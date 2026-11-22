"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import {
  ChevronsUpDown, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings2, Sun, X,
} from "lucide-react";
import { Brand, BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { NAV_GROUPS, isActive, titleFor } from "@/components/nav";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "inboxzero:sidebar-collapsed";
const EXPANDED = 268;
const COLLAPSED = 76;

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <div className="mx-3 mb-2 h-px bg-border" aria-hidden="true" />
          ) : (
            <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{group.label}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              const link = (
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed && "justify-center px-0",
                    active ? "text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={collapsed ? "nav-pill-collapsed" : "nav-pill"}
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      className="absolute inset-0 rounded-lg bg-accent ring-1 ring-primary/15"
                    />
                  ) : null}
                  <Icon className={cn("relative size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110", active && "text-primary")} aria-hidden="true" />
                  {collapsed ? null : <span className="relative truncate">{label}</span>}
                </Link>
              );
              return (
                <li key={href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu({ email, collapsed, signOutAction, side = "top" }: { email: string | null; collapsed: boolean; signOutAction: () => Promise<void>; side?: "top" | "bottom" }) {
  const { theme, setTheme } = useTheme();
  const name = email ?? "Your account";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left outline-none transition-colors hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border data-[state=open]:bg-muted",
            collapsed && "justify-center",
          )}
          aria-label="Account menu"
        >
          <Avatar name={name} className="size-8" />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">Personal account</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={side === "top" ? "start" : "end"} className="w-64">
        <DropdownMenuLabel className="truncate">Signed in as <span className="font-medium text-foreground">{name}</span></DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings2 /> Settings & privacy</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="pb-1">Theme</DropdownMenuLabel>
        {([
          ["light", "Light", Sun],
          ["dark", "Dark", Moon],
          ["system", "System", Monitor],
        ] as const).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value} onSelect={(e) => { e.preventDefault(); setTheme(value); }}>
            <Icon /> {label}
            {theme === value ? <span className="ml-auto size-1.5 rounded-full bg-primary" aria-label="selected" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void signOutAction()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  email,
  signOutAction,
  banner,
  children,
}: {
  email: string | null;
  signOutAction: () => Promise<void>;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const palette = useCommandPalette();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      /* storage unavailable: stay expanded */
    }
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? COLLAPSED : EXPANDED }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
        className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card/80 backdrop-blur-xl lg:flex"
      >
        <div className={cn("flex h-16 items-center px-5", collapsed ? "justify-center px-0" : "justify-between")}>
          <Brand collapsed={collapsed} />
          {collapsed ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Collapse sidebar"><PanelLeftClose /></Button>
              </TooltipTrigger>
              <TooltipContent>Collapse sidebar</TooltipContent>
            </Tooltip>
          )}
        </div>
        {collapsed ? (
          <div className="flex justify-center pb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Expand sidebar"><PanelLeftOpen /></Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        <NavList collapsed={collapsed} />

        <div className="border-t border-border p-3">
          <UserMenu email={email} collapsed={collapsed} signOutAction={signOutAction} />
        </div>
      </motion.aside>

      {/* Mobile drawer */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 lg:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-xs flex-col border-r border-border bg-card shadow-elevated outline-none duration-300 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left lg:hidden"
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <div className="flex h-16 items-center justify-between px-5">
              <Brand />
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close menu"><X /></Button>
              </Dialog.Close>
            </div>
            <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-border p-3">
              <UserMenu email={email} collapsed={false} signOutAction={signOutAction} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Main column */}
      <div className={cn("min-h-screen transition-[padding] duration-300 ease-out", collapsed ? "lg:pl-[76px]" : "lg:pl-[268px]")}>
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <Link href="/inbox" className="lg:hidden" aria-label="InboxZero home"><BrandMark className="size-7" /></Link>

          <div className="hidden min-w-0 items-center gap-2 text-sm lg:flex" aria-label="Breadcrumb">
            <span className="text-muted-foreground">InboxZero</span>
            <span className="text-border" aria-hidden="true">/</span>
            <span className="truncate font-medium">{titleFor(pathname)}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => palette.setOpen(true)}
              className="group hidden h-9 w-64 items-center gap-2.5 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground shadow-xs outline-none transition-all hover:border-foreground/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:flex"
              aria-label="Open command palette"
            >
              <Search className="size-4" aria-hidden="true" />
              <span className="flex-1 text-left">Search or jump to…</span>
              <kbd className="rounded-md border border-border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
            </button>
            <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => palette.setOpen(true)} aria-label="Open command palette">
              <Search />
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {banner}

        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">{children}</main>

        <footer className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-4 pb-8 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>InboxZero · Your email, with a little more clarity.</span>
          <span>Read-only access. Nothing is ever sent or changed in your mailbox.</span>
        </footer>
      </div>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} signOutAction={signOutAction} />
    </div>
  );
}
