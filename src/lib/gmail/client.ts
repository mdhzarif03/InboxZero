import { google, type gmail_v1 } from "googleapis";
import type { Auth } from "googleapis";
import type { GmailMessage } from "@/lib/gmail/parse";

/**
 * Thin, typed wrapper over the Gmail REST API. It contains no business logic.
 * Every call uses the read-only scope; any call that would need more is a bug.
 */

export class HistoryExpiredError extends Error {
  readonly code = "HISTORY_EXPIRED";
  constructor() {
    super("Gmail history cursor expired. A full resynchronization is required.");
  }
}

export class GmailApiError extends Error {
  constructor(message: string, readonly status: number | undefined) {
    super(message);
  }
}

function gmailFor(auth: Auth.OAuth2Client): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = (err as { code?: number; response?: { status?: number } }).response?.status
        ?? (err as { code?: number }).code;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!retryable || i === attempts - 1) break;
      // Exponential backoff with jitter.
      const delay = Math.min(30_000, 500 * 2 ** i) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  const status = (lastError as { response?: { status?: number } }).response?.status;
  throw new GmailApiError(
    lastError instanceof Error ? lastError.message : "Gmail request failed",
    status,
  );
}

export async function getMailboxProfile(auth: Auth.OAuth2Client): Promise<{ emailAddress: string; historyId: string }> {
  const res = await withRetry(() => gmailFor(auth).users.getProfile({ userId: "me" }));
  return {
    emailAddress: res.data.emailAddress ?? "",
    historyId: res.data.historyId ?? "",
  };
}

/** Lists message ids for an initial sync, paginating up to `maxMessages`. */
export async function listRecentMessageRefs(
  auth: Auth.OAuth2Client,
  opts: { query: string; maxMessages: number },
): Promise<Array<{ id: string; threadId: string }>> {
  const gmail = gmailFor(auth);
  const refs: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry(() =>
      gmail.users.messages.list({
        userId: "me",
        q: opts.query,
        maxResults: Math.min(100, opts.maxMessages - refs.length),
        pageToken,
      }),
    );
    for (const m of res.data.messages ?? []) {
      if (m.id && m.threadId) refs.push({ id: m.id, threadId: m.threadId });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && refs.length < opts.maxMessages);
  return refs;
}

export type HistoryChanges = {
  addedOrChanged: Array<{ id: string; threadId: string }>;
  deletedIds: string[];
  latestHistoryId: string;
};

/**
 * Incremental changes since `startHistoryId`. Throws HistoryExpiredError when Google
 * reports the cursor is too old (HTTP 404), which triggers a full resync by the caller.
 */
export async function listHistoryChanges(auth: Auth.OAuth2Client, startHistoryId: string): Promise<HistoryChanges> {
  const gmail = gmailFor(auth);
  const addedOrChanged = new Map<string, { id: string; threadId: string }>();
  const deleted = new Set<string>();
  let latestHistoryId = startHistoryId;
  let pageToken: string | undefined;

  do {
    let res;
    try {
      res = await withRetry(() =>
        gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
          pageToken,
        }),
      );
    } catch (err) {
      if ((err as GmailApiError).status === 404) throw new HistoryExpiredError();
      throw err;
    }
    latestHistoryId = res.data.historyId ?? latestHistoryId;
    for (const record of res.data.history ?? []) {
      for (const m of record.messagesAdded ?? []) {
        if (m.message?.id && m.message.threadId) addedOrChanged.set(m.message.id, { id: m.message.id, threadId: m.message.threadId });
      }
      for (const m of record.labelsAdded ?? []) {
        if (m.message?.id && m.message.threadId) addedOrChanged.set(m.message.id, { id: m.message.id, threadId: m.message.threadId });
      }
      for (const m of record.labelsRemoved ?? []) {
        if (m.message?.id && m.message.threadId) addedOrChanged.set(m.message.id, { id: m.message.id, threadId: m.message.threadId });
      }
      for (const m of record.messagesDeleted ?? []) {
        if (m.message?.id) deleted.add(m.message.id);
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // A message deleted after being added in the same window should not be fetched.
  for (const id of deleted) addedOrChanged.delete(id);
  return { addedOrChanged: [...addedOrChanged.values()], deletedIds: [...deleted], latestHistoryId };
}

/** Fetches a full message. Returns null if it was deleted between listing and fetching. */
export async function getFullMessage(auth: Auth.OAuth2Client, id: string): Promise<GmailMessage | null> {
  try {
    const res = await withRetry(() => gmailFor(auth).users.messages.get({ userId: "me", id, format: "full" }));
    return res.data as GmailMessage;
  } catch (err) {
    if ((err as GmailApiError).status === 404) return null;
    throw err;
  }
}
