import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * SHOPIFY-CONN-1a — disposable local schema acceptance.
 *
 * Requires an isolated Postgres (not local Supabase 55322 / 54322).
 *
 * Required env when RUN_CONN1A_ISOLATED_LIVE=1:
 *   CONN1A_PGHOST, CONN1A_PGPORT, CONN1A_PGDATABASE, CONN1A_PGUSER
 * Optional: CONN1A_PGPASSWORD
 *
 * Schema coverage: V6, V7 (grants), V9, V10, identity immutability, V15.
 * Crypto/runtime V1–V5 and V8/V11–V14: NOT YET TESTED.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_CONN1A_ISOLATED_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const FORBIDDEN_PORTS = new Set(["55322", "54322"]);

const BOOTSTRAP =
  "tests/sql/shopify-conn-1a-disposable-bootstrap.sql";
const MIGRATION =
  "supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql";
const ADVERSARIAL =
  "tests/sql/shopify-conn-1a-credential-vault-schema-adversarial.sql";
const V15_ROLLBACK =
  "tests/sql/shopify-conn-1a-v15-rollback-additive.sql";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `CONN-1a isolated live requires ${name} (no silent 55322 fallback)`,
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
  const host = requiredEnv("CONN1A_PGHOST");
  const port = requiredEnv("CONN1A_PGPORT");
  const database = requiredEnv("CONN1A_PGDATABASE");
  const user = requiredEnv("CONN1A_PGUSER");
  const password = process.env.CONN1A_PGPASSWORD ?? "";

  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(
      `CONN-1a isolated live refuses port ${port} (existing Supabase DB)`,
    );
  }
  if (database === "postgres" && port === "5432") {
    throw new Error(
      "CONN-1a isolated live refuses shared postgres DB; use dedicated disposable database",
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

describeLive("SHOPIFY-CONN-1a credential vault (disposable live)", () => {
  beforeAll(async () => {
    const conn = isolatedConnection();
    const identity = await psqlScalar(
      `select current_database() || '|' || current_user || '|' ||
              inet_server_port()::text || '|' ||
              (select setting from pg_settings where name = 'data_directory')`,
    );
    process.stdout.write(`\n[CONN-1a] disposable identity: ${identity}\n`);
    expect(identity.startsWith(`${conn.database}|`)).toBe(true);
    expect(identity).not.toContain("/var/lib/postgresql/data");

    await psqlFile(BOOTSTRAP);
    await psqlFile(MIGRATION);
  }, 120_000);

  afterAll(async () => {
    // Leave disposable DB for owner inspection unless explicitly dropped by harness.
  });

  it("applies cleanly and exposes vault tables", async () => {
    const present = await psqlScalar(`
      select
        (to_regclass('public.integration_credentials') is not null)::text
        || ',' ||
        (to_regclass('public.integration_external_accounts') is not null)::text
    `);
    expect(present).toBe("true,true");
  });

  it("V6/V7: effective privileges deny browser and service_role DML/SELECT", async () => {
    const matrix = await psqlScalar(`
      select string_agg(role_name || ':' || priv || '=' || allowed::text, ',' order by 1)
      from (
        select r.role_name, p.priv,
          has_table_privilege(r.role_name, t.tbl, p.priv) as allowed
        from (values
          ('anon'), ('authenticated'), ('service_role')
        ) as r(role_name)
        cross join (values
          ('public.integration_credentials'),
          ('public.integration_external_accounts')
        ) as t(tbl)
        cross join (values
          ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
        ) as p(priv)
      ) s
      where allowed
    `);
    expect(matrix).toBe("");
  });

  it("V7: trigger function EXECUTE denied for PUBLIC/browser/service_role", async () => {
    const allowed = await psqlScalar(`
      select string_agg(role_name || ':' || fn, ',' order by 1)
      from (
        select r.role_name, f.fn,
          has_function_privilege(r.role_name, f.fn, 'EXECUTE') as ok
        from (values
          ('public'), ('anon'), ('authenticated'), ('service_role')
        ) as r(role_name)
        cross join (values
          ('public.prevent_integration_credential_identity_reassignment()'),
          ('public.prevent_integration_external_account_identity_reassignment()')
        ) as f(fn)
      ) s
      where ok
    `);
    expect(allowed).toBe("");
  });

  it("browser SET ROLE cannot SELECT ciphertext", async () => {
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      let failed = false;
      try {
        await psqlScalar(`
          set role ${role};
          select count(*) from public.integration_credentials;
        `);
      } catch (error) {
        failed = /permission denied|insufficient_privilege/i.test(
          String(error),
        );
      }
      expect(failed).toBe(true);
      await psqlScalar("reset role;");
    }
  });

  it("runs schema adversarial matrix (V9/V10/immutability/ownership)", async () => {
    const out = await psqlFile(ADVERSARIAL);
    expect(out).toContain("CONN-1a adversarial checks PASS");
  });

  it("V15: dropping additive objects leaves M2.6 integrations intact", async () => {
    const out = await psqlFile(V15_ROLLBACK);
    expect(out).toContain("V15 rollback of additive objects PASS");

    const remaining = await psqlScalar(`
      select
        (to_regclass('public.integrations') is not null)::text
        || ',' ||
        (to_regclass('public.integration_credentials') is null)::text
        || ',' ||
        (to_regclass('public.integration_external_accounts') is null)::text
    `);
    expect(remaining).toBe("true,true,true");
  });
});
