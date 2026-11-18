/** Shown while an authenticated page's server work is in progress. */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="h-6 w-48 rounded bg-muted" />
      <div className="h-4 w-80 max-w-full rounded bg-muted" />
      <div className="mt-6 space-y-2 rounded-md border border-border p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded bg-muted/70" />
        ))}
      </div>
    </div>
  );
}
