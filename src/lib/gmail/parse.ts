/**
 * Pure functions that normalize Gmail API payloads. No network, no database.
 * Shapes match https://developers.google.com/gmail/api/reference/rest/v1/users.messages
 */

export type GmailHeader = { name?: string | null; value?: string | null };

export type GmailPart = {
  partId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  headers?: GmailHeader[] | null;
  body?: { size?: number | null; data?: string | null; attachmentId?: string | null } | null;
  parts?: GmailPart[] | null;
};

export type GmailMessage = {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  internalDate?: string | null;
  payload?: GmailPart | null;
};

export type ParsedAddress = { address: string; name: string | null };

export type AttachmentMeta = { filename: string; mimeType: string; size: number };

export type NormalizedMessage = {
  gmailMessageId: string;
  gmailThreadId: string;
  labelIds: string[];
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  snippet: string;
  sentAt: Date;
  isUnread: boolean;
  listUnsubscribe: boolean;
  precedence: string | null;
  attachments: AttachmentMeta[];
};

/** Body text is truncated at ingest. Anything beyond this is not stored or sent to AI. */
export const MAX_BODY_CHARS = 20_000;

export function getHeader(headers: GmailHeader[] | null | undefined, name: string): string | null {
  const wanted = name.toLowerCase();
  const found = headers?.find((h) => (h.name ?? "").toLowerCase() === wanted);
  return found?.value ?? null;
}

/** Decodes Gmail's base64url body data. Invalid input yields an empty string, never throws. */
export function decodeBase64Url(data: string | null | undefined): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** Parses an RFC 5322 address list like `"Jane Doe" <jane@x.com>, bob@y.org`. Tolerant by design. */
export function parseAddressList(value: string | null | undefined): ParsedAddress[] {
  if (!value) return [];
  const out: ParsedAddress[] = [];
  // Split on commas that are not inside quotes or angle brackets.
  const parts: string[] = [];
  let depth = 0;
  let inQuotes = false;
  let current = "";
  for (const ch of value) {
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === "<") depth++;
    if (!inQuotes && ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && !inQuotes && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  for (const raw of parts) {
    const part = raw.trim();
    const angle = part.match(/^(.*?)<([^<>\s]+@[^<>\s]+)>$/);
    if (angle) {
      const name = (angle[1] ?? "").trim().replace(/^"|"$/g, "").trim();
      out.push({ address: angle[2]!.toLowerCase(), name: name || null });
      continue;
    }
    const bare = part.match(/[^\s<>"]+@[^\s<>"]+/);
    if (bare) out.push({ address: bare[0].toLowerCase(), name: null });
  }
  return out;
}

/** Converts HTML to readable text without executing or preserving markup. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** Removes control characters that have no place in stored text. Keeps newlines and tabs. */
export function sanitizeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Collects the best plain-text body: text/plain preferred, HTML converted as fallback. */
export function extractBodyText(payload: GmailPart | null | undefined): string {
  if (!payload) return "";
  const plain: string[] = [];
  const html: string[] = [];

  const walk = (part: GmailPart) => {
    const mime = (part.mimeType ?? "").toLowerCase();
    if (part.parts?.length) {
      part.parts.forEach(walk);
      return;
    }
    // Attachments have an attachmentId and are not body content.
    if (part.body?.attachmentId) return;
    if (mime === "text/plain") plain.push(decodeBase64Url(part.body?.data));
    else if (mime === "text/html") html.push(htmlToText(decodeBase64Url(part.body?.data)));
  };
  walk(payload);

  const text = plain.length ? plain.join("\n\n") : html.join("\n\n");
  return sanitizeText(text).slice(0, MAX_BODY_CHARS);
}

/** Extracts the original HTML alternative for sandboxed email rendering. */
export function extractBodyHtml(payload: GmailPart | null | undefined): string | null {
  if (!payload) return null;
  const html: string[] = [];
  const walk = (part: GmailPart) => {
    const mime = (part.mimeType ?? "").toLowerCase();
    if (part.parts?.length) { part.parts.forEach(walk); return; }
    if (part.body?.attachmentId) return;
    if (mime === "text/html") html.push(decodeBase64Url(part.body?.data));
  };
  walk(payload);
  const value = html.join("\n");
  return value.trim() ? value.slice(0, 100_000) : null;
}

/** Attachment metadata only. Attachment bytes are never downloaded or stored by this milestone. */
export function collectAttachments(payload: GmailPart | null | undefined): AttachmentMeta[] {
  const out: AttachmentMeta[] = [];
  const walk = (part: GmailPart) => {
    if (part.filename && part.body?.attachmentId) {
      out.push({
        filename: part.filename.slice(0, 255),
        mimeType: (part.mimeType ?? "application/octet-stream").slice(0, 120),
        size: part.body.size ?? 0,
      });
    }
    part.parts?.forEach(walk);
  };
  if (payload) walk(payload);
  return out;
}

/** Normalizes a full Gmail message. Returns null for payloads too incomplete to store. */
export function normalizeGmailMessage(message: GmailMessage): NormalizedMessage | null {
  if (!message.id || !message.threadId || !message.payload) return null;
  const headers = message.payload.headers ?? [];
  const from = parseAddressList(getHeader(headers, "From"))[0];
  const to = parseAddressList(getHeader(headers, "To"));
  const cc = parseAddressList(getHeader(headers, "Cc"));
  const labelIds = message.labelIds ?? [];
  const sentAt = message.internalDate ? new Date(Number(message.internalDate)) : new Date();

  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    labelIds,
    fromAddress: from?.address ?? "unknown@invalid",
    fromName: from?.name ?? null,
    toAddresses: to.map((a) => a.address),
    ccAddresses: cc.map((a) => a.address),
    subject: sanitizeText(getHeader(headers, "Subject") ?? "(no subject)").slice(0, 998),
    bodyText: extractBodyText(message.payload),
    bodyHtml: extractBodyHtml(message.payload),
    snippet: sanitizeText(message.snippet ?? "").slice(0, 500),
    sentAt: Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
    isUnread: labelIds.includes("UNREAD"),
    listUnsubscribe: getHeader(headers, "List-Unsubscribe") !== null,
    precedence: getHeader(headers, "Precedence"),
    attachments: collectAttachments(message.payload),
  };
}

export function isFromOwnAddress(fromAddress: string, ownAddress: string): boolean {
  return fromAddress.toLowerCase() === ownAddress.toLowerCase();
}
