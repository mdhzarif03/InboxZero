import { describe, it, expect } from "vitest";
import { detectActions, filterDismissed } from "@/lib/analysis/actions";

const OWNER = "owner@x.com";
const REF = new Date("2026-11-10T09:00:00Z");

describe("action detection", () => {
  it("detects an explicit request addressed to the user", () => {
    const actions = detectActions(
      [{ id: "m1", isFromMe: false, bodyText: "Please submit your transcript by 30 November 2026.", sentAt: REF }],
      OWNER,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]!.responsible).toBe(OWNER);
    expect(actions[0]!.deadlineText).toBe("30 November 2026");
    expect(actions[0]!.sourceMessageId).toBe("m1");
  });

  it("ignores informational 'please find attached' phrasing", () => {
    const actions = detectActions(
      [{ id: "m1", isFromMe: false, bodyText: "Please find attached the signed contract for your records.", sentAt: REF }],
      OWNER,
    );
    expect(actions).toHaveLength(0);
  });

  it("never treats the user's own messages as requests to the user", () => {
    const actions = detectActions(
      [{ id: "m1", isFromMe: true, bodyText: "Please send me the file when you can.", sentAt: REF }],
      OWNER,
    );
    expect(actions).toHaveLength(0);
  });

  it("ignores quoted reply text", () => {
    const body = "Thanks!\n\nOn Mon wrote:\n> Please submit the report by Friday.";
    expect(detectActions([{ id: "m1", isFromMe: false, bodyText: body, sentAt: REF }], OWNER)).toHaveLength(0);
  });

  it("does not attribute responsibility when 'you' is absent", () => {
    const actions = detectActions(
      [{ id: "m1", isFromMe: false, bodyText: "The team needs the report confirmed before launch.", sentAt: REF }],
      OWNER,
    );
    expect(actions[0]?.responsible ?? null).toBeNull();
  });

  it("filters out actions the user previously dismissed", () => {
    const candidates = detectActions(
      [{ id: "m1", isFromMe: false, bodyText: "Please confirm your attendance.", sentAt: REF }],
      OWNER,
    );
    expect(filterDismissed(candidates, [candidates[0]!.description])).toHaveLength(0);
  });
});
