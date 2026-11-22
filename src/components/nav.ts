import { CalendarDays, Clock3, Inbox, ListChecks, Mail, Search, Settings2, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; shortcut: string; hint: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/inbox", label: "Smart inbox", icon: Inbox, shortcut: "I", hint: "Conversations grouped by what needs you" },
      { href: "/actions", label: "Action center", icon: ListChecks, shortcut: "A", hint: "Requests found in your email" },
      { href: "/follow-ups", label: "Follow-ups", icon: Clock3, shortcut: "F", hint: "Replies you are waiting for" },
      { href: "/deadlines", label: "Deadlines", icon: CalendarDays, shortcut: "D", hint: "Dates found in your email" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/search", label: "Search mail", icon: Search, shortcut: "S", hint: "Full-text search with filters" },
      { href: "/gmail", label: "Gmail connection", icon: Mail, shortcut: "G", hint: "Connect, sync or disconnect" },
      { href: "/settings", label: "Settings & privacy", icon: Settings2, shortcut: ",", hint: "AI processing, export, delete" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function titleFor(pathname: string): string {
  if (pathname.startsWith("/inbox/")) return "Conversation";
  return ALL_NAV_ITEMS.find((i) => isActive(pathname, i.href))?.label ?? "InboxZero";
}
