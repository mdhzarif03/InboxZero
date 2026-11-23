"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Snapshot = {
  status: string;
  stage: string | null;
  current: number;
  total: number;
  running: boolean;
  error: string | null;
  lastSyncedAt?: string | null;
};

export function SyncProgress() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/sync", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as Snapshot;
    setSnapshot(data);
    if (!data.running && (data.status === "completed" || data.status === "failed")) {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const start = async () => {
    setStarting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const data = await response.json() as { results?: Array<{ status: string }> };
      const status = data.results?.[0]?.status;
      if (status === "cooldown") {
        setMessage("Your mailbox was synced recently. Please wait a moment before syncing again.");
        setStarting(false);
      } else if (status === "skipped_locked") {
        setMessage("A sync is already running. Showing its progress below.");
      } else if (!response.ok) {
        setMessage("Could not start synchronization. Please try again.");
        setStarting(false);
      }
      await refresh();
    } catch {
      setMessage("The sync request was interrupted. Checking the latest mailbox status…");
      await refresh();
    }
  };

  const running = starting || Boolean(snapshot?.running);
  const total = snapshot?.total ?? 0;
  const current = snapshot?.current ?? 0;
  const determinate = total > 0;
  const percent = determinate ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const completed = snapshot?.status === "completed" && !snapshot.running;
  const failed = snapshot?.status === "failed" && !snapshot.running;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {running ? <Loader2 className="size-4 animate-spin text-primary" /> : completed ? <CheckCircle2 className="size-4 text-success" /> : failed ? <AlertCircle className="size-4 text-destructive" /> : <RefreshCw className="size-4 text-muted-foreground" />}
            {running ? "Syncing your inbox" : completed ? "Inbox is up to date" : failed ? "Sync needs attention" : "Mailbox synchronization"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {running
              ? snapshot?.stage ?? "Starting synchronization…"
              : failed
                ? snapshot?.error ?? "The last sync failed."
                : completed
                  ? "Your latest mailbox sync completed."
                  : "Sync your Gmail and track progress here."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={start} disabled={running || starting}>
          {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {running ? "Syncing…" : "Sync inbox"}
        </Button>
      </div>

      {(running || completed || failed) ? (
        <div className="mt-4 space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Mailbox sync progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={determinate ? percent : undefined}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${failed ? "bg-destructive" : "bg-primary"} ${running && !determinate ? "w-1/3 animate-pulse" : ""}`}
              style={determinate ? { width: `${percent}%` } : undefined}
            />
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
            <span>{determinate ? `${current.toLocaleString()} of ${total.toLocaleString()} ${snapshot?.stage?.toLowerCase().includes("conversation") ? "conversations" : "emails"}` : running ? "Preparing mailbox…" : failed ? "Incomplete" : completed ? "0 new emails" : "Complete"}</span>
            {determinate ? <span>{percent}%</span> : null}
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-xs text-muted-foreground" role="status">{message}</p> : null}
    </section>
  );
}
