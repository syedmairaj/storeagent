import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "scripts", "check-migration-integrity.mjs");

type IntegrityReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  migrations: {
    file: string;
    version: string;
    sha256: string;
    bytes: number;
  }[];
};

async function loadChecker(): Promise<{
  checkMigrationIntegrity: (
    root?: string,
    options?: { requireManifest?: boolean },
  ) => IntegrityReport;
  stripSqlBodiesForSeedScan: (sql: string) => string;
  formatMigrationManifest: (
    migrations: IntegrityReport["migrations"],
  ) => string;
}> {
  return import(pathToFileURL(SCRIPT).href);
}

const tempRoots: string[] = [];

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-mig-gate-"));
  tempRoots.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents, "utf8");
  }
  return dir;
}

describe("migration integrity gate", () => {
  it("passes against the repository supabase/migrations tree", async () => {
    const { checkMigrationIntegrity } = await loadChecker();
    const report = checkMigrationIntegrity(ROOT);

    expect(report.ok, report.errors.join("\n")).toBe(true);
    expect(report.migrations.length).toBe(52);
    expect(report.migrations[0]?.version).toBe("20261009090000");
    expect(report.migrations.at(-1)?.version).toBe("20261110140000");

    const latestPath = path.join(
      ROOT,
      "supabase",
      "migrations",
      report.migrations.at(-1)!.file,
    );
    const sha = createHash("sha256")
      .update(fs.readFileSync(latestPath))
      .digest("hex");
    expect(report.migrations.at(-1)?.sha256).toBe(sha);
  });

  it("fails closed on duplicate versions and invalid filenames", async () => {
    const { checkMigrationIntegrity } = await loadChecker();
    const root = makeTempRepo({
      "supabase/config.toml": `[db.seed]\nenabled = false\n`,
      "supabase/migrations/20260101000000_ok.sql": "-- ok\nselect 1;\n",
      "supabase/migrations/20260101000000_dup.sql": "-- dup\nselect 1;\n",
      "supabase/migrations/bad_name.sql": "-- bad\n",
    });

    const report = checkMigrationIntegrity(root, { requireManifest: false });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => /Duplicate migration version/.test(e))).toBe(
      true,
    );
    expect(report.errors.some((e) => /Invalid migration filename/.test(e))).toBe(
      true,
    );
  });

  it("rejects top-level merchant DML and enabled missing seeds, not RPC bodies", async () => {
    const { checkMigrationIntegrity } = await loadChecker();
    const root = makeTempRepo({
      "supabase/config.toml": `[db.seed]\nenabled = true\nsql_paths = ["./seed.sql"]\n`,
      "supabase/migrations/20260101000000_bad_dml.sql":
        "INSERT INTO inventory_snapshots (id) VALUES ('x');\n",
      "supabase/migrations/20260101000001_rpc_ok.sql":
        "CREATE FUNCTION public.demo() RETURNS void LANGUAGE plpgsql AS $$\nBEGIN\n  INSERT INTO inventory_snapshots (id) VALUES ('x');\nEND;\n$$;\n",
    });

    const report = checkMigrationIntegrity(root, { requireManifest: false });
    expect(report.ok).toBe(false);
    expect(
      report.errors.some((e) =>
        /Forbidden top-level merchant\/synthetic DML/.test(e),
      ),
    ).toBe(true);
    expect(report.errors.some((e) => /seed\.sql is missing/.test(e))).toBe(true);
    expect(
      report.errors.some((e) => e.includes("20260101000001_rpc_ok.sql")),
    ).toBe(false);
  });

  it("strips comments/strings and catches quoted-identifier seed DML", async () => {
    const { checkMigrationIntegrity, stripSqlBodiesForSeedScan } =
      await loadChecker();

    expect(
      stripSqlBodiesForSeedScan(
        "-- INSERT INTO inventory_snapshots\nSELECT 'INSERT INTO inventory_snapshots';\n",
      ),
    ).not.toMatch(/INSERT\s+INTO\s+inventory_snapshots/i);

    const cases: { label: string; sql: string; expectHit: boolean }[] = [
      {
        label: "comment",
        sql: "-- INSERT INTO inventory_snapshots (id) VALUES (1);\nselect 1;\n",
        expectHit: false,
      },
      {
        label: "string_literal",
        sql: "SELECT 'INSERT INTO inventory_snapshots';\n",
        expectHit: false,
      },
      {
        label: "quoted_ident",
        sql: 'INSERT INTO "inventory_snapshots" (id) VALUES (1);\n',
        expectHit: true,
      },
      {
        label: "public_quoted",
        sql: 'INSERT INTO public."order_items" (id) VALUES (1);\n',
        expectHit: true,
      },
      {
        label: "after_function",
        sql: "CREATE FUNCTION f() RETURNS void AS $$\nSELECT 1;\n$$ LANGUAGE sql;\nINSERT INTO orders (id) VALUES (1);\n",
        expectHit: true,
      },
    ];

    for (const item of cases) {
      const root = makeTempRepo({
        "supabase/config.toml": `[db.seed]\nenabled = false\n`,
        [`supabase/migrations/20260101000000_${item.label}.sql`]: item.sql,
      });
      const report = checkMigrationIntegrity(root, { requireManifest: false });
      const hit = report.errors.some((e) =>
        /Forbidden top-level merchant\/synthetic DML/.test(e),
      );
      expect(hit, item.label).toBe(item.expectHit);
    }
  });

  it("detects SHA mismatch against a trusted baseline manifest", async () => {
    const { checkMigrationIntegrity, formatMigrationManifest } =
      await loadChecker();
    const root = makeTempRepo({
      "supabase/config.toml": `[db.seed]\nenabled = false\n`,
      "supabase/migrations/20260101000000_ok.sql": "-- ok\nselect 1;\n",
    });
    const baseline = checkMigrationIntegrity(root, { requireManifest: false });
    expect(baseline.ok).toBe(true);
    fs.writeFileSync(
      path.join(root, "supabase", "migrations.sha256"),
      formatMigrationManifest(baseline.migrations),
    );

    // Tamper content while keeping the same filename/version.
    fs.writeFileSync(
      path.join(root, "supabase", "migrations", "20260101000000_ok.sql"),
      "-- tampered\nselect 2;\n",
    );
    const tampered = checkMigrationIntegrity(root, { requireManifest: true });
    expect(tampered.ok).toBe(false);
    expect(
      tampered.errors.some((e) => /SHA-256 mismatch vs trusted baseline/.test(e)),
    ).toBe(true);
  });

  it("warns on deprecated auth.email.enable_signup without failing", async () => {
    const { checkMigrationIntegrity } = await loadChecker();
    const root = makeTempRepo({
      "supabase/config.toml": `[db.seed]\nenabled = false\n\n[auth.email]\nenable_signup = true\n`,
      "supabase/migrations/20260101000000_ok.sql": "-- ok\nselect 1;\n",
    });

    const report = checkMigrationIntegrity(root, { requireManifest: false });
    expect(report.ok).toBe(true);
    expect(
      report.warnings.some((w) => /auth\.email\] enable_signup/.test(w)),
    ).toBe(true);
  });

  it("is loadable as a direct CLI script path", () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
    const source = fs.readFileSync(SCRIPT, "utf8");
    expect(source).toContain("Never connects to Postgres");
    expect(source).not.toContain("db reset");
  });

  it("keeps the CI workflow free of production secrets and mutating supabase commands", () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, ".github", "workflows", "db-drift-prevention.yml"),
      "utf8",
    );
    expect(workflow).toContain("non-mutating");
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./);
    expect(workflow).not.toMatch(/SUPABASE_ACCESS_TOKEN/);
    expect(workflow).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(workflow).not.toMatch(/\bDATABASE_URL\b/);
    expect(workflow).not.toMatch(/\bdb push\b/);
    expect(workflow).not.toMatch(/\bdb reset\b/);
    expect(workflow).not.toMatch(/\bmigration repair\b/);
    expect(workflow).not.toMatch(/\bconfig push\b/);
  });
});

// Silence unused import in some bundlers
void fileURLToPath;
