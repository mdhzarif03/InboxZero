import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  info: { icon: Info, box: "border-info/25 bg-info/[0.06]", icon_: "text-info" },
  error: { icon: AlertTriangle, box: "border-destructive/30 bg-destructive/[0.06]", icon_: "text-destructive" },
  success: { icon: CheckCircle2, box: "border-success/30 bg-success/[0.06]", icon_: "text-success" },
} as const;

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "error" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed", t.box, className)}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", t.icon_)} />
      <div className="min-w-0 flex-1 text-foreground/90">{children}</div>
    </div>
  );
}
