/**
 * Pure: derives thread-level fields from the messages stored for it.
 * Recomputing from source messages avoids drift between incremental updates.
 * Kept free of database imports so it can be unit tested directly.
 */
export type AggregateInputMessage = {
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  snippet: string;
  sentAt: Date;
  isUnread: boolean;
  isFromMe: boolean;
  labelIds: string[];
  attachmentsCount: number;
};

export function computeThreadAggregates(messages: AggregateInputMessage[]) {
  if (messages.length === 0) return null;
  const sorted = [...messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const latest = sorted[sorted.length - 1]!;
  const first = sorted[0]!;
  const participants = new Set<string>();
  for (const m of messages) {
    participants.add(m.fromAddress);
    m.toAddresses.forEach((a) => participants.add(a));
    m.ccAddresses.forEach((a) => participants.add(a));
  }
  const labels = new Set<string>();
  messages.forEach((m) => m.labelIds.forEach((l) => labels.add(l)));
  return {
    subject: first.subject || "(no subject)",
    snippet: latest.snippet,
    participants: [...participants],
    messageCount: messages.length,
    unreadCount: messages.filter((m) => m.isUnread).length,
    lastMessageAt: latest.sentAt,
    lastMessageFromMe: latest.isFromMe,
    hasAttachments: messages.some((m) => m.attachmentsCount > 0),
    starred: labels.has("STARRED"),
    // A conversation is in the Gmail inbox while any message still carries the INBOX label.
    archived: !labels.has("INBOX"),
    labelIds: [...labels],
  };
}
