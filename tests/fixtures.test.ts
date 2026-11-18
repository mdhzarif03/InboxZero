import { describe, it, expect } from "vitest";
import { FIXTURE_THREADS, FIXTURE_OWNER_ADDRESS } from "@/fixtures/mailbox";
import { analyzeThread, type AnalysisResult } from "@/lib/analysis/analyze";

/**
 * Runs the sample mailbox through the real deterministic analyzer.
 * Expectations were derived from the fixture content, not from tuning the code to pass.
 */
const NOW = new Date("2026-11-18T12:00:00Z");

function analyze(threadId: string): AnalysisResult {
  const t = FIXTURE_THREADS.find((x) => x.id === threadId);
  if (!t) throw new Error(`fixture ${threadId} missing`);
  const labels = t.labels ?? [];
  const messages = t.messages.map((m) => ({
    id: m.id,
    fromAddress: m.from.toLowerCase(),
    toAddresses: m.to,
    isFromMe: m.from === FIXTURE_OWNER_ADDRESS,
    bodyText: m.body,
    subject: m.subject,
    sentAt: new Date(m.sentAt),
    listUnsubscribe: Boolean(m.listUnsubscribe),
  }));
  return analyzeThread({
    subject: messages[0]!.subject,
    labelIds: labels,
    archived: !labels.includes("INBOX"),
    starred: labels.includes("STARRED"),
    lastMessageFromMe: messages[messages.length - 1]!.isFromMe,
    userAddress: FIXTURE_OWNER_ADDRESS,
    messages,
    dismissedActionDescriptions: [],
    now: NOW,
  });
}

describe("sample mailbox through the deterministic analyzer", () => {
  it("admission request: needs reply, two actions, two confirmed dates with correct kinds", () => {
    const r = analyze("fx-thread-admission");
    expect(r.classification.category).toBe("NEEDS_REPLY");
    expect(r.classification.priority).toBe(1);
    expect(r.actions.length).toBe(2);
    expect(r.actions.every((a) => a.responsible === FIXTURE_OWNER_ADDRESS)).toBe(true);
    const deadline = r.deadlines.find((d) => d.originalExpression === "30 November 2026")!;
    expect(deadline.status).toBe("CONFIRMED");
    expect(deadline.kind).toBe("EXPLICIT_DEADLINE");
    expect(deadline.normalizedAt!.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    const call = r.deadlines.find((d) => d.originalExpression === "December 4, 2026")!;
    expect(call.kind).toBe("MEETING");
    expect(call.timezone).toBe("GMT");
    expect(call.normalizedAt!.toISOString()).toBe("2026-12-04T10:00:00.000Z");
    expect(r.followUp).toBeNull();
  });

  it("invoice: ISO payment date is confirmed and classified as payment due", () => {
    const r = analyze("fx-thread-invoice");
    expect(r.classification.category).toBe("NEEDS_REPLY");
    const d = r.deadlines.find((x) => x.originalExpression === "2026-12-01")!;
    expect(d.status).toBe("CONFIRMED");
    expect(d.kind).toBe("PAYMENT_DUE");
    expect(d.timezone).toBeNull();
  });

  it("sent proposal awaiting reply: waiting category and a DUE follow-up to the right contact", () => {
    const r = analyze("fx-thread-waiting");
    expect(r.classification.category).toBe("WAITING_FOR_REPLY");
    expect(r.followUp).not.toBeNull();
    expect(r.followUp!.status).toBe("DUE");
    expect(r.followUp!.contactAddress).toBe("client@brightwork.example");
    expect(r.followUp!.suggestedAt.toISOString()).toBe("2026-11-09T08:30:00.000Z");
    expect(r.summary.currentStatus).toBe("Waiting for the other person to reply.");
  });

  it("newsletter with unsubscribe header: newsletter category, no actions, no follow-up", () => {
    const r = analyze("fx-thread-newsletter");
    expect(r.classification.category).toBe("NEWSLETTERS");
    expect(r.actions).toHaveLength(0);
    expect(r.followUp).toBeNull();
  });

  it("automated build notification: notifications category, no actions", () => {
    const r = analyze("fx-thread-notification");
    expect(r.classification.category).toBe("NOTIFICATIONS");
    expect(r.actions).toHaveLength(0);
  });

  it("yearless date is ambiguous and resolved only as a proposal for the user to confirm", () => {
    const r = analyze("fx-thread-meeting");
    const d = r.deadlines.find((x) => x.originalExpression === "November 23")!;
    expect(d.status).toBe("AMBIGUOUS");
    expect(d.normalizedAt!.toISOString().slice(0, 10)).toBe("2026-11-23");
    expect(r.summary.items.some((i) => i.text.includes("needs confirmation"))).toBe(true);
  });

  it("every summary item is marked stated (rule-based output never claims inference)", () => {
    for (const t of FIXTURE_THREADS) {
      for (const item of analyze(t.id).summary.items) {
        expect(item.basis).toBe("stated");
      }
    }
  });

  it("fixture records are distinguishable from Gmail records by id prefix", () => {
    for (const t of FIXTURE_THREADS) {
      expect(t.id.startsWith("fx-thread-")).toBe(true);
      for (const m of t.messages) expect(m.id.startsWith("fx-m")).toBe(true);
    }
    expect(FIXTURE_OWNER_ADDRESS.endsWith(".invalid")).toBe(true);
  });
});
