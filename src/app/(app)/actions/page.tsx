import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ThreadActions } from "../inbox/[threadId]/thread-actions";

export const metadata = { title: "Action Center" };
export const dynamic = "force-dynamic";

export default async function ActionCenterPage() {
  const user = await requireUser();
  const actions = await db.actionItem.findMany({
    where: { userId: user.id, status: { in: ["OPEN", "CONFIRMED"] } },
    include: { thread: { select: { id: true, subject: true, lastMessageAt: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Action Center</h1>
        <p className="text-sm text-muted-foreground">Requests found in your email. Confirm, complete or dismiss each one.</p>
      </div>
      {actions.length === 0 ? (
        <EmptyState title="No open actions">Actions appear here after a sync finds requests addressed to you.</EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {actions.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge>P{a.priority}</Badge>
                <Badge>{a.status === "CONFIRMED" ? "Confirmed" : "Suggested"}</Badge>
                <span>{Math.round(a.confidence * 100)}% confidence</span>
                <span>·</span>
                <Link href={`/inbox/${a.thread.id}`} className="underline underline-offset-2 hover:text-foreground">{a.thread.subject}</Link>
                <span>· {formatDate(a.thread.lastMessageAt)}</span>
              </div>
              <p className="mt-2 text-sm">{a.description}</p>
              {a.deadlineText ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Deadline text: “{a.deadlineText}”{a.deadlineAt ? ` · ${formatDate(a.deadlineAt)}` : " · not confirmed"}
                </p>
              ) : null}
              <ThreadActions kind="action" id={a.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
