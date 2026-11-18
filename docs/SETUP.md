# Setup

## 1. Database

### Fresh database: installation procedure

Run these steps in order. The order matters: the initial migration must exist, and must sort before the search-index migration, before any database is migrated.

```bash
docker compose up -d                       # local PostgreSQL (or set DATABASE_URL to your own)
npm install                                # installs dependencies; postinstall runs `prisma generate`
npx prisma validate                        # Prisma's authoritative schema check
bash scripts/generate-init-migration.sh    # creates prisma/migrations/20261118000000_init from the schema
npm run verify:schema                      # structural checks: tables, enums, keys, indexes, ordering
npx prisma migrate deploy                  # applies init, then 20261231235959_search_index, to the empty database
npx prisma migrate status                  # expect: "Database schema is up to date!"
```

Then commit `prisma/migrations/`, including `migration_lock.toml`. Do not edit the generated migration by hand; regenerate the schema changes with `npx prisma migrate dev --name <change>` once the initial migration is in place.

### Why the order is fixed

- `prisma migrate deploy` and `prisma migrate dev` apply migration folders in name order.
- `20261231235959_search_index` adds a trigger and index on `"Message"`. If it ran before the initial migration, it would fail because the table does not exist.
- The initial migration's folder name, `20261118000000_init`, sorts before the search migration, so the replay order is correct. `npm run verify:schema` fails if this ordering is broken.
- `scripts/generate-init-migration.sh` refuses to overwrite an existing migration, and its output is checked before it finishes.

### Troubleshooting

- **`no initial migration creates every model table`** from `verify:schema`: the generator has not been run. Run `bash scripts/generate-init-migration.sh`.
- **`runs before ... which creates "Message"`**: a migration folder has been renamed so that it sorts too early. Restore the names above.
- **`prisma migrate status` reports drift**: the schema changed after the migrations were generated. Run `npx prisma migrate dev --name <describe-change>` to create a new migration. Do not edit existing migration files.

## 2. Secrets

```bash
openssl rand -base64 32    # AUTH_SECRET
openssl rand -base64 32    # TOKEN_ENCRYPTION_KEY (must decode to 32 bytes)
openssl rand -hex 32       # SYNC_SECRET
```

Never commit `.env`. Rotating `TOKEN_ENCRYPTION_KEY` invalidates stored Gmail tokens; users must reconnect.

## 3. Google OAuth (requires your Google Cloud project)

This needs an external account that only you can create.

1. Create a Google Cloud project and enable the **Gmail API**.
2. Configure the OAuth consent screen. Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
3. While the app is in *Testing*, add your own Google account as a test user. Unverified apps are limited to test users, and refresh tokens expire after 7 days in that mode.
4. Create two OAuth clients (type **Web application**):
   - **Sign-in client** (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`). Authorized redirect: `http://localhost:3000/api/auth/callback/google`.
   - **Gmail client** (`GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`). Authorized redirect: `http://localhost:3000/api/gmail/callback`. Set `GOOGLE_GMAIL_REDIRECT_URI` to the same value.
5. Set `AUTH_URL` to your public origin. Leave `AUTH_TRUST_HOST` at `false` unless the app runs behind a reverse proxy that sets the Host header; then set it to `true`.

For production, `gmail.readonly` is a **restricted scope**. Public release requires Google's OAuth verification and a third-party security assessment. Plan for this before launch; it is not something the code can complete.

## 4. AI providers

### Rules only (default)
`AI_PROVIDER="none"`. No setup.

### Ollama (local)
```bash
ollama pull llama3.2
ollama serve
```
Set `AI_PROVIDER="ollama"`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`. Then choose Ollama in Settings.

### Gemini (cloud, paid tier only)
1. Enable billing on the Google AI project that owns the key. Confirm your billing terms; Google's free-tier terms permit use of prompts to improve products.
2. Set `GEMINI_API_KEY`, `GEMINI_TIER="paid"`, `AI_PROVIDER="gemini"`.
3. In Settings, choose Gemini and tick the consent box.

If `GEMINI_TIER` is `free`, Gemini is disabled for email content, by design. Setting `GEMINI_TIER=paid` is your attestation that the key is on a paid tier. The application cannot verify this.

## 5. Scheduled sync

Run once a few minutes apart from cron, or from a hosted scheduler:

```cron
*/15 * * * * cd /path/to/inboxzero && npm run sync:run >> /var/log/inboxzero-sync.log 2>&1
```

Or call the worker endpoint with the secret:

```bash
curl -X POST -H "Authorization: Bearer $SYNC_SECRET" https://your-host/api/sync
```

## 6. Sample data (development only)

```bash
npm run db:seed:fixtures
```

Creates `sample-user@inboxzero.invalid` with six labelled sample conversations. Their account has provider `fixture`, which means:

- every authenticated page shows a SAMPLE DATA banner while it exists;
- the "Open in Gmail" link is disabled for sample threads;
- Sync Now and the scheduled sync refuse to touch it;
- Gmail disconnection never removes it, and account deletion does.

The sample user cannot sign in through Google, because the address ends in `.invalid`. To browse the sample data in the app, create a session row for that user with `npm run db:studio` during development, or sign in with the Google account you intend to use and reseed.

## 6a. Verification commands

```bash
npm run verify:schema    # structural schema and migration checks (no dependencies needed)
npm run typecheck        # strict TypeScript
npm run lint             # ESLint with Next.js rules
npm test                 # Vitest suite
npm run check            # all of the above, in order
TEST_DATABASE_URL=postgresql://... npm test   # also runs the cross-user isolation tests

## 7. Deployment checklist

- `NODE_ENV=production`, HTTPS, and `AUTH_URL` set to the public origin.
- `prisma migrate deploy` before starting the app.
- Separate database user with access to this database only.
- Scheduler configured for `sync:run` or the worker endpoint.
- `TOKEN_ENCRYPTION_KEY` stored in a secret manager, with a backup. Losing it means users must reconnect Gmail.
- Google OAuth verification completed if the app is opened to users beyond your test list.
