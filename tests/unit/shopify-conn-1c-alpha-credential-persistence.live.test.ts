import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * SHOPIFY-CONN-1c-α — disposable local persistence acceptance.
 *
 * Requires an isolated Postgres (not local Supabase 55322 / 54322).
 *
 * Required env when RUN_CONN1C_ISOLATED_LIVE=1:
 *   CONN1C_PGHOST, CONN1C_PGPORT, CONN1C_PGDATABASE, CONN1C_PGUSER
 * Optional: CONN1C_PGPASSWORD
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_CONN1C_ISOLATED_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const FORBIDDEN_PORTS = new Set(["55322", "54322"]);

const BOOTSTRAP =
  "tests/sql/shopify-conn-1a-disposable-bootstrap.sql";
const MIGRATION_1A =
  "supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql";
const MIGRATION_1C =
  "supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql";
const ADVERSARIAL =
  "tests/sql/shopify-conn-1c-alpha-credential-persistence-adversarial.sql";
const V15_ROLLBACK =
  "tests/sql/shopify-conn-1c-alpha-v15-rollback-additive.sql";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `CONN-1c isolated live requires ${name} (no silent 55322 fallback)`,
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
  const host = requiredEnv("CONN1C_PGHOST");
  const port = requiredEnv("CONN1C_PGPORT");
  const database = requiredEnv("CONN1C_PGDATABASE");
  const user = requiredEnv("CONN1C_PGUSER");
  const password = process.env.CONN1C_PGPASSWORD ?? "";

  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(
      `CONN-1c isolated live refuses port ${port} (existing Supabase DB)`,
    );
  }
  if (database === "postgres" && port === "5432") {
    throw new Error(
      "CONN-1c isolated live refuses shared postgres DB; use dedicated disposable database",
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

describeLive("SHOPIFY-CONN-1c-α credential persistence (disposable live)", () => {
  beforeAll(async () => {
    const conn = isolatedConnection();
    const identity = await psqlScalar(
      `select current_database() || '|' || current_user || '|' ||
              inet_server_port()::text || '|' ||
              (select setting from pg_settings where name = 'data_directory')`,
    );
    process.stdout.write(`\n[CONN-1c-α] disposable identity: ${identity}\n`);
    expect(identity.startsWith(`${conn.database}|`)).toBe(true);
    expect(identity).not.toContain("/var/lib/postgresql/data");

    await psqlFile(BOOTSTRAP);
    await psqlFile(MIGRATION_1A);
    await psqlFile(MIGRATION_1C);
  }, 120_000);

  afterAll(async () => {
    // Leave disposable DB for owner inspection unless dropped by harness.
  });

  it("applies α columns and RPCs", async () => {
    const present = await psqlScalar(`
      select
        (exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'integration_credentials'
            and column_name = 'credential_generation'
        ))::text
        || ',' ||
        (to_regprocedure(
          'public.load_integration_credential_envelope(uuid,uuid,text)'
        ) is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.clear_integration_credentials(uuid,uuid,text,bigint)'
        ) is not null)::text
    `);
    expect(present).toBe("true,true,true");
  });

  it("keeps table DML revoked; grants RPC EXECUTE to service_role only", async () => {
    const tableGranted = await psqlScalar(`
      select string_agg(role_name || ':' || priv, ',' order by 1)
      from (
        select r.role_name, p.priv
        from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
        where has_table_privilege(
          r.role_name, 'public.integration_credentials', p.priv
        )
      ) s
    `);
    expect(tableGranted).toBe("");

    const rpcDenied = await psqlScalar(`
      select string_agg(role_name || ':' || fn, ',' order by 1)
      from (
        select r.role_name, f.fn
        from (values ('public'), ('anon'), ('authenticated')) as r(role_name)
        cross join (values
          ('public.load_integration_credential_envelope(uuid,uuid,text)'),
          ('public.clear_integration_credentials(uuid,uuid,text,bigint)')
        ) as f(fn)
        where has_function_privilege(r.role_name, f.fn, 'EXECUTE')
      ) s
    `);
    expect(rpcDenied).toBe("");

    const rpcAllowed = await psqlScalar(`
      select has_function_privilege(
        'service_role',
        'public.load_integration_credential_envelope(uuid,uuid,text)',
        'EXECUTE'
      )::text
      || ',' ||
      has_function_privilege(
        'service_role',
        'public.clear_integration_credentials(uuid,uuid,text,bigint)',
        'EXECUTE'
      )::text
    `);
    expect(rpcAllowed).toBe("true,true");
  });

  it("runs create/CAS/clear adversarial matrix", async () => {
    const out = await psqlFile(ADVERSARIAL);
    expect(out).toContain("CONN-1c-α adversarial checks PASS");
  });

  it("V15: dropping α objects leaves CONN-1a + M2.6 intact", async () => {
    const out = await psqlFile(V15_ROLLBACK);
    expect(out).toContain("V15 CONN-1c-α rollback PASS");

    const remaining = await psqlScalar(`
      select
        (to_regclass('public.integrations') is not null)::text
        || ',' ||
        (to_regclass('public.integration_credentials') is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.load_integration_credential_envelope(uuid,uuid,text)'
        ) is null)::text
        || ',' ||
        (exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'integration_credentials'
            and column_name = 'credential_generation'
        ))::text
    `);
    expect(remaining).toBe("true,true,true,false");
  });
});
