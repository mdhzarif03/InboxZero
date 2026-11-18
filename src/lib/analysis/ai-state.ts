import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Pure per-task AI state. No database, no network: safe to import in unit tests.
 *
 * Each AI task (classify, summarize, actions) keeps its own completion record, keyed by the
 * content it was computed from. A success in one task never marks another task as done, and a
 * failure in one task never blocks the others.
 *
 * Retry policy: a task that failed for the current content is retried after a backoff that doubles
 * with each consecutive failure, so an unavailable model is not called on every sync.
 */

export const AI_TASKS = ["classify", "summarize", "actions"] as const;
export type AiTaskName = (typeof AI_TASKS)[number];

export type TaskRecord = {
  /** The content fingerprint the task was computed from. */
  hash: string;
  status: "ok" | "failed";
  /** ISO timestamp of the last attempt for this content. */
  at: string;
  /** Consecutive failed attempts for this content. Zero after success. */
  attempts: number;
};

export type AiTaskState = Partial<Record<AiTaskName, TaskRecord>>;

export const BASE_RETRY_MS = 15 * 60 * 1000;
export const MAX_RETRY_MS = 24 * 60 * 60 * 1000;

const recordSchema = z.object({
  hash: z.string().min(1).max(200),
  status: z.enum(["ok", "failed"]),
  at: z.string().min(1).max(40),
  attempts: z.number().int().min(0).max(1000),
});
const stateSchema = z.object({
  classify: recordSchema.optional(),
  summarize: recordSchema.optional(),
  actions: recordSchema.optional(),
});

/** Tolerates missing, malformed or unexpected stored JSON by treating it as "nothing completed". */
export function parseAiTaskState(raw: unknown): AiTaskState {
  const parsed = stateSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function retryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** (attempts - 1));
}

export type TaskDecision =
  | { run: true; reason: "never_run" | "content_changed" | "retry_due" }
  | { run: false; reason: "complete" | "backoff" };

/** Decides whether a task should be called for the given content right now. */
export function decideTaskRun(state: AiTaskState, task: AiTaskName, hash: string, now: Date): TaskDecision {
  const record = state[task];
  if (!record) return { run: true, reason: "never_run" };
  if (record.hash !== hash) return { run: true, reason: "content_changed" };
  if (record.status === "ok") return { run: false, reason: "complete" };
  const elapsed = now.getTime() - new Date(record.at).getTime();
  if (elapsed >= retryDelayMs(record.attempts)) return { run: true, reason: "retry_due" };
  return { run: false, reason: "backoff" };
}

/** True only when the task completed successfully for exactly this content. */
export function isTaskCurrent(state: AiTaskState, task: AiTaskName, hash: string): boolean {
  const record = state[task];
  return Boolean(record && record.status === "ok" && record.hash === hash);
}

/** Returns a new state with one task's outcome recorded. Other tasks are untouched. */
export function recordTaskOutcome(
  state: AiTaskState,
  task: AiTaskName,
  hash: string,
  outcome: "ok" | "failed",
  now: Date,
): AiTaskState {
  const previous = state[task];
  const at = now.toISOString();
  if (outcome === "ok") {
    return { ...state, [task]: { hash, status: "ok", at, attempts: 0 } satisfies TaskRecord };
  }
  // Consecutive failures count only for the same content; new content starts again at one.
  const attempts = previous && previous.hash === hash && previous.status === "failed" ? previous.attempts + 1 : 1;
  return { ...state, [task]: { hash, status: "failed", at, attempts } satisfies TaskRecord };
}

/**
 * Fingerprint for the classification task. It covers the conversation content AND the Gmail
 * state that the classification depends on, so a label change invalidates an AI classification.
 */
export function classificationInputKey(p: {
  contentHash: string;
  labelIds: string[];
  archived: boolean;
  starred: boolean;
  lastMessageFromMe: boolean;
}): string {
  const labels = [...p.labelIds].sort().join(",");
  const flags = [p.archived ? "A" : "-", p.starred ? "S" : "-", p.lastMessageFromMe ? "M" : "-"].join("");
  return createHash("sha256").update(`${p.contentHash}|${labels}|${flags}`).digest("base64url").slice(0, 43);
}

/** Categories that come from the user's Gmail state. AI may never set or change them. */
export const AUTHORITATIVE_CATEGORIES = ["ARCHIVED", "PROMOTIONS"] as const;

export function isAuthoritativeCategory(category: string): boolean {
  return (AUTHORITATIVE_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Combines a model's category with the deterministic one. The model's answer is used only when the
 * deterministic result is not authoritative, and the model cannot introduce ARCHIVED, which is a
 * Gmail state rather than a judgment about content.
 */
export function mergeAiCategory(deterministicCategory: string, aiCategory: string): string {
  if (isAuthoritativeCategory(deterministicCategory)) return deterministicCategory;
  if (aiCategory === "ARCHIVED") return deterministicCategory;
  return aiCategory;
}

export type ExistingClassification = {
  producer: string;
  aiInputKey: string | null;
} | null;

export type ClassificationWrite =
  | { action: "write_deterministic" }
  | { action: "keep_ai" };

/**
 * Decides whether the deterministic pipeline may overwrite the stored classification.
 *  - Authoritative (Gmail-state) categories are always written from the deterministic result.
 *  - An AI classification is kept only when it was computed from the same content and Gmail state.
 *  - Otherwise the deterministic result is written. This is also the fallback when AI is unavailable.
 */
export function resolveClassificationWrite(args: {
  deterministicCategory: string;
  existing: ExistingClassification;
  inputKey: string;
}): ClassificationWrite {
  if (isAuthoritativeCategory(args.deterministicCategory)) return { action: "write_deterministic" };
  const existing = args.existing;
  if (existing && existing.producer !== "deterministic" && existing.aiInputKey === args.inputKey) {
    return { action: "keep_ai" };
  }
  return { action: "write_deterministic" };
}

/** Producer strings written by the AI stage look like "ollama:<model>" or "gemini:<model>". */
export function isAiProducer(producer: string): boolean {
  return producer.startsWith("ollama:") || producer.startsWith("gemini:");
}
