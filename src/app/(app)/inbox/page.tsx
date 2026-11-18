import Link from "next/link";
import { redirect } from "next/navigation";
import type { CategoryKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { syncNow } from "@/lib/actions/user";
import { CATEGORY_LABELS, CATEGORY_ORDER, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";

/** Form action wrapper: server actions used by forms must return void, so we redirect with the outcome. */
async function syncFromInbox() {
  "use server";
  const result = await syncNow();
  redirect(result.ok ? "/inbox?synced=1" : `/inbox?error=${encodeURIComponent(result.message)}`);
}

export const metadata = { title: "Smart Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; synced?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const active = CATEGORY_ORDER.includes(params.category as (typeof CATEGORY_ORDER)[number]) ? params.category! : "ALL";

  const [account, counts] = await Promise.all([
    db.connectedAccount.findFirst({ where: { userId: user.id }, select: { emailAddress: true, provider: true, status: true, lastSyncedAt: true, lastSyncError: true } }),
    db.classification.groupBy({ by: ["category"], where: { userId: user.id }, _count: { _all: true } }),
  ]);

  if (!account || account.status !== "ACTIVE") {
    return (
      <EmptyState title="Connect Gmail to see your inbox">
        <p>InboxZero needs read-only access to your mailbox. Nothing is sent or changed.</p>
        <Link href="/gmail" className="mt-4 inline-block"><Button>Connect Gmail</Button></Link>
      </EmptyState>
    );
  }

  const threads = await db.thread.findMany({
    where: {
      userId: user.id,
      ...(active === "ARCHIVED" ? {} : { archived: false }),
      ...(active !== "ALL" ? { classification: { is: { category: active as CategoryKind } } } : {}),
    },
    include: { classification: { select: { category: true, priority: true, reasons: true } } },
    orderBy: [{ lastMessageAt: "desc" }],
    take: 100,
  });

  const countByCategory = new Map(counts.map((c) => [c.category as string, c._count._all]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Smart Inbox</h1>
          <p className="text-xs text-muted-foreground">
            {account.emailAddress}{account.provider !== "gmail" ? " (sample)" : ""} · {account.lastSyncedAt ? `last synced ${formatDate(account.lastSyncedAt)}` : "not synced yet"}
          </p>
        </div>
        <form action={syncFromInbox}>
          <SubmitButton variant="outline" size="sm">Sync now</SubmitButton>
        </form>
      </div>

      {params.synced ? <Notice tone="success">Mailbox synchronized.</Notice> : null}
      {params.error ? <Notice tone="error">{params.error}</Notice> : null}
      {account.lastSyncError ? <Notice tone="error">Last sync failed: {account.lastSyncError}</Notice> : null}

      <nav aria-label="Categories" className="flex flex-wrap gap-1.5 text-sm">
        <CategoryTab href="/inbox" label="All" active={active === "ALL"} />
        {CATEGORY_ORDER.map((c) => (
          <CategoryTab
            key={c}
            href={`/inbox?category=${c}`}
            label={`${CATEGORY_LABELS[c]}${countByCategory.get(c) ? ` (${countByCategory.get(c)})` : ""}`}
            active={active === c}
          />
        ))}
      </nav>

      {threads.length === 0 ? (
        <EmptyState title={account.lastSyncedAt ? "Nothing in this view" : "No conversations yet"}>
          {account.lastSyncedAt ? "Try another category or sync again later." : "Press Sync now to fetch the last 90 days of mail."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/inbox/${t.id}`} className="block px-4 py-3 hover:bg-accent">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t.unreadCount > 0 ? <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" aria-label="unread" /> : null}
                      {t.subject}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.snippet}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">{formatDate(t.lastMessageAt)}</span>
                    {t.classification ? <Badge>{CATEGORY_LABELS[t.classification.category]}</Badge> : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md border px-2.5 py-1 ${active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
    >
      {label}
    </Link>
  );
}
