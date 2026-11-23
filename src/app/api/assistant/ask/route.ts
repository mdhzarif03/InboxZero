import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z.string().trim().min(3).max(600),
});

type Source = { threadId: string; subject: string; reason: string };

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "can", "could", "did", "does", "for",
  "from", "have", "help", "how", "into", "is", "last", "mail", "me", "my", "of", "on",
  "our", "please", "show", "that", "the", "their", "them", "there", "this", "to", "was",
  "what", "when", "where", "which", "who", "with", "would", "you", "your", "email", "emails",
]);

function termsFor(question: string): string[] {
  return [...new Set(question.toLowerCase().match(/[a-z0-9@._-]{3,}/g) ?? [])]
    .filter((term) => !STOP_WORDS.has(term))
    .slice(0, 8);
}

function uniqueSources(items: Source[]): Source[] {
  return [...new Map(items.map((item) => [item.threadId, item])).values()].slice(0, 10);
}

function formatDate(date: Date | null): string {
  if (!date) return "date not confirmed";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a question between 3 and 600 characters." }, { status: 400 });
  }

  const question = parsed.data.question;
  const normalized = question.toLowerCase();
  const terms = termsFor(question);
  const now = new Date();

  const [actions, followUps, deadlines, matching, recent] = await Promise.all([
    db.actionItem.findMany({
      where: { userId: user.id, status: { in: ["OPEN", "CONFIRMED"] } },
      include: { thread: { select: { id: true, subject: true } } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.followUp.findMany({
      where: { userId: user.id, status: { in: ["DUE", "WAITING"] } },
      include: { thread: { select: { id: true, subject: true } } },
      orderBy: [{ suggestedAt: "asc" }],
      take: 100,
    }),
    db.deadline.findMany({
      where: {
        userId: user.id,
        OR: [{ normalizedAt: { gte: now } }, { normalizedAt: null, userConfirmed: true }],
      },
      include: { thread: { select: { id: true, subject: true } } },
      orderBy: [{ normalizedAt: "asc" }],
      take: 100,
    }),
    terms.length ? db.thread.findMany({
      where: {
        userId: user.id,
        archived: false,
        OR: terms.slice(0, 5).flatMap((term) => [
          { subject: { contains: term, mode: "insensitive" as const } },
          { snippet: { contains: term, mode: "insensitive" as const } },
          { messages: { some: { bodyText: { contains: term, mode: "insensitive" as const } } } },
        ]),
      },
      orderBy: { lastMessageAt: "desc" },
      take: 12,
      select: { id: true, subject: true, lastMessageAt: true, snippet: true },
    }) : Promise.resolve([]),
    db.thread.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { lastMessageAt: "desc" },
      take: 8,
      select: { id: true, subject: true, lastMessageAt: true, snippet: true },
    }),
  ]);

  const isWaiting = /wait|waiting|reply|repl(y|ies)|hear back|respond|response|follow.?up/.test(normalized);
  const isDeadline = /deadline|due date|upcoming|meeting|event|payment|renewal|calendar/.test(normalized);
  const isAction = /action|task|todo|to-do|commit|need to do|should i do|attention|urgent|priority/.test(normalized);
  const isRecent = /recent|latest|newest|last emails|last messages|today/.test(normalized);

  let answer = "";
  let sources: Source[] = [];

  if (isWaiting) {
    sources = followUps.map((item) => ({
      threadId: item.thread.id,
      subject: item.thread.subject,
      reason: `${item.contactAddress} · ${item.status === "DUE" ? "follow-up due" : "awaiting a reply"}`,
    }));
    answer = followUps.length
      ? `You're currently waiting on ${followUps.length} conversation${followUps.length === 1 ? "" : "s"}.\n\n${followUps.slice(0, 10).map((item) => `• ${item.contactAddress} — ${item.thread.subject} (sent ${formatDate(item.sentAt)}; suggested follow-up ${formatDate(item.suggestedAt)})`).join("\n")}\n\nThese are existing follow-up records, not a guess based on every email in your mailbox.`
      : "There are no conversations currently marked as waiting for a reply. Sync your inbox to refresh this list.";
  } else if (isDeadline) {
    sources = deadlines.map((item) => ({
      threadId: item.thread.id,
      subject: item.thread.subject,
      reason: `${item.kind.replaceAll("_", " ").toLowerCase()} · ${item.userConfirmed ? "confirmed" : "needs review"}`,
    }));
    answer = deadlines.length
      ? `I found ${deadlines.length} upcoming or confirmed date record${deadlines.length === 1 ? "" : "s"}.\n\n${deadlines.slice(0, 10).map((item) => `• ${item.originalExpression} — ${formatDate(item.normalizedAt)} (${item.userConfirmed ? "confirmed" : "not confirmed"}) · ${item.thread.subject}`).join("\n")}\n\nCheck the source email before relying on an unconfirmed date.`
      : "No upcoming or confirmed dates are currently recorded. Sync your inbox to look for new dates.";
  } else if (isAction) {
    sources = actions.map((item) => ({
      threadId: item.thread.id,
      subject: item.thread.subject,
      reason: `Open commitment · priority ${item.priority}`,
    }));
    answer = actions.length
      ? `There are ${actions.length} open action item${actions.length === 1 ? "" : "s"} in your Action Center.\n\n${actions.slice(0, 10).map((item) => `• ${item.description}${item.deadlineText ? ` — deadline: ${item.deadlineText}` : ""} · ${item.thread.subject}`).join("\n")}\n\nThese are extracted action records. Review them before treating them as confirmed tasks.`
      : "Your Action Center currently has no open items. Sync your inbox to refresh the analysis.";
  } else if (isRecent && matching.length === 0) {
    sources = recent.map((item) => ({ threadId: item.id, subject: item.subject, reason: `Last activity ${formatDate(item.lastMessageAt)}` }));
    answer = recent.length
      ? `Here are your ${recent.length} most recently active conversations:\n\n${recent.map((item) => `• ${item.subject} — ${formatDate(item.lastMessageAt)}`).join("\n")}`
      : "There are no synced conversations yet. Connect and sync Gmail first.";
  } else {
    const results = matching.length ? matching : (terms.length ? [] : recent);
    sources = results.map((item) => ({
      threadId: item.id,
      subject: item.subject,
      reason: item.snippet ? item.snippet.slice(0, 180) : `Last activity ${formatDate(item.lastMessageAt)}`,
    }));
    answer = results.length
      ? `I found ${results.length} conversation${results.length === 1 ? "" : "s"} matching your search.\n\n${results.slice(0, 10).map((item) => `• ${item.subject} — ${formatDate(item.lastMessageAt)}${item.snippet ? `\n  ${item.snippet.slice(0, 180)}` : ""}`).join("\n")}\n\nThis is a keyword search across your synced subjects, snippets and message text. It does not infer meaning the way a language model would.`
      : "I couldn't find a matching conversation in your synced mailbox. Try a person's name, email address, company, or a distinctive phrase from the subject.";
  }

  return NextResponse.json({
    answer,
    sources: uniqueSources(sources),
    mode: "local",
    matched: sources.length,
  });
}
