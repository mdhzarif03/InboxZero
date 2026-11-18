#!/usr/bin/env bash
# Generates the initial database migration from prisma/schema.prisma using Prisma's own schema diff.
#
#   bash scripts/generate-init-migration.sh
#
# The migration is written to prisma/migrations/20261118000000_init. That fixed name sorts before
# the search-index migration (20261231235959_search_index), so the search trigger always runs after the
# tables it depends on exist. Prisma's migrate tooling replays folders in name order.
#
# This script refuses to overwrite an existing migration, writes to a temporary file first, and
# runs the structural checks before finishing. It requires the Prisma CLI, so run it after `npm install`.
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="prisma/migrations/20261118000000_init"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

if [ -e "$TARGET" ]; then
  echo "error: $TARGET already exists. Refusing to overwrite a migration." >&2
  echo "       If you intend to regenerate it, delete it only on a database that has never been migrated." >&2
  exit 1
fi

echo "1/4 validating schema"
npx prisma validate

echo "2/4 generating schema diff from an empty database (Prisma migrate diff)"
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > "$TMP_FILE"

if [ ! -s "$TMP_FILE" ]; then
  echo "error: Prisma produced an empty migration. Check the schema." >&2
  exit 1
fi

echo "3/4 writing $TARGET/migration.sql"
mkdir -p "$TARGET"
mv "$TMP_FILE" "$TARGET/migration.sql"
trap - EXIT

echo "4/4 running structural checks"
node scripts/verify-schema.mjs

echo
echo "Initial migration created. Next: npx prisma migrate dev --name verify-init (no changes expected), then npx prisma migrate status."
