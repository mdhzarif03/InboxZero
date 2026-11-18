# Privacy and security

This document describes what InboxZero stores, what it never does, and how each commitment is enforced. Each control is marked with how it was verified:

- **Tested:** a unit test runs the control in the pure-logic suite (130 tests across 14 suites, see STATUS.md). These tests were run through a harness, not Vitest.
- **Reviewed:** the code was read line by line. It was not executed.
- **Not verified:** requires a database, a network or a live service that the build environment could not reach.

## What InboxZero stores

- Your name and email address, from Google sign-in.
- For each connected Gmail account: the address, an encrypted refresh token, an encrypted short-lived access token, and sync cursors.
- A local mirror of the conversations you synced: subjects, senders, recipients, body text truncated to 20,000 characters per message, and attachment **names and sizes only**.
- Derived data: categories, priorities, summaries, detected actions, dates, follow-up records, and AI usage counts.
- An audit log of security-relevant events (connections, syncs, AI consent changes, exports, deletion). Log entries never contain email content or tokens.

Sample (fixture) data, when loaded, is stored under an account whose provider is `fixture`. It is marked everywhere it appears (see below).

## What InboxZero never does

| Commitment | Enforcement | Verified |
| --- | --- | --- |
| Never sends or deletes email, or changes labels | Only `gmail.readonly` is requested. No code path calls a send or modify API. | Reviewed (`src/lib/gmail/*`) |
| Never downloads attachment contents | Only metadata is read from the message payload | Tested (`attachments` suite) |
| Never sends email content to Gemini's free tier | `GeminiProvider` refuses to construct on the free tier. The routing policy refuses it before that. | Tested (`ai-policy`, `ai` suites) |
| Never sends email content to any cloud provider without recorded consent | Policy requires `cloudAiConsentAt` for Gemini | Tested (`ai-policy`) |
| Never sends the whole inbox to a model | Analysis is per thread. Each prompt contains one conversation, capped at 12 messages and 4,000 characters per message. | Reviewed (`ai-enhance.ts`, `prompts.ts`) |
| Never exposes tokens to the browser or in exports | Tokens are not selected by any page query, and the export query excludes the token fields | Reviewed (`privacy/account.ts`) |
| Never renders email HTML | Bodies are converted to text in `htmlToText`, then shown as React text nodes | Tested for conversion (`parse` suite); rendering not verified |

## AI processing

| Provider | Where content goes | Condition |
| --- | --- | --- |
| Rules only | Nowhere | Default |
| Ollama | The Ollama server at `OLLAMA_BASE_URL` | Operator-configured. If that URL points to another machine, content goes there. |
| Gemini | Google | Paid tier, a key, and the user's recorded consent |

Only the conversation being analyzed is sent, and only when its content has changed since the last AI analysis.

### Prompt-injection handling

Email text is untrusted. The defences are:

1. **Escaping.** `<` and `>` in email content are replaced with entities, so a message cannot close the `<email_data>` tag or open a new one. **Tested** (`ai` suite: a malicious `</email_data><system>` payload).
2. **Instruction.** The system prompt declares email content as data and forbids following instructions inside it. **Reviewed.** This is a mitigation, not a guarantee: a model can still be influenced.
3. **Schema validation.** Every model response is parsed and checked against a zod schema. Unknown categories, out-of-range values and malformed JSON are discarded. **Tested.**
4. **Citation checks.** A summary item or action may only cite message ids that exist in the thread. Other ids are removed. **Reviewed** (`ai-enhance.ts`).
5. **Dates are never taken from the model.** A deadline expression returned by the model must appear verbatim in the email, and the date is then computed by deterministic code. **Tested.**
6. **Gmail labels are authoritative.** AI cannot move a thread out of ARCHIVED or PROMOTIONS. **Reviewed.**

## Your controls

- **Settings → AI processing**: choose the provider, withdraw cloud consent at any time. Withdrawing consent takes effect on the next AI call, because the policy reads the stored timestamp each time.
- **Settings → Your data**: download a JSON copy of everything stored about you. OAuth tokens are excluded by query, not by filtering afterwards. **Reviewed**; the download route has not been executed.
- **Gmail connection → Disconnect**: revokes the token at Google, then deletes the local mirror for that account. Sample data is not affected.
- **Settings → Delete account**: disconnects Gmail, deletes all data and sessions, then clears the session cookies. Requires typing `DELETE`.

## Authentication and sessions

- Sign-in requests only `openid email profile`. Mailbox access is a separate consent. **Reviewed** (`src/lib/auth.ts`, `src/lib/gmail/oauth.ts`).
- Sessions are stored in the database and can be revoked server-side. The cookie is httpOnly and SameSite=Lax, and marked Secure in production. **Reviewed. Not verified** in a running browser.
- Every protected page calls `requireUser()`, which redirects when no session exists. The protected API routes return 401. **Reviewed.**
- The `next` parameter on the login page is restricted to same-origin paths, which blocks open redirects. **Reviewed.**
- Auth.js does not trust the request's Host header unless `AUTH_TRUST_HOST=true` is set. Enable it only behind a reverse proxy that sets Host, and set `AUTH_URL` to the public origin. Off by default. **Written, not executed.**

## Authorization on user-owned data

Every query against a user-owned table includes `userId`, either directly or through a parent row that was already loaded with `userId`. A line-by-line audit covered every `db.*` call that is not an obvious internal update.

- Pages: inbox, thread, actions, follow-ups, deadlines, search, Gmail connection. **Reviewed.**
- Server actions: action status, deadline confirmation, follow-up creation and dismissal, AI preference, Gmail disconnect, account deletion. **Reviewed.**
- Background code, which receives ids that were already validated: sync, analysis pipeline, AI enhancement. **Reviewed.**
- Search: the SQL joins `Message` to `Thread` on both `threadId` and `userId`, and filters `Message.userId`. **Reviewed. Not executed.**

**Cross-user isolation is not yet tested by execution.** `tests/integration-isolation.test.ts` creates two users and checks that one cannot read the other's thread and that deleting a user removes their rows. It runs only when `TEST_DATABASE_URL` is set, and that database was not available in this environment.

## Account deletion and Gmail disconnection

Deletion order: revoke Gmail tokens at Google (best effort), delete the local mail for each connection, delete the user row, clear cookies, redirect. The user row's deletion cascades to sessions, accounts, preferences, mail, summaries, actions, follow-ups, deadlines and AI usage. The audit log keeps its entries with the user reference set to null.

- Token revocation failure does not block deletion. **Reviewed.**
- A failed decrypt of a stored token during disconnection is caught, so deletion still completes. **Reviewed.**
- The cascade behaviour depends on the foreign keys in `schema.prisma` and the migration. The schema checker confirms every relation has both sides. **Verified structurally.** Cascade behaviour in PostgreSQL is **not verified**.

## Encryption

- Refresh and access tokens are encrypted with AES-256-GCM, using a random 96-bit IV per value and a 128-bit authentication tag. **Tested:** round trip, tamper detection, malformed input, key length.
- The key is read from `TOKEN_ENCRYPTION_KEY` and must decode to 32 bytes. **Tested.**
- **Key rotation is not implemented.** The stored format has no key version. Changing the key makes stored tokens unreadable, and users must reconnect Gmail.

## Security headers

`next.config.mjs` sets a Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, a referrer policy, a permissions policy, and `Strict-Transport-Security` in production. `unsafe-eval` is added only in development. The policy still permits `'unsafe-inline'` scripts and styles, because the App Router's runtime requires it without a nonce setup. **Header output executed** in both environments. CSP behaviour in a browser is not verified.

## Security review (phase 4)

The review covered user-data isolation, OAuth state, token handling, server-side authorization, prompt injection, cloud AI consent, the Gemini free-tier restriction, export and deletion, the sync endpoint, rate limiting and headers. It was done by reading the code, not by penetration testing. Concrete results are in STATUS.md.

Fixed this phase: Auth.js no longer trusts the Host header by default; HSTS is sent in production; manual sync no longer reports locked or partial results as success.

Remaining production blockers: no general rate limiting on public routes; `unsafe-inline` remains in the CSP; no encryption key rotation; no audit log retention policy.

## Sample data

Sample data is labelled in four places: a banner on every authenticated page, a disabled "Open in Gmail" link, a "SAMPLE DATA" badge on the Gmail page, and the refusal of Sync Now. **Reviewed.** Visual placement has not been checked in a browser.

## Known gaps before public launch

- Google's OAuth verification and a third-party security assessment for the restricted `gmail.readonly` scope.
- Encryption key rotation.
- Rate limiting on public routes, including sign-in and the sync endpoint. The sync endpoint has a per-account cooldown, but no general limit exists.
- A retention policy for the audit log.
- A verified cross-user isolation test run against PostgreSQL.
- Confirmation of the database cascade behaviour against PostgreSQL.
- Removing `'unsafe-inline'` from the CSP once nonces are configured.
