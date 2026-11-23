import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { getUserOrNull } from "@/lib/auth";
import { syncConnectedAccount } from "@/lib/gmail/sync";
import { env } from "@/lib/env";

/** Minimum time between user-triggered syncs of one account (protects Gmail quota and our cost). */
const USER_SYNC_COOLDOWN_MS = 30_000;

function workerAuthorized(req: NextRequest): boolean {
  const secret = env().SYNC_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Authenticated progress snapshot for the signed-in user's mailbox. */
export async function GET() {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const account = await db.connectedAccount.findFirst({
    where: { userId: user.id, provider: "gmail" },
    orderBy: { createdAt: "desc" },
    select: {
      emailAddress: true,
      syncProgressStatus: true,
      syncProgressStage: true,
      syncProgressCurrent: true,
      syncProgressTotal: true,
      syncProgressUpdatedAt: true,
      lastSyncedAt: true,
      lastSyncError: true,
      syncLockedAt: true,
    },
  });

  if (!account) return NextResponse.json({ status: "idle" });
  return NextResponse.json({
    status: account.syncProgressStatus,
    stage: account.syncProgressStage,
    current: account.syncProgressCurrent,
    total: account.syncProgressTotal,
    updatedAt: account.syncProgressUpdatedAt,
    lastSyncedAt: account.lastSyncedAt,
    error: account.lastSyncError,
    running: Boolean(account.syncLockedAt),
    emailAddress: account.emailAddress,
  });
}

/**
 * POST /api/sync
 *  - Signed-in user: syncs that user's own accounts only (with cooldown).
 *  - Worker (Authorization: Bearer SYNC_SECRET): syncs every ACTIVE account. Used by the scheduler.
 */
export async function POST(req: NextRequest) {
  if (workerAuthorized(req)) {
    const accounts = await db.connectedAccount.findMany({ where: { status: "ACTIVE", provider: "gmail" }, select: { id: true, userId: true } });
    const results = [];
    for (const a of accounts) results.push({ accountId: a.id, ...(await syncConnectedAccount(a.userId, a.id)) });
    return NextResponse.json({ synced: results.length, results: results.map((r) => ({ accountId: r.accountId, status: r.status })) });
  }

  const user = await getUserOrNull();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const accounts = await db.connectedAccount.findMany({ where: { userId: user.id, status: "ACTIVE", provider: "gmail" }, select: { id: true, lastSyncedAt: true } });
  const results = [];
  for (const a of accounts) {
    if (a.lastSyncedAt && Date.now() - a.lastSyncedAt.getTime() < USER_SYNC_COOLDOWN_MS) {
      results.push({ accountId: a.id, status: "cooldown" });
      continue;
    }
    const outcome = await syncConnectedAccount(user.id, a.id);
    results.push({ accountId: a.id, status: outcome.status });
  }
  return NextResponse.json({ results });
}
