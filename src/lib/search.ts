import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";

/**
 * Basic full-text search (milestone one). PostgreSQL full-text search with metadata filters.
 * Semantic search (pgvector) and AI query parsing are later milestones.
 *
 * Security: every query is parameterized through Prisma.sql, and user_id scoping is applied in
 * the SQL itself. The user id always comes from the server-side session, never from the request.
 */

export const searchInputSchema = z.object({
  q: z.string().trim().max(200).default(""),
  from: z.string().trim().max(200).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export type SearchInput = z.infer<typeof searchInputSchema>;

export type SearchHit = {
  messageId: string;
  threadId: string;
  gmailThreadId: string;
  subject: string;
  fromAddress: string;
  fromName: string | null;
  sentAt: Date;
  rank: number;
};

export async function searchMessages(userId: string, input: SearchInput): Promise<SearchHit[]> {
  const parsed = searchInputSchema.parse(input);
  const conditions: Prisma.Sql[] = [Prisma.sql`m."userId" = ${userId}`];

  if (parsed.q) {
    conditions.push(Prisma.sql`m."searchVector" @@ plainto_tsquery('simple', ${parsed.q})`);
  }
  if (parsed.from) {
    const pattern = `%${parsed.from.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(Prisma.sql`(m."fromAddress" ILIKE ${pattern} OR m."fromName" ILIKE ${pattern})`);
  }
  if (parsed.since) conditions.push(Prisma.sql`m."sentAt" >= ${parsed.since}`);
  if (parsed.until) conditions.push(Prisma.sql`m."sentAt" <= ${parsed.until}`);

  const rankExpr = parsed.q
    ? Prisma.sql`ts_rank(m."searchVector", plainto_tsquery('simple', ${parsed.q}))`
    : Prisma.sql`0::real`;

  const rows = await db.$queryRaw<
    Array<{
      messageId: string;
      threadId: string;
      gmailThreadId: string;
      subject: string;
      fromAddress: string;
      fromName: string | null;
      sentAt: Date;
      rank: number;
    }>
  >(Prisma.sql`
    SELECT m.id AS "messageId", m."threadId" AS "threadId", t."gmailThreadId" AS "gmailThreadId",
           m.subject, m."fromAddress", m."fromName", m."sentAt", ${rankExpr} AS rank
    FROM "Message" m
    JOIN "Thread" t ON t.id = m."threadId" AND t."userId" = m."userId"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY rank DESC, m."sentAt" DESC
    LIMIT ${parsed.limit}
  `);

  return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}
