import { categorizeThread, type CategoryResult } from "@/lib/analysis/categorize";
import { detectActions, filterDismissed, type ActionCandidate } from "@/lib/analysis/actions";
import { extractDeadlines, type DeadlineCandidate } from "@/lib/analysis/deadlines";
import { evaluateFollowUp, type FollowUpDecision } from "@/lib/analysis/followups";
import { splitSentences, stripQuotedReply } from "@/lib/analysis/text";
import { contentHashFor } from "@/lib/analysis/hash";

/**
 * Deterministic analysis of one conversation. Pure: takes plain data, returns plain data.
 * The database layer (pipeline.ts) persists the result. Keeping this pure lets the fixture
 * mailbox be analyzed and verified without a database.
 */

export const SOON_DAYS = 14;
const DAY_MS = 86_400_000;

export type AnalysisMessage = {
  id: string;
  fromAddress: string;
  toAddresses: string[];
  isFromMe: boolean;
  bodyText: string;
  subject: string;
  sentAt: Date;
  listUnsubscribe: boolean;
};

export type AnalysisInput = {
  subject: string;
  labelIds: string[];
  archived: boolean;
  starred: boolean;
  lastMessageFromMe: boolean;
  userAddress: string;
  /** Messages sorted by sentAt ascending. */
  messages: AnalysisMessage[];
  /** Descriptions of actions the user dismissed; these are never recreated. */
  dismissedActionDescriptions: string[];
  now: Date;
};

export type SummaryItem = {
  kind: "question" | "action_item" | "deadline";
  text: string;
  basis: "stated";
  sourceMessageId: string;
};

export type AnalysisResult = {
  contentHash: string;
  classification: CategoryResult;
  actions: ActionCandidate[];
  deadlines: Array<DeadlineCandidate & { sourceMessageId: string }>;
  followUp: FollowUpDecision;
  summary: { currentStatus: string; items: SummaryItem[] };
};

export function analyzeThread(input: AnalysisInput): AnalysisResult {
  const { messages, userAddress, now } = input;
  const contentHash = contentHashFor(messages.map((m) => ({ id: m.id, body: m.bodyText, subject: m.subject })));

  const latestInbound = [...messages].reverse().find((m) => !m.isFromMe);
  const latestInboundText = latestInbound ? stripQuotedReply(latestInbound.bodyText) : "";
  const hasUnsubscribe = messages.some((m) => m.listUnsubscribe);
  const senderAddress = latestInbound?.fromAddress ?? messages[messages.length - 1]!.fromAddress;

  // Deadlines first: classification depends on them.
  const deadlines: Array<DeadlineCandidate & { sourceMessageId: string }> = [];
  for (const m of messages) {
    for (const d of extractDeadlines(stripQuotedReply(m.bodyText), m.sentAt)) {
      deadlines.push({ ...d, sourceMessageId: m.id });
    }
  }
  const soonCutoff = now.getTime() + SOON_DAYS * DAY_MS;
  const hasSoonDeadline = deadlines.some(
    (d) => d.normalizedAt && d.normalizedAt.getTime() >= now.getTime() - DAY_MS && d.normalizedAt.getTime() <= soonCutoff,
  );

  const classification = categorizeThread({
    archived: input.archived,
    starred: input.starred,
    labelIds: input.labelIds,
    lastMessageFromMe: input.lastMessageFromMe,
    latestInboundHasQuestion: /\?/.test(latestInboundText),
    latestInboundHasRequest: splitSentences(latestInboundText).some((s) =>
      /\b(please|could you|can you|would you|action required|let me know)\b/i.test(s),
    ),
    hasUnsubscribeHeader: hasUnsubscribe,
    senderAddress,
    subject: input.subject,
    hasSoonDeadline,
  });

  const actions = filterDismissed(
    detectActions(messages.map((m) => ({ id: m.id, isFromMe: m.isFromMe, bodyText: m.bodyText, sentAt: m.sentAt })), userAddress),
    input.dismissedActionDescriptions,
  );

  const followUp = evaluateFollowUp({
    messages: messages.map((m) => ({ fromAddress: m.fromAddress, isFromMe: m.isFromMe, bodyText: m.bodyText, sentAt: m.sentAt, toAddresses: m.toAddresses })),
    userAddress,
    archived: input.archived,
    hasUnsubscribeHeader: hasUnsubscribe,
    now,
  });

  const questionItems: SummaryItem[] = messages
    .flatMap((m) =>
      splitSentences(stripQuotedReply(m.bodyText))
        .filter((s) => s.endsWith("?"))
        .map((s) => ({ kind: "question" as const, text: s.slice(0, 300), basis: "stated" as const, sourceMessageId: m.id })),
    )
    .slice(0, 5);
  const actionItems: SummaryItem[] = actions.map((a) => ({
    kind: "action_item",
    text: a.description,
    basis: "stated",
    sourceMessageId: a.sourceMessageId,
  }));
  const deadlineItems: SummaryItem[] = deadlines.slice(0, 10).map((d) => ({
    kind: "deadline",
    text: `${d.originalExpression}${d.status === "AMBIGUOUS" ? " (needs confirmation)" : ""}`,
    basis: "stated",
    sourceMessageId: d.sourceMessageId,
  }));

  const currentStatus = input.lastMessageFromMe
    ? "Waiting for the other person to reply."
    : actions.length
      ? "A response or action from you appears to be requested."
      : "No open request detected.";

  return {
    contentHash,
    classification,
    actions,
    deadlines,
    followUp,
    summary: { currentStatus, items: [...questionItems, ...actionItems, ...deadlineItems] },
  };
}
