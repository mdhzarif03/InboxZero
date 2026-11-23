import { Bot, CalendarClock, CheckCircle2, Clock3, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { InboxAssistant } from "@/components/assistant/inbox-assistant";

export const metadata = { title: "Inbox Assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const user = await requireUser();
  const now = new Date();
  const [actions, deadlines, followUps, connected] = await Promise.all([
    db.actionItem.findMany({
      where: { userId: user.id, status: { in: ["OPEN", "CONFIRMED"] } },
      include: { thread: { select: { id: true, subject: true } } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
    db.deadline.findMany({
      where: { userId: user.id, normalizedAt: { gte: now }, userConfirmed: true },
      include: { thread: { select: { id: true, subject: true } } },
      orderBy: { normalizedAt: "asc" },
      take: 4,
    }),
    db.followUp.findMany({
      where: { userId: user.id, status: { in: ["DUE", "WAITING"] } },
      include: { thread: { select: { id: true, subject: true } } },
      orderBy: { suggestedAt: "asc" },
      take: 4,
    }),
    db.connectedAccount.count({ where: { userId: user.id, provider: "gmail", status: "ACTIVE" } }),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        icon={Bot}
        eyebrow={<span className="inline-flex items-center gap-2"><Sparkles className="size-3.5 text-primary" /> YOUR EMAIL, UNDERSTOOD</span>}
        title="Inbox Assistant"
        description="Your daily email command center: open commitments, upcoming dates, waiting replies and free, private search across synced conversations."
      />

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><ListChecks className="size-4 text-primary" /><h2 className="text-sm font-semibold">Your open commitments</h2></div>
            <Badge>{actions.length} shown</Badge>
          </div>
          {actions.length ? (
            <ul className="mt-4 space-y-3">
              {actions.map((action) => (
                <li key={action.id} className="flex gap-3 border-t border-border pt-3 first:border-0 first:pt-0">
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{action.description}</p>
                    <Link href={`/inbox/${action.thread.id}`} className="mt-1 block truncate text-xs text-muted-foreground hover:text-primary">{action.thread.subject}</Link>
                    {action.deadlineText ? <p className="mt-1 text-xs text-muted-foreground">Deadline: {action.deadlineText}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-muted-foreground">No open commitments detected. Sync your inbox to refresh this view.</p>}
          <Link href="/actions" className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">Open Action Center →</Link>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2"><CalendarClock className="size-4 text-orange-500" /><h2 className="text-sm font-semibold">Upcoming dates</h2></div>
            {deadlines.length ? <ul className="mt-3 space-y-2">{deadlines.map((item) => <li key={item.id} className="text-sm"><p className="font-medium">{item.originalExpression}</p><Link href={`/inbox/${item.thread.id}`} className="block truncate text-xs text-muted-foreground hover:text-primary">{item.thread.subject}</Link></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No confirmed upcoming dates.</p>}
          </section>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2"><Clock3 className="size-4 text-sky-500" /><h2 className="text-sm font-semibold">Waiting on others</h2></div>
            {followUps.length ? <ul className="mt-3 space-y-2">{followUps.map((item) => <li key={item.id} className="text-sm"><p className="font-medium">{item.contactAddress}</p><Link href={`/inbox/${item.thread.id}`} className="block truncate text-xs text-muted-foreground hover:text-primary">{item.thread.subject}</Link></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Nothing is currently marked as waiting.</p>}
          </section>
        </div>
      </div>

      {connected === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Connect Gmail to let InboxZero build context from your conversations.</div>
      ) : null}

      <InboxAssistant />
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" /> Your email remains read-only. Inbox Assistant uses deterministic search and your existing analysis records; it does not call an external AI API.</p>
    </div>
  );
}
