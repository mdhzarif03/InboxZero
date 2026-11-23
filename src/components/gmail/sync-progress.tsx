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

function getProgress(snapshot: Snapshot | null): number {
  if (!snapshot) return 0;
  if (snapshot.status === "completed") return 100;

  const current = Math.max(0, snapshot.current);
  const total = Math.max(0, snapshot.total);
  const fraction = total > 0 ? Math.min(1, current / total) : 0;
  const stage = (snapshot.stage ?? "").toLowerCase();

  // Weighted phases give users one continuous overall percentage instead of
  // a bar that resets to zero whenever the sync moves to its next stage.
  if (stage.includes("preparing")) return 2;
  if (stage.includes("finding")) return 4;
  if (stage.includes("downloading")) return Math.round(5 + fraction * 50);
  if (stage.includes("checking")) return Math.round(5 + fraction * 50);
  if (stage.includes("saving")) return Math.round(55 + fraction * 15);
  if (stage.includes("organizing")) return Math.round(70 + fraction * 15);
  if (stage.includes("analyzing")) return Math.round(85 + fraction * 14);
  if (snapshot.status === "failed") return 0;
  return snapshot.running ? 1 : 0;
}

export function SyncProgress() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/sync", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as Snapshot;
      setSnapshot(data);
      if (data.running || data.status === "completed" || data.status === "failed") {
        setStarting(false);
      }
    } catch {
      // A missed poll must not interrupt the server-side synchronization.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const start = async () => {
    setStarting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const data = await response.json() as {
        results?: Array<{ status: string }>;
        accepted?: number;
        error?: string;
      };

      if (!response.ok) {
        setMessage(data.error ?? "Could not start synchronization. Please try again.");
        setStarting(false);
        return;
      }

      const statuses = data.results?.map((item) => item.status) ?? [];
      if (statuses.length === 0) {
        setMessage("No active Gmail account is available to sync.");
        setStarting(false);
      } else if (statuses.every((status) => status === "cooldown")) {
        setMessage("Your mailbox was synced recently. Please wait a moment before syncing again.");
        setStarting(false);
      } else if (statuses.every((status) => status === "skipped_locked")) {
        setMessage("A sync is already running. Showing its live progress.");
      } else {
        setMessage("Sync started on the server. You can safely move to another page.");
      }
      await refresh();
    } catch {
      setMessage("Could not confirm the start request. Checking the server for an active sync…");
      await refresh();
    }
  };

  const running = starting || Boolean(snapshot?.running);
  const current = snapshot?.current ?? 0;
  const total = snapshot?.total ?? 0;
  const percent = getProgress(snapshot);
  const completed = snapshot?.status === "completed" && !snapshot.running;
  const failed = snapshot?.status === "failed" && !snapshot.running;
  const showProgress = running || completed || failed;

  const countLabel = total > 0
    ? `${current.toLocaleString()} of ${total.toLocaleString()} ${snapshot?.stage?.toLowerCase().includes("conversation") ? "conversations" : "emails"} in this step`
    : running
      ? "Preparing the next step…"
      : failed
        ? "Sync incomplete"
        : "All steps completed";

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
        <Button type="button" variant="outline" size="sm" onClick={start} disabled={running}>
          {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {running ? "Syncing…" : "Sync inbox"}
        </Button>
      </div>

      {showProgress ? (
        <div className="mt-4 space-y-2">
          <div
            className="h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Overall mailbox synchronization progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${failed ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
            <span className="text-muted-foreground">{countLabel}</span>
            <strong className={failed ? "text-destructive" : "text-foreground"}>{percent}%</strong>
          </div>
          {running ? (
            <p className="text-[11px] text-muted-foreground">Live server progress · updates every second</p>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="mt-3 text-xs text-muted-foreground" role="status">{message}</p> : null}
    </section>
  );
}
