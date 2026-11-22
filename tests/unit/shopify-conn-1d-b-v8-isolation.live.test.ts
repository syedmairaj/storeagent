import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * SHOPIFY-CONN-1d-B — disposable V8 membership / role isolation.
 *
 * Requires isolated Postgres (not local Supabase 55322 / 54322).
 *
 * Required env when RUN_CONN1D_B_ISOLATED_LIVE=1:
 *   CONN1D_B_PGHOST, CONN1D_B_PGPORT, CONN1D_B_PGDATABASE, CONN1D_B_PGUSER
 * Optional: CONN1D_B_PGPASSWORD
 *
 * Evidence class: SQL role impersonation + request.jwt.claim.sub stub.
 * Does NOT claim hosted PostgREST / real JWT verification.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_CONN1D_B_ISOLATED_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const FORBIDDEN_PORTS = new Set(["55322", "54322"]);
const EXPECTED_DISPOSABLE_PORT = "55427";

const BOOTSTRAP_1A =
  "tests/sql/shopify-conn-1a-disposable-bootstrap.sql";
const MIGRATION_1A =
  "supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql";
const MIGRATION_1C_ALPHA =
  "supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql";
const MIGRATION_1C_BETA =
  "supabase/migrations/20261122130000_shopify_conn_1c_beta_refresh_lease.sql";
const MEMBERSHIP_BOOTSTRAP =
  "tests/sql/shopify-conn-1d-b-v8-membership-bootstrap.sql";
const ADVERSARIAL =
  "tests/sql/shopify-conn-1d-b-v8-role-membership-adversarial.sql";
const V15_ROLLBACK =
  "tests/sql/shopify-conn-1d-b-v15-bootstrap-rollback.sql";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `CONN-1d-B isolated live requires ${name} (no silent 55322 fallback)`,
    );
  }
  return value;
}

function isolatedConnection(): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
} {
  const host = requiredEnv("CONN1D_B_PGHOST");
  const port = requiredEnv("CONN1D_B_PGPORT");
  const database = requiredEnv("CONN1D_B_PGDATABASE");
  const user = requiredEnv("CONN1D_B_PGUSER");
  const password = process.env.CONN1D_B_PGPASSWORD ?? "";

  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(
      `CONN-1d-B isolated live refuses port ${port} (existing Supabase DB)`,
    );
  }
  if (database === "postgres" && port === "5432") {
    throw new Error(
      "CONN-1d-B isolated live refuses shared postgres DB; use dedicated disposable database",
    );
  }
  if (port !== EXPECTED_DISPOSABLE_PORT) {
    throw new Error(
      `CONN-1d-B isolated live requires disposable port ${EXPECTED_DISPOSABLE_PORT}, got ${port}`,
    );
  }

  return { host, port, database, user, password };
}

function psqlEnv(): NodeJS.ProcessEnv {
  const conn = isolatedConnection();
  return {
    ...process.env,
    PGHOST: conn.host,
    PGPORT: conn.port,
    PGDATABASE: conn.database,
    PGUSER: conn.user,
    PGPASSWORD: conn.password,
    PGOPTIONS: "-c client_min_messages=warning",
  };
}

async function psqlFile(filePath: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-f", filePath],
    { env: psqlEnv(), maxBuffer: 10 * 1024 * 1024 },
  );
  if (stderr && /ERROR:/i.test(stderr)) {
    throw new Error(stderr);
  }
  return `${stdout}\n${stderr}`;
}

async function psqlScalar(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { env: psqlEnv() },
  );
  return stdout.trim();
}

describeLive("SHOPIFY-CONN-1d-B V8 isolation (disposable live)", () => {
  beforeAll(async () => {
    const conn = isolatedConnection();
    const identity = await psqlScalar(
      `select current_database() || '|' || current_user || '|' ||
              inet_server_port()::text || '|' ||
              (select setting from pg_settings where name = 'data_directory')`,
    );
    process.stdout.write(`\n[CONN-1d-B] disposable identity: ${identity}\n`);
    expect(identity.startsWith(`${conn.database}|`)).toBe(true);
    expect(identity).toContain(`|${EXPECTED_DISPOSABLE_PORT}|`);
    expect(identity).not.toContain("/var/lib/postgresql/data");
    expect(identity.toLowerCase()).toContain("restore-scratch");

    await psqlFile(BOOTSTRAP_1A);
    await psqlFile(MIGRATION_1A);
    await psqlFile(MIGRATION_1C_ALPHA);
    await psqlFile(MIGRATION_1C_BETA);
    await psqlFile(MEMBERSHIP_BOOTSTRAP);
  }, 180_000);

  afterAll(async () => {
    // Leave disposable DB for owner inspection unless dropped externally.
  });

  it("V8-G/A/R/N/X/S SQL adversarial matrix PASS", async () => {
    const out = await psqlFile(ADVERSARIAL);
    expect(out).toContain("CONN-1d-B V8 adversarial checks PASS");
  });

  it("V15: V8 bootstrap rollback leaves CONN-1a/α/β + integrations intact", async () => {
    const out = await psqlFile(V15_ROLLBACK);
    expect(out).toContain("V15 CONN-1d-B V8 bootstrap rollback PASS");

    const remaining = await psqlScalar(`
      select
        (to_regclass('public.integrations') is not null)::text
        || ',' ||
        (to_regclass('public.integration_credentials') is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.load_integration_credential_envelope(uuid,uuid,text)'
        ) is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'
        ) is not null)::text
        || ',' ||
        (to_regclass('public.organization_members') is null)::text
        || ',' ||
        (not exists (
          select 1 from pg_policies
          where schemaname = 'public'
            and tablename = 'integrations'
            and policyname = 'integrations_select_member'
        ))::text
    `);
    expect(remaining).toBe("true,true,true,true,true,true");
  });
});
