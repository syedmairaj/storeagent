import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const READONLY_DIR = path.join(ROOT, "scripts/conn-hr-1/readonly");
const PRESCAN_PARITY = path.join(
  ROOT,
  "scripts/conn-hr-1/disposable/prescan-parity.sql",
);
const CANDIDATE = path.join(
  ROOT,
  "tests/sql/conn-hr-1-disposable-single-transaction-candidate.psql",
);
const MANIFEST = path.join(ROOT, "supabase/migrations.sha256");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const VITEST_PROTECTED = path.join(ROOT, ".vitest/json/output.json");

const CONN_FILES = [
  "20261121120000_shopify_conn_1a_integration_credential_vault.sql",
  "20261122120000_shopify_conn_1c_alpha_credential_persistence.sql",
  "20261122130000_shopify_conn_1c_beta_refresh_lease.sql",
  "20261122140000_shopify_conn_1d_c_disconnect_revoke.sql",
  "20261124120000_shopify_conn_1d_e_json_secret_guard.sql",
] as const;

const MUTATING_TOPLEVEL =
  /^\s*(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|copy|call|do|notify|listen|unlisten|reindex|vacuum|cluster|refresh|security|set\s+role|reset\s+role|discard)\b/im;

// Filesystem / source-dump accessors. ACL catalogs are read only through
// aclexplode (privilege_type / grantee). setconfig is covered by the dedicated
// redaction assertion on 08_logging_indicators.sql.
const FORBIDDEN_SELECT_COLS =
  /\b(prosrc|pg_read_file|pg_read_binary_file|pg_ls_dir|current_setting\s*\(\s*'app\.settings\.jwt_secret')\b/i;

function stripSqlNoise(sql: string): string {
  let text = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  text = text.replace(/--[^\n]*/g, " ");
  text = text.replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, " ");
  text = text.replace(/'(?:[^']|'')*'/g, " ");
  return text;
}

function predicateBlock(sql: string): string {
  const begin = sql.indexOf("-- CONN-HR-1 PREDICATE BEGIN");
  const end = sql.indexOf("-- CONN-HR-1 PREDICATE END");
  expect(begin).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(begin);
  return sql.slice(begin, end).replace(/\s+/g, " ").trim();
}

describe("CONN-HR-1 readonly SQL static safety", () => {
  const files = fs
    .readdirSync(READONLY_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  it("ships the expected readonly file set", () => {
    expect(files).toEqual([
      "01_platform.sql",
      "02_migration_history.sql",
      "03_prerequisites.sql",
      "04_ownership_acl.sql",
      "05_roles_rls_definer.sql",
      "06_publications_triggers.sql",
      "07_json_guard_prescan.sql",
      "08_logging_indicators.sql",
      "09_workload_locks.sql",
      "10_post_apply_catalog.sql",
    ]);
  });

  it("readonly files are SELECT/WITH only, parameter-free, no secret columns", () => {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(READONLY_DIR, file), "utf8");
      expect(raw, file).not.toMatch(/\$\d+\b/);
      const body = stripSqlNoise(raw);
      // Ban psql variables (:name) but allow PostgreSQL casts (::type).
      // Run on noise-stripped text so string literals like ':col:' do not trip.
      expect(body, file).not.toMatch(/(^|[^:]):[A-Za-z_]\w*/);
      for (const stmt of body.split(";")) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        expect(trimmed, `${file}: ${trimmed.slice(0, 80)}`).toMatch(
          /^(with|select)\b/i,
        );
        expect(trimmed, file).not.toMatch(MUTATING_TOPLEVEL);
      }
      expect(raw, file).not.toMatch(FORBIDDEN_SELECT_COLS);
    }
  });

  it("logging probe redacts non-allowlisted db-role settings", () => {
    const raw = fs.readFileSync(
      path.join(READONLY_DIR, "08_logging_indicators.sql"),
      "utf8",
    );
    expect(raw).toMatch(/else '<redacted>'/);
    expect(raw).not.toMatch(/unnest\(d\.setconfig\)[^\n]*as setting_value/i);
  });

  it("prescan predicate matches 07_json_guard_prescan.sql", () => {
    const advisory = fs.readFileSync(
      path.join(READONLY_DIR, "07_json_guard_prescan.sql"),
      "utf8",
    );
    const parity = fs.readFileSync(PRESCAN_PARITY, "utf8");
    expect(predicateBlock(parity)).toBe(predicateBlock(advisory));
  });

  it("candidate is disposable-gated and not a hosted apply script", () => {
    const raw = fs.readFileSync(CANDIDATE, "utf8");
    expect(raw).toMatch(/storeagent-conn-hr-1-disposable/);
    expect(raw).toMatch(/Not a hosted apply script/);
    expect(raw).toMatch(/\\if :conn_hr_1_disposable_ok/);
    expect(raw).toMatch(/select 1 \/ 0/);
    expect(raw).toMatch(/begin;/);
    expect(raw).toMatch(/commit;/);
    expect(raw).toMatch(/set local lock_timeout = '5s'/);
  });

  it("five CONN migration SHAs still match the manifest", () => {
    const manifest = fs.readFileSync(MANIFEST, "utf8");
    const map = new Map<string, string>();
    for (const line of manifest.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const hash = trimmed.slice(0, 64);
      const file = trimmed.slice(66);
      map.set(file, hash);
    }
    for (const file of CONN_FILES) {
      const bytes = fs.readFileSync(path.join(MIGRATIONS_DIR, file));
      const got = createHash("sha256").update(bytes).digest("hex");
      expect(map.get(file), file).toBe(got);
    }
  });

  it("protected .vitest hash is unchanged", () => {
    const got = createHash("sha1")
      .update(fs.readFileSync(VITEST_PROTECTED))
      .digest("hex");
    expect(got).toBe("55661591291aea593f7b3bfc623d547e09dccbfb");
  });

  it("replay tooling refuses forbidden ports and linked-project env", () => {
    const replay = fs.readFileSync(
      path.join(ROOT, "scripts/conn-hr-1/disposable/replay.sh"),
      "utf8",
    );
    expect(replay).toMatch(/FORBIDDEN_PORTS='5432 54322 55322'/);
    expect(replay).toMatch(/unset SUPABASE_ACCESS_TOKEN/);
    expect(replay).toMatch(/storeagent-conn-hr-1-disposable/);
    expect(replay).not.toMatch(/supabase link/);
    expect(replay).not.toMatch(/migration repair/);
  });
});
