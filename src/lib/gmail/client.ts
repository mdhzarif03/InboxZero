import { google, type gmail_v1 } from "googleapis";
import type { Auth } from "googleapis";
import { decodeBase64Url, type GmailMessage, type GmailPart } from "@/lib/gmail/parse";

export class HistoryExpiredError extends Error {
  readonly code = "HISTORY_EXPIRED";

  constructor() {
    super(
      "Gmail history cursor expired. A full resynchronization is required.",
    );
    this.name = "HistoryExpiredError";
  }
}

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

function gmailFor(auth: Auth.OAuth2Client): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth });
}

/**
 * Space out Gmail API request starts with headroom below the 6,000-unit/user/minute
 * quota. A one-second minimum caps even 60-unit full-message requests at 3,600
 * units/minute per warm server instance. The account sync lock prevents duplicate
 * sync workers for the same mailbox; this local gate also smooths other requests.
 */
const MIN_REQUEST_INTERVAL_MS = 1_000;

let nextRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

async function waitForRequestSlot(): Promise<void> {
  let release!: () => void;
  const previous = requestQueue;

  requestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  const now = Date.now();
  const scheduledAt = Math.max(now, nextRequestAt);

  nextRequestAt = scheduledAt + MIN_REQUEST_INTERVAL_MS;

  release();

  const wait = scheduledAt - now;

  if (wait > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
}

type GmailErrorDetails = {
  status: number | undefined;
  reason: string | undefined;
  retryAfterMs: number;
};

function getErrorDetails(err: unknown): GmailErrorDetails {
  const error = err as {
    code?: number | string;
    response?: {
      status?: number;
      headers?: Record<string, unknown>;
      data?: {
        error?: {
          message?: string;
          errors?: Array<{ reason?: string }>;
        };
      };
    };
  };

  const rawStatus = error.response?.status ?? error.code;
  const status =
    typeof rawStatus === "number"
      ? rawStatus
      : typeof rawStatus === "string" && /^\d+$/.test(rawStatus)
        ? Number(rawStatus)
        : undefined;

  const reason = error.response?.data?.error?.errors?.[0]?.reason;

  const retryAfterHeader = error.response?.headers?.["retry-after"];
  const retryAfterSeconds = Number(retryAfterHeader);

  const retryAfterMs =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;

  return { status, reason, retryAfterMs };
}

function isRetryableError(details: GmailErrorDetails): boolean {
  const { status, reason } = details;

  return (
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    reason === "rateLimitExceeded" ||
    reason === "userRateLimitExceeded" ||
    reason === "backendError"
  );
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await waitForRequestSlot();
      return await fn();
    } catch (err) {
      lastError = err;

      const details = getErrorDetails(err);

      if (!isRetryableError(details) || attempt === attempts - 1) {
        break;
      }

      const exponentialBackoff = Math.min(60_000, 1_000 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 1_000);

      const delay = Math.max(details.retryAfterMs, exponentialBackoff + jitter);

      console.warn(
        `[Gmail API] Temporary error. Status: ${details.status ?? "unknown"}, reason: ${details.reason ?? "unknown"}. Retrying in ${delay}ms.`,
      );

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  const details = getErrorDetails(lastError);

  const originalMessage =
    lastError instanceof Error ? lastError.message : "Gmail request failed";

  throw new GmailApiError(
    `${originalMessage}${details.reason ? ` (reason: ${details.reason})` : ""}`,
    details.status,
    details.reason,
  );
}

/**
 * Public wrapper for Gmail API calls made outside this module.
 */
export function gmailRequest<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn);
}

export async function getMailboxProfile(
  auth: Auth.OAuth2Client,
): Promise<{ emailAddress: string; historyId: string }> {
  const res = await withRetry(() =>
    gmailFor(auth).users.getProfile({ userId: "me" }),
  );

  return {
    emailAddress: res.data.emailAddress ?? "",
    historyId: res.data.historyId ?? "",
  };
}

export async function listRecentMessageRefs(
  auth: Auth.OAuth2Client,
  opts: { query: string; maxMessages: number },
): Promise<Array<{ id: string; threadId: string }>> {
  const gmail = gmailFor(auth);
  const refs: Array<{ id: string; threadId: string }> = [];

  let pageToken: string | undefined;

  do {
    const remaining = opts.maxMessages - refs.length;

    if (remaining <= 0) break;

    const res = await withRetry(() =>
      gmail.users.messages.list({
        userId: "me",
        q: opts.query,
        maxResults: Math.min(100, remaining),
        pageToken,
      }),
    );

    for (const message of res.data.messages ?? []) {
      if (message.id && message.threadId) {
        refs.push({
          id: message.id,
          threadId: message.threadId,
        });
      }
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

export async function listHistoryChanges(
  auth: Auth.OAuth2Client,
  startHistoryId: string,
): Promise<HistoryChanges> {
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
          historyTypes: [
            "messageAdded",
            "messageDeleted",
            "labelAdded",
            "labelRemoved",
          ],
          pageToken,
        }),
      );
    } catch (err) {
      if (err instanceof GmailApiError && err.status === 404) {
        throw new HistoryExpiredError();
      }

      throw err;
    }

    latestHistoryId = res.data.historyId ?? latestHistoryId;

    for (const record of res.data.history ?? []) {
      for (const item of record.messagesAdded ?? []) {
        if (item.message?.id && item.message.threadId) {
          addedOrChanged.set(item.message.id, {
            id: item.message.id,
            threadId: item.message.threadId,
          });
        }
      }

      for (const item of record.labelsAdded ?? []) {
        if (item.message?.id && item.message.threadId) {
          addedOrChanged.set(item.message.id, {
            id: item.message.id,
            threadId: item.message.threadId,
          });
        }
      }

      for (const item of record.labelsRemoved ?? []) {
        if (item.message?.id && item.message.threadId) {
          addedOrChanged.set(item.message.id, {
            id: item.message.id,
            threadId: item.message.threadId,
          });
        }
      }

      for (const item of record.messagesDeleted ?? []) {
        if (item.message?.id) {
          deleted.add(item.message.id);
        }
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  for (const id of deleted) {
    addedOrChanged.delete(id);
  }

  return {
    addedOrChanged: [...addedOrChanged.values()],
    deletedIds: [...deleted],
    latestHistoryId,
  };
}


/**
 * Replace RFC 2392 cid: references with data URLs for inline image parts.
 * Gmail stores many logos as inline MIME attachments rather than public URLs.
 */
export async function embedInlineImages(
  auth: Auth.OAuth2Client,
  message: GmailMessage,
  html: string | null,
): Promise<string | null> {
  if (!html || !message.payload) return html;
  const gmail = gmailFor(auth);
  const replacements = new Map<string, string>();

  const walk = async (part: GmailPart): Promise<void> => {
    const mimeType = (part.mimeType ?? "").toLowerCase();
    const contentId = part.headers?.find(
      (header) => (header.name ?? "").toLowerCase() === "content-id",
    )?.value?.trim().replace(/^<|>$/g, "");
    if (contentId && mimeType.startsWith("image/")) {
      let data = part.body?.data ?? null;
      if (!data && part.body?.attachmentId && message.id) {
        const response = await withRetry(() =>
          gmail.users.messages.attachments.get({
            userId: "me",
            messageId: message.id!,
            id: part.body!.attachmentId!,
          }),
        );
        data = response.data.data ?? null;
      }
      if (data) {
        const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
        replacements.set(contentId.toLowerCase(), `data:${mimeType};base64,${base64}`);
      }
    }
    for (const child of part.parts ?? []) await walk(child);
  };

  await walk(message.payload);
  let result = html;
  for (const [contentId, dataUrl] of replacements) {
    const escapedId = contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  auth: Auth.OAuth2Client,
  id: string,
): Promise<GmailMessage | null> {");
    result = result.replace(new RegExp(`cid:${escapedId}`, "gi"), dataUrl);
  }
  return result;
}

export async function getFullMessage(
  auth: Auth.OAuth2Client,
  id: string,
): Promise<GmailMessage | null> {
  try {
    const res = await withRetry(() =>
      gmailFor(auth).users.messages.get({
        userId: "me",
        id,
        format: "full",
      }),
    );

    return res.data as GmailMessage;
  } catch (err) {
    if (err instanceof GmailApiError && err.status === 404) {
      return null;
    }

    throw err;
  }
}
