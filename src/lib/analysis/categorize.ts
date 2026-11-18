/**
 * Deterministic categorization. The user's Gmail labels are read, never modified.
 * AI may refine the result, but it never overrides a Gmail label decision.
 *
 * Precedence (first match wins):
 *   ARCHIVED > PROMOTIONS > NEWSLETTERS > NOTIFICATIONS > WAITING_FOR_REPLY (user spoke last)
 *   > NEEDS_REPLY > DEADLINES > PRIORITY > GENERAL
 */

export type CategoryResult = {
  category:
    | "PRIORITY"
    | "NEEDS_REPLY"
    | "WAITING_FOR_REPLY"
    | "DEADLINES"
    | "NEWSLETTERS"
    | "NOTIFICATIONS"
    | "PROMOTIONS"
    | "ARCHIVED"
    | "GENERAL";
  priority: number;
  confidence: number;
  reasons: string[];
};

export type CategorySignals = {
  archived: boolean;
  starred: boolean;
  labelIds: string[];
  lastMessageFromMe: boolean;
  latestInboundHasQuestion: boolean;
  latestInboundHasRequest: boolean;
  hasUnsubscribeHeader: boolean;
  senderAddress: string;
  subject: string;
  hasSoonDeadline: boolean;
};

const AUTOMATED_SENDER_RE = /^(no-?reply|do-?not-?reply|notifications?|alerts?|mailer|bounce|updates?|support-noreply|system)@/i;
const NEWSLETTER_RE = /\b(newsletter|digest|weekly|monthly|roundup|edition|issue #?\d+)\b/i;

export function categorizeThread(s: CategorySignals): CategoryResult {
  const reasons: string[] = [];

  if (s.archived) {
    return { category: "ARCHIVED", priority: 5, confidence: 0.9, reasons: ["No longer in the Gmail inbox"] };
  }

  if (s.labelIds.includes("CATEGORY_PROMOTIONS")) {
    return { category: "PROMOTIONS", priority: 5, confidence: 0.9, reasons: ["Gmail labels this as promotions"] };
  }

  const automated = AUTOMATED_SENDER_RE.test(s.senderAddress);
  if (s.hasUnsubscribeHeader && (NEWSLETTER_RE.test(s.subject) || NEWSLETTER_RE.test(s.senderAddress))) {
    return { category: "NEWSLETTERS", priority: 4, confidence: 0.8, reasons: ["Bulk mail with unsubscribe header and newsletter wording"] };
  }

  if (automated || s.labelIds.includes("CATEGORY_UPDATES") || s.labelIds.includes("CATEGORY_SOCIAL")) {
    return { category: "NOTIFICATIONS", priority: 4, confidence: 0.75, reasons: ["Automated or update message"] };
  }

  if (s.lastMessageFromMe) {
    reasons.push("You sent the last message");
    return { category: "WAITING_FOR_REPLY", priority: 3, confidence: 0.8, reasons };
  }

  if (s.latestInboundHasQuestion || s.latestInboundHasRequest) {
    reasons.push(s.latestInboundHasQuestion ? "Contains a direct question" : "Contains a request");
    const priority = s.starred || s.labelIds.includes("IMPORTANT") ? 1 : 2;
    return { category: "NEEDS_REPLY", priority, confidence: 0.7, reasons };
  }

  if (s.hasSoonDeadline) {
    return { category: "DEADLINES", priority: 2, confidence: 0.6, reasons: ["Mentions a deadline within 14 days"] };
  }

  if (s.starred || s.labelIds.includes("IMPORTANT")) {
    return { category: "PRIORITY", priority: 1, confidence: 0.65, reasons: [s.starred ? "Starred" : "Marked important by Gmail"] };
  }

  return { category: "GENERAL", priority: 3, confidence: 0.4, reasons: ["No strong signal"] };
}
