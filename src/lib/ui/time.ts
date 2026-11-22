/** Presentation helpers for relative dates. Pure functions, no data access. */

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** "today", "tomorrow", "in 3 days", "2 days ago", "last week" … */
export function relativeDay(target: Date, now: Date = new Date()): string {
  const d = daysBetween(now, target);
  if (Math.abs(d) < 14) return rtf.format(d, "day");
  if (Math.abs(d) < 60) return rtf.format(Math.round(d / 7), "week");
  return rtf.format(Math.round(d / 30), "month");
}

/** Compact "5m", "3h", "2d", else a short date. Used in dense list rows. */
export function compactAge(target: Date, now: Date = new Date()): string {
  const ms = now.getTime() - target.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(target);
}

export function monthShort(d: Date): string {
  return new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(d);
}

export function dayOfMonth(d: Date): string {
  return String(d.getUTCDate());
}
