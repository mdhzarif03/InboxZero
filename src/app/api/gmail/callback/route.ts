import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getUserOrNull } from "@/lib/auth";
import { completeGmailConnection, GMAIL_STATE_COOKIE, statesMatch } from "@/lib/gmail/oauth";
import { syncConnectedAccount, type SyncOutcome } from "@/lib/gmail/sync";
import { syncCodeFromOutcome } from "@/lib/gmail/status";

/**
 * OAuth callback for Gmail. Two separate results are reported:
 *  1. Connection: the code was exchanged, the mailbox was identified and its token stored.
 *  2. Synchronization: the first sync ran. Its failure does NOT undo the connection.
 *
 * Checks, in order:
 *  - the user is still signed in (the connection belongs to this session, not to the link);
 *  - the CSRF state matches the cookie set when consent started (single use, constant-time compare);
 *  - the authorization code is exchanged server-side only.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirectTo = (query: string) => NextResponse.redirect(new URL(`/gmail?${query}`, req.url));

  const user = await getUserOrNull();
  if (!user) return NextResponse.redirect(new URL("/login?next=/gmail", req.url));

  const store = await cookies();
  const expectedState = store.get(GMAIL_STATE_COOKIE)?.value;
  store.delete({ name: GMAIL_STATE_COOKIE, path: "/api/gmail" });

  if (url.searchParams.get("error")) return redirectTo("error=denied");
  if (!statesMatch(expectedState, url.searchParams.get("state"))) return redirectTo("error=state_mismatch");

  const code = url.searchParams.get("code");
  if (!code) return redirectTo("error=missing_code");

  // Stage 1: connection. If this fails, nothing was stored and the user is told why.
  const connection = await completeGmailConnection(user.id, code);
  if (!connection.ok) return redirectTo(`error=${connection.reason}`);

  // Stage 2: first synchronization. Its outcome is reported separately; an unexpected throw is a failed sync.
  let outcome: SyncOutcome;
  try {
    outcome = await syncConnectedAccount(user.id, connection.connectedAccountId);
  } catch {
    outcome = { status: "failed", error: "The first sync stopped unexpectedly." };
  }

  return redirectTo(`connected=1&sync=${syncCodeFromOutcome(outcome)}`);
}
