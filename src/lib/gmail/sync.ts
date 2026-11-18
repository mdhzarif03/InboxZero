import { google } from "googleapis";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getAuthorizedClient } from "@/lib/gmail/oauth";
import {
  getFullMessage,
  getMailboxProfile,
  HistoryExpiredError,
  listHistoryChanges,
  listRecentMessageRefs,
} from "@/lib/gmail/client";
import { normalizeGmailMessage, isFromOwnAddress, type NormalizedMessage } from "@/lib/gmail/parse";
import { refreshThreadAnalysis } from "@/lib/analysis/pipeline";
import { computeThreadAggregates } from "@/lib/gmail/aggregates";

export { computeThreadAggregates };

export const INITIAL_SYNC_DAYS = 90;
export const INITIAL_SYNC_MAX_MESSAGES = 300;
export const LOCK_TTL_MS = 10 * 60 * 1000;
const FETCH_CONCURRENCY = 4;

export type SyncOutcome =
  | { status: "synced"; mode: "initial" | "incremental"; messagesUpserted: number; messagesDeleted: number; threadsTouched: number }
  | { status: "skipped_locked" }
  | { status: "needs_reauth" }
  | { status: "failed"; error: string };

/** Soft lock: returns true if this run acquired the lock. Expired locks are reclaimable. */
async function acquireLock(connectedAccountId: string): Promise<boolean> {
  const now = new Date();
  const result = await db.connectedAccount.updateMany({
    where: {
      id: connectedAccountId,
      OR: [{ syncLockedAt: null }, { syncLockedAt: { lt: new Date(now.getTime() - LOCK_TTL_MS) } }],
    },
    data: { syncLockedAt: now },
  });
  return result.count === 1;
}

async function releaseLock(connectedAccountId: string): Promise<void> {
  await db.connectedAccount.update({ where: { id: connectedAccountId }, data: { syncLockedAt: null } });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Writes one normalized message and returns the thread id it belongs to. */
async function persistMessage(userId: string, connectedAccountId: string, ownAddress: string, msg: NormalizedMessage): Promise<string> {
  const thread = await db.thread.upsert({
    where: { connectedAccountId_gmailThreadId: { connectedAccountId, gmailThreadId: msg.gmailThreadId } },
    create: {
      userId,
      connectedAccountId,
      gmailThreadId: msg.gmailThreadId,
      subject: msg.subject,
      lastMessageAt: msg.sentAt,
    },
    update: {},
  });

  const isFromMe = isFromOwnAddress(msg.fromAddress, ownAddress);
  await db.message.upsert({
    where: { threadId_gmailMessageId: { threadId: thread.id, gmailMessageId: msg.gmailMessageId } },
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
async function recomputeThread(threadId: string, ownAddress: string): Promise<void> {
  const messages = await db.message.findMany({
    where: { threadId },
    select: {
      fromAddress: true, toAddresses: true, ccAddresses: true, subject: true, snippet: true,
      sentAt: true, isUnread: true, isFromMe: true, attachmentsJson: true,
    },
  });
  // labelIds are stored on the thread from the most recent sync data for that thread.
  const thread = await db.thread.findUnique({ where: { id: threadId }, select: { labelIds: true } });
  const aggregates = computeThreadAggregates(
    messages.map((m) => ({
      ...m,
      isFromMe: m.isFromMe || isFromOwnAddress(m.fromAddress, ownAddress),
      attachmentsCount: Array.isArray(m.attachmentsJson) ? m.attachmentsJson.length : 0,
      labelIds: thread?.labelIds ?? [],
    })),
  );
  if (!aggregates) return;
  await db.thread.update({ where: { id: threadId }, data: aggregates });
}

async function fetchAndNormalize(auth: Parameters<typeof getFullMessage>[0], ids: Array<{ id: string }>) {
  const fetched = await mapWithConcurrency(ids, FETCH_CONCURRENCY, async (ref) => {
    const raw = await getFullMessage(auth, ref.id);
    return raw ? normalizeGmailMessage(raw) : null;
  });
  return fetched.filter((m): m is NormalizedMessage => m !== null);
}

export async function syncConnectedAccount(userId: string, connectedAccountId: string): Promise<SyncOutcome> {
  const account = await db.connectedAccount.findFirst({ where: { id: connectedAccountId, userId } });
  if (!account) return { status: "failed", error: "Connected account not found." };
  if (account.provider !== "gmail") return { status: "failed", error: "This account is sample data and cannot be synchronized." };
  if (account.status !== "ACTIVE") return { status: "failed", error: `Connection is ${account.status}.` };

  if (!(await acquireLock(account.id))) return { status: "skipped_locked" };

  try {
    let auth;
    try {
      auth = await getAuthorizedClient(account.id, userId);
    } catch (err) {
      if (err instanceof Error && err.message === "NEEDS_REAUTH") return { status: "needs_reauth" };
      throw err;
    }

    const ownAddress = account.emailAddress;
    let mode: "initial" | "incremental" = "incremental";
    let touchedThreadIds = new Set<string>();
    let upserted = 0;
    let deleted = 0;
    let newHistoryId: string;

    // Capture the cursor BEFORE listing so changes during the sync are picked up next run.
    const profile = await getMailboxProfile(auth);
    newHistoryId = profile.historyId;

    const runInitial = async () => {
      mode = "initial";
      const refs = await listRecentMessageRefs(auth, {
        query: `newer_than:${INITIAL_SYNC_DAYS}d`,
        maxMessages: INITIAL_SYNC_MAX_MESSAGES,
      });
      const messages = await fetchAndNormalize(auth, refs);
      for (const msg of messages) {
        touchedThreadIds.add(await persistMessage(userId, account.id, ownAddress, msg));
      }
      upserted = messages.length;
    };

    if (!account.historyId) {
      await runInitial();
    } else {
      try {
        const changes = await listHistoryChanges(auth, account.historyId);
        newHistoryId = changes.latestHistoryId || newHistoryId;
        const messages = await fetchAndNormalize(auth, changes.addedOrChanged);
        for (const msg of messages) {
          touchedThreadIds.add(await persistMessage(userId, account.id, ownAddress, msg));
        }
        upserted = messages.length;
        if (changes.deletedIds.length) {
          const removed = await db.message.findMany({
            where: { userId, gmailMessageId: { in: changes.deletedIds } },
            select: { threadId: true },
          });
          removed.forEach((r) => touchedThreadIds.add(r.threadId));
          const result = await db.message.deleteMany({ where: { userId, gmailMessageId: { in: changes.deletedIds } } });
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

    // Thread labels come from the thread's messages at fetch time; refresh them for touched threads.
    for (const threadId of touchedThreadIds) {
      await refreshThreadLabelsAndAggregates(auth, threadId, ownAddress);
    }

    // Deterministic + enabled-AI analysis for changed threads. Each step is isolated so one failure
    // cannot leave the mirror inconsistent.
    for (const threadId of touchedThreadIds) {
      await refreshThreadAnalysis(userId, threadId).catch((err) => {
        console.error("[sync] analysis failed for thread", threadId, err instanceof Error ? err.message : "");
      });
    }

    await db.connectedAccount.update({
      where: { id: account.id },
      data: { historyId: newHistoryId, lastSyncedAt: new Date(), lastSyncError: null },
    });
    await writeAudit(userId, "gmail.synced", { mode, upserted, deleted, threads: touchedThreadIds.size });

    return { status: "synced", mode, messagesUpserted: upserted, messagesDeleted: deleted, threadsTouched: touchedThreadIds.size };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    await db.connectedAccount.update({
      where: { id: account.id },
      data: { lastSyncError: message.slice(0, 500) },
    });
    await writeAudit(userId, "gmail.sync_failed", { reason: message.slice(0, 200) });
    return { status: "failed", error: message };
  } finally {
    await releaseLock(account.id);
  }
}

/**
 * Fetches the thread's current labels from Gmail (the message-level labels are the source of truth)
 * and recomputes aggregates. Labels are merged from each message's labelIds.
 */
async function refreshThreadLabelsAndAggregates(
  auth: Parameters<typeof getFullMessage>[0],
  threadId: string,
  ownAddress: string,
): Promise<void> {
  const thread = await db.thread.findUnique({ where: { id: threadId }, select: { gmailThreadId: true } });
  if (!thread) return;
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.threads.get({ userId: "me", id: thread.gmailThreadId, format: "minimal" }).catch(() => null);
  const labelIds = new Set<string>();
  for (const m of res?.data.messages ?? []) {
    (m.labelIds ?? []).forEach((l) => labelIds.add(l));
  }
  if (res?.data.messages) {
    await db.thread.update({ where: { id: threadId }, data: { labelIds: [...labelIds] } });
  }
  await recomputeThread(threadId, ownAddress);
}
