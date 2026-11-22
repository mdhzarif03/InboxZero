import { Bot, Cloud, Cpu, Download, ShieldCheck, Settings2, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { aiStatusForUser } from "@/lib/analysis/ai-enhance";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/notice";
import { formAiPreference, formDeleteAccount } from "@/lib/actions/forms";

export const metadata = { title: "Settings & privacy" };
export const dynamic = "force-dynamic";

const optionCls =
  "group relative flex cursor-pointer items-start gap-4 rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-foreground/25 has-[:checked]:border-primary has-[:checked]:bg-accent/50 has-[:checked]:ring-2 has-[:checked]:ring-primary/20 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

export default async function SettingsPage() {
  const user = await requireUser();
  const [pref, status] = await Promise.all([
    db.userPreference.findUnique({ where: { userId: user.id } }),
    aiStatusForUser(user.id),
  ]);
  const current = pref?.aiProvider ?? env().AI_PROVIDER;
  const geminiBlockedByTier = env().GEMINI_TIER !== "paid";

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader icon={Settings2} title="Settings & privacy" description="Control how your mail is analysed, export your data, or remove your account." />

      <section aria-labelledby="ai-heading" className="space-y-4">
        <div>
          <h2 id="ai-heading" className="text-base font-semibold tracking-tight">AI processing</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Summaries, classification refinement and action extraction can use AI. Without AI, InboxZero still groups, searches and
            tracks your mail using rules. Only one conversation is sent at a time, and only when its content has changed.
          </p>
        </div>
        <Notice><span className="font-medium">Status:</span> {status.message}</Notice>

        <form action={formAiPreference}>
          <Card className="space-y-6 p-5">
            <fieldset className="space-y-3">
              <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Provider</legend>

              <label className={optionCls}>
                <input type="radio" name="provider" value="none" defaultChecked={current === "none"} className="peer sr-only" />
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-has-[:checked]:bg-primary group-has-[:checked]:text-primary-foreground"><ShieldCheck className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1 text-sm leading-relaxed"><strong className="block font-semibold">Rules only</strong><span className="text-muted-foreground">No email content leaves the server.</span></span>
                <span aria-hidden="true" className="mt-1 size-4 shrink-0 rounded-full border-2 border-input transition-all group-has-[:checked]:border-[5px] group-has-[:checked]:border-primary" />
              </label>

              <label className={optionCls}>
                <input type="radio" name="provider" value="ollama" defaultChecked={current === "ollama"} className="peer sr-only" />
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-has-[:checked]:bg-primary group-has-[:checked]:text-primary-foreground"><Cpu className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1 text-sm leading-relaxed"><strong className="block font-semibold">Local model (Ollama)</strong><span className="text-muted-foreground">Runs on the server you control. Requires Ollama to be installed.</span></span>
                <span aria-hidden="true" className="mt-1 size-4 shrink-0 rounded-full border-2 border-input transition-all group-has-[:checked]:border-[5px] group-has-[:checked]:border-primary" />
              </label>

              <label className={optionCls}>
                <input type="radio" name="provider" value="gemini" defaultChecked={current === "gemini"} disabled={geminiBlockedByTier} className="peer sr-only" />
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-has-[:checked]:bg-primary group-has-[:checked]:text-primary-foreground"><Cloud className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1 text-sm leading-relaxed">
                  <strong className="block font-semibold">Google Gemini (cloud)</strong>
                  <span className="text-muted-foreground">
                    Email content is sent to Google.{" "}
                    {geminiBlockedByTier
                      ? "Unavailable: this server is not on a paid Gemini tier. Google's free tier may use prompts to improve its products, so it is not used for email."
                      : "Requires a paid Gemini tier and your consent below."}
                  </span>
                </span>
                <span aria-hidden="true" className="mt-1 size-4 shrink-0 rounded-full border-2 border-input transition-all group-has-[:checked]:border-[5px] group-has-[:checked]:border-primary" />
              </label>
            </fieldset>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted/50 p-4 text-sm leading-relaxed">
              <input type="checkbox" name="cloudConsent" value="on" defaultChecked={Boolean(pref?.cloudAiConsentAt)} className="mt-1 size-4 shrink-0 rounded border-input accent-[hsl(var(--primary))]" />
              <span>
                I understand that if Gemini is selected, the subject, sender and body text of the conversations I open for analysis are sent to Google for processing.
              </span>
            </label>

            <div className="flex items-center justify-between gap-3">
              <p className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><Bot className="size-3.5" aria-hidden="true" /> Changes apply to the next conversation analysed.</p>
              <SubmitButton pendingLabel="Saving…">Save AI settings</SubmitButton>
            </div>
          </Card>
        </form>
      </section>

      <section aria-labelledby="data-heading" className="space-y-4">
        <h2 id="data-heading" className="text-base font-semibold tracking-tight">Your data</h2>
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Download a JSON copy of everything stored about your account. OAuth tokens are never included.
          </p>
          <a href="/api/account/export" className={buttonVariants({ variant: "outline" })}><Download /> Export my data</a>
        </Card>
      </section>

      <section aria-labelledby="delete-heading" className="space-y-4">
        <h2 id="delete-heading" className="flex items-center gap-2 text-base font-semibold tracking-tight text-destructive">
          <TriangleAlert className="size-4" aria-hidden="true" /> Delete account
        </h2>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Revokes InboxZero’s Gmail access, deletes all synced mail, summaries, actions and settings, and removes your sign-in. This cannot be undone.
          </p>
          <form action={formDeleteAccount} className="mt-5 flex flex-wrap items-end gap-3">
            <Field label="Type DELETE to confirm" className="w-full sm:w-56">
              <Input name="confirm" autoComplete="off" required placeholder="DELETE" />
            </Field>
            <SubmitButton variant="destructive" pendingLabel="Deleting…">Delete my account</SubmitButton>
          </form>
        </div>
      </section>
    </div>
  );
}
