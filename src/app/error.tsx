"use client";

import { RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main role="alert" className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="mb-2 grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
        <ShieldAlert className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">InboxZero could not load this page</h1>
      <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
      <Button onClick={() => reset()} className="mt-2"><RotateCcw /> Try again</Button>
    </main>
  );
}
