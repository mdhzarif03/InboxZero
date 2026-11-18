import { createHash } from "node:crypto";

/**
 * Content fingerprint for a thread. AI analysis is cached against this value so that
 * unchanged conversations are never sent to a model again.
 */
export function contentHashFor(messages: Array<{ id: string; body: string; subject: string }>): string {
  const h = createHash("sha256");
  for (const m of messages) {
    h.update(m.id);
    h.update("\u0000");
    h.update(m.subject);
    h.update("\u0000");
    h.update(m.body);
    h.update("\u0001");
  }
  return h.digest("base64url").slice(0, 43);
}
