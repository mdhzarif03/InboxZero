import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-2 px-6 text-center">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">We could not find that page</h1>
      <p className="text-sm text-muted-foreground">It may have moved, or it may belong to a different account.</p>
      <Link href="/inbox" className="mt-3 text-sm underline underline-offset-2">Back to Smart Inbox</Link>
    </main>
  );
}
