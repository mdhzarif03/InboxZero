# Architecture

## Layers

```
UI (App Router pages, server components)
  └─ server actions / route handlers   → requireUser() on every request
       └─ domain modules
            ├─ gmail/       OAuth, API client, pure parser, sync engine
            ├─ analysis/    analyze.ts (pure decisions), pipeline.ts (persistence), ai-enhance.ts
            ├─ ai/          policy.ts (pure privacy routing), router.ts (DB-backed), providers, schemas, prompts
            ├─ privacy/     export, consent, account deletion
            └─ search.ts    PostgreSQL full-text search
       └─ db.ts (Prisma)  ←→  PostgreSQL (tsvector trigger, GIN index)
```

## Pure and effectful modules

Decisions are kept in modules that import no database or network code, so they run in unit tests:
`analysis/analyze.ts` and its helpers, `ai/policy.ts`, `ai/schemas.ts`, `ai/prompts.ts`, `gmail/parse.ts`, `gmail/aggregates.ts`, `crypto.ts`, `fixtures/mailbox.ts`. Effectful code (`pipeline.ts`, `ai-enhance.ts`, `router.ts`, `sync.ts`, `oauth.ts`, the pages) calls these and persists the results.

## Rules the code enforces

1. **Identity is server-side.** Every query that touches user data includes `userId` from the session, never from request input. Ownership failures return "not found", indistinguishable from a missing row.
2. **Sign-in and mailbox access are separate consents.** Auth.js requests `openid email profile` only. `gmail.readonly` is requested in a separate flow.
3. **Tokens are encrypted at rest** with AES-256-GCM (`src/lib/crypto.ts`). Access tokens are cached encrypted. Tokens are never logged or exported.
4. **Deterministic analysis always runs.** Classification, actions, deadlines, follow-ups and a rule-based summary are computed without AI. AI results are an enhancement that can fail without losing that baseline.
5. **AI output is untrusted.** Every model response is validated with zod. Email text is escaped and placed inside data tags declared as untrusted. Citation ids must exist in the thread. An AI deadline expression must appear verbatim in the email before it is normalized, and dates are always computed by code.
6. **AI runs per task, and only when needed.** Classification, summary and actions each keep a completion record in `Thread.aiTaskState`, keyed by the content that task used. A successful task is not repeated while its content is unchanged. A failed task is retried after a backoff that doubles with each consecutive failure (15 minutes up to 24 hours). A failure in one task never hides another task's success. Classification is also keyed by Gmail state (labels, archive, star, last sender), so a label change refreshes it.
7. **Gmail labels are authoritative.** AI cannot move a thread out of ARCHIVED or PROMOTIONS.
8. **Sync is incremental and recoverable.** Gmail `historyId` drives incremental sync. An expired history cursor (HTTP 404) triggers a full resync. A soft lock prevents overlapping runs. The cursor is captured before listing, so changes made during a sync are picked up on the next run.
9. **Sample data is labelled.** Fixture accounts use `provider = "fixture"`. The inbox shows a SAMPLE DATA banner, and the sync engine refuses to synchronize them.

## Data model

Auth.js tables (`User`, `Account`, `Session`, `VerificationToken`) plus: `UserPreference`, `ConnectedAccount` (encrypted token, `historyId`, lock), `Thread`, `Message` (with `searchVector`), `Classification`, `ThreadSummary` (JSON payload with `stated`/`inferred` basis), `ActionItem`, `FollowUp`, `Deadline` (original expression, normalized instant, timezone, confidence, status), `AiUsage`, `AuditLog`. All user-owned tables cascade on user deletion.

Deleting a user removes their mail, summaries, actions, deadlines, usage and sessions. Audit log rows survive with `userId` set to null.

## Migrations

`prisma/migrations/20261231235959_search_index` adds the full-text trigger and GIN index. The initial migration, `prisma/migrations/20261118000000_init`, creates the tables, enums, keys and indexes. It is generated from the schema by `scripts/generate-init-migration.sh`, which uses Prisma's `migrate diff`. It is **not committed** in this repository, because it could not be generated in the sandbox that produced it. `npm run verify:schema` fails until it exists and checks that it is complete and correctly ordered. See SETUP.md for the fresh-database procedure.

## Known limitations

- Sync runs the analysis pipeline inline. Large initial syncs call AI for each changed thread, bounded by `AI_DAILY_CALL_LIMIT`. A separate worker queue is planned.
- The Message `searchVector` trigger assumes the `simple` text configuration. Stemming and other languages are not yet handled.
- Attachment bytes are never downloaded. Only names and sizes are stored.
- Read/unread, archive and star changes in the UI are not offered, because they need `gmail.modify`. This is intentional for milestone one.
- Date normalization is UTC-based. Expressions without a stated timezone are marked as such and capped in confidence.
