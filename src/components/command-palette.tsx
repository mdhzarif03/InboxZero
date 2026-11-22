"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CornerDownLeft, LogOut, Moon, Search, Sun } from "lucide-react";
import { ALL_NAV_ITEMS } from "@/components/nav";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/utils";
import { categoryStyle } from "@/lib/ui/category-style";

const itemCls =
  "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground outline-none transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[selected=true]:[&_svg]:text-accent-foreground";
const groupCls =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground";

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let gPressedAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // "g" then a letter jumps between pages, unless the user is typing.
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "/") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (k === "g") {
        gPressedAt = Date.now();
        return;
      }
      if (gPressedAt && Date.now() - gPressedAt < 900) {
        const hit = ALL_NAV_ITEMS.find((i) => i.shortcut.toLowerCase() === k);
        gPressedAt = 0;
        if (hit) router.push(hit.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
  signOutAction,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  signOutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [router, onOpenChange],
  );

  const q = query.trim();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-elevated outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Jump to a page, filter your inbox, or search mail…"
                className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
              />
              <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">ESC</kbd>
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-10 text-center text-sm text-muted-foreground">Nothing matches “{q}”.</Command.Empty>

              {q ? (
                <Command.Group heading="Search" className={groupCls}>
                  <Command.Item value={`search mail for ${q}`} onSelect={() => go(`/search?q=${encodeURIComponent(q)}`)} className={itemCls}>
                    <Search />
                    <span className="min-w-0 flex-1 truncate">Search mail for “{q}”</span>
                    <CornerDownLeft className="!size-3.5" />
                  </Command.Item>
                </Command.Group>
              ) : null}

              <Command.Group heading="Go to" className={groupCls}>
                {ALL_NAV_ITEMS.map((item) => (
                  <Command.Item key={item.href} value={`${item.label} ${item.hint}`} onSelect={() => go(item.href)} className={itemCls}>
                    <item.icon />
                    <span className="flex-1">{item.label}</span>
                    <span className="hidden items-center gap-1 sm:flex">
                      <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">G</kbd>
                      <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{item.shortcut}</kbd>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading="Inbox views" className={groupCls}>
                {CATEGORY_ORDER.map((c) => {
                  const s = categoryStyle(c);
                  return (
                    <Command.Item key={c} value={`inbox ${CATEGORY_LABELS[c]}`} onSelect={() => go(`/inbox?category=${c}`)} className={itemCls}>
                      <s.icon />
                      <span className="flex-1">{CATEGORY_LABELS[c]}</span>
                      <span className={`size-2 rounded-full ${s.dot}`} aria-hidden="true" />
                    </Command.Item>
                  );
                })}
              </Command.Group>

              <Command.Group heading="Preferences" className={groupCls}>
                <Command.Item
                  value="toggle theme dark light mode"
                  onSelect={() => {
                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                    onOpenChange(false);
                  }}
                  className={itemCls}
                >
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                  <span className="flex-1">Toggle {resolvedTheme === "dark" ? "light" : "dark"} theme</span>
                </Command.Item>
                <Command.Item
                  value="sign out log out"
                  onSelect={() => {
                    onOpenChange(false);
                    void signOutAction();
                  }}
                  className={itemCls}
                >
                  <LogOut />
                  <span className="flex-1">Sign out</span>
                </Command.Item>
              </Command.Group>
            </Command.List>
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
              <span>Navigate with ↑ ↓ · select with ↵</span>
              <span className="hidden sm:inline">Tip: press <kbd className="rounded border border-border bg-card px-1 font-mono">/</kbd> anywhere</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
