/**
 * Loads SAMPLE mailbox fixtures for local development. Idempotent: re-running replaces the sample account.
 *   npm run db:seed:fixtures   (requires DATABASE_URL and a migrated database)
 * The sample account is marked provider "fixture" and cannot be synchronized with Gmail.
 */
import { db } from "../src/lib/db";
import { FIXTURE_OWNER_ADDRESS, FIXTURE_THREADS } from "../src/fixtures/mailbox";
import { computeThreadAggregates } from "../src/lib/gmail/aggregates";
import { refreshThreadAnalysis } from "../src/lib/analysis/pipeline";
import { parseAddressList } from "../src/lib/gmail/parse";

const SAMPLE_USER_EMAIL = "sample-user@inboxzero.invalid";

async function main() {
  const user = await db.user.upsert({
    where: { email: SAMPLE_USER_EMAIL },
    create: { email: SAMPLE_USER_EMAIL, name: "Sample user (fixtures)" },
    update: {},
  });

  // Replace any previous sample account so re-seeding is deterministic.
  await db.connectedAccount.deleteMany({ where: { userId: user.id, provider: "fixture" } });
  const account = await db.connectedAccount.create({
    data: {
      userId: user.id,
      provider: "fixture",
      emailAddress: FIXTURE_OWNER_ADDRESS,
      encryptedRefreshToken: "fixture-not-a-token",
      scopes: "fixture",
      status: "ACTIVE",
      lastSyncedAt: new Date(),
    },
  });

  for (const t of FIXTURE_THREADS) {
    const thread = await db.thread.create({
      data: {
        userId: user.id,
        connectedAccountId: account.id,
        gmailThreadId: t.id,
        subject: t.messages[0]!.subject,
        labelIds: t.labels ?? [],
        lastMessageAt: new Date(t.messages[t.messages.length - 1]!.sentAt),
        lastMessageFromMe: t.messages[t.messages.length - 1]!.from === FIXTURE_OWNER_ADDRESS,
        archived: !(t.labels ?? []).includes("INBOX"),
        starred: (t.labels ?? []).includes("STARRED"),
        messageCount: t.messages.length,
        unreadCount: t.messages.filter((m) => m.unread).length,
      },
    });

    for (const m of t.messages) {
      await db.message.create({
        data: {
          userId: user.id,
          threadId: thread.id,
          gmailMessageId: m.id,
          fromAddress: m.from,
          fromName: m.fromName ?? null,
          toAddresses: parseAddressList(m.to.join(", ")).map((a) => a.address),
          ccAddresses: [],
          subject: m.subject,
          bodyText: m.body,
          snippet: m.body.slice(0, 160),
          isFromMe: m.from === FIXTURE_OWNER_ADDRESS,
          isUnread: Boolean(m.unread),
          sentAt: new Date(m.sentAt),
          listUnsubscribe: Boolean(m.listUnsubscribe),
        },
      });
    }

    const stored = await db.message.findMany({ where: { threadId: thread.id } });
    const agg = computeThreadAggregates(
      stored.map((m) => ({
        fromAddress: m.fromAddress,
        toAddresses: m.toAddresses,
        ccAddresses: m.ccAddresses,
        subject: m.subject,
        snippet: m.snippet,
        sentAt: m.sentAt,
        isUnread: m.isUnread,
        isFromMe: m.isFromMe,
        labelIds: t.labels ?? [],
        attachmentsCount: 0,
      })),
    );
    if (agg) await db.thread.update({ where: { id: thread.id }, data: agg });
    await refreshThreadAnalysis(user.id, thread.id);
  }

  console.log(`[seed] sample account loaded for ${SAMPLE_USER_EMAIL} with ${FIXTURE_THREADS.length} conversations (SAMPLE DATA)`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("[seed] failed", err instanceof Error ? err.message : err);
  await db.$disconnect();
  process.exit(1);
});
