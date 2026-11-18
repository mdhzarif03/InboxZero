/**
 * Shared text helpers for deterministic analysis. Pure functions only.
 */

/** Splits text into sentences, keeping line-level structure for quoted replies. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Removes quoted reply lines ("> ...") and common reply headers, so old text is not re-analyzed. */
export function stripQuotedReply(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^On .+ wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*(Original Message|Forwarded message)/i.test(line.trim())) break;
    if (/^From:\s.+/i.test(line.trim()) && kept.length > 0) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

export function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}
