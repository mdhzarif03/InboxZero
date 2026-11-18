import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Authentication: who the user is.
 *
 * Sign-in requests ONLY identity scopes (openid, email, profile). Gmail access is
 * requested separately in the Gmail connection flow (src/lib/gmail/oauth.ts) so that
 * a user who never connects Gmail never grants mailbox access.
 *
 * Sessions are database-backed so they can be revoked server-side.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 14, updateAge: 60 * 60 },
  // Auth.js builds callback URLs from the request host unless AUTH_URL is set. Trusting the Host header
  // is only safe behind a reverse proxy that sets it. Off by default; enable with AUTH_TRUST_HOST=true
  // only when the proxy is trusted and AUTH_URL is not configured.
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Expose only the user id to the client-facing session object.
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
});

export type CurrentUser = { id: string; email: string | null; name: string | null };

/**
 * Server-side guard. Every protected route and server action must call this, and must
 * use the returned id for all database queries. Never trust a user id from the client.
 */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) {
    redirect("/login");
  }
  return { id, email: session.user?.email ?? null, name: session.user?.name ?? null };
}

/** Non-redirecting variant for API routes, which should return 401 instead. */
export async function getUserOrNull(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return { id, email: session.user?.email ?? null, name: session.user?.name ?? null };
}
