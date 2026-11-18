# InboxZero

Your inbox, under control.

InboxZero is a personal email intelligence app. It reads your Gmail with **read-only** access, groups conversations by what needs your attention, extracts requests and dates, and tracks replies you are still waiting for. It never sends mail, deletes mail, or changes your labels.

## Status

This is the first milestone. Read [docs/STATUS.md](docs/STATUS.md) for an exact account of what has been executed, what is written but not executed, and what needs an external service. Nothing in the project should be treated as verified unless STATUS.md says so.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma · Auth.js (database sessions) · Gmail API (`gmail.readonly`) · Ollama (local AI) · Gemini (optional, paid tier only).

## Quick start

```bash
cp .env.example .env          # fill in values, see docs/SETUP.md
docker compose up -d          # local PostgreSQL
npm install
npx prisma validate
bash scripts/generate-init-migration.sh   # first run only: creates the initial migration from the schema
npx prisma migrate deploy                 # applies all migrations to the empty database
npm run verify:schema
npm run db:seed:fixtures      # OPTIONAL: sample conversations, labelled SAMPLE DATA
npm run dev                   # http://localhost:3000
```

Connect a real mailbox from **Gmail connection** after configuring Google OAuth (see docs/SETUP.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Generates the Prisma client and builds |
| `npm run verify:schema` | Structural checks on the Prisma schema and migrations (no dependencies needed) |
| `npm test` | Unit and fixture tests (Vitest). Set `TEST_DATABASE_URL` to also run database isolation tests |
| `npm run check` | Schema check, typecheck, lint and tests, in order |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run lint` | ESLint (Next.js rules) |
| `npm run sync:run` | Synchronizes every active Gmail account once (run from cron) |
| `npm run db:seed:fixtures` | Loads labelled sample data for a fixture user |

## Documentation

- [docs/STATUS.md](docs/STATUS.md): implemented features, test results, known gaps
- [docs/SETUP.md](docs/SETUP.md): Postgres, Google OAuth, Ollama, Gemini, scheduling, deployment
- [docs/PRIVACY.md](docs/PRIVACY.md): what data is stored, who sees it, AI processing controls
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): module layout and the rules that hold it together
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): hosting, database, OAuth, AI and scheduling for production (not yet verified)
- [docs/SECURITY-CHECKLIST.md](docs/SECURITY-CHECKLIST.md): each security control, its status, and the production blockers
