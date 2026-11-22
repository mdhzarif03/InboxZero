/** Shown while an authenticated page's server work is in progress. */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">Loading…</span>
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-3">
          <div className="skeleton h-8 w-56 rounded-lg" />
          <div className="skeleton h-4 w-80 max-w-full rounded-md" />
        </div>
        <div className="skeleton hidden h-8 w-28 rounded-lg sm:block" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-[74px] rounded-2xl" />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border p-4 last:border-0">
            <div className="skeleton size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="skeleton h-4 w-2/5 rounded-md" />
              <div className="skeleton h-3 w-4/5 rounded-md" />
            </div>
            <div className="skeleton hidden h-5 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
