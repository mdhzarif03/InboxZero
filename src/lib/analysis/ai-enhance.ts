import type { CategoryKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveAiProvider, recordAiUsage, describeRouteReason } from "@/lib/ai/router";
import { AiProviderError, type AiProvider } from "@/lib/ai/types";
import {
  actionsSchema,
  classificationSchema,
  parseModelJson,
  summarySchema,
  type ActionsOutput,
  type ClassificationOutput,
  type SummaryOutput,
} from "@/lib/ai/schemas";
import { actionsPrompt, classificationPrompt, summaryPrompt, type PromptMessage } from "@/lib/ai/prompts";
import { normalizeAiDeadlineExpression } from "@/lib/analysis/deadlines";
import { stripQuotedReply, normalizeForCompare } from "@/lib/analysis/text";
import { contentHashFor } from "@/lib/analysis/hash";
import {
  AI_TASKS,
  classificationInputKey,
  decideTaskRun,
  isAuthoritativeCategory,
  mergeAiCategory,
  parseAiTaskState,
  recordTaskOutcome,
  type AiTaskName,
  type AiTaskState,
} from "@/lib/analysis/ai-state";
import { writeAudit } from "@/lib/audit";

/**
 * AI enhancement, tracked per task.
 *
 *  - Each task (classify, summarize, actions) has its own completion record keyed by the content it used.
 *    A success is saved immediately, so a later failure in the same run cannot erase it.
 *  - A task that failed stays eligible for retry, after a backoff that grows with each failure.
 *  - Only tasks whose content changed, or that were never completed, call a model.
 *  - Output is schema-validated. Cited message ids must exist in the thread. Dates are normalized by code.
 *  - AI cannot set ARCHIVED, and cannot change a category that Gmail's labels make authoritative.
 *  - If no provider is available, nothing is recorded, so the task remains eligible later.
 */

const MAX_OUTPUT_TOKENS = { classify: 300, summarize: 900, actions: 700 } as const;

export type TaskOutcome = "ok" | "failed" | "not_due";

export type EnhanceResult = {
  status: "no_thread" | "cached" | "skipped" | "analyzed" | "failed_all_tasks";
  reason?: string;
  tasks?: Partial<Record<AiTaskName, TaskOutcome>>;
};

export type EnhanceOptions = {
  /** The deterministic category the pipeline just wrote. Required for the classify task. */
  deterministicCategory?: string;
  now?: Date;
};

export async function enhanceThreadWithAi(userId: string, threadId: string, opts: EnhanceOptions = {}): Promise<EnhanceResult> {
  const now = opts.now ?? new Date();
  const thread = await db.thread.findFirst({
    where: { id: threadId, userId },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      classification: true,
      connectedAccount: { select: { emailAddress: true } },
    },
  });
  if (!thread || thread.messages.length === 0) return { status: "no_thread" };

  const contentHash = contentHashFor(thread.messages.map((m) => ({ id: m.id, body: m.bodyText, subject: m.subject })));
  const classifyKey = classificationInputKey({
    contentHash,
    labelIds: thread.labelIds,
    archived: thread.archived,
    starred: thread.starred,
    lastMessageFromMe: thread.lastMessageFromMe,
  });

  // The deterministic category the classify task refines. Taken from the pipeline when provided.
  const deterministicCategory =
    opts.deterministicCategory ??
    (thread.classification?.producer === "deterministic" ? thread.classification.category : undefined);

  const hashes: Record<AiTaskName, string> = { classify: classifyKey, summarize: contentHash, actions: contentHash };
  let state: AiTaskState = parseAiTaskState(thread.aiTaskState);

  // Classification is skipped when there is nothing to refine, or when Gmail's labels make it authoritative.
  const classifyApplicable = Boolean(thread.classification && deterministicCategory && !isAuthoritativeCategory(deterministicCategory));
  const due = AI_TASKS.filter((task) => {
    if (task === "classify" && !classifyApplicable) return false;
    return decideTaskRun(state, task, hashes[task], now).run;
  });
  if (due.length === 0) return { status: "cached" };

  const route = await resolveAiProvider(userId);
  if (!route.provider) return { status: "skipped", reason: describeRouteReason(route.reason) };
  const provider = route.provider;

  const promptMessages: PromptMessage[] = thread.messages.map((m) => ({
    id: m.id,
    from: m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress,
    sentAt: m.sentAt.toISOString(),
    isFromUser: m.isFromMe,
    subject: m.subject,
    body: stripQuotedReply(m.bodyText),
  }));
  const validIds = new Set(thread.messages.map((m) => m.id));
  const reference = thread.messages[thread.messages.length - 1]!.sentAt;

  const outcomes: Partial<Record<AiTaskName, TaskOutcome>> = {};
  for (const task of AI_TASKS) {
    if (!due.includes(task)) {
      outcomes[task] = "not_due";
      continue;
    }
    let ok = false;
    try {
      if (task === "classify") {
        ok = await runClassify(userId, provider, thread.classification!.id, promptMessages, deterministicCategory!, classifyKey);
      } else if (task === "summarize") {
        ok = await runSummarize(userId, provider, threadId, thread.subject, promptMessages, validIds);
      } else {
        ok = await runActions(userId, provider, threadId, promptMessages, validIds, thread.messages, reference);
      }
    } catch (err) {
      await logAiFailure(userId, task, err);
      ok = false;
    }
    outcomes[task] = ok ? "ok" : "failed";
    state = recordTaskOutcome(state, task, hashes[task], ok ? "ok" : "failed", now);
    // Persist after every task, so a success survives a later failure in the same run.
    await db.thread.update({ where: { id: threadId }, data: { aiTaskState: state as unknown as Prisma.InputJsonValue } });
  }

  const anyOk = Object.values(outcomes).includes("ok");
  if (anyOk) {
    await writeAudit(userId, "ai.thread_analyzed", { provider: provider.id, model: provider.model, cloud: provider.cloud, tasks: outcomes });
    return { status: "analyzed", tasks: outcomes };
  }
  return { status: "failed_all_tasks", tasks: outcomes };
}

async function runClassify(
  userId: string,
  provider: AiProvider,
  classificationId: string,
  messages: PromptMessage[],
  deterministicCategory: string,
  inputKey: string,
): Promise<boolean> {
  const prompt = classificationPrompt(messages, deterministicCategory);
  const text = await callAndRecord(userId, provider, "classify", prompt, MAX_OUTPUT_TOKENS.classify);
  const parsed = parseModelJson(text, classificationSchema);
  if (!parsed) return false;
  await applyClassification(classificationId, parsed, provider, deterministicCategory, inputKey);
  return true;
}

async function runSummarize(
  userId: string,
  provider: AiProvider,
  threadId: string,
  subject: string,
  messages: PromptMessage[],
  validIds: Set<string>,
): Promise<boolean> {
  const text = await callAndRecord(userId, provider, "summarize", summaryPrompt(messages), MAX_OUTPUT_TOKENS.summarize);
  const parsed = parseModelJson(text, summarySchema);
  if (!parsed) return false;
  await storeAiSummary(userId, threadId, subject, parsed, validIds, provider);
  return true;
}

async function runActions(
  userId: string,
  provider: AiProvider,
  threadId: string,
  messages: PromptMessage[],
  validIds: Set<string>,
  stored: Array<{ id: string; bodyText: string; sentAt: Date }>,
  reference: Date,
): Promise<boolean> {
  const text = await callAndRecord(userId, provider, "actions", actionsPrompt(messages), MAX_OUTPUT_TOKENS.actions);
  const parsed = parseModelJson(text, actionsSchema);
  if (!parsed) return false;
  await storeAiActions(userId, threadId, parsed, validIds, stored, reference, provider);
  return true;
}

async function callAndRecord(
  userId: string,
  provider: AiProvider,
  task: "classify" | "summarize" | "actions",
  prompt: { system: string; user: string },
  maxOutputTokens: number,
): Promise<string> {
  const inputChars = prompt.system.length + prompt.user.length;
  try {
    const text = await provider.complete({ task, system: prompt.system, user: prompt.user, maxOutputTokens });
    await recordAiUsage({ userId, provider, task, inputChars, outputChars: text.length, status: "ok" });
    return text;
  } catch (err) {
    await recordAiUsage({ userId, provider, task, inputChars, outputChars: 0, status: "error" });
    throw err;
  }
}

async function logAiFailure(userId: string, task: string, err: unknown): Promise<void> {
  const code = err instanceof AiProviderError ? err.code : "UNKNOWN";
  // Logged without email content or provider payloads.
  console.error(`[ai] ${task} failed (${code})`);
  await writeAudit(userId, "ai.task_failed", { task, code });
}

async function applyClassification(
  classificationId: string,
  out: ClassificationOutput,
  provider: AiProvider,
  deterministicCategory: string,
  inputKey: string,
): Promise<void> {
  await db.classification.update({
    where: { id: classificationId },
    data: {
      category: mergeAiCategory(deterministicCategory, out.category) as CategoryKind,
      priority: out.priority,
      confidence: out.confidence,
      reasons: out.reasons,
      producer: `${provider.id}:${provider.model}`,
      aiInputKey: inputKey,
    },
  });
}

async function storeAiSummary(
  userId: string,
  threadId: string,
  subject: string,
  out: SummaryOutput,
  validIds: Set<string>,
  provider: AiProvider,
): Promise<void> {
  const items = out.items.map((item) => ({
    kind: item.kind,
    text: item.text,
    basis: item.basis,
    // Citations to ids that are not in this thread are removed, never trusted.
    sourceMessageIds: item.sourceMessageIds.filter((id) => validIds.has(id)),
  }));
  const payload = {
    source: "ai",
    currentStatus: out.currentStatus,
    items,
    disclaimer: "Items marked inferred are AI interpretation, not explicit statements in the email.",
  };
  const producer = `${provider.id}:${provider.model}`;
  await db.threadSummary.upsert({
    where: { threadId },
    create: { userId, threadId, mainSubject: out.mainSubject || subject, payload, producer },
    update: { mainSubject: out.mainSubject || subject, payload, producer },
  });
}

async function storeAiActions(
  userId: string,
  threadId: string,
  out: ActionsOutput,
  validIds: Set<string>,
  messages: Array<{ id: string; bodyText: string; sentAt: Date }>,
  reference: Date,
  provider: AiProvider,
): Promise<void> {
  const dismissed = await db.actionItem.findMany({ where: { userId, threadId, status: "DISMISSED" }, select: { description: true } });
  const dismissedKeys = new Set(dismissed.map((d) => normalizeForCompare(d.description).slice(0, 120)));

  const rows: Prisma.ActionItemCreateManyInput[] = [];
  const seen = new Set<string>();
  for (const a of out.actions) {
    if (!validIds.has(a.sourceMessageId)) continue;
    const key = normalizeForCompare(a.description).slice(0, 120);
    if (dismissedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);

    const source = messages.find((m) => m.id === a.sourceMessageId)!;
    let deadlineAt: Date | null = null;
    let deadlineText: string | null = a.deadlineText;
    if (a.deadlineText) {
      const normalized = normalizeAiDeadlineExpression(a.deadlineText, stripQuotedReply(source.bodyText), source.sentAt);
      deadlineAt = normalized?.status === "CONFIRMED" ? normalized.normalizedAt : null;
      // An expression that is not found verbatim in the email is dropped rather than trusted.
      if (!normalized) deadlineText = null;
    }
    rows.push({
      userId,
      threadId,
      description: a.description.slice(0, 300),
      responsible: a.responsible,
      deadlineText,
      deadlineAt,
      priority: a.priority,
      confidence: Math.min(a.confidence, 0.95),
      sourceMessageId: a.sourceMessageId,
      producer: `${provider.id}:${provider.model}`,
    });
  }

  // Replace only open, untouched rows from deterministic or earlier AI runs. Confirmed, completed,
  // dismissed and user-edited actions are never removed here.
  await db.actionItem.deleteMany({
    where: {
      userId,
      threadId,
      status: "OPEN",
      userEdited: false,
      OR: [{ producer: "deterministic" }, { producer: { startsWith: "ollama:" } }, { producer: { startsWith: "gemini:" } }],
    },
  });
  if (rows.length) await db.actionItem.createMany({ data: rows });
}

/** Exposed for the settings page to explain why AI did or did not run. */
export async function aiStatusForUser(userId: string): Promise<{ available: boolean; message: string }> {
  const route = await resolveAiProvider(userId);
  if (route.provider) return { available: true, message: `AI is available (${route.provider.id}).` };
  return { available: false, message: describeRouteReason(route.reason) };
}
