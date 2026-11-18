# Security checklist

Each item states its current status. **Done** means implemented in code and reviewed by reading it. It does **not** mean tested in a running deployment, because none has been run. Items marked *Blocker* must be resolved before public release.

## Authentication and sessions
- [x] Sign-in requests identity scopes only (`openid email profile`). *Done (reviewed).*
- [x] Database-backed sessions, revocable server-side, 14-day maximum age. *Done (reviewed).*
- [x] Session cookie httpOnly, SameSite=Lax, Secure in production. *Done (reviewed).*
- [x] Protected pages call `requireUser()`; API routes return 401. *Done (reviewed).*
- [x] Login `next` parameter limited to same-origin paths. *Done (reviewed).*
- [x] Auth.js trusts the Host header only when `AUTH_TRUST_HOST=true`. *Done (reviewed).*
- [ ] Rate limiting on sign-in. Delegated to Google; no application-level limit. *Blocker for public release (see below).*

## Gmail access
- [x] Requests only `gmail.readonly`. No code path sends, deletes, archives or relabels mail. *Done (reviewed).*
- [x] OAuth state: random, single-use, httpOnly cookie, constant-time comparison, path-limited. *Done (reviewed).*
- [x] Callback requires the signed-in session that started the consent. *Done (reviewed).*
- [x] Refresh tokens and access tokens encrypted with AES-256-GCM. *Done, unit-tested (crypto).*
- [x] Revocation at Google on disconnect; local mail deleted. *Done (reviewed).*
- [ ] Gmail restricted-scope verification by Google. *Blocker for public release.*
- [ ] Independent security assessment. *Blocker for public release.*

## Data isolation
- [x] Every query on user-owned tables is scoped by `userId`. *Done (reviewed line by line).*
- [ ] Cross-user isolation test executed against PostgreSQL. `tests/integration-isolation.test.ts` exists but has not been run. *Blocker until executed.*

## Input handling
- [x] Server actions validate input with zod. *Done (reviewed).*
- [x] Search uses parameterized SQL; LIKE wildcards are escaped. *Done (reviewed).*
- [x] Email bodies are converted to text and rendered as React text; no email HTML is rendered. *Done (reviewed).*
- [x] Redirect targets are validated. *Done (reviewed).*

## AI and prompt injection
- [x] Email content is escaped and placed in data tags; the system prompt forbids following instructions in email. *Done, unit-tested in part.*
- [x] Model output is schema-validated; cited message ids must exist in the thread; deadline text must appear verbatim in the email. *Done, unit-tested.*
- [x] Cloud AI requires a paid Gemini tier, a key, and recorded user consent. *Done, unit-tested (policy).*
- [x] Gemini free tier is refused by both the policy and the provider constructor. *Done, unit-tested.*
- [ ] Prompt-injection resistance measured against an adversarial corpus. *Not done. Mitigation only; not a guarantee.*

## Headers and browser security
- [x] Content-Security-Policy, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. *Done (header config executed).*
- [x] HSTS in production. *Done (header config executed).*
- [ ] CSP without `'unsafe-inline'` (nonce-based). *Not done. Scripts and styles still allow inline.*

## Rate limiting and abuse
- [x] Manual and worker sync: 30-second per-account cooldown on the user path. *Done (reviewed).*
- [x] AI calls: daily per-user quota. *Done, unit-tested (policy).*
- [ ] General rate limiting on public routes (sign-in callbacks, search, export, sync worker). *Blocker for public release.*

## Secrets and logging
- [x] No secrets in the repository; `.env.example` contains placeholders only. *Done (scanned).*
- [x] Logs record error codes and messages, not email content or tokens. *Done (reviewed).*
- [ ] Log retention and access policy for the host. *Operator responsibility.*

## Account lifecycle
- [x] Export is JSON and excludes tokens and encrypted fields. *Done (reviewed).*
- [x] Deletion revokes Gmail tokens, deletes local mail, deletes the user row (cascade), clears cookies. *Done (reviewed).*
- [ ] Cascade deletion verified against PostgreSQL. *Blocker until executed.*
- [ ] Audit log retention policy. *Blocker for public release.*

## Keys
- [ ] Encryption key rotation. Not implemented; the stored format has no key version. *Blocker for public release.*

## Verification status
None of the items above has been verified by running the deployed application. The static review and unit tests cover the logic only.
