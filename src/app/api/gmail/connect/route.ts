import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getUserOrNull } from "@/lib/auth";
import { buildConsentUrl, createConsentState, GMAIL_STATE_COOKIE } from "@/lib/gmail/oauth";
import { ConfigurationError } from "@/lib/env";

/**
 * Starts the Gmail consent flow. Requires an authenticated session.
 * Sets a single-use CSRF state cookie that the callback must match.
 */
export async function GET(req: NextRequest) {
  const user = await getUserOrNull();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/gmail", req.url));
  }

  let url: string;
  try {
    const state = createConsentState();
    url = buildConsentUrl(state);
    (await cookies()).set(GMAIL_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/gmail",
      maxAge: 600,
    });
  } catch (err) {
    const reason = err instanceof ConfigurationError ? "not_configured" : "failed";
    return NextResponse.redirect(new URL(`/gmail?error=${reason}`, req.url));
  }
  return NextResponse.redirect(url);
}
