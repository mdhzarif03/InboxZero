import { describe, it, expect } from "vitest";
import { categorizeThread, type CategorySignals } from "@/lib/analysis/categorize";

const base: CategorySignals = {
  archived: false,
  starred: false,
  labelIds: ["INBOX"],
  lastMessageFromMe: false,
  latestInboundHasQuestion: false,
  latestInboundHasRequest: false,
  hasUnsubscribeHeader: false,
  senderAddress: "person@x.com",
  subject: "Hello",
  hasSoonDeadline: false,
};

describe("categorizeThread", () => {
  it("respects Gmail's promotions label", () => {
    expect(categorizeThread({ ...base, labelIds: ["CATEGORY_PROMOTIONS"], latestInboundHasRequest: true }).category).toBe("PROMOTIONS");
  });

  it("classifies bulk digests as newsletters", () => {
    expect(categorizeThread({ ...base, hasUnsubscribeHeader: true, subject: "Weekly digest" }).category).toBe("NEWSLETTERS");
  });

  it("classifies no-reply senders as notifications", () => {
    expect(categorizeThread({ ...base, senderAddress: "no-reply@svc.com" }).category).toBe("NOTIFICATIONS");
  });

  it("marks threads where the user spoke last as waiting for reply", () => {
    expect(categorizeThread({ ...base, lastMessageFromMe: true }).category).toBe("WAITING_FOR_REPLY");
  });

  it("marks inbound questions as needs reply, raising priority when starred", () => {
    const r = categorizeThread({ ...base, latestInboundHasQuestion: true, starred: true });
    expect(r.category).toBe("NEEDS_REPLY");
    expect(r.priority).toBe(1);
  });

  it("archived takes precedence over everything", () => {
    expect(categorizeThread({ ...base, archived: true, latestInboundHasQuestion: true }).category).toBe("ARCHIVED");
  });

  it("returns GENERAL with low confidence when nothing matches", () => {
    const r = categorizeThread(base);
    expect(r.category).toBe("GENERAL");
    expect(r.confidence).toBeLessThan(0.5);
  });
});
