import { describe, it, expect } from "vitest";
import { gmailBanner, syncCodeFromOutcome } from "@/lib/gmail/status";

describe("sync outcome codes", () => {
  it("maps each sync result to a distinct code", () => {
    expect(syncCodeFromOutcome({ status: "synced", mode: "initial", messagesUpserted: 1, messagesDeleted: 0, threadsTouched: 1 })).toBe("completed");
    expect(syncCodeFromOutcome({ status: "failed", error: "x" })).toBe("failed");
    expect(syncCodeFromOutcome({ status: "needs_reauth" })).toBe("reauth");
    expect(syncCodeFromOutcome({ status: "skipped_locked" })).toBe("locked");
  });
});

describe("connection and synchronization are reported separately", () => {
  it("a connected account whose first sync failed is never reported as a successful sync", () => {
    const b = gmailBanner({ connected: "1", sync: "failed" });
    expect(b).not.toBeNull();
    expect(b!.tone).toBe("warning");
    expect(b!.title).toContain("connected");
    expect(b!.title).toContain("first sync failed");
    expect(b!.title.includes("completed")).toBe(false);
  });

  it("a failed sync says the account is still connected and offers Sync now, not reconnect", () => {
    const b = gmailBanner({ connected: "1", sync: "failed" })!;
    expect(b.body).toContain("still connected");
    expect(b.recovery).toEqual(["sync_now"]);
  });

  it("a completed first sync is reported as completed", () => {
    const b = gmailBanner({ connected: "1", sync: "completed" })!;
    expect(b.tone).toBe("success");
    expect(b.title).toContain("sync completed");
    expect(b.recovery).toEqual([]);
  });

  it("rejected credentials ask for a reconnect, not a retry", () => {
    const b = gmailBanner({ connected: "1", sync: "reauth" })!;
    expect(b.tone).toBe("error");
    expect(b.recovery).toEqual(["reconnect"]);
  });

  it("a locked sync is reported as in progress, not as a failure", () => {
    const b = gmailBanner({ connected: "1", sync: "locked" })!;
    expect(b.tone).toBe("warning");
    expect(b.title).toContain("already running");
  });

  it("a connection with no sync code yet still offers Sync now and claims no sync result", () => {
    const b = gmailBanner({ connected: "1" })!;
    expect(b.title.includes("completed")).toBe(false);
    expect(b.recovery).toEqual(["sync_now"]);
  });
});

describe("connection errors", () => {
  it("reports a connection error with no sync claim", () => {
    const b = gmailBanner({ error: "state_mismatch" })!;
    expect(b.tone).toBe("error");
    expect(b.title).toContain("not connected");
  });

  it("uses a generic message for unknown error codes", () => {
    expect(gmailBanner({ error: "something_new" })!.body).toContain("Something went wrong");
  });
});

describe("manual sync from the Gmail page", () => {
  it("reports completion as success", () => {
    expect(gmailBanner({ manual: "completed" })!.tone).toBe("success");
  });

  it("reports a failed sync as a failure with the connection unchanged", () => {
    const failed = gmailBanner({ manual: "failed" })!;
    expect(failed.tone).toBe("warning");
    expect(failed.body).toContain("connection was not changed");
    expect(failed.title.includes("completed")).toBe(false);
  });

  it("never reports a locked sync as a completed sync", () => {
    const locked = gmailBanner({ manual: "locked" })!;
    expect(locked.title.includes("Mailbox synchronized")).toBe(false);
    expect(locked.body).toContain("not counted as a completed sync");
  });

  it("asks for a reconnect when credentials were rejected", () => {
    const b = gmailBanner({ manual: "reauth" })!;
    expect(b.tone).toBe("error");
    expect(b.recovery).toEqual(["reconnect"]);
  });

  it("says a partial result is partial, not complete", () => {
    const b = gmailBanner({ manual: "partial" })!;
    expect(b.title).toContain("Some accounts");
    expect(b.title.includes("Mailbox synchronized")).toBe(false);
  });

  it("explains when no Gmail account exists", () => {
    expect(gmailBanner({ manual: "none" })!.title).toContain("No Gmail account");
  });

  it("returns null when there is nothing to report", () => {
    expect(gmailBanner({})).toBeNull();
  });
});
