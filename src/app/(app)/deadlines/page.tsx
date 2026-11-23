import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ArrowUpRight, CalendarDays, CalendarX2, Globe2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cn, formatDateTime } from "@/lib/utils";
import { dayOfMonth, monthShort, relativeDay } from "@/lib/ui/time";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ThreadActions } from "../inbox/[threadId]/thread-actions";

export const metadata = { title: "Deadlines" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  EXPLICIT_DEADLINE: "Deadline",
  MEETING: "Meeting",
  EVENT: "Event",
  PAYMENT_DUE: "Payment due",
  RENEWAL: "Renewal",
  SUGGESTED_FOLLOW_UP: "Follow-up",
  UNKNOWN: "Date",
};

export default async function DeadlinesPage() {
  const user = await requireUser();
  const deadlines = await db.deadline.findMany({
    where: { userId: user.id },
    include: { thread: { select: { id: true, subject: true } } },
    orderBy: [{ normalizedAt: "asc" }],
    take: 300,
  });

  const now = Date.now();
  const upcoming = deadlines.filter((d) => d.normalizedAt && d.normalizedAt.getTime() >= now - 86_400_000);
  const undated = deadlines.filter((d) => !d.normalizedAt);
  const past = deadlines.filter((d) => d.normalizedAt && d.normalizedAt.getTime() < now - 86_400_000);

  return (
    <div className="space-y-9">
      <PageHeader
        icon={CalendarDays}
        title="Deadlines"
        description="Dates found in your email. Dates marked “needs confirmation” were inferred from relative or yearless wording."
        actions={
          deadlines.length > 0 ? (
            <div className="flex items-center gap-2">
              <Badge tone="primary">{upcoming.length} upcoming</Badge>
              {undated.length ? <Badge tone="warning">{undated.length} undated</Badge> : null}
            </div>
          ) : null
        }
      />
      {deadlines.length === 0 ? (
        <EmptyState title="No dates found yet" icon={CalendarX2}>Dates from synced conversations appear here.</EmptyState>
      ) : (
        <>
          <Section title="Upcoming" rows={upcoming} />
          {undated.length ? <Section title="Undated expressions" rows={undated} /> : null}
          {past.length ? <Section title="Past" rows={past} muted /> : null}
        </>
      )}
    </div>
  );
}

type Row = Prisma.DeadlineGetPayload<{ include: { thread: { select: { id: true; subject: true } } } }>;

function Section({ title, rows, muted = false }: { title: string; rows: Row[]; muted?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">{rows.length}</span>
      </h2>
      <ul className="stagger space-y-3">
        {rows.map((d) => {
          const confirmed = d.status === "CONFIRMED" || d.userConfirmed;
          const when = d.normalizedAt;
          const soon = when ? when.getTime() - Date.now() < 3 * 86_400_000 && when.getTime() >= Date.now() - 86_400_000 : false;
          return (
            <li key={d.id} className={cn("flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:border-primary/25 hover:shadow-elevated sm:p-5", muted && "opacity-70 hover:opacity-100")}>
              <div
                aria-hidden="true"
                className={cn(
                  "flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-none",
                  when ? (soon && !muted ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300" : "border-border bg-muted text-foreground") : "border-dashed border-border bg-muted/50 text-muted-foreground",
                )}
              >
                {when ? (
                  <>
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{monthShort(when)}</span>
                    <span className="mt-1 text-xl font-semibold tabular-nums">{dayOfMonth(when)}</span>
                  </>
                ) : (
                  <CalendarX2 className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{KIND_LABEL[d.kind] ?? "Date"}</Badge>
                  <Badge tone={confirmed ? "success" : "warning"}>{confirmed ? "Confirmed" : "Needs confirmation"}</Badge>
                  {when ? <span className={cn("text-xs font-medium", soon && !muted ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground")}>{relativeDay(when)}</span> : null}
                </div>
                <p className="text-[15px] font-medium leading-snug">“{d.originalExpression}”</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{when ? formatDateTime(when) : "no normalized date"}</span>
                  <span className="inline-flex items-center gap-1"><Globe2 className="size-3" aria-hidden="true" />{d.timezone ?? "timezone not stated"}</span>
                </p>
                <Link href={`/inbox/${d.thread.id}`} className="inline-flex max-w-full items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-primary">
                  <span className="truncate">From {d.thread.subject}</span>
                  <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                </Link>
                {!d.userConfirmed && d.status === "AMBIGUOUS" ? <div className="pt-1"><ThreadActions kind="deadline" id={d.id} /></div> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
