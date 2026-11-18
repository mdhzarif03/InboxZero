import { splitSentences, stripQuotedReply } from "@/lib/analysis/text";

/**
 * Follow-up tracking rules. The guiding principle from the product spec: do not assume every
 * unanswered email needs a follow-up. A sent message is tracked only when it expects a response.
 */

export const FOLLOW_UP_DELAY_DAYS = 3;
const DAY_MS = 86_400_000;

const EXPECTS_RESPONSE_RE =
  /\?|\b(let me know|looking forward|waiting (?:for|to hear)|get back to me|your (?:thoughts|feedback|confirmation|reply)|can you|could you|would you|please (?:confirm|reply|send|share|review|let))\b/i;

export type FollowUpInput = {
  messages: Array<{ fromAddress: string; isFromMe: boolean; bodyText: string; sentAt: Date; toAddresses: string[] }>;
  userAddress: string;
  archived: boolean;
  hasUnsubscribeHeader: boolean;
  now: Date;
};

export type FollowUpDecision =
  | null
  | {
      contactAddress: string;
      sentAt: Date;
      suggestedAt: Date;
      status: "WAITING" | "DUE";
      reason: string;
    };

export function evaluateFollowUp(input: FollowUpInput): FollowUpDecision {
  if (input.archived || input.hasUnsubscribeHeader) return null;
  const last = [...input.messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime()).at(-1);
  if (!last || !last.isFromMe) return null;

  const sentText = stripQuotedReply(last.bodyText);
  const expectsResponse = splitSentences(sentText).some((s) => EXPECTS_RESPONSE_RE.test(s));
  if (!expectsResponse) return null;

  const contact = last.toAddresses.find((a) => a.toLowerCase() !== input.userAddress.toLowerCase());
  if (!contact) return null;
  // Automated recipients will not answer; do not track them.
  if (/^(no-?reply|do-?not-?reply)@/i.test(contact)) return null;

  const suggestedAt = new Date(last.sentAt.getTime() + FOLLOW_UP_DELAY_DAYS * DAY_MS);
  return {
    contactAddress: contact,
    sentAt: last.sentAt,
    suggestedAt,
    status: input.now.getTime() >= suggestedAt.getTime() ? "DUE" : "WAITING",
    reason: "Your last message asked for a response and none has arrived.",
  };
}
