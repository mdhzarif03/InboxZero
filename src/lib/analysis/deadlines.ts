import { splitSentences } from "@/lib/analysis/text";

/**
 * Deterministic date extraction. Date arithmetic is code, not AI.
 *
 * Confidence rules:
 *  - CONFIRMED: a calendar date with an explicit year, or an ISO date. Still shown with its original text.
 *  - AMBIGUOUS: missing year, relative words ("tomorrow", "next Friday") or unclear timezone.
 *    Ambiguous dates are never promoted to confirmed automatically. The user must confirm.
 *
 * Timezone: stored only when the expression itself states one. Otherwise null, meaning
 * "wall-clock time in the sender's context, unknown zone". normalizedAt is then UTC-based
 * and must not be read as an exact instant.
 */

export type DeadlineKindLiteral = "EXPLICIT_DEADLINE" | "MEETING" | "EVENT" | "PAYMENT_DUE" | "RENEWAL" | "UNKNOWN";

export type DeadlineCandidate = {
  originalExpression: string;
  normalizedAt: Date | null;
  timezone: string | null;
  kind: DeadlineKindLiteral;
  status: "CONFIRMED" | "AMBIGUOUS";
  confidence: number;
  sentence: string;
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const TZ_RE = /\b(UTC|GMT|BST|IST|BDT|CET|CEST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|[+-]\d{2}:?\d{2})\b/;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

function kindFor(sentence: string): DeadlineKindLiteral {
  const s = sentence.toLowerCase();
  if (/\b(payment|invoice|pay|bill|due amount|overdue)\b/.test(s)) return "PAYMENT_DUE";
  if (/\b(renew|renewal|expires?|expiry|subscription ends)\b/.test(s)) return "RENEWAL";
  if (/\b(meeting|call|meet|sync|interview|appointment|demo)\b/.test(s)) return "MEETING";
  if (/\b(event|conference|webinar|workshop|ceremony|launch|exhibition)\b/.test(s)) return "EVENT";
  if (/\b(deadline|due|submit|submission|by|before|no later than|closes?|last date)\b/.test(s)) return "EXPLICIT_DEADLINE";
  return "UNKNOWN";
}

function parseTime(sentence: string): { hours: number; minutes: number } | null {
  const m = sentence.match(TIME_RE);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const isPm = m[3]!.toLowerCase() === "pm";
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  if (isPm && hours !== 12) hours += 12;
  if (!isPm && hours === 12) hours = 0;
  return { hours, minutes };
}

/** Builds a UTC date and rejects impossible calendar dates such as 30 February. */
function buildDate(year: number, monthIndex: number, day: number, time: { hours: number; minutes: number } | null): Date | null {
  const d = new Date(Date.UTC(year, monthIndex, day, time?.hours ?? 0, time?.minutes ?? 0));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) return null;
  return d;
}

/** Next occurrence of a weekday strictly after the reference date (UTC). */
function nextWeekday(reference: Date, weekday: number, forceNextWeek: boolean): Date {
  const base = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  let delta = (weekday - base.getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  if (forceNextWeek && delta < 7) delta += 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return base;
}

type Match = { index: number; text: string; date: Date | null; status: "CONFIRMED" | "AMBIGUOUS"; confidence: number };

function findMatches(sentence: string, reference: Date): Match[] {
  const matches: Match[] = [];
  const time = parseTime(sentence);

  // ISO 8601 date: 2026-11-30
  for (const m of sentence.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const date = buildDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), time);
    matches.push({ index: m.index ?? 0, text: m[0], date, status: date ? "CONFIRMED" : "AMBIGUOUS", confidence: date ? 0.95 : 0.2 });
  }

  // "November 30, 2026" / "Nov 30 2026"
  for (const m of sentence.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"))) {
    const month = MONTHS[m[1]!.slice(0, 3).toLowerCase()]!;
    const date = buildDate(Number(m[3]), month, Number(m[2]), time);
    matches.push({ index: m.index ?? 0, text: m[0], date, status: date ? "CONFIRMED" : "AMBIGUOUS", confidence: date ? 0.9 : 0.2 });
  }

  // "30 November 2026"
  for (const m of sentence.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi"))) {
    const month = MONTHS[m[2]!.slice(0, 3).toLowerCase()]!;
    const date = buildDate(Number(m[3]), month, Number(m[1]), time);
    matches.push({ index: m.index ?? 0, text: m[0], date, status: date ? "CONFIRMED" : "AMBIGUOUS", confidence: date ? 0.9 : 0.2 });
  }

  // Month and day without a year: "Nov 30" or "30 Nov". Year is inferred from the reference date, so ambiguous.
  const yearless: Array<{ index: number; text: string; month: number; day: number }> = [];
  for (const m of sentence.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!,?\\s+\\d{4})`, "gi"))) {
    yearless.push({ index: m.index ?? 0, text: m[0], month: MONTHS[m[1]!.slice(0, 3).toLowerCase()]!, day: Number(m[2]) });
  }
  for (const m of sentence.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?!\\.?,?\\s+\\d{4})`, "gi"))) {
    yearless.push({ index: m.index ?? 0, text: m[0], month: MONTHS[m[2]!.slice(0, 3).toLowerCase()]!, day: Number(m[1]) });
  }
  for (const y of yearless) {
    // Skip if an explicit-year match already covers this position.
    if (matches.some((mm) => Math.abs(mm.index - y.index) < 3)) continue;
    let date = buildDate(reference.getUTCFullYear(), y.month, y.day, time);
    // If the date already passed by more than 6 months, the sender probably means next year.
    if (date && date.getTime() < reference.getTime() - 183 * 86_400_000) {
      date = buildDate(reference.getUTCFullYear() + 1, y.month, y.day, time);
    }
    matches.push({ index: y.index, text: y.text, date, status: "AMBIGUOUS", confidence: 0.45 });
  }

  // Relative expressions. Always ambiguous: "tomorrow" depends on when the user reads it.
  for (const m of sentence.matchAll(/\b(today|tonight|tomorrow)\b/gi)) {
    const offset = m[1]!.toLowerCase() === "tomorrow" ? 1 : 0;
    const base = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() + offset));
    matches.push({ index: m.index ?? 0, text: m[0], date: base, status: "AMBIGUOUS", confidence: 0.35 });
  }
  for (const m of sentence.matchAll(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi)) {
    const weekday = WEEKDAYS[m[2]!.toLowerCase()]!;
    matches.push({
      index: m.index ?? 0,
      text: m[0],
      date: nextWeekday(reference, weekday, Boolean(m[1])),
      status: "AMBIGUOUS",
      confidence: 0.35,
    });
  }

  return matches;
}

/**
 * Extracts deadline-like date expressions from plain text. `reference` is the message's sent date,
 * used for relative and yearless expressions. Pure: no I/O.
 */
export function extractDeadlines(text: string, reference: Date): DeadlineCandidate[] {
  const out: DeadlineCandidate[] = [];
  const seen = new Set<string>();
  for (const sentence of splitSentences(text)) {
    const tz = sentence.match(TZ_RE)?.[1] ?? null;
    const kind = kindFor(sentence);
    for (const match of findMatches(sentence, reference)) {
      const key = `${match.text.toLowerCase()}|${sentence.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        originalExpression: match.text.slice(0, 120),
        normalizedAt: match.date,
        timezone: tz,
        kind,
        status: match.status,
        // Without a stated timezone, even a confirmed date is capped below full confidence.
        confidence: tz ? match.confidence : Math.min(match.confidence, 0.85),
        sentence: sentence.slice(0, 300),
      });
    }
  }
  return out;
}

/**
 * Normalizes a verbatim expression returned by the AI. The AI never supplies the date itself:
 * the expression must still be found in the source text, or it is discarded.
 */
export function normalizeAiDeadlineExpression(expression: string, sourceText: string, reference: Date): DeadlineCandidate | null {
  if (!sourceText.toLowerCase().includes(expression.toLowerCase())) return null;
  const found = extractDeadlines(expression, reference);
  return found[0] ?? null;
}
