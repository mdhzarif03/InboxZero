import Link from "next/link";
import { requireUser, signOut } from "@/lib/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { SampleDataBanner } from "@/components/sample-data-banner";

/** Navigation contains only pages that are implemented in this milestone. */
const NAV = [
  { href: "/inbox", label: "Smart Inbox" },
  { href: "/actions", label: "Action Center" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/deadlines", label: "Deadlines" },
  { href: "/search", label: "Search" },
  { href: "/gmail", label: "Gmail connection" },
  { href: "/settings", label: "Settings & privacy" },
];

async function logout() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-border md:flex md:flex-col">
        <div className="px-4 py-5">
          <Link href="/inbox" className="text-base font-semibold tracking-tight">InboxZero</Link>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 px-2">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2 text-sm hover:bg-accent">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate px-1 text-xs text-muted-foreground" title={user.email ?? ""}>{user.email}</p>
          <form action={logout} className="mt-2">
            <SubmitButton variant="ghost" size="sm" className="w-full justify-start">Sign out</SubmitButton>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border px-4 py-3 md:hidden">
          <Link href="/inbox" className="font-semibold">InboxZero</Link>
          <nav aria-label="Main mobile" className="flex gap-3 overflow-x-auto text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap text-muted-foreground hover:text-foreground">{item.label}</Link>
            ))}
          </nav>
        </header>
        <SampleDataBanner userId={user.id} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
