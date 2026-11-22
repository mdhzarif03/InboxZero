import { FlaskConical } from "lucide-react";
import { db } from "@/lib/db";

/**
 * Shown on every authenticated page while the signed-in user has sample (fixture) data loaded.
 * This is the single source of the sample-data indicator, so it cannot be missed on any page.
 */
export async function SampleDataBanner({ userId }: { userId: string }) {
  const sample = await db.connectedAccount.count({ where: { userId, provider: "fixture" } });
  if (sample === 0) return null;
  return (
    <div role="alert" className="border-b border-warning/30 bg-warning/10 px-4 py-2 sm:px-6 lg:px-8">
      <p className="mx-auto flex max-w-[1200px] items-center gap-2.5 text-[13px] text-foreground">
        <FlaskConical className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <span>
          <strong className="font-semibold tracking-wide">SAMPLE DATA.</strong>{" "}
          Conversations shown on this account are development fixtures, not messages from Gmail.
        </span>
      </p>
    </div>
  );
}
