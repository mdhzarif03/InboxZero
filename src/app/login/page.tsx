import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { signIn } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { FadeIn } from "@/components/motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/notice";

export const metadata = { title: "Sign in" };

async function signInWithGoogle(formData: FormData) {
  "use server";
  const next = String(formData.get("next") ?? "/inbox");
  // Only allow same-origin relative paths to prevent open redirects.
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/inbox";
  await signIn("google", { redirectTo: safe });
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="!size-[18px]">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.87 8.88 4.76 12 4.76Z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <main id="main" className="relative flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Brand href="/" />
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <FadeIn>
            <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Sign in to InboxZero. Sign-in uses only your name and email address. Gmail access is requested separately, and only if you choose to connect it.
            </p>
            {params.error ? <div className="mt-5"><Notice tone="error">Sign-in did not complete. Please try again.</Notice></div> : null}
            <form action={signInWithGoogle} className="mt-8">
              <input type="hidden" name="next" value={params.next ?? "/inbox"} />
              <SubmitButton size="lg" variant="outline" className="w-full text-[15px]" pendingLabel="Redirecting to Google…">
                <GoogleMark /> Continue with Google
              </SubmitButton>
            </form>
            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              Read-only by design. InboxZero never sends mail or changes your labels.
            </p>
          </FadeIn>
        </div>

        <Link href="/" className="text-xs text-muted-foreground transition-colors hover:text-foreground">← Back to home</Link>
      </main>

      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-foreground text-background lg:block">
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-primary/50 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="absolute inset-0 bg-grid opacity-[0.12] mask-radial invert" />
        <div className="relative flex h-full flex-col justify-center px-16">
          <p className="max-w-md text-balance text-4xl font-semibold leading-tight tracking-tight">Your inbox, with the noise turned down.</p>
          <ul className="mt-10 space-y-5">
            {["Conversations grouped by what needs you", "Requests and deadlines found automatically", "Replies you are waiting on, tracked for you"].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] text-background/80">
                <span className="grid size-6 place-items-center rounded-full bg-background/10 ring-1 ring-background/20"><CheckCircle2 className="size-3.5" /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
