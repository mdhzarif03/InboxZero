import { describe, it, expect } from "vitest";
import { summarizeManualSync, noGmailAccountResult, type AccountSyncResult } from "@/lib/gmail/manual-sync";

const acc = (emailAddress: string, status: AccountSyncResult["status"]): AccountSyncResult => ({ emailAddress, status });

/**
 * Regression: a skipped_locked sync was previously reported as "Mailbox synchronized".
 * Only a completed sync for every account may be reported as success.
 */
describe("single account", () => {
  it("a completed sync is success", () => {
    const r = summarizeManualSync([acc("a@x.com", "synced")]);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("completed");
    expect(r.message).toBe("Mailbox synchronized.");
  });

  it("a locked sync is NOT success and says another sync is running", () => {
    const r = summarizeManualSync([acc("a@x.com", "skipped_locked")]);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("locked");
    expect(r.message).toContain("already syncing");
    expect(r.message.includes("synchronized.")).toBe(false);
  });

  it("a failed sync is failure and the connection is reported as unchanged", () => {
    const r = summarizeManualSync([acc("a@x.com", "failed")]);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("failed");
    expect(r.message).toContain("failed to sync");
    expect(r.message).toContain("unchanged");
  });

  it("a rejected credential requires reconnecting", () => {
    const r = summarizeManualSync([acc("a@x.com", "needs_reauth")]);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("reauth");
    expect(r.message).toContain("reconnected");
  });
});

describe("multiple accounts", () => {
  it("is success only when every account completed", () => {
    const r = summarizeManualSync([acc("a@x.com", "synced"), acc("b@x.com", "synced")]);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("completed");
    expect(r.message).toBe("All 2 accounts synchronized.");
  });

  it("one completed and one locked is partial, never complete, and names the locked account", () => {
    const r = summarizeManualSync([acc("a@x.com", "synced"), acc("b@x.com", "skipped_locked")]);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("partial");
    expect(r.message).toContain("1 of 2 accounts synchronized");
    expect(r.message).toContain("b@x.com is already syncing");
    expect(r.message.includes("All 2")).toBe(false);
  });

  it("one completed and one failed is partial and names the failed account", () => {
    const r = summarizeManualSync([acc("a@x.com", "failed"), acc("b@x.com", "synced")]);
    expect(r.kind).toBe("partial");
    expect(r.message).toContain("a@x.com failed to sync");
  });

  it("reports every problem account, not only the first one", () => {
    const r = summarizeManualSync([
      acc("a@x.com", "failed"),
      acc("b@x.com", "needs_reauth"),
      acc("c@x.com", "skipped_locked"),
    ]);
    expect(r.kind).toBe("reauth");
    expect(r.message).toContain("a@x.com failed to sync");
    expect(r.message).toContain("b@x.com needs to be reconnected");
    expect(r.message).toContain("c@x.com is already syncing");
  });

  it("when nothing synced, reauth takes precedence over failure", () => {
    expect(summarizeManualSync([acc("a@x.com", "failed"), acc("b@x.com", "needs_reauth")]).kind).toBe("reauth");
  });

  it("when nothing synced, failure takes precedence over a locked sync", () => {
    expect(summarizeManualSync([acc("a@x.com", "skipped_locked"), acc("b@x.com", "failed")]).kind).toBe("failed");
  });

  it("when every account is locked, the result is locked, not success", () => {
    const r = summarizeManualSync([acc("a@x.com", "skipped_locked"), acc("b@x.com", "skipped_locked")]);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("locked");
  });
});

describe("no account", () => {
  it("an empty account list is never success", () => {
    const r = summarizeManualSync([]);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("none");
  });

  it("explains sample data separately from a missing connection", () => {
    expect(noGmailAccountResult(true).message).toContain("sample data");
    expect(noGmailAccountResult(false).message).toContain("Connect Gmail first");
    expect(noGmailAccountResult(false).ok).toBe(false);
  });
});
