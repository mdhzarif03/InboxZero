/**
 * Cross-user isolation against a real database. Skipped unless TEST_DATABASE_URL is set.
 * Run: TEST_DATABASE_URL=postgresql://... npm test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("cross-user data isolation (database)", () => {
  // Imported lazily so that skipped runs do not need a generated Prisma client.
  let db: typeof import("@/lib/db").db;
  let userA: string;
  let userB: string;
  let threadOfA: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    ({ db } = await import("@/lib/db"));
    const a = await db.user.create({ data: { email: `iso-a-${Date.now()}@test.invalid` } });
    const b = await db.user.create({ data: { email: `iso-b-${Date.now()}@test.invalid` } });
    userA = a.id;
    userB = b.id;
    const account = await db.connectedAccount.create({
      data: { userId: userA, provider: "fixture", emailAddress: "a@test.invalid", encryptedRefreshToken: "x", scopes: "x", status: "ACTIVE" },
    });
    const thread = await db.thread.create({
      data: { userId: userA, connectedAccountId: account.id, gmailThreadId: `g-${Date.now()}`, subject: "Private", lastMessageAt: new Date() },
    });
    threadOfA = thread.id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.$disconnect();
  });

  it("does not return another user's thread by id", async () => {
    const found = await db.thread.findFirst({ where: { id: threadOfA, userId: userB } });
    expect(found).toBeNull();
  });

  it("owner can read their own thread", async () => {
    const found = await db.thread.findFirst({ where: { id: threadOfA, userId: userA } });
    expect(found).not.toBeNull();
  });

  it("deleting a user removes their mail and tokens by cascade", async () => {
    await db.user.delete({ where: { id: userA } });
    expect(await db.thread.count({ where: { id: threadOfA } })).toBe(0);
    expect(await db.connectedAccount.count({ where: { userId: userA } })).toBe(0);
    userA = "";
  });
});
