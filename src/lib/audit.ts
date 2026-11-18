import { db } from "@/lib/db";

/**
 * Security-relevant event log. Never pass tokens, email bodies or secrets in `detail`.
 * Writes never throw into the caller's flow: an audit failure must not break a user action,
 * but it is reported to the server log.
 */
export async function writeAudit(userId: string | null, action: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await db.auditLog.create({ data: { userId, action, detail: detail as object } });
  } catch (err) {
    console.error("[audit] write failed", action, err instanceof Error ? err.message : "unknown");
  }
}
