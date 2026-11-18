import { describe, it, expect } from "vitest";
import {
  AI_TASKS,
  BASE_RETRY_MS,
  MAX_RETRY_MS,
  classificationInputKey,
  decideTaskRun,
  isAiProducer,
  isTaskCurrent,
  mergeAiCategory,
  parseAiTaskState,
  recordTaskOutcome,
  resolveClassificationWrite,
  retryDelayMs,
  type AiTaskName,
  type AiTaskState,
} from "@/lib/analysis/ai-state";

const T0 = new Date("2026-11-18T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;

/**
 * Simulates one AI stage run, using the same decision and recording functions as ai-enhance.ts.
 * `outcomes` says what each task returns when it is called in this run.
 */
function run(
  state: AiTaskState,
  hashes: Record<AiTaskName, string>,
  now: Date,
  outcomes: Partial<Record<AiTaskName, "ok" | "failed">>,
): { state: AiTaskState; called: AiTaskName[] } {
  let next = state;
  const called: AiTaskName[] = [];
  for (const task of AI_TASKS) {
    if (!decideTaskRun(next, task, hashes[task], now).run) continue;
    called.push(task);
    next = recordTaskOutcome(next, task, hashes[task], outcomes[task] ?? "ok", now);
  }
  return { state: next, called };
}

const H1 = { classify: "k1", summarize: "h1", actions: "h1" } as Record<AiTaskName, string>;

describe("complete success", () => {
  it("runs every task once, then makes no calls while content is unchanged", () => {
    const first = run({}, H1, T0, {});
    expect(first.called).toEqual(["classify", "summarize", "actions"]);
    const again = run(first.state, H1, at(60 * MIN), {});
    expect(again.called).toEqual([]);
  });

  it("records each success with its own content fingerprint", () => {
    const { state } = run({}, H1, T0, {});
    expect(isTaskCurrent(state, "classify", "k1")).toBe(true);
    expect(isTaskCurrent(state, "summarize", "h1")).toBe(true);
    expect(isTaskCurrent(state, "actions", "h1")).toBe(true);
  });
});

describe("partial success", () => {
  it("a successful classify is not repeated when summarize and actions fail", () => {
    const first = run({}, H1, T0, { classify: "ok", summarize: "failed", actions: "failed" });
    expect(isTaskCurrent(first.state, "classify", "k1")).toBe(true);
    expect(isTaskCurrent(first.state, "summarize", "h1")).toBe(false);
    expect(isTaskCurrent(first.state, "actions", "h1")).toBe(false);
  });

  it("failed tasks are not hidden by another task's success", () => {
    // Summarize fails while classify and actions succeed. Summarize must still be eligible later.
    const first = run({}, H1, T0, { summarize: "failed" });
    const later = run(first.state, H1, at(BASE_RETRY_MS + MIN), {});
    expect(later.called).toEqual(["summarize"]);
  });

  it("a later run only retries the failed tasks, leaving successful ones alone", () => {
    const first = run({}, H1, T0, { summarize: "failed", actions: "failed" });
    const second = run(first.state, H1, at(BASE_RETRY_MS + MIN), { summarize: "ok" });
    expect(second.called).toEqual(["summarize", "actions"]);
    expect(isTaskCurrent(second.state, "classify", "k1")).toBe(true);
    expect(isTaskCurrent(second.state, "summarize", "h1")).toBe(true);
  });

  it("one failed task does not block the other tasks from being recorded in the same run", () => {
    const { state } = run({}, H1, T0, { classify: "failed" });
    expect(isTaskCurrent(state, "summarize", "h1")).toBe(true);
    expect(isTaskCurrent(state, "actions", "h1")).toBe(true);
    expect(state.classify?.status).toBe("failed");
  });
});

describe("retry behaviour", () => {
  it("does not retry a failed task before the first backoff has elapsed", () => {
    const first = run({}, H1, T0, { summarize: "failed" });
    const tooSoon = run(first.state, H1, at(BASE_RETRY_MS - MIN), {});
    expect(tooSoon.called).toEqual([]);
  });

  it("retries after the backoff and doubles the delay on each consecutive failure", () => {
    let state: AiTaskState = {};
    let now = T0;
    const delays: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = run(state, H1, now, { summarize: "failed" });
      state = r.state;
      expect(r.called.includes("summarize")).toBe(true);
      expect(state.summarize?.attempts).toBe(attempt + 1);
      const wait = retryDelayMs(attempt + 1);
      delays.push(wait);
      // Just before the delay: not due. At the delay: due.
      expect(run(state, H1, new Date(now.getTime() + wait - 1), {}).called.includes("summarize")).toBe(false);
      now = new Date(now.getTime() + wait);
    }
    expect(delays).toEqual([BASE_RETRY_MS, BASE_RETRY_MS * 2, BASE_RETRY_MS * 4]);
  });

  it("caps the backoff so a persistent failure is still retried daily", () => {
    expect(retryDelayMs(50)).toBe(MAX_RETRY_MS);
    expect(retryDelayMs(0)).toBe(0);
  });

  it("a success resets the failure count, so a later failure starts at the base delay again", () => {
    let state = run({}, H1, T0, { summarize: "failed" }).state;
    state = run(state, H1, at(BASE_RETRY_MS + MIN), { summarize: "ok" }).state;
    const H2 = { ...H1, summarize: "h2" } as Record<AiTaskName, string>;
    state = run(state, H2, at(2 * BASE_RETRY_MS), { summarize: "failed" }).state;
    expect(state.summarize?.attempts).toBe(1);
  });

  it("new content for a failed task is attempted immediately, not after the old backoff", () => {
    const first = run({}, H1, T0, { summarize: "failed" });
    const changed = { ...H1, summarize: "h2" } as Record<AiTaskName, string>;
    // The new content fails again: its failure count starts at one, not continuing the old count.
    const r = run(first.state, changed, at(MIN), { summarize: "failed" });
    expect(r.called).toEqual(["summarize"]);
    expect(r.state.summarize?.attempts).toBe(1);
  });
});

describe("content change", () => {
  it("re-runs a task whose content changed, and leaves unchanged tasks alone", () => {
    const first = run({}, H1, T0, {});
    const changed = { classify: "k2", summarize: "h2", actions: "h1" } as Record<AiTaskName, string>;
    const r = run(first.state, changed, at(MIN), {});
    expect(r.called).toEqual(["classify", "summarize"]);
  });

  it("a classification key change re-runs only the classification", () => {
    const first = run({}, H1, T0, {});
    const r = run(first.state, { ...H1, classify: "k-labels-changed" } as Record<AiTaskName, string>, at(MIN), {});
    expect(r.called).toEqual(["classify"]);
  });
});

describe("stored state parsing", () => {
  it("treats missing or malformed stored JSON as nothing completed", () => {
    expect(parseAiTaskState(undefined)).toEqual({});
    expect(parseAiTaskState(null)).toEqual({});
    expect(parseAiTaskState("garbage")).toEqual({});
    expect(parseAiTaskState({ classify: { hash: "x", status: "maybe", at: "now", attempts: 0 } })).toEqual({});
  });

  it("keeps valid records and drops unknown keys", () => {
    const parsed = parseAiTaskState({ summarize: { hash: "h", status: "ok", at: "2026-11-18T10:00:00.000Z", attempts: 0 }, extra: 1 });
    expect(parsed.summarize?.status).toBe("ok");
    expect((parsed as Record<string, unknown>).extra).toBe(undefined);
  });
});

describe("classification input key", () => {
  const base = { contentHash: "c", labelIds: ["INBOX", "IMPORTANT"], archived: false, starred: false, lastMessageFromMe: false };

  it("is stable regardless of label order", () => {
    expect(classificationInputKey(base)).toBe(classificationInputKey({ ...base, labelIds: ["IMPORTANT", "INBOX"] }));
  });

  it("changes when content changes", () => {
    expect(classificationInputKey(base)).not.toBe(classificationInputKey({ ...base, contentHash: "d" }));
  });

  it("changes when a Gmail label changes, so a stale AI classification is refreshed", () => {
    expect(classificationInputKey(base)).not.toBe(classificationInputKey({ ...base, labelIds: ["INBOX", "CATEGORY_PROMOTIONS"] }));
  });

  it("changes when archive, star or the last sender changes", () => {
    const k = classificationInputKey(base);
    expect(k).not.toBe(classificationInputKey({ ...base, archived: true }));
    expect(k).not.toBe(classificationInputKey({ ...base, starred: true }));
    expect(k).not.toBe(classificationInputKey({ ...base, lastMessageFromMe: true }));
  });
});
