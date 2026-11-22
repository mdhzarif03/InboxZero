import {
  Archive, Bell, CalendarClock, Flame, Hourglass, Inbox, Newspaper, Reply, Repeat, Tag, type LucideIcon,
} from "lucide-react";

/** Presentation-only styling for each mail category. Labels live in `@/lib/utils` (CATEGORY_LABELS). */
export type CategoryStyle = { icon: LucideIcon; badge: string; dot: string; tile: string };

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  PRIORITY: {
    icon: Flame,
    badge: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300",
    dot: "bg-rose-500",
    tile: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  },
  NEEDS_REPLY: {
    icon: Reply,
    badge: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
    dot: "bg-amber-500",
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  WAITING_FOR_REPLY: {
    icon: Hourglass,
    badge: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
    dot: "bg-sky-500",
    tile: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  },
  FOLLOW_UP: {
    icon: Repeat,
    badge: "bg-cyan-500/10 text-cyan-700 ring-cyan-500/25 dark:text-cyan-300",
    dot: "bg-cyan-500",
    tile: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
  },
  DEADLINES: {
    icon: CalendarClock,
    badge: "bg-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300",
    dot: "bg-orange-500",
    tile: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
  },
  NEWSLETTERS: {
    icon: Newspaper,
    badge: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
    dot: "bg-violet-500",
    tile: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  },
  NOTIFICATIONS: {
    icon: Bell,
    badge: "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300",
    dot: "bg-slate-500",
    tile: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  PROMOTIONS: {
    icon: Tag,
    badge: "bg-fuchsia-500/10 text-fuchsia-700 ring-fuchsia-500/25 dark:text-fuchsia-300",
    dot: "bg-fuchsia-500",
    tile: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300",
  },
  ARCHIVED: {
    icon: Archive,
    badge: "bg-zinc-500/10 text-zinc-700 ring-zinc-500/25 dark:text-zinc-300",
    dot: "bg-zinc-500",
    tile: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  },
  GENERAL: {
    icon: Inbox,
    badge: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
    dot: "bg-emerald-500",
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
};

export const FALLBACK_CATEGORY_STYLE: CategoryStyle = CATEGORY_STYLE.GENERAL!;

export function categoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLE[category] ?? FALLBACK_CATEGORY_STYLE;
}
