import Link from "next/link";
import { ArrowUpRight, CalendarRange, Search, SearchX, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { searchMessages, searchInputSchema } from "@/lib/search";
import { formatDateTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; since?: string; until?: string }>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const hasQuery = Boolean(raw.q || raw.from || raw.since || raw.until);

  // Validation happens inside searchInputSchema; invalid dates are ignored rather than crashing the page.
  const parsed = searchInputSchema.safeParse({
    q: raw.q ?? "",
    from: raw.from || undefined,
    since: raw.since || undefined,
    until: raw.until || undefined,
  });
  const hits = hasQuery && parsed.success ? await searchMessages(user.id, parsed.data) : [];
  const filtersOpen = Boolean(raw.from || raw.since || raw.until);

  return (
    <div className="space-y-7">
      <PageHeader
        icon={Search}
        title="Search"
        description="Full-text search across your synced mail, with optional sender and date filters."
      />

      <form method="get" className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            name="q"
            defaultValue={raw.q ?? ""}
            placeholder="Search invoices, admission, project deadline…"
            maxLength={200}
            aria-label="Keywords"
            className="h-12 rounded-xl pl-11 text-[15px]"
          />
        </div>

        <details open={filtersOpen} className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="grid size-5 place-items-center rounded-md bg-muted text-xs transition-transform group-open:rotate-90" aria-hidden="true">›</span>
            Filters
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Sender (name or address)">
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input name="from" defaultValue={raw.from ?? ""} maxLength={200} className="pl-9" />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From date"><Input type="date" name="since" defaultValue={raw.since ?? ""} /></Field>
              <Field label="To date"><Input type="date" name="until" defaultValue={raw.until ?? ""} /></Field>
            </div>
          </div>
        </details>

        <div className="flex items-center justify-between gap-3">
          <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><CalendarRange className="size-3.5" aria-hidden="true" />Searches subjects and message text.</p>
          <SubmitButton className="w-full sm:w-auto" pendingLabel="Searching…"><Search /> Search</SubmitButton>
        </div>
      </form>

      {!parsed.success && hasQuery ? <Notice tone="error">Check the dates and keyword length.</Notice> : null}

      {hasQuery && parsed.success ? (
        hits.length === 0 ? (
          <EmptyState title="No matching messages" icon={SearchX}>Try fewer keywords, or check the sender and date range.</EmptyState>
        ) : (
          <section aria-label="Results" className="space-y-2">
            <p className="px-1 text-xs text-muted-foreground">{hits.length} {hits.length === 1 ? "result" : "results"}</p>
            <ul className="stagger overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              {hits.map((h) => (
                <li key={h.messageId} className="border-b border-border last:border-0">
                  <Link href={`/inbox/${h.threadId}`} className="group flex items-center gap-4 px-4 py-3.5 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5">
                    <Avatar name={h.fromName ?? h.fromAddress} seed={h.fromAddress} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium">{h.subject}</p>
                      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{h.fromName ?? h.fromAddress} · {formatDateTime(h.sentAt)}</p>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : !hasQuery ? (
        <EmptyState title="Find anything in your mail" icon={Search}>
          Type keywords above. Press <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-xs">⌘K</kbd> from any page to search without leaving where you are.
        </EmptyState>
      ) : null}
    </div>
  );
}
