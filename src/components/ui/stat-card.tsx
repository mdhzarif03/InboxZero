import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact metric tile. Optional href makes the whole tile a link. */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "text-accent-foreground bg-accent",
  active,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href?: string;
  tone?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tone)}>
        <Icon className="size-[17px]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        <span className="mt-1.5 block truncate text-xs font-medium text-muted-foreground">{label}</span>
      </span>
    </>
  );
  const cls = cn(
    "group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all duration-200",
    href && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated",
    active && "border-primary/40 ring-2 ring-primary/15",
  );
  return href ? (
    <Link href={href} className={cls}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
