/**
 * Scheduled sync entry point. Run from cron, a systemd timer or a hosted scheduler:
 *   npm run sync:run
 * It uses the same engine as the worker endpoint, without going through HTTP.
 */
import { db } from "../src/lib/db";
import { syncConnectedAccount } from "../src/lib/gmail/sync";

async function main() {
  const accounts = await db.connectedAccount.findMany({ where: { status: "ACTIVE", provider: "gmail" }, select: { id: true, userId: true } });
  let failures = 0;
  for (const account of accounts) {
    const outcome = await syncConnectedAccount(account.userId, account.id);
    if (outcome.status === "failed") failures++;
    console.log(`[sync] account=${account.id} status=${outcome.status}`);
  }
  console.log(`[sync] done: ${accounts.length} accounts, ${failures} failed`);
  await db.$disconnect();
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch(async (err) => {
  console.error("[sync] fatal", err instanceof Error ? err.message : "unknown");
  await db.$disconnect();
  process.exit(1);
});
