#!/usr/bin/env node
/**
 * PostgreSQL (Prisma) → MySQL/MariaDB migration tool.
 *
 * Reads the LIVE structure of the existing application database (so every migration is included) and produces:
 *
 *   node pg-to-mysql.mjs schema             MySQL DDL (tables, keys, indexes, foreign keys)                → database.sql
 *   node pg-to-mysql.mjs meta               PHP array describing every column (types, defaults, enums)     → app/schema.php
 *   node pg-to-mysql.mjs data [options]     INSERT statements for the rows currently in the database        → data.sql
 *   node pg-to-mysql.mjs map                Markdown table "Prisma model → MySQL table" (with notes)       → MIGRATION_MAP.md
 *
 * Options for `data`:  --tables=a,b   only these tables      --skip=a,b   leave these tables out
 *
 * Connection: DATABASE_URL (PostgreSQL). Nothing is ever written to the source database.
 * This tool is only needed by someone who has an existing installation of the previous (Node/Prisma) version
 * and wants to move its data. The PHP application itself does not use it.
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL ?? "postgresql://faizan:faizan_dev@127.0.0.1:5432/faizaneditspro";
const mode = process.argv[2];
const flag = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=")[1]?.split(",").filter(Boolean) ?? null;

// ── things that exist only in the old stack's bookkeeping ─────────────────────────────────────────────
const SKIP_TABLES = new Set(["_prisma_migrations"]);
/** Prisma's implicit many-to-many table → an ordinary, self-describing join table. A/B follow the alphabetical order of the models. */
const RENAME_TABLE = { _OnboardingCategoryToOnboardingQuestion: "onboarding_category_questions" };
const RENAME_COL = { _OnboardingCategoryToOnboardingQuestion: { A: "categoryId", B: "questionId" } };

const MEDIUM_TEXT = /^(body|content|terms|logs|signatureData|notes|description|testimonial|message|summary|problem|objective|strategy|creativeDirection|clientFeedback|timeline|whatChanged|why|additionalRequirements|staffNote|typographyRules|editingPreferences|brandSummary|changeSummary|approvalNotes|error|lastError|comment|note|excerpt|question|answer|text|value|helpText|billingAddress|quote|metaDescription|seoDescription|shortDescription)$|(Url|Image|Data|Html|Markdown)$/i;

/**
 * Additions the PHP version needs on ordinary hosting (documented in MIGRATION_MAP.md). They are appended to the generated
 * structure only — they never take part in data export.
 *  • sessions.data      the PHP session payload (sessions live in the database, not in world-readable temp files)
 *  • rate_limits        request counters (shared hosting has no shared memory to keep them in)
 */
const EXTRA_COLS = { sessions: [{ name: "data", kind: "text", sql: "MEDIUMTEXT", nullable: true, defSql: null, defPhp: undefined }] };
const EXTRA_TABLES = {
  rate_limits: {
    name: "rate_limits",
    pk: ["k"],
    cols: [
      { name: "k", kind: "str", sql: "VARCHAR(190)", nullable: false, defSql: null, defPhp: undefined },
      { name: "hits", kind: "int", sql: "INT", nullable: false, defSql: "0", defPhp: 0 },
      { name: "resetAt", kind: "bigint", sql: "BIGINT", nullable: false, defSql: null, defPhp: undefined },
    ],
    extraOnly: true,
  },
};

const tn = (t) => RENAME_TABLE[t] ?? t;
const cn = (t, c) => RENAME_COL[t]?.[c] ?? c;
const q = (s) => "`" + String(s).replace(/`/g, "``") + "`";
const lit = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";

pg.types.setTypeParser(1114, (s) => s); // timestamp without time zone → raw string (Prisma stores UTC here)
pg.types.setTypeParser(20, (s) => s); // bigint → string (no precision loss)

const c = new pg.Client({ connectionString: url });
await c.connect();

// ── introspection ──────────────────────────────────────────────────────────────────────────────────────
const enums = Object.fromEntries((await c.query(`select t.typname n, array_agg(e.enumlabel::text order by e.enumsortorder) v from pg_type t join pg_enum e on e.enumtypid=t.oid group by 1`)).rows.map((r) => [r.n, r.v]));
const colRows = (await c.query(`select table_name t, column_name c, data_type dt, udt_name u, is_nullable = 'YES' nullable, column_default d from information_schema.columns where table_schema='public' order by table_name, ordinal_position`)).rows;
const idxRows = (await c.query(`select t.relname t, i.relname n, ix.indisunique u, ix.indisprimary p, array_agg(a.attname::text order by k.ord) cols from pg_index ix join pg_class t on t.oid=ix.indrelid join pg_class i on i.oid=ix.indexrelid join pg_namespace ns on ns.oid=t.relnamespace cross join lateral unnest(ix.indkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum where ns.nspname='public' group by 1,2,3,4 order by 1,2`)).rows;
const fkRows = (await c.query(`select c.conrelid::regclass::text t, c.conname n, (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum) cols, c.confrelid::regclass::text rt, (select array_agg(a.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum) rcols, c.confdeltype del, c.confupdtype upd from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace order by 1,2`)).rows;

const tables = {};
for (const r of colRows) {
  if (SKIP_TABLES.has(r.t)) continue;
  (tables[r.t] ??= { cols: [], idx: [], fks: [], pk: [] }).cols.push(r);
}
for (const i of idxRows) {
  const t = tables[i.t];
  if (!t) continue;
  if (i.p) t.pk = i.cols;
  else t.idx.push({ name: i.n, unique: i.u, cols: i.cols });
}
for (const f of fkRows) tables[f.t]?.fks.push(f);
const indexedCols = (t) => new Set(tables[t].idx.flatMap((i) => i.cols).concat(tables[t].pk));
const fkCols = (t) => new Set(tables[t].fks.flatMap((f) => f.cols));

// ── type mapping ───────────────────────────────────────────────────────────────────────────────────────
/** returns { kind, sql, enumValues? } kind ∈ id|str|text|int|bigint|float|bool|dt|json|arr|enum */
function mapType(t, col) {
  const { dt, u, c: name } = col;
  if (dt === "USER-DEFINED" && enums[u]) return { kind: "enum", sql: `ENUM(${enums[u].map(lit).join(",")})`, enumValues: enums[u] };
  if (dt === "boolean") return { kind: "bool", sql: "TINYINT(1)" };
  if (dt === "integer") return { kind: "int", sql: "INT" };
  if (dt === "bigint") return { kind: "bigint", sql: "BIGINT" };
  if (dt === "double precision") return { kind: "float", sql: "DOUBLE" };
  if (dt.startsWith("timestamp")) return { kind: "dt", sql: "DATETIME(3)" };
  if (dt === "jsonb" || dt === "json") return { kind: "json", sql: "JSON" };
  if (dt === "ARRAY") return { kind: "arr", sql: "JSON" };
  if (dt === "text" || dt === "character varying") {
    // Names ending in Id are database ids (cuid) — except these, which hold values from outside (payment provider references, tax numbers,
    // e-mail message ids) or free-form entity keys, and so must not be cut to an id's length.
    if (/^(taxId|providerMessageId)$/.test(name)) return { kind: "text", sql: "TEXT" };
    if (/^(transactionId|providerAccountId|entityId|subjectId)$/.test(name) && !fkCols(t).has(name) && !tables[t].pk.includes(name)) return { kind: "str", sql: "VARCHAR(191)" };
    const idLike = name === "id" || /Id$/.test(name) || tables[t].pk.includes(name) || fkCols(t).has(name);
    if (idLike) return { kind: "id", sql: "VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin" };
    if (indexedCols(t).has(name)) return { kind: "str", sql: "VARCHAR(191)" };
    if (col.d) return { kind: "str", sql: "VARCHAR(255)" };
    return { kind: "text", sql: MEDIUM_TEXT.test(name) ? "MEDIUMTEXT" : "TEXT" };
  }
  throw new Error(`Unmapped type ${dt}/${u} on ${t}.${name}`);
}

/** default → { sql, php } ; `sql` only where MySQL/MariaDB can hold it portably, `php` is what the application layer applies */
function mapDefault(kind, d) {
  if (d == null) return { sql: null, php: undefined };
  if (/^CURRENT_TIMESTAMP|^now\(\)/i.test(d)) return { sql: "CURRENT_TIMESTAMP(3)", php: "now" };
  if (kind === "bool") return { sql: d === "true" ? "1" : "0", php: d === "true" };
  if (kind === "int" || kind === "bigint") return { sql: String(Number(d)), php: Number(d) };
  if (kind === "float") return { sql: String(Number(d)), php: Number(d) };
  if (kind === "enum") { const v = d.match(/^'(.*)'::/)[1]; return { sql: lit(v), php: v }; }
  if (kind === "str" || kind === "id" || kind === "text") { const v = d.match(/^'(.*)'::/)?.[1]; return v == null ? { sql: null, php: undefined } : { sql: kind === "text" ? null : lit(v.replace(/''/g, "'")), php: v.replace(/''/g, "'") }; }
  if (kind === "arr") return { sql: null, php: "[]" };
  if (kind === "json") { const v = d.match(/^'(.*)'::jsonb?/)?.[1]; return { sql: null, php: v ?? "null" }; }
  return { sql: null, php: undefined };
}

const model = {}; // table → { cols: [{name, kind, sql, nullable, def, enumValues, auto}], ... }
for (const [t, info] of Object.entries(tables)) {
  model[t] = { name: tn(t), pk: info.pk.map((x) => cn(t, x)), cols: [] };
  for (const col of info.cols) {
    const m = mapType(t, col);
    const d = mapDefault(m.kind, col.d);
    const auto = m.kind === "dt" && col.c === "updatedAt" && col.d == null && !col.nullable;
    model[t].cols.push({ name: cn(t, col.c), kind: m.kind, sql: m.sql, nullable: col.nullable, defSql: d.sql, defPhp: d.php, enumValues: m.enumValues, auto });
  }
}
// every foreign key pair must map to the same MySQL type, otherwise the constraint cannot be created
for (const [t, info] of Object.entries(tables)) for (const f of info.fks) f.cols.forEach((col, i) => {
  const a = model[t].cols.find((x) => x.name === cn(t, col)).sql;
  const b = model[f.rt].cols.find((x) => x.name === cn(f.rt, f.rcols[i])).sql;
  if (a !== b) throw new Error(`FK type mismatch ${t}.${col} (${a}) → ${f.rt}.${f.rcols[i]} (${b})`);
});

const ACTION = { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" };

function ddl() {
  const out = [];
  out.push(`-- FaizanEdits Pro — MySQL / MariaDB schema`);
  out.push(`-- Generated from the live structure of the previous (PostgreSQL/Prisma) database by migration-tools/pg-to-mysql.mjs.`);
  out.push(`-- Requires MySQL 5.7+ or MariaDB 10.3+ (utf8mb4, JSON, fractional-second DATETIME).`);
  out.push(`-- Import this file with phpMyAdmin (Import tab) into an EMPTY database.\n`);
  out.push(`SET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n`);
  for (const [t, m] of Object.entries(model)) {
    const lines = [];
    for (const col of m.cols) {
      let s = `  ${q(col.name)} ${col.sql} ${col.nullable ? "NULL" : "NOT NULL"}`;
      if (col.auto) s += " DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)";
      else if (col.defSql != null) s += ` DEFAULT ${col.defSql}`;
      else if (col.nullable && !["json", "arr"].includes(col.kind)) s += " DEFAULT NULL";
      lines.push(s);
    }
    for (const col of EXTRA_COLS[t] ?? []) lines.push(`  ${q(col.name)} ${col.sql} ${col.nullable ? "NULL DEFAULT NULL" : "NOT NULL"}`);
    if (m.pk.length) lines.push(`  PRIMARY KEY (${m.pk.map(q).join(", ")})`);
    for (const i of tables[t].idx) {
      let name = RENAME_TABLE[t] ? `${m.name}_${i.cols.map((x) => cn(t, x)).join("_")}_idx` : i.name;
      if (name.length > 64) name = name.slice(0, 55) + "_" + Math.abs(hash(name)).toString(36).slice(0, 8);
      lines.push(`  ${i.unique ? "UNIQUE KEY" : "KEY"} ${q(name)} (${i.cols.map((x) => q(cn(t, x))).join(", ")})`);
    }
    out.push(`CREATE TABLE ${q(m.name)} (\n${lines.join(",\n")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n`);
  }
  for (const m of Object.values(EXTRA_TABLES)) {
    const lines = m.cols.map((col) => `  ${q(col.name)} ${col.sql} ${col.nullable ? "NULL DEFAULT NULL" : "NOT NULL"}${col.defSql != null ? ` DEFAULT ${col.defSql}` : ""}`);
    lines.push(`  PRIMARY KEY (${m.pk.map(q).join(", ")})`, `  KEY \`rate_limits_resetAt_idx\` (\`resetAt\`)`);
    out.push(`-- added for the PHP version: request counters for rate limiting\nCREATE TABLE ${q(m.name)} (\n${lines.join(",\n")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n`);
  }
  out.push(`-- ── foreign keys (added after all tables exist, so import order never matters) ──`);
  for (const [t, info] of Object.entries(tables)) for (const f of info.fks) {
    out.push(`ALTER TABLE ${q(tn(t))} ADD CONSTRAINT ${q(f.n.slice(0, 64))} FOREIGN KEY (${f.cols.map((x) => q(cn(t, x))).join(", ")}) REFERENCES ${q(tn(f.rt))} (${f.rcols.map((x) => q(cn(f.rt, x))).join(", ")}) ON DELETE ${ACTION[f.del]} ON UPDATE ${ACTION[f.upd]};`);
  }
  out.push(`\nSET FOREIGN_KEY_CHECKS = 1;`);
  return out.join("\n");
}
function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }

function phpMeta() {
  const php = (v) => (v === undefined ? "null" : typeof v === "string" ? "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'" : String(v));
  const out = [`<?php\n// GENERATED by migration-tools/pg-to-mysql.mjs from the database structure — do not edit by hand.\n// col => [kind, nullable, default, enumValues|null]   kind: id str text int bigint float bool dt json arr enum\n// default 'now' = current UTC time; json/arr defaults are JSON text.\nreturn [`];
  for (const [t, m] of Object.entries(model)) {
    out.push(`  ${php(m.name)} => ['pk' => [${m.pk.map(php).join(", ")}], 'upd' => [${m.cols.filter((x) => x.auto).map((x) => php(x.name)).join(", ")}], 'cols' => [`);
    for (const col of [...m.cols, ...(EXTRA_COLS[Object.keys(model).find((k) => model[k] === m)] ?? [])]) out.push(`    ${php(col.name)} => [${php(col.kind)}, ${col.nullable ? "true" : "false"}, ${col.auto ? "'now'" : php(col.defPhp)}, ${col.enumValues ? "[" + col.enumValues.map(php).join(", ") + "]" : "null"}],`);
    out.push(`  ]],`);
  }
  for (const m of Object.values(EXTRA_TABLES)) {
    out.push(`  ${php(m.name)} => ['pk' => [${m.pk.map(php).join(", ")}], 'upd' => [], 'cols' => [`);
    for (const col of m.cols) out.push(`    ${php(col.name)} => [${php(col.kind)}, ${col.nullable ? "true" : "false"}, ${php(col.defPhp)}, null],`);
    out.push(`  ]],`);
  }
  out.push(`];\n`);
  return out.join("\n");
}

function esc(s) {
  return "'" + s.replace(/[\0\n\r\\'"\x1a]/g, (ch) => ({ "\0": "\\0", "\n": "\\n", "\r": "\\r", "\\": "\\\\", "'": "\\'", '"': '\\"', "\x1a": "\\Z" })[ch]) + "'";
}
function dtSql(v) {
  if (v == null) return "NULL";
  const s = v instanceof Date ? v.toISOString().replace("T", " ").replace("Z", "") : String(v);
  const [d, tm = "00:00:00"] = s.split(/[ T]/);
  const [hms, frac = ""] = tm.replace(/[+-]\d\d(:?\d\d)?$/, "").split(".");
  return `'${d} ${hms}.${(frac + "000").slice(0, 3)}'`;
}
function valueSql(col, v) {
  if (v == null) return "NULL";
  switch (col.kind) {
    case "bool": return v ? "1" : "0";
    case "int": case "float": return String(v);
    case "bigint": return String(v);
    case "dt": return dtSql(v);
    case "json": return esc(JSON.stringify(v)); // the driver has already parsed jsonb, so even a plain string value must be re-encoded
    case "arr": return esc(JSON.stringify(Array.isArray(v) ? v : []));
    default: return esc(String(v));
  }
}

async function* dataSql() {
  const only = flag("tables"), skip = new Set(flag("skip") ?? []);
  yield `-- FaizanEdits Pro — data export (MySQL). Import AFTER database.sql.\nSET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\n`;
  for (const [t, m] of Object.entries(model)) {
    if ((only && !only.includes(t) && !only.includes(m.name)) || skip.has(t) || skip.has(m.name)) continue;
    const order = tables[t].pk.length ? tables[t].pk.map((x) => `"${x}"`).join(",") : "1";
    const total = Number((await c.query(`select count(*) n from "${t}"`)).rows[0].n);
    if (!total) continue;
    const cols = tables[t].cols;
    const head = `INSERT INTO ${q(m.name)} (${m.cols.map((x) => q(x.name)).join(", ")}) VALUES\n`;
    yield `\n-- ${m.name}: ${total} row(s)\n`;
    for (let off = 0; off < total; off += 250) {
      const rows = (await c.query(`select * from "${t}" order by ${order} limit 250 offset ${off}`)).rows;
      yield head + rows.map((r) => "(" + cols.map((col, i) => valueSql(m.cols[i], r[col.c])).join(", ") + ")").join(",\n") + ";\n";
    }
  }
  yield `\nSET FOREIGN_KEY_CHECKS = 1;\n`;
}

function map() {
  const schemaPath = resolve(here, "../prisma/schema.prisma");
  const byTable = {};
  if (existsSync(schemaPath)) {
    const src = readFileSync(schemaPath, "utf8");
    for (const m of src.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) { const mp = m[2].match(/@@map\("([^"]+)"\)/); byTable[mp ? mp[1] : m[1]] = m[1]; }
  }
  const out = [`# Database migration map — previous (PostgreSQL/Prisma) → MySQL/MariaDB\n`, `Generated by \`migration-tools/pg-to-mysql.mjs\` from the live database structure. Every column of every table is carried over; column and table names are unchanged except where noted.\n`];
  out.push(`## Type mapping\n`, `| PostgreSQL / Prisma | MySQL / MariaDB | Notes |`, `| --- | --- | --- |`,
    `| \`text\` id / foreign-key columns (cuid) | \`VARCHAR(40)\` ascii, binary collation | case-sensitive, exact same ids as before |`,
    `| \`text\` in an index or unique key | \`VARCHAR(191)\` | utf8mb4 index-safe length |`,
    `| \`text\` with a default | \`VARCHAR(255)\` | |`,
    `| other \`text\` | \`TEXT\` / \`MEDIUMTEXT\` | long-form content columns use \`MEDIUMTEXT\` (16 MB) |`,
    `| enum | \`ENUM(...)\` | same labels |`, `| \`boolean\` | \`TINYINT(1)\` | |`, `| \`integer\` / \`bigint\` / \`double precision\` | \`INT\` / \`BIGINT\` / \`DOUBLE\` | money stays in integer minor units |`,
    `| \`timestamp\` (UTC) | \`DATETIME(3)\` | connection time zone is forced to UTC; \`updatedAt\` uses \`ON UPDATE CURRENT_TIMESTAMP(3)\` |`,
    `| \`jsonb\` | \`JSON\` | |`, `| \`text[]\` | \`JSON\` (array of strings) | the application encodes and decodes |`, `| composite primary keys, unique constraints, indexes, foreign keys (ON DELETE / ON UPDATE) | identical | |\n`);
  out.push(`## Tables\n`, `| Prisma model | PostgreSQL table | MySQL table | Columns | Foreign keys | Notes |`, `| --- | --- | --- | --- | --- | --- |`);
  for (const [t, m] of Object.entries(model)) {
    const notes = [];
    if (RENAME_TABLE[t]) notes.push(`Prisma implicit many-to-many table \`${t}\` (columns A, B) → explicit join table (categoryId, questionId)`);
    const special = m.cols.filter((x) => x.kind === "arr").map((x) => x.name); if (special.length) notes.push(`array → JSON: ${special.join(", ")}`);
    const js = m.cols.filter((x) => x.kind === "json").map((x) => x.name); if (js.length) notes.push(`json: ${js.join(", ")}`);
    out.push(`| ${byTable[t] ?? "(implicit)"} | \`${t}\` | \`${m.name}\` | ${m.cols.length} | ${tables[t].fks.length} | ${notes.join("; ")} |`);
  }
  out.push(`\n\`_prisma_migrations\` (the old tool's own bookkeeping) is intentionally not migrated.\n`, `## Added for the PHP version\n`, `| Object | Purpose |`, `| --- | --- |`, `| \`sessions.data\` (MEDIUMTEXT) | PHP session payload — sessions are stored in the database rather than in temp files |`, `| table \`rate_limits\` (k, hits, resetAt) | request counters for rate limiting (shared hosting has no shared memory) |\n`, `## Enumerations\n`, `| Enum | Values |`, `| --- | --- |`);
  for (const [n, v] of Object.entries(enums)) out.push(`| ${n} | ${v.join(", ")} |`);
  return out.join("\n") + "\n";
}

try {
  if (mode === "schema") console.log(ddl());
  else if (mode === "meta") process.stdout.write(phpMeta());
  else if (mode === "map") process.stdout.write(map());
  else if (mode === "data") for await (const chunk of dataSql()) process.stdout.write(chunk);
  else { console.error("usage: pg-to-mysql.mjs schema|meta|data|map"); process.exitCode = 2; }
} finally {
  await c.end();
}
