import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ThreadActions } from "../inbox/[threadId]/thread-actions";

export const metadata = { title: "Action Center" };
export const dynamic = "force-dynamic";

/** Priority 1 is the most urgent (rows are ordered ascending), so lower numbers get warmer colors. */
function priorityStyle(p: number): { chip: string; bar: string } {
  if (p <= 1) return { chip: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300", bar: "bg-rose-500" };
  if (p === 2) return { chip: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300", bar: "bg-amber-500" };
  return { chip: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300", bar: "bg-sky-500" };
}

export default async function ActionCenterPage() {
  const user = await requireUser();
  const actions = await db.actionItem.findMany({
    where: { userId: user.id, status: { in: ["OPEN", "CONFIRMED"] } },
    include: { thread: { select: { id: true, subject: true, lastMessageAt: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const confirmed = actions.filter((a) => a.status === "CONFIRMED").length;

  return (
    <div className="space-y-7">
      <PageHeader
        icon={ListChecks}
        title="Action center"
        description="Requests found in your email. Confirm, complete or dismiss each one."
        actions={
          actions.length > 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Badge tone="primary">{actions.length} open</Badge>
              <Badge tone="success">{confirmed} confirmed</Badge>
            </div>
          ) : null
        }
      />

      {actions.length === 0 ? (
        <EmptyState title="No open actions" icon={CheckCircle2}>Actions appear here after a sync finds requests addressed to you.</EmptyState>
      ) : (
        <ul className="stagger grid gap-4 md:grid-cols-2">
          {actions.map((a) => {
            const ps = priorityStyle(a.priority);
            return (
              <li key={a.id} className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-elevated">
                <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", ps.bar)} />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={ps.chip}>P{a.priority}</Badge>
                  <Badge tone={a.status === "CONFIRMED" ? "success" : "neutral"}>{a.status === "CONFIRMED" ? "Confirmed" : "Suggested"}</Badge>
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground" title={`${Math.round(a.confidence * 100)}% confidence`}>
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(a.confidence * 100)}%` }} />
                    </span>
                    {Math.round(a.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-3.5 text-[15px] font-medium leading-relaxed">{a.description}</p>
                {a.deadlineText ? (
                  <p className="mt-2.5 flex items-start gap-2 text-[13px] text-muted-foreground">
                    <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>Deadline text: “{a.deadlineText}”{a.deadlineAt ? ` · ${formatDate(a.deadlineAt)}` : " · not confirmed"}</span>
                  </p>
                ) : null}
                <Link href={`/inbox/${a.thread.id}`} className="mt-4 inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-primary">
                  <span className="truncate">{a.thread.subject}</span>
                  <span className="shrink-0 text-xs">· {formatDate(a.thread.lastMessageAt)}</span>
                  <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                </Link>
                <div className="mt-auto border-t border-border pt-1">
                  <ThreadActions kind="action" id={a.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
