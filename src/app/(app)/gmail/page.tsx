import { CheckCircle2, Link2, Mail, PlugZap, RefreshCw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { formDisconnectGmail, formSyncFromGmail } from "@/lib/actions/forms";
import { GMAIL_READONLY_SCOPE } from "@/lib/gmail/oauth";
import { gmailBanner, type GmailPageParams } from "@/lib/gmail/status";

export const metadata = { title: "Gmail connection" };
export const dynamic = "force-dynamic";

export default async function GmailPage({ searchParams }: { searchParams: Promise<GmailPageParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const accounts = await db.connectedAccount.findMany({
    where: { userId: user.id },
    select: { id: true, provider: true, emailAddress: true, status: true, lastSyncedAt: true, lastSyncError: true, createdAt: true },
  });
  const configured = Boolean(
    env().GOOGLE_GMAIL_CLIENT_ID && env().GOOGLE_GMAIL_CLIENT_SECRET && env().GOOGLE_GMAIL_REDIRECT_URI && env().TOKEN_ENCRYPTION_KEY,
  );
  const sample = accounts.some((a) => a.provider === "fixture");
  const gmailAccounts = accounts.filter((a) => a.provider === "gmail");
  const active = gmailAccounts.find((a) => a.status === "ACTIVE");
  const needsReconnect = gmailAccounts.some((a) => a.status === "NEEDS_REAUTH" || a.status === "REVOKED");
  const banner = gmailBanner(params);
  const recovery = banner?.recovery ?? [];
  // Sync is always available for an active connection. Recovery only changes which action is emphasised.

  const statusFor = (status: string): { label: string; tone: "success" | "warning" | "danger" | "neutral" } =>
    status === "ACTIVE" ? { label: "Connected", tone: "success" }
    : status === "NEEDS_REAUTH" ? { label: "Reconnect needed", tone: "warning" }
    : status === "REVOKED" ? { label: "Access revoked", tone: "danger" }
    : { label: status.toLowerCase(), tone: "neutral" };

  return (
    <div className="space-y-7">
      <PageHeader
        icon={Mail}
        title="Gmail connection"
        description={<>InboxZero requests one permission: <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{GMAIL_READONLY_SCOPE}</code>. It can read your mail. It cannot send, delete, or change labels.</>}
      />

      {banner ? (
        <Notice tone={banner.tone === "success" ? "success" : banner.tone === "error" ? "error" : "info"}>
          <p className="font-semibold">{banner.title}</p>
          <p className="mt-1 text-foreground/80">{banner.body}</p>
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-5">
          {gmailAccounts.length === 0 ? (
            <EmptyState title="No Gmail account connected" icon={PlugZap}>
              Connect your mailbox to start grouping conversations, extracting requests and tracking replies.
            </EmptyState>
          ) : null}

          {gmailAccounts.map((a) => {
            const st = statusFor(a.status);
            return (
              <Card key={a.id} className="overflow-hidden">
                <div className="flex items-start gap-4 p-5">
                  <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl ring-1", a.status === "ACTIVE" ? "bg-success/10 text-success ring-success/25" : "bg-warning/10 text-warning ring-warning/25")}>
                    {a.status === "ACTIVE" ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <XCircle className="size-5" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-semibold">{a.emailAddress}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Connected {formatDateTime(a.createdAt)}
                      {a.lastSyncedAt ? ` · last synced ${formatDateTime(a.lastSyncedAt)}` : " · not synced yet"}
                    </p>
                    {a.lastSyncError ? (
                      <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="status">
                        Last sync error: {a.lastSyncError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}

          {sample && !active ? (
            <Notice>
              SAMPLE DATA is loaded for development. It is not a Gmail connection, and it is not affected by the actions below.
            </Notice>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {!configured ? (
              <Notice tone="error" className="w-full">Gmail OAuth is not configured on this server. Administrators: see docs/SETUP.md.</Notice>
            ) : active && !needsReconnect ? null : (
              <a href="/api/gmail/connect" className={buttonVariants({ size: "lg" })}>
                <Link2 />
                {recovery.includes("reconnect") || needsReconnect ? "Reconnect Gmail" : "Connect Gmail"}
              </a>
            )}

            {active ? (
              <form action={formSyncFromGmail}>
                <SubmitButton variant="outline" size="lg" pendingLabel="Syncing…"><RefreshCw /> Sync now</SubmitButton>
              </form>
            ) : null}

            {active ? (
              <form action={formDisconnectGmail} className="sm:ml-auto">
                <SubmitButton variant="destructive-outline" size="lg" pendingLabel="Disconnecting…"><Trash2 /> Disconnect and delete local mail</SubmitButton>
              </form>
            ) : null}
          </div>
        </div>

        <aside aria-label="What access means" className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-success" aria-hidden="true" /> What InboxZero can do</h2>
            <ul className="mt-4 space-y-2.5 text-[13px] leading-relaxed">
              {["Read your messages and thread metadata", "Group conversations and find requests and dates", "Track replies you are still waiting for"].map((t) => (
                <li key={t} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />{t}</li>
              ))}
            </ul>
            <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold"><XCircle className="size-4 text-destructive" aria-hidden="true" /> What it cannot do</h2>
            <ul className="mt-4 space-y-2.5 text-[13px] leading-relaxed">
              {["Send, delete or archive mail", "Change your labels", "Download attachment files"].map((t) => (
                <li key={t} className="flex gap-2.5"><XCircle className="mt-0.5 size-4 shrink-0 text-destructive/70" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </Card>
          <div className="space-y-2 px-1 text-xs leading-relaxed text-muted-foreground">
            <p>Disconnecting revokes InboxZero’s access at Google and deletes the copy of your mail stored here.</p>
            <p>Attachment files are never downloaded. Only their names and sizes are kept.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
