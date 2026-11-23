import { google } from "googleapis";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getAuthorizedClient } from "@/lib/gmail/oauth";
import {
  getFullMessage,
  getMailboxProfile,
  gmailRequest,
  HistoryExpiredError,
  listHistoryChanges,
  listRecentMessageRefs,
} from "@/lib/gmail/client";
import {
  normalizeGmailMessage,
  isFromOwnAddress,
  type NormalizedMessage,
} from "@/lib/gmail/parse";
import { refreshThreadAnalysis } from "@/lib/analysis/pipeline";
import { computeThreadAggregates } from "@/lib/gmail/aggregates";

export { computeThreadAggregates };

export const INITIAL_SYNC_DAYS = 90;
export const INITIAL_SYNC_MAX_MESSAGES = 300;
export const LOCK_TTL_MS = 10 * 60 * 1000;

// Keep Gmail message fetching sequential to reduce quota pressure.
const FETCH_CONCURRENCY = 1;

async function setSyncProgress(
  accountId: string,
  status: string,
  stage: string | null,
  current: number,
  total: number,
): Promise<void> {
  await db.connectedAccount.update({
    where: { id: accountId },
    data: {
      syncProgressStatus: status,
      syncProgressStage: stage,
      syncProgressCurrent: current,
      syncProgressTotal: total,
      syncProgressUpdatedAt: new Date(),
    },
  });
}

export type SyncOutcome =
  | {
      status: "synced";
      mode: "initial" | "incremental";
      messagesUpserted: number;
      messagesDeleted: number;
      threadsTouched: number;
    }
  | { status: "skipped_locked" }
  | { status: "needs_reauth" }
  | { status: "failed"; error: string };

/** Soft lock: returns true if this run acquired the lock. Expired locks are reclaimable. */
async function acquireLock(connectedAccountId: string): Promise<boolean> {
  const now = new Date();

  const result = await db.connectedAccount.updateMany({
    where: {
      id: connectedAccountId,
      OR: [
        { syncLockedAt: null },
        {
          syncLockedAt: {
            lt: new Date(now.getTime() - LOCK_TTL_MS),
          },
        },
      ],
    },
    data: { syncLockedAt: now },
  });

  return result.count === 1;
}

async function releaseLock(connectedAccountId: string): Promise<void> {
  await db.connectedAccount.update({
    where: { id: connectedAccountId },
    data: { syncLockedAt: null },
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    },
  );

  await Promise.all(workers);

  return results;
}

/** Writes one normalized message and returns the thread id it belongs to. */
async function persistMessage(
  userId: string,
  connectedAccountId: string,
  ownAddress: string,
  msg: NormalizedMessage,
): Promise<string> {
  const thread = await db.thread.upsert({
    where: {
      connectedAccountId_gmailThreadId: {
        connectedAccountId,
        gmailThreadId: msg.gmailThreadId,
      },
    },
    create: {
      userId,
      connectedAccountId,
      gmailThreadId: msg.gmailThreadId,
      subject: msg.subject,
      lastMessageAt: msg.sentAt,
      labelIds: msg.labelIds,
    },
    update: {},
  });

  // Message payloads already include labelIds. Preserve their union on the thread
  // so the initial import does not need an additional threads.get call per thread.
  const mergedLabels = [...new Set([...thread.labelIds, ...msg.labelIds])];
  if (mergedLabels.length !== thread.labelIds.length ||
      mergedLabels.some((label) => !thread.labelIds.includes(label))) {
    await db.thread.update({
      where: { id: thread.id },
      data: { labelIds: mergedLabels },
    });
  }

  const isFromMe = isFromOwnAddress(msg.fromAddress, ownAddress);

  await db.message.upsert({
    where: {
      threadId_gmailMessageId: {
        threadId: thread.id,
        gmailMessageId: msg.gmailMessageId,
      },
    },
    create: {
      userId,
      threadId: thread.id,
      gmailMessageId: msg.gmailMessageId,
      fromAddress: msg.fromAddress,
      fromName: msg.fromName,
      toAddresses: msg.toAddresses,
      ccAddresses: msg.ccAddresses,
      subject: msg.subject,
      bodyText: msg.bodyText,
      snippet: msg.snippet,
      isFromMe,
      isUnread: msg.isUnread,
      sentAt: msg.sentAt,
      listUnsubscribe: msg.listUnsubscribe,
      precedence: msg.precedence,
      attachmentsJson: msg.attachments,
    },
    update: {
      isUnread: msg.isUnread,
      subject: msg.subject,
      bodyText: msg.bodyText,
      snippet: msg.snippet,
      attachmentsJson: msg.attachments,
    },
  });

  return thread.id;
}

/** Recomputes a thread's aggregate fields from the messages stored for it. */
async function recomputeThread(
  threadId: string,
  ownAddress: string,
): Promise<void> {
  const messages = await db.message.findMany({
    where: { threadId },
    select: {
      fromAddress: true,
      toAddresses: true,
      ccAddresses: true,
      subject: true,
      snippet: true,
      sentAt: true,
      isUnread: true,
      isFromMe: true,
      attachmentsJson: true,
    },
  });

  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { labelIds: true },
  });

  const aggregates = computeThreadAggregates(
    messages.map((message) => ({
      ...message,
      isFromMe:
        message.isFromMe || isFromOwnAddress(message.fromAddress, ownAddress),
      attachmentsCount: Array.isArray(message.attachmentsJson)
        ? message.attachmentsJson.length
        : 0,
      labelIds: thread?.labelIds ?? [],
    })),
  );

  if (!aggregates) return;

  await db.thread.update({
    where: { id: threadId },
    data: aggregates,
  });
}

async function fetchAndNormalize(
  auth: Parameters<typeof getFullMessage>[0],
  ids: Array<{ id: string }>,
  onProgress?: (current: number, total: number) => Promise<void>,
): Promise<NormalizedMessage[]> {
  const fetched = await mapWithConcurrency(
    ids,
    FETCH_CONCURRENCY,
    async (ref) => {
      const raw = await getFullMessage(auth, ref.id);
      const normalized = raw ? normalizeGmailMessage(raw) : null;
      if (onProgress) await onProgress(ids.indexOf(ref) + 1, ids.length);
      return normalized;
    },
  );

  return fetched.filter(
    (message): message is NormalizedMessage => message !== null,
  );
}

export async function syncConnectedAccount(
  userId: string,
  connectedAccountId: string,
): Promise<SyncOutcome> {
  const account = await db.connectedAccount.findFirst({
    where: {
      id: connectedAccountId,
      userId,
    },
  });

  if (!account) {
    return {
      status: "failed",
      error: "Connected account not found.",
    };
  }

  if (account.provider !== "gmail") {
    return {
      status: "failed",
      error: "This account is sample data and cannot be synchronized.",
    };
  }

  if (account.status !== "ACTIVE") {
    return {
      status: "failed",
      error: `Connection is ${account.status}.`,
    };
  }

  if (!(await acquireLock(account.id))) {
    return { status: "skipped_locked" };
  }

  await setSyncProgress(account.id, "running", "Preparing mailbox", 0, 0);

  try {
    let auth;

    try {
      auth = await getAuthorizedClient(account.id, userId);
    } catch (err) {
      if (err instanceof Error && err.message === "NEEDS_REAUTH") {
        return { status: "needs_reauth" };
      }

      throw err;
    }

    const ownAddress = account.emailAddress;

    let mode: "initial" | "incremental" = "incremental";
    let touchedThreadIds = new Set<string>();
    let upserted = 0;
    let deleted = 0;
    let newHistoryId: string;

    // Capture the cursor BEFORE listing so changes during the sync
    // are picked up during the next run.
    const profile = await getMailboxProfile(auth);
    newHistoryId = profile.historyId;

    const runInitial = async () => {
      mode = "initial";

      await setSyncProgress(account.id, "running", "Finding recent emails", 0, 0);
      const refs = await listRecentMessageRefs(auth, {
        query: `newer_than:${INITIAL_SYNC_DAYS}d`,
        maxMessages: INITIAL_SYNC_MAX_MESSAGES,
      });

      await setSyncProgress(account.id, "running", "Downloading email details", 0, refs.length);
      const messages = await fetchAndNormalize(auth, refs, (current, total) =>
        setSyncProgress(account.id, "running", "Downloading email details", current, total),
      );

      await setSyncProgress(account.id, "running", "Saving emails", 0, messages.length);
      let saved = 0;
      for (const msg of messages) {
        const threadId = await persistMessage(
          userId,
          account.id,
          ownAddress,
          msg,
        );

        touchedThreadIds.add(threadId);
        saved += 1;
        await setSyncProgress(account.id, "running", "Saving emails", saved, messages.length);
      }

      upserted = messages.length;
    };

    if (!account.historyId) {
      await runInitial();
    } else {
      try {
        const changes = await listHistoryChanges(auth, account.historyId);

        newHistoryId = changes.latestHistoryId || newHistoryId;

        await setSyncProgress(account.id, "running", "Checking new emails", 0, changes.addedOrChanged.length);
        const messages = await fetchAndNormalize(auth, changes.addedOrChanged, (current, total) =>
          setSyncProgress(account.id, "running", "Checking new emails", current, total),
        );

        let saved = 0;
        for (const msg of messages) {
          const threadId = await persistMessage(
            userId,
            account.id,
            ownAddress,
            msg,
          );

          touchedThreadIds.add(threadId);
          saved += 1;
          await setSyncProgress(account.id, "running", "Saving new emails", saved, messages.length);
        }

        upserted = messages.length;

        if (changes.deletedIds.length > 0) {
          const removed = await db.message.findMany({
            where: {
              userId,
              gmailMessageId: {
                in: changes.deletedIds,
              },
            },
            select: { threadId: true },
          });

          removed.forEach((item) => {
            touchedThreadIds.add(item.threadId);
          });

          const result = await db.message.deleteMany({
            where: {
              userId,
              gmailMessageId: {
                in: changes.deletedIds,
              },
            },
          });

          deleted = result.count;
        }
      } catch (err) {
        if (err instanceof HistoryExpiredError) {
          touchedThreadIds = new Set();
          await runInitial();
        } else {
          throw err;
        }
      }
    }

    // On initial import, labels were captured from each full message payload
    // and merged into the local thread during persistence. Avoid one extra
    // threads.get request (40 quota units) for every imported thread.
    // Incremental sync still refreshes thread labels because labels may have
    // been removed from messages and the local model stores labels per thread.
    await setSyncProgress(account.id, "running", "Organizing conversations", 0, touchedThreadIds.size);
    let organized = 0;
    if (mode === "incremental") {
      for (const threadId of touchedThreadIds) {
        await refreshThreadLabelsAndAggregates(auth, threadId, ownAddress);
        organized += 1;
        await setSyncProgress(account.id, "running", "Organizing conversations", organized, touchedThreadIds.size);
      }
    } else {
      for (const threadId of touchedThreadIds) {
        await recomputeThread(threadId, ownAddress);
        organized += 1;
        await setSyncProgress(account.id, "running", "Organizing conversations", organized, touchedThreadIds.size);
      }
    }

    // Run analysis for changed threads.
    // One analysis failure must not interrupt the entire sync.
    await setSyncProgress(account.id, "running", "Analyzing conversations", 0, touchedThreadIds.size);
    let analyzed = 0;
    for (const threadId of touchedThreadIds) {
      await refreshThreadAnalysis(userId, threadId).catch((err) => {
        console.error("[GMAIL ANALYSIS ERROR]", threadId, err);
      });
      analyzed += 1;
      await setSyncProgress(account.id, "running", "Analyzing conversations", analyzed, touchedThreadIds.size);
    }

    await db.connectedAccount.update({
      where: { id: account.id },
      data: {
        historyId: newHistoryId,
        lastSyncedAt: new Date(),
        lastSyncError: null,
        syncProgressStatus: "completed",
        syncProgressStage: "Sync complete",
        syncProgressCurrent: upserted,
        syncProgressTotal: upserted,
        syncProgressUpdatedAt: new Date(),
      },
    });

    await writeAudit(userId, "gmail.synced", {
      mode,
      upserted,
      deleted,
      threads: touchedThreadIds.size,
    });

    return {
      status: "synced",
      mode,
      messagesUpserted: upserted,
      messagesDeleted: deleted,
      threadsTouched: touchedThreadIds.size,
    };
  } catch (err) {
    console.error("[GMAIL SYNC ERROR]", err);

    const message = err instanceof Error ? err.message : "Unknown sync error";

    await db.connectedAccount.update({
      where: { id: account.id },
      data: {
        lastSyncError: message.slice(0, 500),
      },
    });

    await writeAudit(userId, "gmail.sync_failed", {
      reason: message.slice(0, 200),
    });

    return {
      status: "failed",
      error: message,
    };
  } finally {
    await releaseLock(account.id);
  }
}

/**
 * Fetches the thread's current labels from Gmail and recomputes aggregates.
 * The Gmail thread request uses the shared retry and throttling wrapper.
 */
async function refreshThreadLabelsAndAggregates(
  auth: Parameters<typeof getFullMessage>[0],
  threadId: string,
  ownAddress: string,
): Promise<void> {
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { gmailThreadId: true },
  });

  if (!thread) return;

  const gmail = google.gmail({
    version: "v1",
    auth,
  });

  const res = await gmailRequest(() =>
    gmail.users.threads.get({
      userId: "me",
      id: thread.gmailThreadId,
      format: "minimal",
    }),
  ).catch((err) => {
    console.error("[GMAIL THREAD FETCH ERROR]", err);
    return null;
  });

  const labelIds = new Set<string>();

  for (const message of res?.data.messages ?? []) {
    for (const label of message.labelIds ?? []) {
      labelIds.add(label);
    }
  }

  if (res?.data.messages) {
    await db.thread.update({
      where: { id: threadId },
      data: {
        labelIds: [...labelIds],
      },
    });
  }

  await recomputeThread(threadId, ownAddress);
}
