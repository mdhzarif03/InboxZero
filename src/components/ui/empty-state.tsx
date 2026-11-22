import type { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  children,
  icon: Icon = Sparkles,
}: {
  title: string;
  children?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-dots mask-radial opacity-60" />
      <div className="relative mx-auto flex max-w-sm flex-col items-center">
        <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-soft ring-1 ring-primary/15">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <p className="text-[15px] font-semibold tracking-tight">{title}</p>
        {children ? <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
