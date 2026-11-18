import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserOrNull } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  if (await getUserOrNull()) redirect("/inbox");
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
      {params.deleted ? <p role="status" className="mb-6 rounded-md border border-border px-3 py-2 text-sm">Your account and its data have been deleted.</p> : null}
      <h1 className="text-4xl font-semibold tracking-tight">InboxZero</h1>
      <p className="mt-2 text-lg text-muted-foreground">Your inbox, under control.</p>
      <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">
        InboxZero reads your Gmail with read-only access, groups conversations by what needs your attention,
        finds requests and deadlines, and tracks replies you are still waiting for. It never sends mail or changes your
        labels. AI is optional, and email content is never sent to a cloud provider without your explicit consent.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login"><Button>Sign in</Button></Link>
      </div>
    </main>
  );
}
