"use client";

import { Button } from "@/components/ui/button";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main role="alert" className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold">InboxZero could not load this page</h1>
      <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
      <div className="flex justify-center"><Button onClick={() => reset()} size="sm">Try again</Button></div>
    </main>
  );
}
