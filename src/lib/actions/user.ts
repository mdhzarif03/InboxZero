"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { writeAudit } from "@/lib/audit";
import { deleteAccount, setAiPreference } from "@/lib/privacy/account";
import { disconnectGmailAccount } from "@/lib/gmail/oauth";
import { syncConnectedAccount } from "@/lib/gmail/sync";
import { noGmailAccountResult, summarizeManualSync, type AccountSyncResult, type ManualSyncResult } from "@/lib/gmail/manual-sync";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const idSchema = z.string().min(1).max(64);

/** Parses FormData into a plain object so zod can validate it. */
function fields(formData: FormData): Record<string, FormDataEntryValue | null> {
  return Object.fromEntries(formData.entries());
}

const actionStatusSchema = z.object({
  id: idSchema,
  status: z.enum(["CONFIRMED", "COMPLETED", "DISMISSED", "OPEN"]),
});

/**
 * Updates an extracted action. Dismissing records the description so detection does not resurface it.
 * Marking an action as user-controlled stops automatic re-analysis from changing it.
 */
export async function setActionStatus(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = actionStatusSchema.safeParse(fields(formData));
  if (!parsed.success) return { ok: false, error: "Invalid action update." };

  const updated = await db.actionItem.updateMany({
    where: { id: parsed.data.id, userId: user.id },
    data: { status: parsed.data.status, userEdited: true },
  });
  if (updated.count === 0) return { ok: false, error: "Action not found." };

  await writeAudit(user.id, "action.status_changed", { status: parsed.data.status });
  revalidatePath("/actions");
  return { ok: true };
}

const confirmDeadlineSchema = z.object({ id: idSchema });

export async function confirmDeadline(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = confirmDeadlineSchema.safeParse(fields(formData));
  if (!parsed.success) return { ok: false, error: "Invalid deadline." };
  const updated = await db.deadline.updateMany({
    where: { id: parsed.data.id, userId: user.id },
    data: { userConfirmed: true, status: "CONFIRMED" },
  });
  if (updated.count === 0) return { ok: false, error: "Deadline not found." };
  revalidatePath("/deadlines");
  return { ok: true };
}

const followUpSchema = z.object({
  threadId: idSchema,
  suggestedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Choose a valid date."),
});

/** Creates or updates a manual follow-up reminder for a thread the user owns. */
export async function createFollowUpReminder(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = followUpSchema.safeParse(fields(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid reminder." };

  const thread = await db.thread.findFirst({
    where: { id: parsed.data.threadId, userId: user.id },
    include: { connectedAccount: { select: { emailAddress: true } }, messages: { orderBy: { sentAt: "desc" }, take: 1 } },
  });
  if (!thread) return { ok: false, error: "Conversation not found." };
  const lastSent = thread.messages[0];
  const contact = lastSent?.toAddresses.find((a) => a !== thread.connectedAccount.emailAddress) ?? "unknown";

  await db.followUp.upsert({
    where: { threadId: thread.id },
    create: {
      userId: user.id,
      threadId: thread.id,
      contactAddress: contact,
      sentAt: lastSent?.sentAt ?? thread.lastMessageAt,
      suggestedAt: new Date(parsed.data.suggestedAt),
      status: "WAITING",
      reason: "Manual reminder set by you.",
      manual: true,
    },
    update: { suggestedAt: new Date(parsed.data.suggestedAt), status: "WAITING", manual: true, reason: "Manual reminder set by you." },
  });
  revalidatePath("/follow-ups");
  return { ok: true };
}

const dismissFollowUpSchema = z.object({ threadId: idSchema });

export async function dismissFollowUp(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = dismissFollowUpSchema.safeParse(fields(formData));
  if (!parsed.success) return { ok: false, error: "Invalid follow-up." };
  const updated = await db.followUp.updateMany({
    where: { threadId: parsed.data.threadId, userId: user.id },
    data: { status: "DISMISSED" },
  });
  if (updated.count === 0) return { ok: false, error: "Follow-up not found." };
  revalidatePath("/follow-ups");
  return { ok: true };
}

const aiPreferenceSchema = z.object({
  provider: z.enum(["none", "ollama", "gemini"]),
  cloudConsent: z.enum(["on", "off"]).optional(),
});

export async function updateAiPreference(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = aiPreferenceSchema.safeParse(fields(formData));
  if (!parsed.success) return { ok: false, error: "Invalid AI setting." };
  // Server-side gate, independent of the disabled radio button in the UI.
  if (parsed.data.provider === "gemini") {
    if (env().GEMINI_TIER !== "paid") return { ok: false, error: "Gemini is unavailable on the free tier, which may not receive email content." };
    if (!env().GEMINI_API_KEY) return { ok: false, error: "Gemini is not configured on this server." };
    if (parsed.data.cloudConsent !== "on") return { ok: false, error: "Tick the consent box to use Gemini." };
  }
  await setAiPreference(user.id, {
    provider: parsed.data.provider,
    cloudConsent: parsed.data.cloudConsent === "on",
  });
  revalidatePath("/settings");
  return { ok: true, message: "AI preference saved." };
}

export async function disconnectGmail(): Promise<ActionResult> {
  const user = await requireUser();
  // Only real Gmail connections are disconnected here. Sample data is not a Gmail connection.
  const accounts = await db.connectedAccount.findMany({ where: { userId: user.id, provider: "gmail" }, select: { id: true } });
  for (const account of accounts) await disconnectGmailAccount(account.id, user.id);
  const count = accounts.length;
  revalidatePath("/settings");
  revalidatePath("/inbox");
  return { ok: true, message: count ? "Gmail disconnected and local mail removed." : "No Gmail account was connected." };
}

/**
 * Synchronizes every active Gmail account and reports the aggregate outcome.
 * Sample (fixture) accounts are never synchronized with Gmail.
 * Only a completed sync for every account is reported as success.
 */
export async function syncNow(): Promise<ManualSyncResult> {
  const user = await requireUser();
  const accounts = await db.connectedAccount.findMany({
    where: { userId: user.id, status: "ACTIVE", provider: "gmail" },
    select: { id: true, emailAddress: true },
  });
  if (accounts.length === 0) {
    const sample = await db.connectedAccount.count({ where: { userId: user.id, provider: "fixture" } });
    return noGmailAccountResult(sample > 0);
  }

  const results: AccountSyncResult[] = [];
  for (const account of accounts) {
    const outcome = await syncConnectedAccount(user.id, account.id);
    results.push({ emailAddress: account.emailAddress, status: outcome.status });
  }
  revalidatePath("/inbox");
  revalidatePath("/gmail");
  return summarizeManualSync(results);
}

/**
 * Deletes the account, then clears the session cookie directly.
 * Calling Auth.js signOut after deletion is avoided: the session row is already gone by then.
 * Sessions are database rows, so deleting the user also invalidates every session server-side.
 */
export async function deleteMyAccount(): Promise<void> {
  const user = await requireUser();
  await deleteAccount(user.id);
  const store = await cookies();
  for (const name of ["authjs.session-token", "__Secure-authjs.session-token"]) {
    store.delete(name);
  }
  redirect("/?deleted=1");
}
