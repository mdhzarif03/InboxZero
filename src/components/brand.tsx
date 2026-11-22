import Link from "next/link";
import { cn } from "@/lib/utils";

/** Logo mark. Uses the existing brand asset so favicon, sidebar and landing stay consistent. */
export function BrandMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/inboxzero-icon.svg" alt="" width={32} height={32} className={cn("size-8 shrink-0", className)} />;
}

export function Brand({
  href = "/inbox",
  collapsed = false,
  className,
}: {
  href?: string;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} aria-label="InboxZero home" className={cn("flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      <BrandMark />
      {collapsed ? null : (
        <span className="text-[17px] font-semibold tracking-tight">
          Inbox<span className="text-primary">Zero</span>
        </span>
      )}
    </Link>
  );
}
