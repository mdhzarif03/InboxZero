import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { formCreateReminder, formDismissFollowUp } from "@/lib/actions/forms";

export const metadata = { title: "Follow-ups" };
export const dynamic = "force-dynamic";

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const items = await db.followUp.findMany({
    where: { userId: user.id, status: { in: ["WAITING", "DUE", "SNOOZED"] } },
    include: { thread: { select: { id: true, subject: true } } },
    orderBy: [{ suggestedAt: "asc" }],
    take: 200,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          Conversations where you asked something and no reply has arrived. Only messages that expect a response are tracked.
        </p>
      </div>
      {params.notice ? <Notice tone="success">{params.notice}</Notice> : null}
      {params.error ? <Notice tone="error">{params.error}</Notice> : null}

      {items.length === 0 ? (
        <EmptyState title="Nothing waiting on anyone">When you ask a question in email and it stays unanswered, it shows up here.</EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((f) => (
            <li key={f.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge>{f.status === "DUE" ? "Due" : f.status === "SNOOZED" ? "Snoozed" : "Waiting"}</Badge>
                <span>{f.contactAddress}</span>
                <span>· sent {formatDate(f.sentAt)} ({daysSince(f.sentAt)} days ago)</span>
                <span>· suggested {formatDate(f.suggestedAt)}</span>
                {f.manual ? <span>· manual reminder</span> : null}
              </div>
              <Link href={`/inbox/${f.thread.id}`} className="text-sm font-medium hover:underline">{f.thread.subject}</Link>
              <p className="text-xs text-muted-foreground">{f.reason}</p>
              <div className="flex flex-wrap items-end gap-2">
                <form action={formCreateReminder} className="flex items-end gap-2">
                  <input type="hidden" name="threadId" value={f.thread.id} />
                  <label className="text-xs text-muted-foreground">
                    Remind me on
                    <input
                      type="date"
                      name="suggestedAt"
                      required
                      className="ml-2 h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                    />
                  </label>
                  <SubmitButton variant="outline" size="sm">Set reminder</SubmitButton>
                </form>
                <form action={formDismissFollowUp}>
                  <input type="hidden" name="threadId" value={f.thread.id} />
                  <SubmitButton variant="ghost" size="sm">Dismiss</SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
