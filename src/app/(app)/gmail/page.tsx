import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Gmail connection</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          InboxZero requests one permission: <code className="text-xs">{GMAIL_READONLY_SCOPE}</code>. It can read your mail. It cannot send, delete, or change labels.
        </p>
      </div>

      {banner ? (
        <Notice tone={banner.tone === "success" ? "success" : banner.tone === "error" ? "error" : "info"}>
          <p className="font-medium">{banner.title}</p>
          <p className="mt-1">{banner.body}</p>
        </Notice>
      ) : null}

      {gmailAccounts.map((a) => (
        <div key={a.id} className="rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{a.emailAddress}</p>
            <Badge>
              {a.status === "ACTIVE" ? "Connected" : a.status === "NEEDS_REAUTH" ? "Reconnect needed" : a.status === "REVOKED" ? "Access revoked" : a.status.toLowerCase()}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Connected {formatDateTime(a.createdAt)}
            {a.lastSyncedAt ? ` · last synced ${formatDateTime(a.lastSyncedAt)}` : " · not synced yet"}
          </p>
          {a.lastSyncError ? (
            <p className="mt-2 text-xs text-destructive" role="status">
              Last sync error: {a.lastSyncError}
            </p>
          ) : null}
        </div>
      ))}

      {sample && !active ? (
        <Notice>
          SAMPLE DATA is loaded for development. It is not a Gmail connection, and it is not affected by the actions below.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!configured ? (
          <Notice tone="error">Gmail OAuth is not configured on this server. Administrators: see docs/SETUP.md.</Notice>
        ) : active && !needsReconnect ? null : (
          <a
            href="/api/gmail/connect"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {recovery.includes("reconnect") || needsReconnect ? "Reconnect Gmail" : "Connect Gmail"}
          </a>
        )}

        {active ? (
          <form action={formSyncFromGmail}>
            <SubmitButton variant="outline" pendingLabel="Syncing…">Sync now</SubmitButton>
          </form>
        ) : null}

        {active ? (
          <form action={formDisconnectGmail}>
            <SubmitButton variant="outline" pendingLabel="Disconnecting…">Disconnect Gmail and delete local mail</SubmitButton>
          </form>
        ) : null}
      </div>

      <section className="space-y-2 text-xs text-muted-foreground">
        <p>Disconnecting revokes InboxZero’s access at Google and deletes the copy of your mail stored here.</p>
        <p>Attachment files are never downloaded. Only their names and sizes are kept.</p>
      </section>
    </div>
  );
}
