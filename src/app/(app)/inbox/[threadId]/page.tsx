import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABELS, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { ThreadActions } from "./thread-actions";

export const dynamic = "force-dynamic";

type SummaryItem = {
  kind: string;
  text: string;
  basis: "stated" | "inferred" | string;
  sourceMessageIds?: string[];
};

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const user = await requireUser();
  const { threadId } = await params;

  // Ownership is enforced in the query. A thread belonging to another user is indistinguishable from a missing one.
  const thread = await db.thread.findFirst({
    where: { id: threadId, userId: user.id },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      classification: true,
      summary: true,
      actionItems: { where: { status: { in: ["OPEN", "CONFIRMED"] } }, orderBy: { priority: "asc" } },
      deadlines: { orderBy: { normalizedAt: "asc" } },
      followUps: true,
      connectedAccount: { select: { emailAddress: true, provider: true } },
    },
  });
  if (!thread) notFound();

  const summaryPayload = (thread.summary?.payload ?? {}) as { source?: string; currentStatus?: string; items?: SummaryItem[]; disclaimer?: string };
  const summaryItems = summaryPayload.items ?? [];
  const isSample = thread.connectedAccount.provider !== "gmail";
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${thread.gmailThreadId}`;

  return (
    <article className="space-y-6">
      <div>
        <Link href="/inbox" className="text-xs text-muted-foreground hover:text-foreground">← Smart Inbox</Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{thread.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {thread.classification ? <Badge>{CATEGORY_LABELS[thread.classification.category]}</Badge> : null}
          <span>{thread.messageCount} messages</span>
          <span>·</span>
          <span>Last activity {formatDateTime(thread.lastMessageAt)}</span>
          <span>·</span>
          {isSample ? (
            <span>Open in Gmail unavailable for sample data</span>
          ) : (
            <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Open in Gmail</a>
          )}
        </div>
      </div>

      {thread.followUps.length > 0 ? (
        <Notice>
          Follow-up: {thread.followUps[0]!.status === "DUE" ? "due now" : `suggested ${formatDateTime(thread.followUps[0]!.suggestedAt)}`}. {thread.followUps[0]!.reason}
        </Notice>
      ) : null}

      <section aria-labelledby="summary-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="summary-heading" className="text-sm font-semibold">Summary</h2>
          <span className="text-xs text-muted-foreground">
            {summaryPayload.source === "ai" ? "AI-generated" : "Rule-based"}
          </span>
        </div>
        {summaryPayload.currentStatus ? <p className="text-sm">{summaryPayload.currentStatus}</p> : null}
        {summaryPayload.source === "ai" && summaryPayload.disclaimer ? (
          <p className="text-xs text-muted-foreground">{summaryPayload.disclaimer}</p>
        ) : null}
        {summaryItems.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {summaryItems.slice(0, 30).map((item, i) => (
              <li key={i} className="flex gap-2">
                <Badge className="h-fit shrink-0">{item.basis === "stated" ? "Stated" : "Inferred"}</Badge>
                <span className="min-w-0">{item.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No questions, requests or dates were detected in this conversation.</p>
        )}
      </section>

      <section aria-labelledby="actions-heading" className="space-y-2">
        <h2 id="actions-heading" className="text-sm font-semibold">Detected actions</h2>
        {thread.actionItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open actions for this conversation.</p>
        ) : (
          <ul className="space-y-3">
            {thread.actionItems.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-3">
                <p className="text-sm">{a.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Confidence {Math.round(a.confidence * 100)}% · {a.producer.startsWith("deterministic") ? "rule-based" : "AI"}
                  {a.deadlineText ? ` · deadline text: “${a.deadlineText}”` : ""}
                </p>
                <ThreadActions kind="action" id={a.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="deadlines-heading" className="space-y-2">
        <h2 id="deadlines-heading" className="text-sm font-semibold">Dates and deadlines</h2>
        {thread.deadlines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dates detected.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {thread.deadlines.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Badge>{d.status === "CONFIRMED" ? "Confirmed" : "Needs confirmation"}</Badge>
                <span>“{d.originalExpression}”</span>
                <span className="text-xs text-muted-foreground">
                  {d.normalizedAt ? formatDateTime(d.normalizedAt) : "no date"}
                  {d.timezone ? ` ${d.timezone}` : " · timezone not stated"}
                </span>
                {!d.userConfirmed && d.status === "AMBIGUOUS" ? <ThreadActions kind="deadline" id={d.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="messages-heading" className="space-y-3">
        <h2 id="messages-heading" className="text-sm font-semibold">Messages</h2>
        <ol className="space-y-4">
          {thread.messages.map((m) => (
            <li key={m.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.isFromMe ? "You" : m.fromName ?? m.fromAddress}
                  {!m.isFromMe && m.fromName ? <span className="font-normal"> &lt;{m.fromAddress}&gt;</span> : null}
                </span>
                <span>{formatDateTime(m.sentAt)}</span>
              </div>
              {/* Plain text only. React escapes content; no HTML from email is rendered. */}
              <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.bodyText || m.snippet}</div>
              {Array.isArray(m.attachmentsJson) && m.attachmentsJson.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Attachments: {(m.attachmentsJson as Array<{ filename: string }>).map((a) => a.filename).join(", ")} (names only, files are not downloaded)
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
