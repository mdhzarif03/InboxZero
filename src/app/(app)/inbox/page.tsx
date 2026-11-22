import Link from "next/link";
import { redirect } from "next/navigation";
import type { CategoryKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { syncNow } from "@/lib/actions/user";
import { CATEGORY_LABELS, CATEGORY_ORDER, formatDate } from "@/lib/utils";
import { Archive, ChevronRight, Flame, Hourglass, Inbox, Mail, RefreshCw, Reply, CalendarClock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { categoryStyle } from "@/lib/ui/category-style";
import { cn } from "@/lib/utils";

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
      <div className="mx-auto max-w-xl pt-6">
        <EmptyState title="Connect Gmail to see your inbox" icon={Mail}>
          <p>InboxZero needs read-only access to your mailbox. Nothing is sent or changed.</p>
          <Link href="/gmail" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>Connect Gmail</Link>
        </EmptyState>
      </div>
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
  const n = (k: string) => countByCategory.get(k) ?? 0;
  const activeLabel = active === "ALL" ? "All conversations" : CATEGORY_LABELS[active];

  return (
    <div className="space-y-7">
      <PageHeader
        icon={Inbox}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-success/60" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            {account.emailAddress}{account.provider !== "gmail" ? " (sample)" : ""}
          </span>
        }
        title="Smart inbox"
        description={account.lastSyncedAt ? `Last synced ${formatDate(account.lastSyncedAt)}. Conversations are grouped by what needs your attention.` : "Not synced yet. Conversations are grouped by what needs your attention."}
        actions={
          <form action={syncFromInbox}>
            <SubmitButton variant="outline" pendingLabel="Syncing…"><RefreshCw /> Sync inbox</SubmitButton>
          </form>
        }
      />

      {account.lastSyncError ? <Notice tone="error">Last sync failed: {account.lastSyncError}</Notice> : null}

      <section aria-label="Overview" className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Priority" value={n("PRIORITY")} icon={Flame} href="/inbox?category=PRIORITY" tone={categoryStyle("PRIORITY").tile} active={active === "PRIORITY"} />
        <StatCard label="Needs reply" value={n("NEEDS_REPLY")} icon={Reply} href="/inbox?category=NEEDS_REPLY" tone={categoryStyle("NEEDS_REPLY").tile} active={active === "NEEDS_REPLY"} />
        <StatCard label="Waiting for reply" value={n("WAITING_FOR_REPLY")} icon={Hourglass} href="/inbox?category=WAITING_FOR_REPLY" tone={categoryStyle("WAITING_FOR_REPLY").tile} active={active === "WAITING_FOR_REPLY"} />
        <StatCard label="Deadlines" value={n("DEADLINES")} icon={CalendarClock} href="/inbox?category=DEADLINES" tone={categoryStyle("DEADLINES").tile} active={active === "DEADLINES"} />
      </section>

      <div>
        <nav aria-label="Categories" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <CategoryTab href="/inbox" label="All" active={active === "ALL"} />
          {CATEGORY_ORDER.map((c) => (
            <CategoryTab key={c} href={`/inbox?category=${c}`} label={CATEGORY_LABELS[c]!} count={countByCategory.get(c)} category={c} active={active === c} />
          ))}
        </nav>

        <div className="mt-4">
          {threads.length === 0 ? (
            <EmptyState title={account.lastSyncedAt ? "Nothing in this view" : "No conversations yet"} icon={active === "ARCHIVED" ? Archive : Inbox}>
              {account.lastSyncedAt ? "Try another category or sync again later." : "Press Sync inbox to fetch the last 90 days of mail."}
            </EmptyState>
          ) : (
            <>
              <p className="mb-2 px-1 text-xs text-muted-foreground">
                {activeLabel} · {threads.length}{threads.length === 100 ? "+" : ""} {threads.length === 1 ? "conversation" : "conversations"}
              </p>
              <ul className="stagger overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                {threads.map((t) => {
                  const cat = t.classification ? categoryStyle(t.classification.category) : null;
                  const unread = t.unreadCount > 0;
                  return (
                    <li key={t.id} className="border-b border-border last:border-0">
                      <Link
                        href={`/inbox/${t.id}`}
                        className="group relative flex items-center gap-4 px-4 py-3.5 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                      >
                        {unread ? <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" /> : null}
                        <span className={cn("hidden size-10 shrink-0 place-items-center rounded-xl sm:grid", cat ? cat.tile : "bg-muted text-muted-foreground")}>
                          {cat ? <cat.icon className="size-[18px]" aria-hidden="true" /> : <Mail className="size-[18px]" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("flex items-center gap-2 truncate text-[14.5px]", unread ? "font-semibold" : "font-medium")}>
                            {unread ? <span className="size-1.5 shrink-0 rounded-full bg-primary" role="img" aria-label="unread" /> : null}
                            <span className="truncate">{t.subject}</span>
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{t.snippet}</p>
                          <div className="mt-2 flex items-center gap-2 sm:hidden">
                            {t.classification ? <Badge className={cat?.badge}>{CATEGORY_LABELS[t.classification.category]}</Badge> : null}
                            <span className="text-xs text-muted-foreground">{formatDate(t.lastMessageAt)}</span>
                          </div>
                        </div>
                        <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                          <span className="text-xs tabular-nums text-muted-foreground">{formatDate(t.lastMessageAt)}</span>
                          {t.classification ? <Badge className={cat?.badge}>{CATEGORY_LABELS[t.classification.category]}</Badge> : null}
                        </div>
                        <ChevronRight className="size-4 shrink-0 -translate-x-1 text-muted-foreground/50 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryTab({ href, label, active, count, category }: { href: string; label: string; active: boolean; count?: number; category?: string }) {
  const s = category ? categoryStyle(category) : null;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-transparent bg-foreground text-background shadow-soft"
          : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {s && !active ? <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden="true" /> : null}
      {label}
      {count ? (
        <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-background/20" : "bg-muted text-muted-foreground")}>{count}</span>
      ) : null}
    </Link>
  );
}
