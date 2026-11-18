import { db } from "@/lib/db";
import { analyzeThread } from "@/lib/analysis/analyze";
import { enhanceThreadWithAi } from "@/lib/analysis/ai-enhance";
import {
  classificationInputKey,
  isTaskCurrent,
  parseAiTaskState,
  resolveClassificationWrite,
} from "@/lib/analysis/ai-state";

export const DETERMINISTIC_PRODUCER = "deterministic";

/**
 * Runs deterministic analysis for one thread, persists it, then runs optional AI enhancement.
 *
 * Ownership: the thread is loaded with userId in the query, so another user's thread is treated
 * as missing. Persistence rules:
 *  - User-edited, confirmed, completed and dismissed actions are never deleted by re-analysis.
 *  - User-confirmed deadlines are kept; detected deadlines are replaced.
 *  - A manual follow-up reminder is never removed automatically.
 *  - A rule-based summary does not overwrite an AI summary that is current for this content.
 * AI failures never remove deterministic results.
 */
export async function refreshThreadAnalysis(userId: string, threadId: string, now = new Date()): Promise<void> {
  const thread = await db.thread.findFirst({
    where: { id: threadId, userId },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      connectedAccount: { select: { emailAddress: true } },
    },
  });
  if (!thread || thread.messages.length === 0) return;

  const dismissed = await db.actionItem.findMany({
    where: { userId, threadId: thread.id, status: "DISMISSED" },
    select: { description: true },
  });

  const result = analyzeThread({
    subject: thread.subject,
    labelIds: thread.labelIds,
    archived: thread.archived,
    starred: thread.starred,
    lastMessageFromMe: thread.lastMessageFromMe,
    userAddress: thread.connectedAccount.emailAddress,
    messages: thread.messages.map((m) => ({
      id: m.id,
      fromAddress: m.fromAddress,
      toAddresses: m.toAddresses,
      isFromMe: m.isFromMe,
      bodyText: m.bodyText,
      subject: m.subject,
      sentAt: m.sentAt,
      listUnsubscribe: m.listUnsubscribe,
    })),
    dismissedActionDescriptions: dismissed.map((d) => d.description),
    now,
  });

  const aiState = parseAiTaskState(thread.aiTaskState);
  const aiSummaryCurrent = isTaskCurrent(aiState, "summarize", result.contentHash);
  const aiActionsCurrent = isTaskCurrent(aiState, "actions", result.contentHash);

  // 1. Classification (one row per thread). A current AI classification is kept; everything else is refreshed.
  const c = result.classification;
  const classifyKey = classificationInputKey({
    contentHash: result.contentHash,
    labelIds: thread.labelIds,
    archived: thread.archived,
    starred: thread.starred,
    lastMessageFromMe: thread.lastMessageFromMe,
  });
  const existingClassification = await db.classification.findUnique({
    where: { threadId: thread.id },
    select: { producer: true, aiInputKey: true },
  });
  const classificationWrite = resolveClassificationWrite({
    deterministicCategory: c.category,
    existing: existingClassification,
    inputKey: classifyKey,
  });
  if (classificationWrite.action === "write_deterministic") {
    await db.classification.upsert({
      where: { threadId: thread.id },
      create: {
        userId,
        threadId: thread.id,
        category: c.category,
        priority: c.priority,
        confidence: c.confidence,
        producer: DETERMINISTIC_PRODUCER,
        reasons: c.reasons,
        aiInputKey: null,
      },
      update: {
        category: c.category,
        priority: c.priority,
        confidence: c.confidence,
        producer: DETERMINISTIC_PRODUCER,
        reasons: c.reasons,
        aiInputKey: null,
      },
    });
  }

  // 2. Actions. Open, untouched deterministic rows are always replaced. Open, untouched AI rows are
  // replaced only when the content has changed since the AI actions task last succeeded, because
  // otherwise they are still current and must not be duplicated or dropped.
  await db.actionItem.deleteMany({
    where: {
      userId,
      threadId: thread.id,
      status: "OPEN",
      userEdited: false,
      ...(aiActionsCurrent ? { producer: DETERMINISTIC_PRODUCER } : { OR: [{ producer: DETERMINISTIC_PRODUCER }, { producer: { startsWith: "ollama:" } }, { producer: { startsWith: "gemini:" } }] }),
    },
  });
  // When current AI actions exist, the deterministic set is not created, which prevents duplicates.
  if (result.actions.length && !aiActionsCurrent) {
    await db.actionItem.createMany({
      data: result.actions.map((a) => ({
        userId,
        threadId: thread.id,
        description: a.description,
        responsible: a.responsible,
        deadlineText: a.deadlineText,
        deadlineAt: a.deadlineAt,
        priority: a.priority,
        confidence: a.confidence,
        sourceMessageId: a.sourceMessageId,
        producer: DETERMINISTIC_PRODUCER,
      })),
    });
  }

  // 3. Deadlines: keep user-confirmed, replace the rest
  await db.deadline.deleteMany({ where: { userId, threadId: thread.id, userConfirmed: false } });
  if (result.deadlines.length) {
    await db.deadline.createMany({
      data: result.deadlines.slice(0, 50).map((d) => ({
        userId,
        threadId: thread.id,
        kind: d.kind,
        originalExpression: d.originalExpression,
        normalizedAt: d.normalizedAt,
        timezone: d.timezone,
        sourceMessageId: d.sourceMessageId,
        confidence: d.confidence,
        status: d.status,
        producer: DETERMINISTIC_PRODUCER,
      })),
    });
  }

  // 4. Follow-up
  const existing = await db.followUp.findUnique({ where: { threadId: thread.id } });
  const follow = result.followUp;
  if (follow) {
    // A dismissed follow-up stays dismissed for the same sent message.
    const dismissedSame = existing?.status === "DISMISSED" && existing.sentAt.getTime() === follow.sentAt.getTime();
    if (!dismissedSame) {
      await db.followUp.upsert({
        where: { threadId: thread.id },
        create: {
          userId,
          threadId: thread.id,
          contactAddress: follow.contactAddress,
          sentAt: follow.sentAt,
          suggestedAt: follow.suggestedAt,
          status: follow.status,
          reason: follow.reason,
        },
        update: {
          contactAddress: follow.contactAddress,
          sentAt: follow.sentAt,
          suggestedAt: follow.suggestedAt,
          status: follow.status,
          reason: follow.reason,
        },
      });
    }
  } else if (existing && !existing.manual) {
    // The conversation no longer needs a follow-up (for example, a reply arrived).
    await db.followUp.delete({ where: { threadId: thread.id } });
  }

  // 5. Rule-based summary (always available). Not written if a current AI summary exists.
  if (!aiSummaryCurrent) {
    const payload = {
      source: "deterministic",
      currentStatus: result.summary.currentStatus,
      participants: thread.participants,
      items: result.summary.items,
    };
    await db.threadSummary.upsert({
      where: { threadId: thread.id },
      create: { userId, threadId: thread.id, mainSubject: thread.subject, payload, producer: DETERMINISTIC_PRODUCER },
      update: { mainSubject: thread.subject, payload, producer: DETERMINISTIC_PRODUCER },
    });
  }

  // 6. Optional AI enhancement, per task. Failures are logged and never remove the results above.
  await enhanceThreadWithAi(userId, thread.id, { deterministicCategory: c.category, now }).catch((err) => {
    console.error("[analysis] AI enhancement failed", err instanceof Error ? err.message : "unknown");
  });
}
