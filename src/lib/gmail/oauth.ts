import { google, type Auth } from "googleapis";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { requireEnv } from "@/lib/env";
import { writeAudit } from "@/lib/audit";

/**
 * Gmail connection OAuth.
 *
 * Scope policy: gmail.readonly ONLY in this milestone. No modify or send scopes.
 * Write capabilities (labels, sending) will be requested in a later, separate consent
 * step, and only when the user enables that feature.
 *
 * CSRF: a random state value is set in an httpOnly cookie when consent starts and must
 * match on callback, using a constant-time comparison.
 */
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_STATE_COOKIE = "iz_gmail_oauth_state";

export function createOAuthClient(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_GMAIL_CLIENT_ID"),
    requireEnv("GOOGLE_GMAIL_CLIENT_SECRET"),
    requireEnv("GOOGLE_GMAIL_REDIRECT_URI"),
  );
}

export function createConsentState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildConsentUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // needed to receive a refresh token
    prompt: "consent", // ensures a refresh token is issued on every connection
    include_granted_scopes: false,
    scope: [GMAIL_READONLY_SCOPE],
    state,
  });
}

export function statesMatch(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ConnectResult =
  | { ok: true; connectedAccountId: string; emailAddress: string }
  | { ok: false; reason: "no_refresh_token" | "no_profile" | "exchange_failed" };

/**
 * Exchanges the authorization code, verifies the mailbox, and stores the refresh token
 * encrypted. The caller MUST have already verified the state and authenticated the user.
 */
export async function completeGmailConnection(userId: string, code: string): Promise<ConnectResult> {
  const client = createOAuthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }

  if (!tokens.refresh_token) {
    // Without a refresh token we cannot sync in the background. Refuse rather than store a short-lived token.
    return { ok: false, reason: "no_refresh_token" };
  }

  client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" }).catch(() => null);
  const emailAddress = profile?.data.emailAddress;
  if (!emailAddress) {
    return { ok: false, reason: "no_profile" };
  }

  const account = await db.connectedAccount.upsert({
    where: { userId_emailAddress: { userId, emailAddress } },
    create: {
      userId,
      emailAddress,
      encryptedRefreshToken: encryptSecret(tokens.refresh_token),
      accessTokenCache: tokens.access_token ? encryptSecret(tokens.access_token) : null,
      accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: GMAIL_READONLY_SCOPE,
      status: "ACTIVE",
    },
    update: {
      encryptedRefreshToken: encryptSecret(tokens.refresh_token),
      accessTokenCache: tokens.access_token ? encryptSecret(tokens.access_token) : null,
      accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: GMAIL_READONLY_SCOPE,
      status: "ACTIVE",
      lastSyncError: null,
    },
  });

  await writeAudit(userId, "gmail.connected", { accountId: account.id });
  return { ok: true, connectedAccountId: account.id, emailAddress };
}

/**
 * Returns an authenticated OAuth client for a stored connection, refreshing the access token
 * when needed. Persists the refreshed access token (encrypted). Marks the connection as
 * NEEDS_REAUTH if Google rejects the refresh token, so the UI can prompt reconnection.
 */
export async function getAuthorizedClient(connectedAccountId: string, userId: string): Promise<Auth.OAuth2Client> {
  const account = await db.connectedAccount.findFirst({ where: { id: connectedAccountId, userId } });
  if (!account) {
    throw new Error("Connected account not found for this user.");
  }
  if (account.status !== "ACTIVE") {
    throw new Error(`Connection is ${account.status}.`);
  }

  const client = createOAuthClient();
  client.setCredentials({
    refresh_token: decryptSecret(account.encryptedRefreshToken),
    access_token: account.accessTokenCache ? decryptSecret(account.accessTokenCache) : undefined,
    expiry_date: account.accessTokenExpiresAt?.getTime(),
  });

  const needsRefresh =
    !account.accessTokenExpiresAt || account.accessTokenExpiresAt.getTime() - Date.now() < 60_000;

  if (needsRefresh) {
    try {
      const { credentials } = await client.refreshAccessToken();
      await db.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessTokenCache: credentials.access_token ? encryptSecret(credentials.access_token) : null,
          accessTokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        },
      });
    } catch {
      await db.connectedAccount.update({
        where: { id: account.id },
        data: { status: "NEEDS_REAUTH", lastSyncError: "Google rejected the stored credentials. Reconnect Gmail." },
      });
      throw new Error("NEEDS_REAUTH");
    }
  }
  return client;
}

/**
 * Disconnects a Gmail account: revokes the token at Google (best effort), deletes the
 * locally stored tokens, and deletes all mirrored mail for that connection.
 */
export async function disconnectGmailAccount(connectedAccountId: string, userId: string): Promise<void> {
  const account = await db.connectedAccount.findFirst({ where: { id: connectedAccountId, userId } });
  if (!account) return;

  try {
    const client = createOAuthClient();
    await client.revokeToken(decryptSecret(account.encryptedRefreshToken));
  } catch {
    // Revocation can fail if the token is already invalid. Local deletion still proceeds.
  }

  await db.$transaction([
    db.thread.deleteMany({ where: { connectedAccountId: account.id, userId } }),
    db.connectedAccount.delete({ where: { id: account.id } }),
  ]);
  await writeAudit(userId, "gmail.disconnected", { emailAddress: account.emailAddress });
}
