import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Deadlines</h1>
        <p className="text-sm text-muted-foreground">
          Dates found in your email. Dates marked “needs confirmation” were inferred from relative or yearless wording.
        </p>
      </div>
      {deadlines.length === 0 ? (
        <EmptyState title="No dates found yet">Dates from synced conversations appear here.</EmptyState>
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
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((d) => (
          <li key={d.id} className={`space-y-1.5 px-4 py-3 ${muted ? "text-muted-foreground" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge>{KIND_LABEL[d.kind] ?? "Date"}</Badge>
              <Badge>{d.status === "CONFIRMED" || d.userConfirmed ? "Confirmed" : "Needs confirmation"}</Badge>
              <span>{d.normalizedAt ? formatDateTime(d.normalizedAt) : "no normalized date"}</span>
              {d.timezone ? <span>{d.timezone}</span> : <span>· timezone not stated</span>}
            </div>
            <p className="text-sm">“{d.originalExpression}”</p>
            <p className="text-xs text-muted-foreground">
              From{" "}
              <Link href={`/inbox/${d.thread.id}`} className="underline underline-offset-2 hover:text-foreground">{d.thread.subject}</Link>
              {" · "}confidence {Math.round(d.confidence * 100)}%
            </p>
            {!d.userConfirmed && d.status === "AMBIGUOUS" ? <ThreadActions kind="deadline" id={d.id} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
