"use client";

import { useEffect } from "react";
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
    <div role="alert" className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-lg font-semibold">Something went wrong on this page</h1>
      <p className="text-sm text-muted-foreground">Your data has not been changed. You can try again, or return to the Smart Inbox.</p>
      {error.digest ? <p className="text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      <div className="flex justify-center gap-2 pt-2">
        <Button onClick={() => reset()} size="sm">Try again</Button>
        <Button variant="outline" size="sm" onClick={() => { window.location.href = "/inbox"; }}>Smart Inbox</Button>
      </div>
    </div>
  );
}
