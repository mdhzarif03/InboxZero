import { describe, it, expect } from "vitest";
import { evaluateFollowUp, FOLLOW_UP_DELAY_DAYS } from "@/lib/analysis/followups";

const OWNER = "owner@x.com";
const sent = new Date("2026-11-01T10:00:00Z");
const DAY = 86_400_000;

const outbound = (body: string, to = "client@x.com") => ({
  fromAddress: OWNER,
  isFromMe: true,
  bodyText: body,
  sentAt: sent,
  toAddresses: [to],
});

describe("follow-up tracking", () => {
  it("tracks a sent question that has not been answered", () => {
    const d = evaluateFollowUp({
      messages: [outbound("Could you confirm the timeline?")],
      userAddress: OWNER,
      archived: false,
      hasUnsubscribeHeader: false,
      now: new Date(sent.getTime() + DAY),
    });
    expect(d).not.toBeNull();
    expect(d!.status).toBe("WAITING");
    expect(d!.contactAddress).toBe("client@x.com");
    expect(d!.suggestedAt.getTime()).toBe(sent.getTime() + FOLLOW_UP_DELAY_DAYS * DAY);
  });

  it("becomes DUE once the suggested date has passed", () => {
    const d = evaluateFollowUp({
      messages: [outbound("Let me know what you think?")],
      userAddress: OWNER,
      archived: false,
      hasUnsubscribeHeader: false,
      now: new Date(sent.getTime() + (FOLLOW_UP_DELAY_DAYS + 1) * DAY),
    });
    expect(d!.status).toBe("DUE");
  });

  it("does not track messages that do not expect a response", () => {
    const d = evaluateFollowUp({
      messages: [outbound("Thanks, that is all for now.")],
      userAddress: OWNER,
      archived: false,
      hasUnsubscribeHeader: false,
      now: new Date(sent.getTime() + 10 * DAY),
    });
    expect(d).toBeNull();
  });

  it("does not track when the last message came from the other party", () => {
    const d = evaluateFollowUp({
      messages: [
        outbound("Can you confirm?"),
        { fromAddress: "client@x.com", isFromMe: false, bodyText: "Yes.", sentAt: new Date(sent.getTime() + DAY), toAddresses: [OWNER] },
      ],
      userAddress: OWNER,
      archived: false,
      hasUnsubscribeHeader: false,
      now: new Date(sent.getTime() + 10 * DAY),
    });
    expect(d).toBeNull();
  });

  it("does not track automated recipients or archived conversations", () => {
    const base = { userAddress: OWNER, hasUnsubscribeHeader: false, now: new Date(sent.getTime() + 10 * DAY) };
    expect(evaluateFollowUp({ ...base, messages: [outbound("Please reply?", "no-reply@svc.com")], archived: false })).toBeNull();
    expect(evaluateFollowUp({ ...base, messages: [outbound("Please reply?")], archived: true })).toBeNull();
  });
});
