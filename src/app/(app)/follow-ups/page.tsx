import Link from "next/link";
import { BellRing, Clock3, Hourglass, MailCheck, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { cn, formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formCreateReminder, formDismissFollowUp } from "@/lib/actions/forms";

export const metadata = { title: "Follow-ups" };
export const dynamic = "force-dynamic";

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

const STATUS: Record<string, { label: string; tone: "danger" | "neutral" | "info" }> = {
  DUE: { label: "Due", tone: "danger" },
  SNOOZED: { label: "Snoozed", tone: "neutral" },
  WAITING: { label: "Waiting", tone: "info" },
};

export default async function FollowUpsPage() {
  const user = await requireUser();
  const items = await db.followUp.findMany({
    where: { userId: user.id, status: { in: ["WAITING", "DUE", "SNOOZED"] } },
    include: { thread: { select: { id: true, subject: true } } },
    orderBy: [{ suggestedAt: "asc" }],
    take: 200,
  });

  const due = items.filter((f) => f.status === "DUE").length;

  return (
    <div className="space-y-7">
      <PageHeader
        icon={Hourglass}
        title="Follow-ups"
        description="Conversations where you asked something and no reply has arrived. Only messages that expect a response are tracked."
        actions={
          items.length > 0 ? (
            <div className="flex items-center gap-2">
              <Badge tone="info">{items.length} waiting</Badge>
              {due > 0 ? <Badge tone="danger">{due} due</Badge> : null}
            </div>
          ) : null
        }
      />

      {items.length === 0 ? (
        <EmptyState title="Nothing waiting on anyone" icon={MailCheck}>When you ask a question in email and it stays unanswered, it shows up here.</EmptyState>
      ) : (
        <ul className="stagger space-y-4">
          {items.map((f) => {
            const st = STATUS[f.status] ?? STATUS.WAITING!;
            const waited = daysSince(f.sentAt);
            return (
              <li key={f.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-elevated">
                <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
                  <Avatar name={f.contactAddress} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {f.manual ? <Badge tone="primary"><BellRing /> Manual reminder</Badge> : null}
                      <span className="truncate text-[13px] text-muted-foreground">{f.contactAddress}</span>
                    </div>
                    <Link href={`/inbox/${f.thread.id}`} className="mt-2 block text-[15px] font-semibold leading-snug tracking-tight transition-colors hover:text-primary">
                      {f.thread.subject}
                    </Link>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.reason}</p>
                    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />Sent {formatDate(f.sentAt)}</span>
                      <span>Suggested {formatDate(f.suggestedAt)}</span>
                    </p>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <p className={cn("text-3xl font-semibold leading-none tracking-tight tabular-nums", f.status === "DUE" && "text-destructive")}>{waited}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{waited === 1 ? "day" : "days"} ago</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-5 py-3.5 sm:flex-row sm:items-end sm:justify-between">
                  <form action={formCreateReminder} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="threadId" value={f.thread.id} />
                    <Field label="Remind me on">
                      <Input type="date" name="suggestedAt" required className="h-8 w-40 text-[13px]" />
                    </Field>
                    <SubmitButton variant="outline" size="sm" pendingLabel="Saving…"><BellRing /> Set reminder</SubmitButton>
                  </form>
                  <form action={formDismissFollowUp}>
                    <input type="hidden" name="threadId" value={f.thread.id} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="Dismissing…"><X /> Dismiss</SubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
