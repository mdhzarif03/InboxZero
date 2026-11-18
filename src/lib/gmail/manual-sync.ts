/**
 * Pure aggregation of manual sync results across all connected Gmail accounts.
 * Kept free of database and server imports so the reporting rules can be tested directly.
 *
 * Rule: "ok" is true only when every account completed its sync. A locked, failed or
 * reauthentication-required account is never reported as a successful synchronization.
 */

export type AccountSyncStatus = "synced" | "failed" | "needs_reauth" | "skipped_locked";

export type AccountSyncResult = {
  emailAddress: string;
  status: AccountSyncStatus;
};

export type ManualSyncKind =
  | "completed" // every account synced
  | "partial" // some accounts synced, at least one did not
  | "failed" // no account synced; at least one failed
  | "reauth" // no account synced; at least one needs reconnecting (and none merely failed)
  | "locked" // no account synced; a sync was already running for each non-synced account
  | "none"; // no Gmail account is connected

export type ManualSyncResult = {
  ok: boolean;
  kind: ManualSyncKind;
  message: string;
};

export function summarizeManualSync(results: AccountSyncResult[]): ManualSyncResult {
  if (results.length === 0) {
    return { ok: false, kind: "none", message: "No connected Gmail account to synchronize." };
  }

  const total = results.length;
  const synced = results.filter((r) => r.status === "synced");
  const failed = results.filter((r) => r.status === "failed");
  const reauth = results.filter((r) => r.status === "needs_reauth");
  const locked = results.filter((r) => r.status === "skipped_locked");
  const label = (n: number) => (n === 1 ? "account" : "accounts");

  if (synced.length === total) {
    return {
      ok: true,
      kind: "completed",
      message: total === 1 ? "Mailbox synchronized." : `All ${total} accounts synchronized.`,
    };
  }

  // Each non-synced account is named, so a multi-account user can see which one needs attention.
  const issues: string[] = [];
  for (const r of reauth) issues.push(`${r.emailAddress} needs to be reconnected`);
  for (const r of failed) issues.push(`${r.emailAddress} failed to sync`);
  for (const r of locked) issues.push(`${r.emailAddress} is already syncing`);

  if (synced.length > 0) {
    return {
      ok: false,
      kind: "partial",
      message: `${synced.length} of ${total} ${label(total)} synchronized. ${issues.join("; ")}.`,
    };
  }

  // Nothing synchronized. Report the most actionable cause: reconnect, then failure, then a running sync.
  if (reauth.length > 0) {
    return { ok: false, kind: "reauth", message: `${issues.join("; ")}. Reconnect Gmail to restore access.` };
  }
  if (failed.length > 0) {
    return { ok: false, kind: "failed", message: `${issues.join("; ")}. Your connection is unchanged; retry with Sync now.` };
  }
  return {
    ok: false,
    kind: "locked",
    message: `${issues.join("; ")}. Wait for it to finish, then refresh this page.`,
  };
}

export function noGmailAccountResult(hasSampleAccount: boolean): ManualSyncResult {
  return {
    ok: false,
    kind: "none",
    message: hasSampleAccount
      ? "This is sample data. Connect Gmail to synchronize a real mailbox."
      : "Connect Gmail first.",
  };
}
