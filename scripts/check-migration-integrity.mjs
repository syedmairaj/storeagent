#!/usr/bin/env node
/**
 * Non-mutating migration / seed integrity gate (Phase 1).
 * Never connects to Postgres, never runs supabase db push/reset, never
 * touches hosted projects.
 *
 * Exit 0 on PASS, 1 on FAIL.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const MANIFEST_PATH = path.join(ROOT, "supabase", "migrations.sha256");
const CONFIG_PATH = path.join(ROOT, "supabase", "config.toml");
const SEED_PATH = path.join(ROOT, "supabase", "seed.sql");

/** Supabase migration filename: YYYYMMDDHHmmss_slug.sql */
const MIGRATION_NAME_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

const MERCHANT_TABLES =
  "inventory_snapshots|order_items|orders|organizations|stores|locations|product_variants|products|sku_daily_metrics|purchase_orders|purchase_order_items";

/**
 * Merchant / synthetic data must never ship as *top-level* migration DML.
 * INSERT/COPY inside CREATE FUNCTION bodies (CSV RPCs, bootstrap helpers) is
 * allowed; static seed rows at migration scope are not.
 * Table names may be bare or "quoted".
 */
const FORBIDDEN_TOPLEVEL_DML_RE = new RegExp(
  // Trailing boundary: bare names use \b; quoted names end at " so use (?=[\s;(]|$).
  String.raw`\b(?:INSERT\s+INTO|COPY)\s+(?:public\.)?(?:"(?:${MERCHANT_TABLES})"(?=[\s;(]|$)|(?:${MERCHANT_TABLES})\b)`,
  "i",
);

const FORBIDDEN_SEED_TABLE_RE =
  /\b(?:inventory_snapshots|order_items|orders|sku_daily_metrics|purchase_order_items)\b/i;

/**
 * Remove comments, dollar-quoted bodies, and single-quoted string literals so
 * RPC/trigger SQL and documentation strings do not trip the seed DML check.
 * @param {string} sql
 */
export function stripSqlBodiesForSeedScan(sql) {
  let text = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  text = text.replace(/--[^\n]*/g, " ");
  // $tag$ ... $tag$ including $$ ... $$
  text = text.replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, " ");
  // Standard SQL strings with '' escapes (E'...' treated as ordinary quotes).
  text = text.replace(/'(?:[^']|'')*'/g, " ");
  return text;
}

/**
 * @param {IntegrityReport["migrations"]} migrations
 * @returns {string}
 */
export function formatMigrationManifest(migrations) {
  return (
    migrations
      .map((entry) => `${entry.sha256}  ${entry.file}`)
      .join("\n") + (migrations.length > 0 ? "\n" : "")
  );
}

/**
 * @param {string} manifestText
 * @returns {Map<string, string>}
 */
export function parseMigrationManifest(manifestText) {
  const map = new Map();
  for (const line of manifestText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = /^([a-f0-9]{64})(?:\s{2}|\s+)(.+)$/i.exec(trimmed);
    if (!match) {
      throw new Error(`Invalid migrations.sha256 line: ${trimmed}`);
    }
    map.set(match[2].trim(), match[1].toLowerCase());
  }
  return map;
}

/**
 * @typedef {{
 *   ok: boolean;
 *   errors: string[];
 *   warnings: string[];
 *   migrations: { file: string; version: string; sha256: string; bytes: number }[];
 * }} IntegrityReport
 */

/**
 * @param {string} root
 * @param {{ requireManifest?: boolean }} [options]
 * @returns {IntegrityReport}
 */
export function checkMigrationIntegrity(
  root = ROOT,
  options = { requireManifest: true },
) {
  const errors = [];
  const warnings = [];
  const migrationsDir = path.join(root, "supabase", "migrations");
  const manifestPath = path.join(root, "supabase", "migrations.sha256");
  const configPath = path.join(root, "supabase", "config.toml");
  const seedPath = path.join(root, "supabase", "seed.sql");
  const requireManifest = options.requireManifest !== false;

  if (!fs.existsSync(migrationsDir)) {
    return {
      ok: false,
      errors: [`Missing migrations directory: ${migrationsDir}`],
      warnings: [],
      migrations: [],
    };
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => !name.startsWith("."))
    .sort();

  /** @type {IntegrityReport["migrations"]} */
  const migrations = [];
  const versions = new Map();

  for (const file of files) {
    const full = path.join(migrationsDir, file);
    const stat = fs.statSync(full);
    if (!stat.isFile()) {
      errors.push(`Non-file entry in migrations/: ${file}`);
      continue;
    }

    const match = MIGRATION_NAME_RE.exec(file);
    if (!match) {
      errors.push(
        `Invalid migration filename (expected YYYYMMDDHHmmss_slug.sql): ${file}`,
      );
      continue;
    }

    const version = match[1];
    if (versions.has(version)) {
      errors.push(
        `Duplicate migration version ${version}: ${versions.get(version)} and ${file}`,
      );
    } else {
      versions.set(version, file);
    }

    if (stat.size === 0) {
      errors.push(`Empty migration file: ${file}`);
      continue;
    }

    const bytes = fs.readFileSync(full);
    let text;
    try {
      text = bytes.toString("utf8");
    } catch {
      errors.push(`Migration is not readable as UTF-8: ${file}`);
      continue;
    }

    if (text.includes("\uFFFD") && bytes.includes(0xff)) {
      warnings.push(`Migration may contain non-UTF8 bytes: ${file}`);
    }

    const toplevelSql = stripSqlBodiesForSeedScan(text);
    if (FORBIDDEN_TOPLEVEL_DML_RE.test(toplevelSql)) {
      errors.push(
        `Forbidden top-level merchant/synthetic DML in migration (use local seeds only): ${file}`,
      );
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    migrations.push({
      file,
      version,
      sha256,
      bytes: stat.size,
    });
  }

  if (migrations.length === 0) {
    errors.push("No migration files found under supabase/migrations.");
  }

  // Lexicographic filename order must match version order (Supabase apply order).
  const byVersion = [...migrations].sort((a, b) =>
    a.version.localeCompare(b.version),
  );
  for (let i = 0; i < migrations.length; i += 1) {
    if (migrations[i].file !== byVersion[i].file) {
      errors.push(
        `Migration directory sort order diverges from version order near ${migrations[i].file}`,
      );
      break;
    }
  }

  // Trusted baseline: committed supabase/migrations.sha256 detects content
  // tampering / silent edits that keep the same filename+version.
  if (requireManifest) {
    if (!fs.existsSync(manifestPath)) {
      errors.push(
        "Missing trusted baseline supabase/migrations.sha256. Run: node scripts/check-migration-integrity.mjs --write-manifest",
      );
    } else {
      try {
        const expected = parseMigrationManifest(
          fs.readFileSync(manifestPath, "utf8"),
        );
        const actualFiles = new Set(migrations.map((entry) => entry.file));
        for (const entry of migrations) {
          const want = expected.get(entry.file);
          if (!want) {
            errors.push(
              `Migration missing from trusted baseline manifest: ${entry.file}`,
            );
            continue;
          }
          if (want !== entry.sha256) {
            errors.push(
              `Migration SHA-256 mismatch vs trusted baseline (tamper or unreviewed edit): ${entry.file}`,
            );
          }
        }
        for (const file of expected.keys()) {
          if (!actualFiles.has(file)) {
            errors.push(
              `Trusted baseline lists migration not present on disk: ${file}`,
            );
          }
        }
      } catch (cause) {
        errors.push(
          cause instanceof Error
            ? cause.message
            : "Unable to parse supabase/migrations.sha256",
        );
      }
    }
  }

  // Seed policy: never ship merchant observations/sales as production seeds.
  let seedEnabled = false;
  if (fs.existsSync(configPath)) {
    const configText = fs.readFileSync(configPath, "utf8");
    const seedSection = configText.match(
      /\[db\.seed\][\s\S]*?(?=\n\[|\n*$)/,
    )?.[0];
    if (seedSection) {
      seedEnabled = /^\s*enabled\s*=\s*true\s*$/m.test(seedSection);
    }

    // Deprecated auth keys (CLI v3 → removed in v4): document-only unless changed.
    if (/\[auth\.email\][\s\S]*?^\s*enable_signup\s*=/m.test(configText)) {
      warnings.push(
        "Deprecated: [auth.email] enable_signup — use [auth.email] enabled (CLI v3; removed in v4). Do not change without a dedicated auth compatibility check.",
      );
    }
    if (/\[auth\.sms\][\s\S]*?^\s*enable_signup\s*=/m.test(configText)) {
      warnings.push(
        "Deprecated: [auth.sms] enable_signup — use [auth.sms] enabled (CLI v3; removed in v4). Do not change without a dedicated auth compatibility check.",
      );
    }
  } else {
    warnings.push("supabase/config.toml not found; seed/auth checks skipped.");
  }

  if (seedEnabled && !fs.existsSync(seedPath)) {
    errors.push(
      "config.toml enables [db.seed] but supabase/seed.sql is missing. Disable seed or add a schema-safe local-only seed file.",
    );
  }

  if (fs.existsSync(seedPath)) {
    const seedText = fs.readFileSync(seedPath, "utf8");
    if (FORBIDDEN_SEED_TABLE_RE.test(seedText)) {
      errors.push(
        "supabase/seed.sql references merchant commerce tables. Local inventory/sales must never ship as production seeds.",
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    migrations,
  };
}

function main() {
  const writeManifest = process.argv.includes("--write-manifest");
  const report = checkMigrationIntegrity(ROOT, {
    // When writing a new baseline, skip mismatch failures against the old file.
    requireManifest: !writeManifest,
  });

  console.log("StoreAgent migration integrity gate (Phase 1)");
  console.log(`migrations_dir=${MIGRATIONS_DIR}`);
  console.log(`manifest=${MANIFEST_PATH}`);
  console.log(`count=${report.migrations.length}`);

  if (report.migrations.length > 0) {
    const latest = report.migrations[report.migrations.length - 1];
    console.log(`latest=${latest.version} (${latest.file})`);
    console.log(`latest_sha256=${latest.sha256}`);
  }

  for (const warning of report.warnings) {
    console.warn(`WARN: ${warning}`);
  }

  if (writeManifest) {
    if (!report.ok) {
      for (const error of report.errors) {
        console.error(`FAIL: ${error}`);
      }
      process.exit(1);
    }
    fs.writeFileSync(MANIFEST_PATH, formatMigrationManifest(report.migrations));
    console.log(`WROTE trusted baseline ${MANIFEST_PATH}`);
    process.exit(0);
  }

  if (!report.ok) {
    for (const error of report.errors) {
      console.error(`FAIL: ${error}`);
    }
    process.exit(1);
  }

  console.log(
    "PASS: migration filename, version uniqueness, seed policy, and SHA baseline checks.",
  );
  process.exit(0);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
