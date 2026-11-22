"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox, ListTodo, Clock3, CalendarDays, Search, Mail,
  Settings2, PanelLeftClose, CircleHelp,
} from "lucide-react";

const groups = [
  {
    label: "WORKSPACE",
    items: [
      { href: "/inbox", label: "Smart inbox", icon: Inbox },
      { href: "/actions", label: "Action center", icon: ListTodo },
      { href: "/follow-ups", label: "Follow-ups", icon: Clock3 },
      { href: "/deadlines", label: "Deadlines", icon: CalendarDays },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { href: "/search", label: "Search mail", icon: Search },
      { href: "/gmail", label: "Gmail connection", icon: Mail },
      { href: "/settings", label: "Settings", icon: Settings2 },
    ],
  },
];

export function AppSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const initials = (email ?? "U").slice(0, 1).toUpperCase();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <Link href="/inbox" className="brand-lockup">
          <img src="/inboxzero-icon.svg" alt="" className="brand-logo-icon" />
          <span className="brand-wordmark">Inbox<span>Zero</span></span>
        </Link>
        <button className="icon-button sidebar-collapse" aria-label="Sidebar">
          <PanelLeftClose size={17} />
        </button>
      </div>

      <div className="workspace-switcher">
        <div className="workspace-avatar">I</div>
        <div className="workspace-meta">
          <strong>Personal workspace</strong>
          <span>Free plan</span>
        </div>
        <span className="workspace-chevron">⌄</span>
      </div>

      <nav className="sidebar-navigation" aria-label="Main navigation">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/inbox" && pathname.startsWith(`${href}/`));
              return (
                <Link key={href} href={href} className={`sidebar-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{label}</span>
                  {href === "/inbox" && active ? <span className="nav-active-dot" /> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <Link href="/settings" className="help-link"><CircleHelp size={17} /> Help & support</Link>
        <div className="profile-card">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-meta">
            <strong>{email ?? "Your account"}</strong>
            <span>Personal account</span>
          </div>
          <span className="profile-menu">···</span>
        </div>
      </div>
    </aside>
  );
}
