import { signIn } from "@/lib/auth";
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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to InboxZero</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign-in uses only your name and email address. Gmail access is requested separately, and only if you choose to connect it.
      </p>
      {params.error ? <div className="mt-4"><Notice tone="error">Sign-in did not complete. Please try again.</Notice></div> : null}
      <form action={signInWithGoogle} className="mt-6">
        <input type="hidden" name="next" value={params.next ?? "/inbox"} />
        <SubmitButton className="w-full">Continue with Google</SubmitButton>
      </form>
    </main>
  );
}
