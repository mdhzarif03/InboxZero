import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { aiStatusForUser } from "@/lib/analysis/ai-enhance";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/notice";
import { formAiPreference, formDeleteAccount } from "@/lib/actions/forms";

export const metadata = { title: "Settings & privacy" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [pref, status] = await Promise.all([
    db.userPreference.findUnique({ where: { userId: user.id } }),
    aiStatusForUser(user.id),
  ]);
  const current = pref?.aiProvider ?? env().AI_PROVIDER;
  const geminiBlockedByTier = env().GEMINI_TIER !== "paid";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings & privacy</h1>
      </div>
      {params.notice ? <Notice tone="success">{params.notice}</Notice> : null}
      {params.error ? <Notice tone="error">{params.error}</Notice> : null}

      <section aria-labelledby="ai-heading" className="space-y-4">
        <h2 id="ai-heading" className="text-sm font-semibold">AI processing</h2>
        <p className="text-sm text-muted-foreground">
          Summaries, classification refinement and action extraction can use AI. Without AI, InboxZero still groups, searches and
          tracks your mail using rules. Only one conversation is sent at a time, and only when its content has changed.
        </p>
        <Notice>Status: {status.message}</Notice>

        <form action={formAiPreference} className="space-y-4 rounded-md border border-border p-4">
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-2 text-xs text-muted-foreground">Provider</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="provider" value="none" defaultChecked={current === "none"} className="mt-1" />
              <span><strong>Rules only.</strong> No email content leaves the server.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="provider" value="ollama" defaultChecked={current === "ollama"} className="mt-1" />
              <span><strong>Local model (Ollama).</strong> Runs on the server you control. Requires Ollama to be installed.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="provider" value="gemini" defaultChecked={current === "gemini"} disabled={geminiBlockedByTier} className="mt-1" />
              <span>
                <strong>Google Gemini (cloud).</strong> Email content is sent to Google.{" "}
                {geminiBlockedByTier
                  ? "Unavailable: this server is not on a paid Gemini tier. Google's free tier may use prompts to improve its products, so it is not used for email."
                  : "Requires a paid Gemini tier and your consent below."}
              </span>
            </label>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="cloudConsent" value="on" defaultChecked={Boolean(pref?.cloudAiConsentAt)} className="mt-1" />
            <span>
              I understand that if Gemini is selected, the subject, sender and body text of the conversations I open for analysis are sent to Google for processing.
            </span>
          </label>

          <SubmitButton size="sm">Save AI settings</SubmitButton>
        </form>
      </section>

      <section aria-labelledby="data-heading" className="space-y-3">
        <h2 id="data-heading" className="text-sm font-semibold">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Download a JSON copy of everything stored about your account. OAuth tokens are never included.
        </p>
        <a href="/api/account/export" className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent">
          Export my data
        </a>
      </section>

      <section aria-labelledby="delete-heading" className="space-y-3">
        <h2 id="delete-heading" className="text-sm font-semibold text-destructive">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          Revokes InboxZero’s Gmail access, deletes all synced mail, summaries, actions and settings, and removes your sign-in. This cannot be undone.
        </p>
        <form action={formDeleteAccount} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            Type DELETE to confirm
            <input name="confirm" autoComplete="off" required className="ml-2 h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <SubmitButton variant="destructive" size="sm">Delete my account</SubmitButton>
        </form>
      </section>
    </div>
  );
}
