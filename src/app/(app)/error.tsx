"use client";

import { useEffect } from "react";
import { Inbox, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for authenticated pages. Shows a neutral message and never the raw error,
 * because server errors can contain configuration detail or fragments of data.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Logged client-side only; the digest links the message to the server log without exposing content.
    console.error("[app] page error", error.digest ?? "no-digest");
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
        <ShieldAlert className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong on this page</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your data has not been changed. You can try again, or return to the Smart Inbox.
      </p>
      {error.digest ? <p className="mt-3 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex gap-2">
        <Button onClick={() => reset()}><RotateCcw /> Try again</Button>
        <Button variant="outline" onClick={() => { window.location.href = "/inbox"; }}><Inbox /> Smart inbox</Button>
      </div>
    </div>
  );
}
