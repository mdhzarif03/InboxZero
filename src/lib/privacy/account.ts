import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { disconnectGmailAccount } from "@/lib/gmail/oauth";

/**
 * User-facing privacy operations. Each function must be called only after the caller has
 * authenticated the user; ownership is enforced again inside every query.
 */

/** Exports everything stored about the user. Tokens and encrypted credentials are excluded. */
export async function exportUserData(userId: string) {
  const [user, preferences, accounts, threads, summaries, actions, followUps, deadlines, usage] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, createdAt: true } }),
    db.userPreference.findUnique({ where: { userId }, select: { aiProvider: true, cloudAiConsentAt: true, summaryStyle: true } }),
    db.connectedAccount.findMany({ where: { userId }, select: { id: true, emailAddress: true, scopes: true, status: true, createdAt: true, lastSyncedAt: true } }),
    db.thread.findMany({
      where: { userId },
      include: { messages: { select: { gmailMessageId: true, fromAddress: true, fromName: true, toAddresses: true, ccAddresses: true, subject: true, bodyText: true, sentAt: true, isFromMe: true, attachmentsJson: true } }, classification: { select: { category: true, priority: true, reasons: true, producer: true } } },
    }),
    db.threadSummary.findMany({ where: { userId }, select: { threadId: true, payload: true, producer: true, createdAt: true } }),
    db.actionItem.findMany({ where: { userId }, select: { threadId: true, description: true, status: true, deadlineText: true, deadlineAt: true, producer: true, createdAt: true } }),
    db.followUp.findMany({ where: { userId }, select: { threadId: true, contactAddress: true, sentAt: true, suggestedAt: true, status: true, manual: true } }),
    db.deadline.findMany({ where: { userId }, select: { threadId: true, kind: true, originalExpression: true, normalizedAt: true, timezone: true, status: true, userConfirmed: true } }),
    db.aiUsage.findMany({ where: { userId }, select: { provider: true, model: true, task: true, inputTokens: true, outputTokens: true, status: true, createdAt: true } }),
  ]);

  await writeAudit(userId, "account.exported", {});
  return {
    exportedAt: new Date().toISOString(),
    user,
    preferences,
    connectedAccounts: accounts,
    threads,
    summaries,
    actionItems: actions,
    followUps,
    deadlines,
    aiUsage: usage,
    note: "Tokens and encrypted credentials are intentionally excluded.",
  };
}

/** Records the user's choice about cloud AI. Consent is timestamped and can be withdrawn. */
export async function setAiPreference(userId: string, input: { provider: "none" | "ollama" | "gemini"; cloudConsent: boolean }) {
  const consentAt = input.provider === "gemini" && input.cloudConsent ? new Date() : null;
  await db.userPreference.upsert({
    where: { userId },
    create: { userId, aiProvider: input.provider, cloudAiConsentAt: consentAt },
    update: { aiProvider: input.provider, cloudAiConsentAt: consentAt },
  });
  await writeAudit(userId, "ai.preference_changed", { provider: input.provider, cloudConsent: Boolean(consentAt) });
}

/** Disconnects every Gmail account: revokes tokens and deletes mirrored mail. */
export async function disconnectAllGmail(userId: string): Promise<number> {
  const accounts = await db.connectedAccount.findMany({ where: { userId }, select: { id: true } });
  for (const account of accounts) {
    await disconnectGmailAccount(account.id, userId);
  }
  return accounts.length;
}

/**
 * Deletes the account. Order matters:
 *  1. Revoke Gmail tokens at Google (best effort) and remove local mail.
 *  2. Delete the user row. Foreign keys cascade to sessions, mail, AI outputs and preferences.
 *  3. Audit the deletion with no user id, because the user row no longer exists.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await disconnectAllGmail(userId);
  await db.user.delete({ where: { id: userId } });
  await writeAudit(null, "account.deleted", { reason: "user_requested" });
}
