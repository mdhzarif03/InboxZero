import { db } from "@/lib/db";
import { Notice } from "@/components/ui/notice";

/**
 * Shown on every authenticated page while the signed-in user has sample (fixture) data loaded.
 * This is the single source of the sample-data indicator, so it cannot be missed on any page.
 */
export async function SampleDataBanner({ userId }: { userId: string }) {
  const sample = await db.connectedAccount.count({ where: { userId, provider: "fixture" } });
  if (sample === 0) return null;
  return (
    <div className="border-b border-border bg-muted px-4 py-2 md:px-8">
      <Notice tone="error">
        SAMPLE DATA. Conversations shown on this account are development fixtures, not messages from Gmail.
      </Notice>
    </div>
  );
}
