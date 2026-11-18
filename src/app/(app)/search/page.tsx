import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { searchMessages, searchInputSchema } from "@/lib/search";
import { formatDateTime } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">Full-text search across your synced mail, with optional sender and date filters.</p>
      </div>

      <form method="get" className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
          Keywords
          <input name="q" defaultValue={raw.q ?? ""} placeholder="invoice, admission, project deadline" maxLength={200}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Sender (name or address)
          <input name="from" defaultValue={raw.from ?? ""} maxLength={200}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            From date
            <input type="date" name="since" defaultValue={raw.since ?? ""}
              className="block w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            To date
            <input type="date" name="until" defaultValue={raw.until ?? ""}
              className="block w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground" />
          </label>
        </div>
        <div className="sm:col-span-2">
          <SubmitButton>Search</SubmitButton>
        </div>
      </form>

      {!parsed.success && hasQuery ? <p className="text-sm text-destructive">Check the dates and keyword length.</p> : null}

      {hasQuery && parsed.success ? (
        hits.length === 0 ? (
          <EmptyState title="No matching messages">Try fewer keywords, or check the sender and date range.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {hits.map((h) => (
              <li key={h.messageId} className="px-4 py-3">
                <Link href={`/inbox/${h.threadId}`} className="text-sm font-medium hover:underline">{h.subject}</Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {h.fromName ?? h.fromAddress} · {formatDateTime(h.sentAt)}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
