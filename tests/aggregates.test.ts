import { describe, it, expect } from "vitest";
import { computeThreadAggregates, type AggregateInputMessage } from "@/lib/gmail/aggregates";

const m = (over: Partial<AggregateInputMessage>): AggregateInputMessage => ({
  fromAddress: "a@x.com",
  toAddresses: ["me@y.com"],
  ccAddresses: [],
  subject: "Topic",
  snippet: "",
  sentAt: new Date("2026-01-01T00:00:00Z"),
  isUnread: false,
  isFromMe: false,
  labelIds: ["INBOX"],
  attachmentsCount: 0,
  ...over,
});

describe("computeThreadAggregates", () => {
  it("returns null for an empty thread", () => {
    expect(computeThreadAggregates([])).toBeNull();
  });

  it("uses the latest message for activity and the first for the subject", () => {
    const agg = computeThreadAggregates([
      m({ subject: "Original", sentAt: new Date("2026-01-01T00:00:00Z"), snippet: "first" }),
      m({ subject: "Re: Original", sentAt: new Date("2026-01-03T00:00:00Z"), snippet: "latest", isFromMe: true }),
    ]);
    expect(agg!.subject).toBe("Original");
    expect(agg!.snippet).toBe("latest");
    expect(agg!.lastMessageFromMe).toBe(true);
    expect(agg!.messageCount).toBe(2);
  });

  it("is archived when no message carries INBOX", () => {
    expect(computeThreadAggregates([m({ labelIds: ["SENT"] })])!.archived).toBe(true);
    expect(computeThreadAggregates([m({ labelIds: ["INBOX"] })])!.archived).toBe(false);
  });

  it("counts unread messages and detects attachments", () => {
    const agg = computeThreadAggregates([m({ isUnread: true, attachmentsCount: 1 }), m({ isUnread: true })])!;
    expect(agg.unreadCount).toBe(2);
    expect(agg.hasAttachments).toBe(true);
  });
});
