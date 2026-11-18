import { describe, it, expect } from "vitest";
import {
  parseAddressList,
  decodeBase64Url,
  extractBodyText,
  collectAttachments,
  sanitizeText,
  normalizeGmailMessage,
  MAX_BODY_CHARS,
  type GmailPart,
} from "@/lib/gmail/parse";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("parseAddressList", () => {
  it("parses named and bare addresses and lowercases them", () => {
    expect(parseAddressList('"Doe, Jane" <Jane@X.com>, bob@y.org')).toEqual([
      { address: "jane@x.com", name: "Doe, Jane" },
      { address: "bob@y.org", name: null },
    ]);
  });

  it("returns an empty list for missing headers", () => {
    expect(parseAddressList(null)).toEqual([]);
  });
});

describe("body extraction", () => {
  it("prefers text/plain over text/html", () => {
    const payload: GmailPart = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64url("<p>html version</p>") } },
        { mimeType: "text/plain", body: { data: b64url("plain version") } },
      ],
    };
    expect(extractBodyText(payload)).toBe("plain version");
  });

  it("falls back to HTML converted to text and strips scripts", () => {
    const payload: GmailPart = {
      mimeType: "text/html",
      body: { data: b64url("<style>x{}</style><script>alert(1)</script><p>Hello &amp; welcome</p>") },
    };
    const text = extractBodyText(payload);
    expect(text).toContain("Hello & welcome");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("<p>");
  });

  it("truncates very large bodies", () => {
    const payload: GmailPart = { mimeType: "text/plain", body: { data: b64url("a".repeat(MAX_BODY_CHARS + 500)) } } as GmailPart;
    expect(extractBodyText(payload).length).toBe(MAX_BODY_CHARS);
  });

  it("decodes base64url safely and never throws on bad input", () => {
    expect(decodeBase64Url(b64url("héllo"))).toBe("héllo");
    expect(() => decodeBase64Url("%%%")).not.toThrow();
  });
});

describe("attachments", () => {
  it("collects metadata only, not body data", () => {
    const payload: GmailPart = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: b64url("hi") } },
        { mimeType: "application/pdf", filename: "invoice.pdf", body: { attachmentId: "A1", size: 2048 } },
      ],
    };
    expect(collectAttachments(payload)).toEqual([{ filename: "invoice.pdf", mimeType: "application/pdf", size: 2048 }]);
  });
});

describe("sanitizeText", () => {
  it("removes control characters but keeps newlines", () => {
    expect(sanitizeText("a\u0000b\r\nc\n\n\n\nd")).toBe("ab\nc\n\nd");
  });
});

describe("normalizeGmailMessage", () => {
  it("normalizes headers, labels and timestamps", () => {
    const n = normalizeGmailMessage({
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      internalDate: "1700000000000",
      snippet: "preview",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "Ann <ann@x.com>" },
          { name: "To", value: "me@y.com" },
          { name: "Subject", value: "Hello" },
          { name: "List-Unsubscribe", value: "<mailto:u@x.com>" },
        ],
        body: { data: b64url("body") },
      },
    });
    expect(n).not.toBeNull();
    expect(n!.fromAddress).toBe("ann@x.com");
    expect(n!.isUnread).toBe(true);
    expect(n!.listUnsubscribe).toBe(true);
    expect(n!.sentAt.toISOString()).toBe(new Date(1700000000000).toISOString());
  });

  it("returns null for incomplete payloads", () => {
    expect(normalizeGmailMessage({ id: "x" })).toBeNull();
  });
});
