#!/usr/bin/env node
/**
 * Structural checks for prisma/schema.prisma and the raw SQL migrations.
 *
 * This is a supplementary, dependency-free check. It does NOT replace `npx prisma validate`,
 * which is the authoritative validator and should be run in every environment that has
 * Prisma installed. This script catches the classes of mistake that are easy to make by hand:
 *   - a relation with no opposite field, or with fields/references that do not exist
 *   - a field whose type is neither a scalar nor a declared model/enum
 *   - @@unique, @@index and @@id lists that reference unknown fields
 *   - migration SQL that refers to a table or column the schema does not declare
 *
 * Usage: node scripts/verify-schema.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "prisma", "schema.prisma");
const migrationsDir = join(root, "prisma", "migrations");

const SCALARS = new Set(["String", "Int", "Float", "Boolean", "DateTime", "Json", "BigInt", "Decimal", "Bytes"]);
const errors = [];
const notes = [];

function fail(msg) {
  errors.push(msg);
}

/** Removes trailing // comments outside of string literals (good enough for this schema). */
function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inStr = !inStr;
    if (!inStr && c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

function parseSchema(text) {
  const models = new Map();
  const enums = new Map();
  let current = null;
  let currentKind = null;

  for (const raw of text.split("\n")) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    const open = line.match(/^(model|enum)\s+(\w+)\s*\{$/);
    if (open) {
      currentKind = open[1];
      current = { name: open[2], fields: [], uniques: [], indexes: [], ids: [] };
      (currentKind === "model" ? models : enums).set(open[2], current);
      continue;
    }
    if (line === "}") {
      current = null;
      currentKind = null;
      continue;
    }
    if (!current) continue;

    if (currentKind === "enum") {
      current.fields.push(line);
      continue;
    }

    const blockAttr = line.match(/^@@(unique|index|id)\((.*)\)$/);
    if (blockAttr) {
      const list = blockAttr[2].match(/\[([^\]]*)\]/);
      const cols = list ? list[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (blockAttr[1] === "unique") current.uniques.push(cols);
      else if (blockAttr[1] === "index") current.indexes.push(cols);
      else current.ids.push(cols);
      continue;
    }
    if (line.startsWith("@@")) continue;

    const field = line.match(/^(\w+)\s+([A-Za-z]\w*(?:\([^)]*\))?)(\[\])?(\?)?\s*(.*)$/);
    if (field) {
      const [, name, type, list, optional, attrs] = field;
      current.fields.push({
        name,
        type,
        list: Boolean(list),
        optional: Boolean(optional),
        relation: attrs.match(/@relation\(([^)]*)\)/)?.[1] ?? null,
        raw: line,
      });
    }
  }
  return { models, enums };
}

function checkModels({ models, enums }) {
  for (const model of models.values()) {
    const fieldNames = new Set(model.fields.map((f) => f.name));
    if (fieldNames.size !== model.fields.length) fail(`${model.name}: duplicate field name`);

    for (const f of model.fields) {
      const base = f.type.replace(/\(.*\)$/, "");
      const isUnsupported = f.type.startsWith("Unsupported");
      if (!SCALARS.has(base) && !models.has(base) && !enums.has(base) && !isUnsupported) {
        fail(`${model.name}.${f.name}: unknown type "${f.type}"`);
      }
    }

    // Relations: fields/references must exist, and the opposite side must declare the back-relation.
    for (const f of model.fields.filter((x) => x.relation)) {
      const target = models.get(f.type);
      if (!target) {
        fail(`${model.name}.${f.name}: relation target "${f.type}" is not a model`);
        continue;
      }
      const fieldsArg = f.relation.match(/fields:\s*\[([^\]]*)\]/);
      const refsArg = f.relation.match(/references:\s*\[([^\]]*)\]/);
      if (fieldsArg) {
        for (const local of fieldsArg[1].split(",").map((s) => s.trim()).filter(Boolean)) {
          if (!fieldNames.has(local)) fail(`${model.name}.${f.name}: relation field "${local}" does not exist on ${model.name}`);
        }
      }
      if (refsArg) {
        const targetNames = new Set(target.fields.map((x) => x.name));
        for (const ref of refsArg[1].split(",").map((s) => s.trim()).filter(Boolean)) {
          if (!targetNames.has(ref)) fail(`${model.name}.${f.name}: referenced field "${ref}" does not exist on ${target.name}`);
        }
      }
      // Opposite side: a field on the target whose type is this model.
      const back = target.fields.filter((x) => x.type === model.name);
      if (back.length === 0) fail(`${model.name}.${f.name}: no back-relation field of type ${model.name} on ${target.name}`);
    }

    // Each model with a field-level relation that has no @relation on the opposite side must be the side with @relation.
    const relationSides = model.fields.filter((x) => models.has(x.type) && !x.relation && !x.list);
    for (const side of relationSides) {
      const target = models.get(side.type);
      const owner = target.fields.find((x) => x.type === model.name && x.relation);
      if (!owner) fail(`${model.name}.${side.name}: relation has no owning side with @relation(fields, references)`);
    }

    for (const cols of [...model.uniques, ...model.indexes, ...model.ids]) {
      for (const c of cols) {
        if (!fieldNames.has(c)) fail(`${model.name}: @@ attribute references unknown field "${c}"`);
      }
    }

    // Prisma requires at least one unique criterion: @id, @@id, @unique or @@unique.
    const hasId = model.fields.some((f) => f.raw.includes("@id")) || model.ids.length > 0;
    const hasUnique = model.fields.some((f) => /@unique\b/.test(f.raw)) || model.uniques.length > 0;
    if (!hasId && !hasUnique) fail(`${model.name}: no unique criterion (@id, @@id, @unique or @@unique)`);
  }
  notes.push(`models checked: ${models.size}, enums checked: ${enums.size}`);
}

/** Prisma's naming conventions for generated constraints and indexes. */
const pgIndexName = (table, cols, suffix) => `${table}_${cols.join("_")}_${suffix}`;

function checkMigrations({ models, enums }) {
  if (!existsSync(migrationsDir)) {
    fail("prisma/migrations directory is missing");
    return;
  }
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (dirs.length === 0) {
    fail("no migration directories found. Generate the initial migration: scripts/generate-init-migration.sh");
    return;
  }

  const sqlByDir = new Map();
  for (const dir of dirs) {
    const file = join(migrationsDir, dir, "migration.sql");
    if (!existsSync(file)) {
      fail(`${dir}: migration.sql missing`);
      continue;
    }
    sqlByDir.set(dir, readFileSync(file, "utf8"));
  }

  // Which migration creates each table and enum.
  const tableCreators = new Map();
  const enumCreators = new Map();
  for (const [dir, sql] of sqlByDir) {
    for (const m of sql.matchAll(/CREATE TABLE\s+"(\w+)"/g)) {
      tableCreators.set(m[1], [...(tableCreators.get(m[1]) ?? []), dir]);
    }
    for (const m of sql.matchAll(/CREATE TYPE\s+"(\w+)"/g)) {
      enumCreators.set(m[1], [...(enumCreators.get(m[1]) ?? []), dir]);
    }
  }

  // Ordering rule: every table a migration touches must be created by that migration or an earlier one.
  for (const [dir, sql] of sqlByDir) {
    const touched = new Set();
    for (const m of sql.matchAll(/ON\s+"(\w+)"|ALTER TABLE\s+(?:ONLY\s+)?"(\w+)"|REFERENCES\s+"(\w+)"/g)) {
      touched.add(m[1] ?? m[2] ?? m[3]);
    }
    for (const table of touched) {
      if (!models.has(table)) {
        fail(`${dir}: SQL references "${table}", which the schema does not declare`);
        continue;
      }
      const creators = tableCreators.get(table) ?? [];
      if (creators.length === 0) {
        fail(`${dir}: SQL alters "${table}", but no migration creates that table`);
      } else if (!creators.some((c) => c <= dir)) {
        fail(`${dir} runs before ${creators[0]}, which creates "${table}". Rename the folders so the table is created first.`);
      }
    }
  }

  // Initial migration: the earliest migration that creates every model table and every enum.
  const modelNames = [...models.keys()];
  const enumNames = [...enums.keys()];
  const covering = dirs.filter(
    (d) =>
      modelNames.every((m) => (tableCreators.get(m) ?? []).includes(d)) &&
      enumNames.every((e) => (enumCreators.get(e) ?? []).includes(d)),
  );
  if (covering.length === 0) {
    const missing = modelNames.filter((m) => !tableCreators.has(m));
    const missingEnums = enumNames.filter((e) => !enumCreators.has(e));
    fail(
      "no initial migration creates every model table and enum. " +
        (missing.length ? `Missing tables: ${missing.join(", ")}. ` : "") +
        (missingEnums.length ? `Missing enums: ${missingEnums.join(", ")}. ` : "") +
        "Generate it with scripts/generate-init-migration.sh",
    );
    return;
  }
  const init = covering[0];
  const initSql = sqlByDir.get(init);
  notes.push(`initial migration: ${init}`);

  // Tables the initial migration creates must all be declared in the schema.
  for (const m of initSql.matchAll(/CREATE TABLE\s+"(\w+)"/g)) {
    if (!models.has(m[1])) fail(`${init}: creates undeclared table "${m[1]}"`);
  }

  // Columns: every scalar or enum field must be a column in its table.
  for (const model of models.values()) {
    const body = initSql.match(new RegExp(`CREATE TABLE\\s+"${model.name}"\\s*\\(([\\s\\S]*?)\\n\\);`));
    if (!body) {
      fail(`${init}: table "${model.name}" definition not found`);
      continue;
    }
    for (const f of model.fields) {
      if (f.relation || models.has(f.type)) continue; // relation fields are not columns
      if (!body[1].includes(`"${f.name}" `)) fail(`${init}: column "${model.name}"."${f.name}" is missing`);
    }

    // Primary key.
    const hasId = model.fields.some((f) => f.raw.includes("@id")) || model.ids.length > 0;
    if (hasId && !initSql.includes(`CONSTRAINT "${model.name}_pkey" PRIMARY KEY`)) {
      fail(`${init}: primary key ${model.name}_pkey is missing`);
    }

    // Unique constraints: @unique on fields and @@unique blocks.
    const uniqueSets = [
      ...model.fields.filter((f) => /@unique\b/.test(f.raw)).map((f) => [f.name]),
      ...model.uniques,
    ];
    for (const cols of uniqueSets) {
      if (!initSql.includes(`CREATE UNIQUE INDEX "${pgIndexName(model.name, cols, "key")}"`)) {
        fail(`${init}: unique index ${pgIndexName(model.name, cols, "key")} is missing`);
      }
    }

    // Plain indexes from @@index.
    for (const cols of model.indexes) {
      if (!initSql.includes(`CREATE INDEX "${pgIndexName(model.name, cols, "idx")}"`)) {
        fail(`${init}: index ${pgIndexName(model.name, cols, "idx")} is missing`);
      }
    }

    // Foreign keys from @relation(fields, references) on the owning side.
    for (const f of model.fields.filter((x) => x.relation && models.has(x.type))) {
      const fieldsArg = f.relation.match(/fields:\s*\[([^\]]*)\]/);
      const refsArg = f.relation.match(/references:\s*\[([^\]]*)\]/);
      if (!fieldsArg || !refsArg) {
        fail(`${model.name}.${f.name}: @relation has no explicit fields/references`);
        continue;
      }
      const local = fieldsArg[1].split(",").map((x) => x.trim());
      const refs = refsArg[1].split(",").map((x) => x.trim());
      // Prisma writes REFERENCES "User"("id") without a space; allow any whitespace between tokens.
      const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fkPattern = new RegExp(
        // Scoped to the child table's own ALTER TABLE, so another table's identical key cannot satisfy it.
        `ALTER TABLE\\s+"${esc(model.name)}"\\s+ADD CONSTRAINT\\s+"[^"]+"\\s+FOREIGN KEY\\s*\\(${local.map((c) => `"${esc(c)}"`).join("\\s*,\\s*")}\\)\\s*REFERENCES\\s+"${esc(f.type)}"\\s*\\(${refs.map((c) => `"${esc(c)}"`).join("\\s*,\\s*")}\\)`,
      );
      if (!fkPattern.test(initSql)) {
        fail(`${init}: foreign key ${model.name}.${local.join(",")} -> ${f.type}.${refs.join(",")} is missing`);
      }
    }
  }

  // Enum types: values in the schema must appear in the CREATE TYPE statement.
  for (const [name, def] of enums) {
    const values = def.fields.map((v) => v.split(/\s+/)[0]).filter(Boolean);
    const m = initSql.match(new RegExp(`CREATE TYPE\\s+"${name}"\\s+AS ENUM\\s*\\(([^)]*)\\)`));
    if (!m) {
      fail(`${init}: enum "${name}" is not created`);
      continue;
    }
    for (const v of values) {
      if (!m[1].includes(`'${v}'`)) fail(`${init}: enum "${name}" is missing value ${v}`);
    }
  }

  // Trigger and index migrations after the initial migration. Their dependencies are covered by the
  // ordering rule above; the search migration's columns are checked here.
  for (const dir of dirs) {
    if (dir === init) continue;
    const sql = sqlByDir.get(dir);
    if (!sql) continue;
    if (dir.endsWith("search_index")) {
      const message = models.get("Message");
      const cols = new Set(message?.fields.map((f) => f.name) ?? []);
      const knownFns = new Set(["message_search_vector_update", "message_search_vector_trg", "message_search_vector_idx"]);
      for (const m of sql.matchAll(/"(\w+)"/g)) {
        const id = m[1];
        if (models.has(id) || knownFns.has(id) || cols.has(id)) continue;
        notes.push(`${dir} quotes "${id}", which is not a model or Message field; check it is a function or trigger identifier`);
      }
    }
    notes.push(`${dir}: ${sql.split("\n").length} lines scanned`);
  }
  notes.push(`migrations: ${dirs.length}, tables created by initial migration: ${modelNames.length}, enums: ${enumNames.length}`);
}

const parsed = parseSchema(readFileSync(schemaPath, "utf8"));
checkModels(parsed);
checkMigrations(parsed);

for (const n of notes) console.log(`  note: ${n}`);
if (errors.length) {
  for (const e of errors) console.error(`  ERROR: ${e}`);
  console.error(`\nschema check FAILED: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log("\nschema check passed (structural only; run `npx prisma validate` for the authoritative check)");
