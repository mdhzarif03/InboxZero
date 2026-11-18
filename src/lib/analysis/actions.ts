import { extractDeadlines } from "@/lib/analysis/deadlines";
import { splitSentences, stripQuotedReply } from "@/lib/analysis/text";

/**
 * Deterministic action detection. Conservative by design: a false negative is better than
 * inventing a task. Only inbound messages are considered; the user's own requests to others are
 * tracked as follow-ups instead.
 */

export type ActionCandidate = {
  description: string;
  responsible: string | null;
  deadlineText: string | null;
  deadlineAt: Date | null;
  priority: number;
  confidence: number;
  sourceMessageId: string;
};

export type ActionSourceMessage = {
  id: string;
  isFromMe: boolean;
  bodyText: string;
  sentAt: Date;
};

const REQUEST_RE =
  /\b(please|could you|can you|would you|kindly|need you to|you need to|you must|you are required|action required|let me know|confirm|approve|review and|submit|send (?:me|us|over)|share (?:the|your|with)|sign (?:and|the)|complete (?:the|your)|fill (?:out|in)|rsvp|reply by|respond by)\b/i;

/** Phrases that look like requests but are informational. */
const NOT_ACTION_RE =
  /\b(please find (?:attached|below|enclosed)|thanks? (?:again|in advance)|please don'?t hesitate|please feel free|no need to reply|no action (?:is )?(?:needed|required))\b/i;

const MAX_MESSAGES_CONSIDERED = 3;

export function detectActions(messages: ActionSourceMessage[], userAddress: string): ActionCandidate[] {
  const inbound = messages.filter((m) => !m.isFromMe).slice(-MAX_MESSAGES_CONSIDERED);
  const out: ActionCandidate[] = [];
  const seen = new Set<string>();

  for (const message of inbound) {
    const body = stripQuotedReply(message.bodyText);
    for (const sentence of splitSentences(body)) {
      if (sentence.length < 12 || sentence.length > 400) continue;
      if (!REQUEST_RE.test(sentence) || NOT_ACTION_RE.test(sentence)) continue;

      const deadline = extractDeadlines(sentence, message.sentAt)[0] ?? null;
      let confidence = 0.5;
      if (/\bplease\s+\w+/i.test(sentence)) confidence += 0.1;
      if (/\b(action required|you need to|you must)\b/i.test(sentence)) confidence += 0.15;
      if (deadline) confidence += 0.1;
      if (/\?\s*$/.test(sentence)) confidence -= 0.05; // questions are weaker signals than instructions
      confidence = Math.min(0.9, Math.max(0.2, confidence));

      const key = `${message.id}|${sentence.toLowerCase().slice(0, 120)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        description: sentence.slice(0, 300),
        // Inbound requests are addressed to the mailbox owner when they say "you/your" or give an imperative
        // "please <verb>". Anything else stays unattributed rather than guessed.
        responsible: /\b(you|your)\b|\bplease\s+\w+/i.test(sentence) ? userAddress : null,
        deadlineText: deadline?.originalExpression ?? null,
        deadlineAt: deadline?.status === "CONFIRMED" ? deadline.normalizedAt : null,
        priority: deadline?.kind === "EXPLICIT_DEADLINE" || deadline?.kind === "PAYMENT_DUE" ? 2 : 3,
        confidence: Number(confidence.toFixed(2)),
        sourceMessageId: message.id,
      });
    }
  }
  return out;
}

/**
 * Deduplicates candidates against actions the user already dismissed. Dismissed actions are
 * remembered so the detector does not keep resurfacing a false positive.
 */
export function filterDismissed(candidates: ActionCandidate[], dismissedDescriptions: string[]): ActionCandidate[] {
  const dismissed = new Set(dismissedDescriptions.map((d) => d.toLowerCase().slice(0, 120)));
  return candidates.filter((c) => !dismissed.has(c.description.toLowerCase().slice(0, 120)));
}
