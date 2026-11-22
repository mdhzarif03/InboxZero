import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 overflow-hidden px-6 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid mask-radial opacity-60" />
      <p className="relative text-gradient text-8xl font-semibold tracking-tighter">404</p>
      <h1 className="relative mt-2 text-xl font-semibold tracking-tight">We could not find that page</h1>
      <p className="relative text-sm text-muted-foreground">It may have moved, or it may belong to a different account.</p>
      <Link href="/inbox" className={`${buttonVariants({ variant: "outline" })} relative mt-5`}>
        <ArrowLeft /> Back to Smart Inbox
      </Link>
    </main>
  );
}
