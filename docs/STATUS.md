# Status

**InboxZero is not production-ready.** It has not been installed, built, or run in an environment with network access and a database. Nothing below should be read as evidence that the application works end to end.

This document uses four categories, and every claim belongs to exactly one of them:

- **Executed and passing:** run in this repository, output recorded.
- **Executed and failing:** run, failed. The failure is listed with its cause.
- **Written, not executed:** code exists and was read and, where possible, syntax-checked. It has not run against its real dependency.
- **Blocked by external requirements:** cannot be done in the environment that produced this repository.

## Environment of the phase 4 run

The sandbox had no route to the internet and no database. Real attempts, with their outcomes:

| Attempt | Outcome |
| --- | --- |
| DNS for `registry.npmjs.org` | Failed (`Could not resolve host`) |
| `curl https://registry.npmjs.org/zod` | Exit 6, no connection |
| `npm install` | Hung until a 120-second timeout ended it. No `node_modules` and no lockfile were created. |
| `npx prisma validate` (fetches Prisma 6) | Failed: `npm error network` |
| TCP connection to `127.0.0.1:5432` | Nothing listening. No PostgreSQL, Docker or Prisma engine is installed. |

Because these failed, the following were **not** performed: dependency installation, lockfile generation, Prisma client generation, `prisma validate`, Prisma migration generation, migration deployment against a database, `npm run typecheck`, `npm run lint`, `npm test` under Vitest, `npm run build`, the cross-user isolation tests against PostgreSQL, and any run of the application. None of these has been fabricated or estimated.

## Final-build attempt (this run)

The final-build assignment asked for dependency installation, a real PostgreSQL database, a generated Prisma migration, the real test runner, a production build and a running application. Each was attempted and blocked:

| Attempt | Outcome |
| --- | --- |
| DNS and HTTPS to `registry.npmjs.org` | Unresolved; `curl` exit 6 |
| HTTPS to `pypi.org` | Unresolved; `curl` exit 6 |
| `apt-get update` | Exit 0 with warnings: `archive.ubuntu.com` and `security.ubuntu.com` unresolved. The package index is a stale local cache with no PostgreSQL candidate. |
| PostgreSQL, Docker, `initdb` | None installed; none obtainable |
| Node.js and npm | Present (Node v22.23.4, npm 10.9.9), but no registry to install from |

Not performed, because each depends on a blocked resource: `npm ci`, `prisma validate`, `prisma generate`, generating the initial migration, `prisma migrate deploy`, database integration tests, `npm run typecheck` with Next.js types, `npm run lint`, `npm test` under Vitest, `npm run build`, and running the application. No result for any of them has been produced or estimated.

Checks that did run in this environment, against the current sources:

- **Environment variables.** Every variable read by `src/lib/env.ts` appears in `.env.example`. Every variable read through `process.env` appears there, except `NODE_ENV`, a standard variable that needs no entry. `AUTH_URL` is read implicitly by Auth.js.
- **Documentation references.** Every npm script cited in the documentation exists in `package.json`, and every file path cited exists in the repository.

New documents: `docs/DEPLOYMENT.md` and `docs/SECURITY-CHECKLIST.md`. Both are written from the code and are marked as unverified where that applies.

## Executed and passing

| Check | How it was run | Result |
| --- | --- | --- |
| Pure unit, fixture and regression tests, 14 suites | The `src/` and `tests/` directories were copied to a scratch directory. The `from "vitest"` import line was replaced with a minimal assertion harness supporting the matchers the suite uses. Run with `tsx`. | **130 / 130 passed** |
| Strict TypeScript on 21 dependency-free modules | Global `tsc` with the project's strict settings (`strict`, `noUncheckedIndexedAccess`). Modules that import Prisma, Next.js or googleapis are excluded. | exit 0 |
| Syntax parse of every project file (87 files) | TypeScript's parser, including JSX | 0 errors |
| Next.js header configuration | `next.config.mjs` evaluated under `NODE_ENV` development and production | Development omits HSTS; production includes it. CSP `unsafe-eval` appears only in development. |

The 130 tests are the same files that `npm test` will run under Vitest. Only the import line was changed. This means the harness is not a substitute for Vitest, and a Vitest-specific difference could still exist.

Test inventory:

| Suite | Tests | Covers |
| --- | --- | --- |
| crypto | 5 | AES-256-GCM round trip, random IV, tamper detection, malformed envelope, key length |
| parse | 10 | address parsing, base64url, text preference, HTML stripping, truncation, attachment metadata only |
| deadlines | 7 | confirmed and ambiguous dates, weekday resolution, impossible dates, timezone capture |
| actions | 6 | request detection, informational phrases, the user's own messages, quoted text, attribution, dismissal |
| categorize | 7 | Gmail promotions label, newsletters, automated senders, waiting, needs-reply priority, archive precedence |
| followups | 5 | tracking a sent question, due date, statements not tracked, replies, automated or archived threads |
| ai | 10 | fence-tolerant JSON, schema rejection, prompt-injection escaping, truncation, verbatim deadline rule, Gemini gates |
| aggregates | 4 | empty thread, subject and latest-message rules, archive state, counts |
| fixtures | 8 | the sample mailbox through the real analyzer |
| ai-policy | 8 | cloud AI privacy policy: disabled, free tier refused, consent, key, local Ollama, quota |
| ai-state | 19 | per-task completion, partial success, retry backoff and cap, reset after success, tolerant state parsing, classification key |
| classification-preservation | 12 | AI classification kept when current, refreshed on change, fallback, Gmail authority |
| gmail-status | 16 | connection and sync reported separately, callback and manual-sync banners |
| manual-sync | 13 | single and multi-account sync aggregation, locked, failed, reauth, partial |

## Executed and failing

| Check | Failure | Cause |
| --- | --- | --- |
| `npm run verify:schema` (`scripts/verify-schema.mjs`) | Exit 1: no initial migration creates the model tables or enums, and the search migration alters a `Message` table that no migration creates | **Expected.** The initial migration has not been generated. This is the correct result, not a defect in the checker. |

## Written, not executed

These have been read, and their syntax checked, but not run against Prisma, PostgreSQL, Next.js, Google, Ollama or Gemini.

- **Database layer:** every Prisma query, including the ownership scoping in `src/lib/analysis/pipeline.ts`, `ai-enhance.ts`, `sync.ts`, `privacy/account.ts`, and the page queries.
- **Manual sync:** `syncNow()` in `src/lib/actions/user.ts`. Its aggregation logic is pure and tested; the server action that calls it is not.
- **Authentication:** Auth.js configuration, Prisma adapter, session cookies, route guards.
- **Gmail OAuth and synchronization:** consent URL, state validation, code exchange, token refresh, `historyId` incremental sync, the expired-cursor fallback, pagination.
- **OAuth callback route:** `src/app/api/gmail/callback/route.ts`.
- **Account export, disconnection and deletion routes and actions.**
- **Full-text search:** the trigger, the GIN index, and the parameterized `$queryRaw` in `src/lib/search.ts`.
- **AI providers:** Ollama and Gemini HTTP calls. The Gemini *policy* is tested; the HTTP path is not.
- **User interface:** every page and component. None has been rendered in a browser. Layout, responsive behaviour, contrast, and empty states are unverified.
- **Scripts:** `scripts/run-sync.ts`, `scripts/seed-fixtures.ts`, `scripts/generate-init-migration.sh` (its first step, `prisma validate`, failed for lack of network; the diff step has never executed).
- **ESLint configuration** (`eslint.config.mjs`) and the Next.js build.
- **The cross-user isolation test** (`tests/integration-isolation.test.ts`). It is skipped unless `TEST_DATABASE_URL` is set.

## Blocked by external requirements

1. **Dependency installation and lockfile.** Requires access to `registry.npmjs.org`. Run `npm install`, confirm it completes, and commit `package-lock.json`. The package versions in `package.json` were chosen without access to the registry and have **not** been checked. Any that do not exist will fail installation.
2. **Prisma client and CLI.** `npm install` runs `prisma generate` via `postinstall`. `npx prisma validate` is the authoritative schema check.
3. **Initial migration.** Run `bash scripts/generate-init-migration.sh` after step 1, then `npm run verify:schema`, then `npx prisma migrate deploy` against an empty PostgreSQL database, then `npx prisma migrate status`. Commit `prisma/migrations/20261118000000_init`. The script refuses to overwrite an existing migration. Nothing has been hand-written as a substitute.
4. **PostgreSQL.** `docker compose up -d` (see `docker-compose.yml`), or any PostgreSQL 14+ server, reachable at `DATABASE_URL`.
5. **Google Cloud project.** Gmail API enabled; two OAuth clients (sign-in and Gmail); consent screen configured. Only the account owner can create these. See SETUP.md.
6. **Google OAuth verification and a third-party security assessment.** Required before any public release, because `gmail.readonly` is a restricted scope.
7. **Ollama** with a pulled model, for local AI. Optional.
8. **A paid Gemini tier and key**, for cloud AI. Optional, and it requires the operator's attestation that billing is enabled.

## Fixes made in phase 4

1. **Manual sync reported locked and partial syncs as success.** `syncNow()` returned `ok: true` for any result other than `failed` or `needs_reauth`, so a `skipped_locked` sync was shown as "Mailbox synchronized", and with several accounts only the first problem was reported. It now calls `summarizeManualSync()`, which is pure and tested: success only when every account completed, with partial, failed, reauthentication-needed and locked results named per account. The Gmail banner and the inbox message handle each kind. **Tested** (`manual-sync` suite, `gmail-status` suite). **Not executed** end to end.
2. **Auth.js trusted the Host header by default** (`trustHost: true`). Callback URLs could be built from a request header. It is now off by default and controlled by `AUTH_TRUST_HOST`, documented in `.env.example` and SETUP.md. **Written, not executed.**
3. **No Strict-Transport-Security header.** It is now sent in production only. **Executed:** the header configuration was evaluated in both environments.

## Security review

Reviewed by reading the code. Nothing here has been penetration-tested or run.

| Area | Finding | Status |
| --- | --- | --- |
| User-data isolation | Every query on a user-owned table is scoped by `userId`, directly or through a parent already loaded with `userId`. | Reviewed. Cross-user test not executed. |
| OAuth state | Random 256-bit state in a single-use httpOnly cookie, compared in constant time, cookie path limited to `/api/gmail`, deleted on callback. The callback also requires the signed-in session. | Reviewed. Not executed against Google. |
| Token encryption | AES-256-GCM, random 96-bit IV per value, key must be 32 bytes. | Tested (`crypto` suite). Key rotation is not implemented. |
| Token handling | Tokens are not selected by page queries or included in the export. Revocation failure does not block deletion. | Reviewed. |
| Server-side authorization | Every server action and route re-checks the session. Protected pages redirect; API routes return 401. | Reviewed. |
| Sync endpoint | Worker path compares the bearer secret in constant time, after a length check. User path requires a session and enforces a 30-second cooldown per account. | Reviewed. Not executed. |
| Prompt injection | Email content is escaped, placed in data tags, truncated, and the model is instructed to ignore instructions in email. Every output is schema-validated; cited message ids must exist in the thread; deadline text must appear verbatim in the email. | Tested in part (`ai` suite). This is a mitigation, not a guarantee. |
| Cloud AI consent | Gemini requires a paid tier, a key, and a recorded consent timestamp. Withdrawing consent takes effect on the next call. | Tested (`ai-policy` suite). |
| Gemini free tier | Refused by the policy and again by the provider constructor. | Tested. |
| Account deletion and export | Deletion revokes tokens, deletes mail, deletes the user row (cascade) and clears cookies. Export excludes tokens. | Reviewed. Cascade not executed against PostgreSQL. |
| Rate limiting | Sync has a per-account cooldown. AI has a daily quota. There is **no** general rate limit on any route. | **Production blocker** for public release. |
| Security headers | CSP, frame denial, nosniff, referrer policy, permissions policy, HSTS in production. | Executed (header configuration). CSP still allows `unsafe-inline` scripts and styles. |
| Logging | Error logs contain error messages and codes, not email content or tokens. | Reviewed. |

**Remaining production blockers:** rate limiting on public routes; a nonce-based CSP to remove `unsafe-inline`; encryption key rotation; a retention policy for the audit log; Google's restricted-scope verification; a third-party security assessment; and every item under "Written, not executed".

## Earlier phases

- **Phase 2** established the test harness approach, the schema checker, and the fixture analysis. Its counts are superseded by this document.
- **Phase 3** added per-task AI completion records (design in `docs/ARCHITECTURE.md`), classification preservation, the split between Gmail connection and first-sync reporting, and the migration generator `scripts/generate-init-migration.sh`. The phase 3 test counts are superseded by the table above. The initial migration was not produced in phase 3 and is still missing.

## Known weaknesses in the analysis

- **Redundant actions.** One request can produce two actions, for example "Can you please confirm a demo slot…" and "Let me know what works." The second is a weak pattern and is not suppressed.
- **Confidence values** are hand-set heuristics. The UI presents them as percentages, which overstates their precision.
- **Summary basis.** Rule-based summary items are labelled "stated". The sentences are quoted from email, but the grouping and the status sentence are the application's inference.
- **Stale AI actions.** When content changes and the actions task is in backoff, the previous AI actions remain visible until the retry succeeds.

## Missing from the product

These were in the original specification and are not implemented: an onboarding flow, a separate dashboard (`/` redirects to the inbox), read/unread/archive/star actions (which need `gmail.modify`), a daily briefing, analytics, a draft assistant, calendar integration, semantic search, attachment downloads, key rotation, and a worker queue. Analysis currently runs inline during sync.

## Next steps, in a networked environment

1. `npm install`. Commit `package-lock.json`.
2. `npx prisma validate`.
3. `bash scripts/generate-init-migration.sh`, then `npm run verify:schema`.
4. Start PostgreSQL. `npx prisma migrate deploy` on an empty database, then `npx prisma migrate status`. Confirm the schema by listing tables and indexes with `psql`.
5. `npm run typecheck`, `npm run lint`, `npm test`.
6. `TEST_DATABASE_URL=postgresql://... npm test` for the isolation tests.
7. `npm run build`.
8. `npm run db:seed:fixtures`, then `npm run dev`, then exercise each page. Fixture data does not verify the Gmail integration.
9. With a test Google account: connect, sync, change mail, sync again, disconnect, delete. Record each result here.
