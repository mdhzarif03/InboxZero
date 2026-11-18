
/**
 * Pure mapping from sync results to what the user is told. Kept separate from the route and the page
 * so the wording rules can be tested. Connection and synchronization are reported as two facts:
 * a connection can succeed while the first sync fails, and the UI must say both.
 */

export type SyncCode = "completed" | "failed" | "reauth" | "locked";

/**
 * Only the status field matters here. Declared structurally so this module does not import the sync
 * engine, which depends on the database.
 */
export type SyncOutcomeStatus = { status: "synced" | "failed" | "needs_reauth" | "skipped_locked" };

/** Compact code carried in the redirect query. Details are read back from the database, not the URL. */
export function syncCodeFromOutcome(outcome: SyncOutcomeStatus): SyncCode {
  switch (outcome.status) {
    case "synced":
      return "completed";
    case "needs_reauth":
      return "reauth";
    case "skipped_locked":
      return "locked";
    case "failed":
      return "failed";
  }
}

export type GmailBanner = {
  tone: "success" | "warning" | "error";
  title: string;
  body: string;
  /** Recovery actions the page should offer next to the banner. */
  recovery: Array<"sync_now" | "reconnect">;
};

export type GmailPageParams = {
  connected?: string;
  sync?: string;
  error?: string;
  /** Result kind of a manual sync: completed | partial | failed | reauth | locked | none. */
  manual?: string;
};

const CONNECT_ERRORS: Record<string, string> = {
  denied: "You declined Gmail access. Nothing was connected.",
  state_mismatch: "The connection request expired or did not match. Please try again.",
  missing_code: "Google did not return an authorization code. Please try again.",
  no_refresh_token: "Google did not issue a long-lived token. Remove InboxZero from your Google account permissions, then connect again.",
  no_profile: "Could not read the mailbox address for this account.",
  exchange_failed: "Google rejected the connection. Please try again.",
  not_configured: "Gmail connection is not configured on this server. See docs/SETUP.md.",
  failed: "The connection could not be started.",
};

/**
 * Banner for the Gmail page. Returns null when there is nothing to report.
 * Rule: a banner that mentions a connection never claims that synchronization succeeded
 * unless the sync code says it completed.
 */
export function gmailBanner(params: GmailPageParams): GmailBanner | null {
  if (params.error) {
    return {
      tone: "error",
      title: "Gmail is not connected",
      body: CONNECT_ERRORS[params.error] ?? "Something went wrong while connecting Gmail.",
      recovery: [],
    };
  }

  if (params.connected === "1") {
    switch (params.sync) {
      case "completed":
        return {
          tone: "success",
          title: "Gmail connected and the first sync completed",
          body: "Your recent conversations are now in the Smart Inbox.",
          recovery: [],
        };
      case "failed":
        return {
          tone: "warning",
          title: "Gmail connected, but the first sync failed",
          body: "Your Gmail account is still connected. No mail was lost. The sync error is shown below. Retry with Sync now; if it keeps failing, check the error and your network connection.",
          recovery: ["sync_now"],
        };
      case "reauth":
        return {
          tone: "error",
          title: "Gmail connected, but Google rejected the stored credentials",
          body: "Reconnect Gmail to restore access. Your previous data is unchanged.",
          recovery: ["reconnect"],
        };
      case "locked":
        return {
          tone: "warning",
          title: "Gmail connected. A sync is already running",
          body: "The first sync is still in progress. Refresh this page in a moment.",
          recovery: [],
        };
      default:
        return {
          tone: "success",
          title: "Gmail connected",
          body: "The first sync has not been reported yet. Use Sync now to fetch your recent conversations.",
          recovery: ["sync_now"],
        };
    }
  }

  switch (params.manual) {
    case "completed":
      return { tone: "success", title: "Mailbox synchronized", body: "Your recent conversations are up to date.", recovery: [] };
    case "partial":
      return {
        tone: "warning",
        title: "Some accounts did not synchronize",
        body: "Accounts that synchronized are up to date. The others are named below with the reason. Your connections are unchanged.",
        recovery: ["sync_now"],
      };
    case "reauth":
      return {
        tone: "error",
        title: "Gmail needs to be reconnected",
        body: "Google rejected the stored credentials for at least one account. Reconnect Gmail to restore access.",
        recovery: ["reconnect"],
      };
    case "failed":
      return {
        tone: "warning",
        title: "Sync did not complete",
        body: "Your Gmail connection was not changed. The error is shown below. Retry with Sync now.",
        recovery: ["sync_now"],
      };
    case "locked":
      return {
        tone: "warning",
        title: "A sync is already running",
        body: "Mailbox synchronization is in progress. This was not counted as a completed sync. Refresh in a moment.",
        recovery: [],
      };
    case "none":
      return {
        tone: "error",
        title: "No Gmail account to synchronize",
        body: "Connect Gmail to load your conversations.",
        recovery: ["reconnect"],
      };
  }
  return null;
}
