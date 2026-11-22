import { cn } from "@/lib/utils";

function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function initialsOf(name: string): string {
  const cleaned = name.replace(/<.*?>/g, "").trim();
  const parts = cleaned.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase();
}

/** Deterministic colored initials avatar. Hue derives from the seed so a sender always looks the same. */
export function Avatar({ name, seed, className }: { name: string; seed?: string; className?: string }) {
  const hue = hueOf(seed ?? name);
  return (
    <span
      aria-hidden="true"
      style={{ ["--h" as string]: hue }}
      className={cn(
        "grid size-9 shrink-0 select-none place-items-center rounded-full text-[12px] font-semibold",
        "bg-[hsl(var(--h)_85%_92%)] text-[hsl(var(--h)_60%_30%)] dark:bg-[hsl(var(--h)_40%_20%)] dark:text-[hsl(var(--h)_90%_82%)]",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
