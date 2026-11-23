import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CATEGORY_LABELS, cn, formatDateTime } from "@/lib/utils";
import { ArrowLeft, CalendarClock, ExternalLink, ListChecks, MessagesSquare, Paperclip, Sparkles, Bot, Cpu, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { categoryStyle } from "@/lib/ui/category-style";
import { ThreadActions } from "./thread-actions";
import { getAuthorizedClient } from "@/lib/gmail/oauth";
import { getFullMessage } from "@/lib/gmail/client";
import { normalizeGmailMessage } from "@/lib/gmail/parse";

export const dynamic = "force-dynamic";

function buildEmailDocument(html: string): string {
  const policy = "<meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
  const styles = "<style>html,body{margin:0;padding:0;background:#fff;color:#202124;font:14px Arial,sans-serif}body{padding:24px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#1967d2}*{box-sizing:border-box}</style>";
  if (/<head\\b[^>]*>/i.test(html)) {
    return html.replace(/<head\\b[^>]*>/i, (head) => head + policy).replace(/<\\/head>/i, styles + "</head>");
  }
  return "<!doctype html><html><head>" + policy + styles + "</head><body>" + html + "</body></html>";
}

type SummaryItem = {
  kind: string;
  text: string;
  basis: "stated" | "inferred" | string;
  sourceMessageIds?: string[];
};

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string; category?: string }>;
}) {
  const user = await requireUser();
  const { threadId } = await params;
  const query = await searchParams;
  const returnParams = new URLSearchParams();
  if (query.page && /^\d+$/.test(query.page)) returnParams.set("page", query.page);
  if (["25", "50", "100"].includes(query.pageSize ?? "")) returnParams.set("pageSize", query.pageSize!);
  if (query.category) returnParams.set("category", query.category);
  const inboxHref = returnParams.size ? `/inbox?${returnParams.toString()}` : "/inbox";

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

  // Backfill formatted bodies for messages imported before HTML storage existed.
  if (thread.connectedAccount.provider === "gmail" && thread.messages.some((message) => !message.bodyHtmlFetched)) {
    try {
      const auth = await getAuthorizedClient(thread.connectedAccountId, user.id);
      for (const message of thread.messages) {
        if (message.bodyHtmlFetched) continue;
        const raw = await getFullMessage(auth, message.gmailMessageId);
        const normalized = raw ? normalizeGmailMessage(raw) : null;
        if (normalized?.bodyHtml) {
          await db.message.update({ where: { id: message.id }, data: { bodyHtml: normalized.bodyHtml } });
          message.bodyHtml = normalized.bodyHtml;\n          message.bodyHtmlFetched = true;
        }
      }
    } catch (error) {
      console.error("[EMAIL HTML LOAD ERROR]", threadId, error);
    }
  }

  const summaryPayload = (thread.summary?.payload ?? {}) as { source?: string; currentStatus?: string; items?: SummaryItem[]; disclaimer?: string };
  const summaryItems = summaryPayload.items ?? [];
  const isSample = thread.connectedAccount.provider !== "gmail";
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${thread.gmailThreadId}`;

  const lastIndex = thread.messages.length - 1;
  const cat = thread.classification ? categoryStyle(thread.classification.category) : null;
  const followUp = thread.followUps[0];

  return (
    <article className="space-y-6">
      <div className="space-y-4">
        <Link href={inboxHref} className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" /> Smart inbox
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-9">{thread.subject}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
              {thread.classification ? (
                <Badge className={cat?.badge}>{cat ? <cat.icon /> : null}{CATEGORY_LABELS[thread.classification.category]}</Badge>
              ) : null}
              <span className="inline-flex items-center gap-1.5"><MessagesSquare className="size-3.5" aria-hidden="true" />{thread.messageCount} {thread.messageCount === 1 ? "message" : "messages"}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />Last activity {formatDateTime(thread.lastMessageAt)}</span>
            </div>
          </div>
          {isSample ? (
            <span className="shrink-0 text-xs text-muted-foreground">Open in Gmail unavailable for sample data</span>
          ) : (
            <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
              Open in Gmail <ExternalLink />
            </a>
          )}
        </div>
      </div>

      {followUp ? (
        <Notice tone={followUp.status === "DUE" ? "error" : "info"}>
          <span className="font-medium">Follow-up: {followUp.status === "DUE" ? "due now" : `suggested ${formatDateTime(followUp.suggestedAt)}`}.</span>{" "}
          {followUp.reason}
        </Notice>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        {/* Conversation */}
        <section aria-labelledby="messages-heading" className="order-1 min-w-0 space-y-3">
          <h2 id="messages-heading" className="sr-only">Messages</h2>
          <ol className="stagger space-y-3">
            {thread.messages.map((m, idx) => {
              const who = m.isFromMe ? "You" : m.fromName ?? m.fromAddress;
              const attachments = Array.isArray(m.attachmentsJson) ? (m.attachmentsJson as Array<{ filename: string }>) : [];
              return (
                <li key={m.id}>
                  <details open={idx >= lastIndex - 1 || thread.messages.length <= 3} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft open:shadow-soft">
                    <summary className={cn("flex list-none items-center gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden", m.isFromMe && "bg-accent/40")}>
                      <Avatar name={who} seed={m.fromAddress} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {who}
                          {!m.isFromMe && m.fromName ? <span className="ml-1.5 font-normal text-muted-foreground">&lt;{m.fromAddress}&gt;</span> : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{formatDateTime(m.sentAt)}</span>
                      </span>
                      {attachments.length > 0 ? <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-label="Has attachments" /> : null}
                    </summary>
                    <div className="border-t border-border px-4 py-5 sm:px-6 sm:py-6">
                      <dl className="mb-5 grid gap-x-6 gap-y-2 border-b border-border/70 pb-4 text-xs sm:grid-cols-[56px_minmax(0,1fr)]">
                        <dt className="text-muted-foreground">From</dt>
                        <dd className="min-w-0 break-words text-foreground">{m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress}</dd>
                        {m.toAddresses.length > 0 ? <>
                          <dt className="text-muted-foreground">To</dt>
                          <dd className="min-w-0 break-words text-foreground">{m.toAddresses.join(", ")}</dd>
                        </> : null}
                        {m.ccAddresses.length > 0 ? <>
                          <dt className="text-muted-foreground">Cc</dt>
                          <dd className="min-w-0 break-words text-foreground">{m.ccAddresses.join(", ")}</dd>
                        </> : null}
                      </dl>
                      {m.bodyHtml ? (
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-white">
                          <iframe
                            title={`Formatted email from ${m.fromName ?? m.fromAddress}`}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="block min-h-[560px] w-full border-0 bg-white"
                            style={{ height: "min(1100px, 78vh)" }}
                            srcDoc={buildEmailDocument(m.bodyHtml)}
                          />
                        </div>
                      ) : (
                        <div className="max-w-[82ch] whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground sm:text-[15.5px] sm:leading-8">{m.bodyText || m.snippet}</div>
                      )}
                      {attachments.length > 0 ? (
                        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Paperclip className="size-3.5" aria-hidden="true" />
                          {attachments.map((a, i) => (
                            <span key={i} className="rounded-md bg-muted px-2 py-1 font-mono">{a.filename}</span>
                          ))}
                          <span>(names only, files are not downloaded)</span>
                        </p>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Insights rail */}
        <aside className="order-2 grid min-w-0 gap-4 sm:grid-cols-2 xl:sticky xl:top-24 xl:grid-cols-1 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1" aria-label="Conversation insights">
          <Card>
            <section aria-labelledby="summary-heading" className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 id="summary-heading" className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" /> Summary
                </h2>
                <Badge tone={summaryPayload.source === "ai" ? "primary" : "neutral"}>
                  {summaryPayload.source === "ai" ? <Bot /> : <Cpu />}
                  {summaryPayload.source === "ai" ? "AI-generated" : "Rule-based"}
                </Badge>
              </div>
              {summaryPayload.currentStatus ? <p className="text-sm leading-relaxed">{summaryPayload.currentStatus}</p> : null}
              {summaryPayload.source === "ai" && summaryPayload.disclaimer ? (
                <p className="text-xs leading-relaxed text-muted-foreground">{summaryPayload.disclaimer}</p>
              ) : null}
              {summaryItems.length > 0 ? (
                <ul className="space-y-2.5 text-sm">
                  {summaryItems.slice(0, 30).map((item, i) => (
                    <li key={i} className="flex gap-2.5">
                      <Badge tone={item.basis === "stated" ? "success" : "warning"} className="mt-0.5 h-fit shrink-0">{item.basis === "stated" ? "Stated" : "Inferred"}</Badge>
                      <span className="min-w-0 leading-relaxed">{item.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No questions, requests or dates were detected in this conversation.</p>
              )}
            </section>
          </Card>

          <Card>
            <section aria-labelledby="actions-heading" className="space-y-3 p-5">
              <h2 id="actions-heading" className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="size-4 text-primary" aria-hidden="true" /> Detected actions
                {thread.actionItems.length > 0 ? <span className="ml-auto rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">{thread.actionItems.length}</span> : null}
              </h2>
              {thread.actionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open actions for this conversation.</p>
              ) : (
                <ul className="space-y-3">
                  {thread.actionItems.map((a) => (
                    <li key={a.id} className="rounded-xl border border-border bg-background/50 p-3.5">
                      <p className="text-sm leading-relaxed">{a.description}</p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {Math.round(a.confidence * 100)}% confidence · {a.producer.startsWith("deterministic") ? "rule-based" : "AI"}
                        {a.deadlineText ? ` · deadline text: “${a.deadlineText}”` : ""}
                      </p>
                      <ThreadActions kind="action" id={a.id} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Card>

          <Card>
            <section aria-labelledby="deadlines-heading" className="space-y-3 p-5">
              <h2 id="deadlines-heading" className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="size-4 text-primary" aria-hidden="true" /> Dates and deadlines
              </h2>
              {thread.deadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No dates detected.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {thread.deadlines.map((d) => (
                    <li key={d.id} className="space-y-2 rounded-xl border border-border bg-background/50 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={d.status === "CONFIRMED" ? "success" : "warning"}>{d.status === "CONFIRMED" ? "Confirmed" : "Needs confirmation"}</Badge>
                      </div>
                      <p className="font-medium">“{d.originalExpression}”</p>
                      <p className="text-xs text-muted-foreground">
                        {d.normalizedAt ? formatDateTime(d.normalizedAt) : "no date"}
                        {d.timezone ? ` ${d.timezone}` : " · timezone not stated"}
                      </p>
                      {!d.userConfirmed && d.status === "AMBIGUOUS" ? <ThreadActions kind="deadline" id={d.id} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Card>
        </aside>
      </div>
    </article>
  );
}
