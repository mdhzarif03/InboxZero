import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: d.getUTCFullYear() !== new Date().getUTCFullYear() ? "numeric" : undefined }).format(d);
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const CATEGORY_LABELS: Record<string, string> = {
  PRIORITY: "Priority",
  NEEDS_REPLY: "Needs reply",
  WAITING_FOR_REPLY: "Waiting for reply",
  FOLLOW_UP: "Follow up",
  DEADLINES: "Deadlines",
  NEWSLETTERS: "Newsletters",
  NOTIFICATIONS: "Notifications",
  PROMOTIONS: "Promotions",
  ARCHIVED: "Archived",
  GENERAL: "General",
};

export const CATEGORY_ORDER = [
  "PRIORITY",
  "NEEDS_REPLY",
  "WAITING_FOR_REPLY",
  "DEADLINES",
  "NEWSLETTERS",
  "NOTIFICATIONS",
  "PROMOTIONS",
  "GENERAL",
  "ARCHIVED",
] as const;
