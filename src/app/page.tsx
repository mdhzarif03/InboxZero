import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, BellRing, CalendarClock, CheckCircle2, Cpu, Download, Eye, Flame, Hourglass, Layers3, ListChecks, Lock, Mail, Reply, Search, ShieldCheck, Sparkles,
} from "lucide-react";
import { getUserOrNull } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { FadeIn, Reveal } from "@/components/motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Layers3, title: "Smart grouping", body: "Conversations are sorted by what needs your attention: priority, needs reply, waiting, deadlines, newsletters and more.", tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300", span: "md:col-span-2" },
  { icon: ListChecks, title: "Requests, extracted", body: "Questions and asks addressed to you land in an Action Center you can confirm, complete or dismiss.", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-300", span: "" },
  { icon: CalendarClock, title: "Deadlines found for you", body: "Dates are pulled from messages and flagged when they need your confirmation, so nothing is assumed.", tone: "bg-orange-500/10 text-orange-600 dark:text-orange-300", span: "" },
  { icon: Hourglass, title: "Follow-up tracking", body: "Ask something and hear nothing? InboxZero tracks the replies you are still waiting for and nudges you at the right time.", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300", span: "md:col-span-2" },
  { icon: Search, title: "Full-text search", body: "Search across your synced mail with sender and date filters, or press ⌘K from anywhere.", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", span: "" },
  { icon: Cpu, title: "AI, only if you want it", body: "Rules work out of the box. Add a local model, or opt in to a cloud model with explicit consent.", tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300", span: "md:col-span-2" },
];

const STEPS = [
  { n: "01", title: "Connect Gmail, read-only", body: "Sign in with your name and email. Gmail access is requested separately, and only if you choose to connect it." },
  { n: "02", title: "Sync your recent mail", body: "InboxZero fetches the last 90 days and analyses each conversation to find requests, dates and unanswered questions." },
  { n: "03", title: "Work from what matters", body: "Open the Smart inbox, clear your Action Center, and let follow-ups and deadlines come to you." },
];

const PRIVACY = [
  { icon: Eye, title: "Read-only access", body: "One Gmail permission: gmail.readonly. It can read, never send, delete or relabel." },
  { icon: Lock, title: "Consent before the cloud", body: "Email content is never sent to a cloud provider without your explicit consent." },
  { icon: Download, title: "Your data, portable", body: "Export everything stored about your account as JSON, or delete it all in one step." },
];

function ProductPreview() {
  const rows = [
    { icon: Flame, tile: "bg-rose-500/10 text-rose-600 dark:text-rose-300", badge: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300", label: "Priority", subject: "Quarterly report: final review needed", snippet: "Could you confirm the figures before Friday?", unread: true },
    { icon: Reply, tile: "bg-amber-500/10 text-amber-600 dark:text-amber-300", badge: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300", label: "Needs reply", subject: "Re: Venue options for the offsite", snippet: "Which of the three works best for the team?", unread: true },
    { icon: Hourglass, tile: "bg-sky-500/10 text-sky-600 dark:text-sky-300", badge: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300", label: "Waiting for reply", subject: "Invoice question", snippet: "Following up on the amount listed on page two.", unread: false },
    { icon: CalendarClock, tile: "bg-orange-500/10 text-orange-600 dark:text-orange-300", badge: "bg-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300", label: "Deadlines", subject: "Registration closes soon", snippet: "Please submit the form by the end of the month.", unread: false },
  ];
  return (
    <div className="relative mx-auto mt-16 w-full max-w-5xl">
      <div aria-hidden="true" className="absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_30%,hsl(var(--primary)/0.22),transparent)] blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevated ring-1 ring-foreground/5">
        <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-3">
          <span className="size-2.5 rounded-full bg-rose-400/80" /><span className="size-2.5 rounded-full bg-amber-400/80" /><span className="size-2.5 rounded-full bg-emerald-400/80" />
          <span className="mx-auto rounded-md bg-background/80 px-3 py-0.5 text-[11px] text-muted-foreground">inboxzero · Smart inbox</span>
          <span className="w-10" />
        </div>
        <div className="grid md:grid-cols-[200px_1fr]">
          <div className="hidden border-r border-border bg-muted/30 p-4 md:block" aria-hidden="true">
            {["Smart inbox", "Action center", "Follow-ups", "Deadlines", "Search mail"].map((t, i) => (
              <div key={t} className={cn("mb-1 flex h-9 items-center rounded-lg px-3 text-[13px] font-medium", i === 0 ? "bg-accent text-accent-foreground ring-1 ring-primary/15" : "text-muted-foreground")}>{t}</div>
            ))}
          </div>
          <div className="p-4 text-left sm:p-5">
            <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-hidden="true">
              {[["Priority", "3"], ["Needs reply", "5"], ["Waiting", "2"], ["Deadlines", "4"]].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-xl font-semibold leading-none tabular-nums">{v}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
            <ul className="overflow-hidden rounded-xl border border-border">
              {rows.map((r) => (
                <li key={r.subject} className="relative flex items-center gap-3 border-b border-border bg-card px-4 py-3 last:border-0">
                  {r.unread ? <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" /> : null}
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", r.tile)}><r.icon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[13px]", r.unread ? "font-semibold" : "font-medium")}>{r.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.snippet}</p>
                  </div>
                  <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset sm:inline-flex", r.badge)}>{r.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Illustrative preview with placeholder content.</p>
    </div>
  );
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  if (await getUserOrNull()) redirect("/today");
  const params = await searchParams;
  return (
    <div className="relative overflow-x-clip">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-grid mask-fade-b opacity-70" />

      <header className="glass sticky top-0 z-40 border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Brand href="/" />
          <nav aria-label="Primary" className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#privacy" className="transition-colors hover:text-foreground">Privacy</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className={buttonVariants({ size: "sm" })}>Sign in</Link>
          </div>
        </div>
      </header>

      <main id="main">
        {params.deleted ? (
          <div role="status" className="mx-auto mt-6 flex max-w-xl items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            Your account and its data have been deleted.
          </div>
        ) : null}

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 text-center sm:pt-24">
          <FadeIn>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" /> Read-only Gmail · AI is optional
            </span>
          </FadeIn>
          <FadeIn delay={0.08}>
            <h1 className="mx-auto mt-6 max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tighter sm:text-7xl">
              Your inbox, <span className="text-gradient">under control.</span>
            </h1>
          </FadeIn>
          <FadeIn delay={0.16}>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              InboxZero reads your Gmail with read-only access, groups conversations by what needs your attention,
              finds requests and deadlines, and tracks replies you are still waiting for. It never sends mail or changes your
              labels.
            </p>
          </FadeIn>
          <FadeIn delay={0.24} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "group w-full sm:w-auto")}>
              Get started <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="#how" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}>See how it works</a>
          </FadeIn>
          <FadeIn delay={0.34} y={28}><ProductPreview /></FadeIn>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-primary">Features</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Everything that needs you, in one calm place.</h2>
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.06} className={cn("group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-elevated", f.span || "md:col-span-2")}>
                <span className={cn("mb-5 grid size-11 place-items-center rounded-xl", f.tone)}><f.icon className="size-5" aria-hidden="true" /></span>
                <h3 className="text-[17px] font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-primary">How it works</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">From connected to caught up in three steps.</h2>
          </Reveal>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08} className="relative rounded-2xl border border-border bg-card p-6 shadow-soft">
                <span className="text-gradient text-4xl font-semibold tracking-tighter tabular-nums">{s.n}</span>
                <h3 className="mt-4 text-[17px] font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Privacy */}
        <section id="privacy" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
          <Reveal className="relative overflow-hidden rounded-3xl border border-border bg-foreground px-6 py-14 text-background sm:px-12">
            <div aria-hidden="true" className="absolute -right-24 -top-24 size-96 rounded-full bg-primary/40 blur-3xl" />
            <div aria-hidden="true" className="absolute -bottom-32 -left-16 size-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="relative mx-auto max-w-2xl text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-background/10 ring-1 ring-background/20"><ShieldCheck className="size-6" aria-hidden="true" /></span>
              <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Built to be trusted with your mail.</h2>
              <p className="mt-3 text-pretty text-background/70">Your inbox is personal. InboxZero is designed around keeping it that way.</p>
            </div>
            <div className="relative mt-12 grid gap-4 md:grid-cols-3">
              {PRIVACY.map((p) => (
                <div key={p.title} className="rounded-2xl bg-background/[0.06] p-6 ring-1 ring-background/15 backdrop-blur">
                  <p.icon className="size-5 text-background/90" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-semibold">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-background/70">{p.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-3xl px-5 pb-28 pt-10 text-center">
          <Reveal>
            <BellRing className="mx-auto size-8 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Turn the noise down.</h2>
            <p className="mt-3 text-muted-foreground">Sign in and connect Gmail when you are ready.</p>
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "group mt-8")}>
              Get started <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row">
          <Brand href="/" />
          <p className="flex items-center gap-2"><Mail className="size-4" aria-hidden="true" /> Your email, with a little more clarity.</p>
        </div>
      </footer>
    </div>
  );
}
