import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronRight, Clock3, Inbox, Mail, MessageSquareText, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ThreadActions } from "../inbox/[threadId]/thread-actions";
import { formDismissFollowUp } from "@/lib/actions/forms";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await requireUser();
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);

  const [account, actionCount, dueFollowUpCount, unreadCount, actions, followUps, deadlines, unreadThreads] = await Promise.all([
    db.connectedAccount.findFirst({
      where: { userId: user.id, provider: "gmail", status: "ACTIVE" },
      select: { emailAddress: true, lastSyncedAt: true, syncProgressStatus: true },
    }),
    db.actionItem.count({ where: { userId: user.id, status: { in: ["OPEN", "CONFIRMED"] } } }),
    db.followUp.count({ where: { userId: user.id, status: "DUE" } }),
    db.thread.count({ where: { userId: user.id, archived: false, unreadCount: { gt: 0 } } }),
    db.actionItem.findMany({
      where: { userId: user.id, status: { in: ["OPEN", "CONFIRMED"] } },
      include: { thread: { select: { id: true, subject: true, lastMessageAt: true } } },
      orderBy: [{ priority: "asc" }, { deadlineAt: "asc" }, { createdAt: "desc" }],
      take: 7,
    }),
    db.followUp.findMany({
      where: { userId: user.id, status: { in: ["DUE", "WAITING"] }, suggestedAt: { lte: horizon } },
      include: { thread: { select: { id: true, subject: true } } },
      orderBy: [{ suggestedAt: "asc" }],
      take: 5,
    }),
    db.deadline.findMany({
      where: { userId: user.id, normalizedAt: { gte: now, lte: horizon }, userConfirmed: true },
      include: { thread: { select: { id: true, subject: true } } },
      orderBy: [{ normalizedAt: "asc" }],
      take: 5,
    }),
    db.thread.findMany({
      where: { userId: user.id, archived: false, unreadCount: { gt: 0 } },
      select: { id: true, subject: true, snippet: true, lastMessageAt: true, unreadCount: true },
      orderBy: [{ lastMessageAt: "desc" }],
      take: 5,
    }),
  ]);

  const overdueActions = actions.filter((item) => item.deadlineAt && item.deadlineAt < now).length;
  const greetingDate = now.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Inbox}
        eyebrow={greetingDate}
        title="Today"
        description="A practical view of what needs your attention, what you're waiting on, and what's coming up."
        actions={account ? <Badge tone="success">Synced mailbox</Badge> : <Link href="/gmail" className="text-sm font-medium text-primary hover:underline">Connect Gmail</Link>}
      />

      <section aria-label="Work overview" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Open actions" value={actionCount} icon={CheckCircle2} href="/actions" tone="bg-primary/10 text-primary" />
        <StatCard label="Follow-ups due" value={dueFollowUpCount} icon={Clock3} href="/follow-ups" tone="bg-amber-500/10 text-amber-600" />
        <StatCard label="Unread conversations" value={unreadCount} icon={Mail} href="/inbox" tone="bg-sky-500/10 text-sky-600" />
        <StatCard label="Upcoming dates" value={deadlines.length} icon={CalendarClock} href="/deadlines" tone="bg-emerald-500/10 text-emerald-600" />
      </section>

      {account?.lastSyncedAt ? (
        <p className="text-xs text-muted-foreground">Last synced {formatDateTime(account.lastSyncedAt)}. Counts reflect the latest synced mailbox data.</p>
      ) : account ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm">Your Gmail account is connected but has not been synced yet. <Link href="/gmail" className="font-medium text-primary hover:underline">Sync your mailbox</Link>.</div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Connect Gmail to build your daily work queue. InboxZero uses read-only access.</div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="min-w-0 space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Do next</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Open commitments</h2>
            </div>
            <Link href="/actions" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">All actions <ChevronRight className="size-4" /></Link>
          </div>
          {actions.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {actions.map((item) => {
                const late = Boolean(item.deadlineAt && item.deadlineAt < now);
                return (
                  <li key={item.id} className="p-4 transition-colors hover:bg-muted/30">
                    <div className="flex items-start gap-3">
                      <span className={late ? "mt-1.5 size-2 shrink-0 rounded-full bg-destructive" : "mt-1.5 size-2 shrink-0 rounded-full bg-primary"} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-6">{item.description}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <Link href={`/inbox/${item.thread.id}`} className="truncate hover:text-primary">{item.thread.subject}</Link>
                          {item.deadlineAt ? <><span>·</span><span className={late ? "font-medium text-destructive" : ""}>{late ? "Overdue" : "Due"} {formatDate(item.deadlineAt)}</span></> : item.deadlineText ? <><span>·</span><span>{item.deadlineText}</span></> : null}
                        </div>
                        <div className="mt-2"><ThreadActions kind="action" id={item.id} /></div>
                      </div>
                      <Badge tone={item.priority <= 1 ? "danger" : item.priority === 2 ? "warning" : "neutral"}>P{item.priority}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No open commitments" icon={CheckCircle2}>When InboxZero detects a request in a conversation, it appears here for you to confirm or complete.</EmptyState>
          )}
          {overdueActions > 0 ? <p className="text-xs text-destructive">{overdueActions} of the displayed actions have passed their recorded deadline.</p> : null}
        </section>

        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Waiting on others</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Replies to chase</h2>
              </div>
              <Link href="/follow-ups" className="text-sm font-medium text-primary hover:underline">View all</Link>
            </div>
            {followUps.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {followUps.map((item) => (
                  <li key={item.id} className="p-3.5">
                    <div className="flex items-center gap-2"><Badge tone={item.status === "DUE" ? "danger" : "info"}>{item.status === "DUE" ? "Follow up" : "Waiting"}</Badge><span className="truncate text-xs text-muted-foreground">{item.contactAddress}</span></div>
                    <Link href={`/inbox/${item.thread.id}`} className="mt-2 block text-sm font-medium hover:text-primary">{item.thread.subject}</Link>
                    <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                    <form action={formDismissFollowUp} className="mt-2">
                      <input type="hidden" name="threadId" value={item.thread.id} />
                      <SubmitButton variant="ghost" size="sm" pendingLabel="Saving…">Dismiss</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No follow-ups due in the next 14 days.</p>}
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next 14 days</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Dates on the horizon</h2>
              </div>
              <Link href="/deadlines" className="text-sm font-medium text-primary hover:underline">Calendar list</Link>
            </div>
            {deadlines.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {deadlines.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 p-3.5">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-center">
                      <span className="text-xs font-semibold">{item.normalizedAt?.toLocaleDateString("en", { month: "short" })}</span>
                      <span className="text-sm font-bold tabular-nums">{item.normalizedAt?.getDate()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.originalExpression}</p>
                      <Link href={`/inbox/${item.thread.id}`} className="mt-1 block truncate text-xs text-muted-foreground hover:text-primary">{item.thread.subject}</Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No confirmed dates in the next 14 days.</p>}
          </section>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inbox activity</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Unread conversations</h2>
          </div>
          <Link href="/inbox" className="text-sm font-medium text-primary hover:underline">Open inbox</Link>
        </div>
        {unreadThreads.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {unreadThreads.map((thread) => (
              <li key={thread.id}>
                <Link href={`/inbox/${thread.id}`} className="flex items-center gap-3 p-3.5 hover:bg-muted/30">
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{thread.subject}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{thread.snippet}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDate(thread.lastMessageAt)}</span>
                  <Badge>{thread.unreadCount} unread</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No unread conversations. Your inbox is caught up.</p>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><MessageSquareText className="size-3.5" /> Requests and dates are suggestions until you confirm them.</span>
        <Link href="/search" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Search all synced mail <ChevronRight className="size-3.5" /></Link>
      </div>
    </div>
  );
}
