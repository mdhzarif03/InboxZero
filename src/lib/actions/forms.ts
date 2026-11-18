"use server";

import { redirect } from "next/navigation";
import { createFollowUpReminder, dismissFollowUp, updateAiPreference, deleteMyAccount, disconnectGmail, syncNow } from "@/lib/actions/user";

/**
 * Form-action wrappers. HTML forms require void-returning actions; these translate the
 * ActionResult into a redirect carrying a short status message.
 */

function back(path: string, result: { ok: boolean; error?: string; message?: string }): never {
  const key = result.ok ? "notice" : "error";
  const text = result.ok ? result.message ?? "Saved." : result.error ?? "Something went wrong.";
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

export async function formCreateReminder(formData: FormData): Promise<void> {
  const r = await createFollowUpReminder(formData);
  back("/follow-ups", r);
}

export async function formDismissFollowUp(formData: FormData): Promise<void> {
  const r = await dismissFollowUp(formData);
  back("/follow-ups", r);
}

export async function formAiPreference(formData: FormData): Promise<void> {
  const r = await updateAiPreference(formData);
  back("/settings", r);
}

export async function formDisconnectGmail(): Promise<void> {
  const r = await disconnectGmail();
  back("/gmail", r);
}

/** Sync from the Gmail page. Reports the outcome as a code; the detailed error is stored on the account. */
export async function formSyncFromGmail(): Promise<void> {
  const r = await syncNow();
  redirect(`/gmail?manual=${r.kind}`);
}

export async function formDeleteAccount(formData: FormData): Promise<void> {
  // Second confirmation is required in the UI and re-checked here.
  if (formData.get("confirm") !== "DELETE") back("/settings", { ok: false, error: "Type DELETE to confirm." });
  await deleteMyAccount(); // redirects on success
}
