import {
  type ChildProcessWithoutNullStreams,
  execFile,
  spawn,
} from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

/**
 * SHOPIFY-CONN-1d-C — disposable local disconnect/revoke acceptance.
 *
 * Requires an isolated Postgres (not local Supabase 55322 / 54322).
 *
 * Required env when RUN_CONN1D_C_ISOLATED_LIVE=1:
 *   CONN1C_PGHOST, CONN1C_PGPORT, CONN1C_PGDATABASE, CONN1C_PGUSER
 * Optional: CONN1C_PGPASSWORD
 *
 * Reuses CONN1C_* env names for the same disposable host (port 55427).
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_CONN1D_C_ISOLATED_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const FORBIDDEN_PORTS = new Set(["55322", "54322"]);
const EXPECTED_DISPOSABLE_PORT = "55427";

const BOOTSTRAP =
  "tests/sql/shopify-conn-1a-disposable-bootstrap.sql";
const MIGRATION_1A =
  "supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql";
const MIGRATION_1C_ALPHA =
  "supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql";
const MIGRATION_1C_BETA =
  "supabase/migrations/20261122130000_shopify_conn_1c_beta_refresh_lease.sql";
const MIGRATION_1D_C =
  "supabase/migrations/20261122140000_shopify_conn_1d_c_disconnect_revoke.sql";
const ADVERSARIAL =
  "tests/sql/shopify-conn-1d-c-disconnect-revoke-adversarial.sql";
const V15_ROLLBACK =
  "tests/sql/shopify-conn-1d-c-v15-rollback-additive.sql";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `CONN-1d-C isolated live requires ${name} (no silent 55322 fallback)`,
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
      `CONN-1d-C isolated live refuses port ${port} (existing Supabase DB)`,
    );
  }
  if (database === "postgres" && port === "5432") {
    throw new Error(
      "CONN-1d-C isolated live refuses shared postgres DB; use dedicated disposable database",
    );
  }
  if (port !== EXPECTED_DISPOSABLE_PORT) {
    throw new Error(
      `CONN-1d-C isolated live requires disposable port ${EXPECTED_DISPOSABLE_PORT}, got ${port}`,
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

const CONC_ORG = "c0dd1d0c-0000-4000-8000-000000000001";
const CONC_STORE = "c0dd1d0c-0000-4000-8000-000000000002";
const CONC_INTEG = "c0dd1d0c-0000-4000-8000-000000000003";
const SEED_ACCESS_HEX = "aa";
const BARRIER_TIMEOUT_MS = 5_000;
const BARRIER_POLL_MS = 20;

type SessionResult = { rows: string[]; errors: string[] };

const DIAGNOSTIC_LINE =
  /^(psql:|ERROR:|WARNING:|DETAIL:|HINT:|CONTEXT:|STATEMENT:|LINE \d+:|PL\/pgSQL|SQL statement|\s)/;

class PsqlSession {
  pid = 0;
  private readonly proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private lines: string[] = [];
  private seq = 0;
  private pending: {
    marker: string;
    resolve: (result: SessionResult) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  constructor(readonly name: string) {
    this.proc = spawn(
      "sh",
      ["-c", "exec psql -X -q -At -v ON_ERROR_STOP=0 2>&1"],
      { env: psqlEnv(), stdio: ["pipe", "pipe", "pipe"] },
    );
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.proc.on("exit", () => {
      const pending = this.pending;
      if (pending) {
        this.pending = null;
        clearTimeout(pending.timer);
        pending.reject(new Error(`${this.name}: psql exited mid-statement`));
      }
    });
  }

  get inFlight(): boolean {
    return this.pending !== null;
  }

  async start(asServiceRole: boolean): Promise<void> {
    const conn = isolatedConnection();
    const identity = await this.run(
      "select pg_catalog.pg_backend_pid()::text || '|' || " +
        "pg_catalog.current_database() || '|' || " +
        "pg_catalog.inet_server_port()::text;",
    );
    expect(identity.errors).toEqual([]);
    const [pid, database, port] = (identity.rows[0] ?? "").split("|");
    expect(database).toBe(conn.database);
    expect(port).toBe(EXPECTED_DISPOSABLE_PORT);
    this.pid = Number(pid);
    expect(this.pid).toBeGreaterThan(0);

    const setup = await this.run(
      [
        `set application_name = 'conn1d_c_${this.name}';`,
        "set lock_timeout = '10s';",
        "set statement_timeout = '20s';",
        "set client_connection_check_interval = '1s';",
        asServiceRole ? "set role service_role;" : "",
      ].join("\n"),
    );
    expect(setup.errors).toEqual([]);
  }

  run(sql: string, timeoutMs = 25_000): Promise<SessionResult> {
    if (this.pending) {
      return Promise.reject(
        new Error(`${this.name}: statement already in flight`),
      );
    }
    this.seq += 1;
    const marker = `__CONN1DC_${this.name}_${this.seq}__`;
    const result = new Promise<SessionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`${this.name}: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending = { marker, resolve, reject, timer };
      this.proc.stdin.write(`${sql}\n\\echo ${marker}\n`);
    });
    result.catch(() => undefined);
    return result;
  }

  async close(): Promise<void> {
    if (this.proc.exitCode !== null || this.proc.signalCode !== null) {
      return;
    }
    const exited = new Promise<void>((resolve) => {
      this.proc.once("exit", () => resolve());
    });
    if (!this.pending) {
      this.proc.stdin.write("rollback;\n\\q\n");
    }
    this.proc.stdin.end();
    const killTimer = setTimeout(() => this.proc.kill("SIGKILL"), 3_000);
    if (this.pending) {
      this.proc.kill("SIGTERM");
    }
    await exited;
    clearTimeout(killTimer);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      const pending = this.pending;
      if (pending && line === pending.marker) {
        this.pending = null;
        clearTimeout(pending.timer);
        const collected = this.lines;
        this.lines = [];
        pending.resolve({
          rows: collected.filter(
            (entry) => entry.length > 0 && !DIAGNOSTIC_LINE.test(entry),
          ),
          errors: collected.filter((entry) => /ERROR:/.test(entry)),
        });
      } else {
        this.lines.push(line);
      }
      index = this.buffer.indexOf("\n");
    }
  }
}

async function waitUntilBlockedBy(
  blocked: PsqlSession,
  ...blockers: PsqlSession[]
): Promise<void> {
  const blockerPids = blockers.map((session) => session.pid).join(",");
  const deadline = Date.now() + BARRIER_TIMEOUT_MS;
  let last = "";
  while (Date.now() < deadline) {
    last = await psqlScalar(`
      select
        (pg_catalog.pg_blocking_pids(${blocked.pid}) && array[${blockerPids}])::text
        || '|' ||
        coalesce((
          select activity.wait_event_type
          from pg_catalog.pg_stat_activity as activity
          where activity.pid = ${blocked.pid}
        ), '')
    `);
    if (last === "true|Lock") {
      expect(blocked.inFlight).toBe(true);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, BARRIER_POLL_MS));
  }
  throw new Error(
    `barrier: ${blocked.name} never blocked by ${blockers
      .map((session) => session.name)
      .join("/")} (last=${last})`,
  );
}

function disconnectSql(
  generation: number | null,
  status: "disconnected" | "revoked",
  reason: "merchant_disconnect" | "uninstall" | "hard_auth_failure",
): string {
  const genSql = generation == null ? "null" : String(generation);
  return `
    select d.outcome
      || '|' || coalesce(d.integration_status, '')
      || '|' || coalesce(d.credential_generation::text, '')
      || '|' || d.vault_present::text
      || '|' || d.external_account_released::text
    from public.disconnect_or_revoke_integration_credentials(
      '${CONC_ORG}'::uuid, '${CONC_INTEG}'::uuid, 'shopify',
      ${genSql}, '${status}', '${reason}'
    ) as d;`;
}

function alphaCreateSql(accessHex: string): string {
  return `
    select r.outcome
    from public.replace_integration_credential_set(
      '${CONC_ORG}'::uuid, '${CONC_INTEG}'::uuid, 'shopify', 'offline_expiring',
      pg_catalog.decode('${accessHex}', 'hex'),
      pg_catalog.decode('0102030405060708090a0b0c', 'hex'),
      pg_catalog.decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
      pg_catalog.decode('bb', 'hex'),
      pg_catalog.decode('1112131415161718191a1b1c', 'hex'),
      pg_catalog.decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
      pg_catalog.decode('cc', 'hex'),
      pg_catalog.decode('2122232425262728292a2b2c', 'hex'),
      pg_catalog.decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
      1, now() + interval '1 hour', now() + interval '30 days',
      'read_products', null
    ) as r;`;
}

function alphaCasSql(generation: number, accessHex: string): string {
  return `
    select r.outcome
    from public.replace_integration_credential_set(
      '${CONC_ORG}'::uuid, '${CONC_INTEG}'::uuid, 'shopify', 'offline_expiring',
      pg_catalog.decode('${accessHex}', 'hex'),
      pg_catalog.decode('0102030405060708090a0b0c', 'hex'),
      pg_catalog.decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
      pg_catalog.decode('ee', 'hex'),
      pg_catalog.decode('1112131415161718191a1b1c', 'hex'),
      pg_catalog.decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
      pg_catalog.decode('ff', 'hex'),
      pg_catalog.decode('2122232425262728292a2b2c', 'hex'),
      pg_catalog.decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
      1, now() + interval '1 hour', now() + interval '30 days',
      'read_products', ${generation}
    ) as r;`;
}

function acquireSql(owner: string): string {
  return `
    select a.acquired::text
      || '|' || coalesce(a.refresh_lock_token, '')
      || '|' || coalesce(a.credential_generation::text, '')
    from public.acquire_integration_credential_refresh_lock(
      '${CONC_ORG}'::uuid, '${CONC_INTEG}'::uuid, 'shopify', '${owner}', 60
    ) as a;`;
}

function rotateSql(
  owner: string,
  token: string,
  generation: number,
  accessHex: string,
): string {
  return `
    select r.outcome || '|' || coalesce(r.credential_generation::text, '')
    from public.rotate_integration_credential_set(
      '${CONC_ORG}'::uuid, '${CONC_INTEG}'::uuid, 'shopify', 'offline_expiring',
      pg_catalog.decode('${accessHex}', 'hex'),
      pg_catalog.decode('0102030405060708090a0b0c', 'hex'),
      pg_catalog.decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
      pg_catalog.decode('ee', 'hex'),
      pg_catalog.decode('1112131415161718191a1b1c', 'hex'),
      pg_catalog.decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
      pg_catalog.decode('ff', 'hex'),
      pg_catalog.decode('2122232425262728292a2b2c', 'hex'),
      pg_catalog.decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
      1, now() + interval '1 hour', now() + interval '30 days',
      'read_products', '${owner}', '${token}', ${generation}
    ) as r;`;
}

function singleRow(result: SessionResult): string {
  expect(result.errors).toEqual([]);
  expect(result.rows).toHaveLength(1);
  return result.rows[0];
}

async function deleteConcurrencyFixture(): Promise<void> {
  await psqlScalar(`
    delete from public.integration_credentials
    where organization_id = '${CONC_ORG}'::uuid;
    delete from public.integration_external_accounts
    where organization_id = '${CONC_ORG}'::uuid;
    delete from public.integrations where organization_id = '${CONC_ORG}'::uuid;
    delete from public.stores where organization_id = '${CONC_ORG}'::uuid;
    delete from public.organizations where id = '${CONC_ORG}'::uuid;
  `);
}

async function seedConcurrencyFixture(options?: {
  withOwnership?: boolean;
}): Promise<void> {
  await psqlScalar(`
    insert into public.organizations (id, name, default_currency, timezone)
    values ('${CONC_ORG}'::uuid, 'CONN-1d-C concurrency org', 'USD', 'UTC');
    insert into public.stores (
      id, organization_id, name, status, currency, timezone
    )
    values (
      '${CONC_STORE}'::uuid, '${CONC_ORG}'::uuid,
      'CONN-1d-C concurrency store', 'active', 'USD', 'UTC'
    );
    insert into public.integrations (
      id, organization_id, store_id, provider, status, display_name
    )
    values (
      '${CONC_INTEG}'::uuid, '${CONC_ORG}'::uuid, '${CONC_STORE}'::uuid,
      'shopify', 'active', 'CONN-1d-C concurrency'
    );
  `);
  const outcome = await psqlScalar(`
    set role service_role;
    select r.outcome
    from public.replace_integration_credential_set(
      '${CONC_ORG}'::uuid, '${CONC_INTEG}'::uuid, 'shopify', 'offline_expiring',
      pg_catalog.decode('${SEED_ACCESS_HEX}', 'hex'),
      pg_catalog.decode('0102030405060708090a0b0c', 'hex'),
      pg_catalog.decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
      pg_catalog.decode('bb', 'hex'),
      pg_catalog.decode('1112131415161718191a1b1c', 'hex'),
      pg_catalog.decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
      pg_catalog.decode('cc', 'hex'),
      pg_catalog.decode('2122232425262728292a2b2c', 'hex'),
      pg_catalog.decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
      1, now() + interval '1 hour', now() + interval '30 days',
      'read_products', null
    ) as r;
  `);
  expect(outcome.split("\n").at(-1)).toBe("inserted");

  if (options?.withOwnership) {
    await psqlScalar(`
      insert into public.integration_external_accounts (
        organization_id, integration_id, provider,
        external_account_id, external_handle,
        ownership_status, verified_at
      )
      values (
        '${CONC_ORG}'::uuid, '${CONC_INTEG}'::uuid, 'shopify',
        'gid://shopify/Shop/conc1dc', 'conn1dc-conc.myshopify.com',
        'active', now()
      );
    `);
  }
}

async function vaultCount(): Promise<number> {
  const raw = await psqlScalar(`
    select count(*)::text from public.integration_credentials
    where organization_id = '${CONC_ORG}'::uuid
      and integration_id = '${CONC_INTEG}'::uuid
  `);
  return Number(raw);
}

async function integrationStatus(): Promise<string> {
  return psqlScalar(`
    select status from public.integrations
    where organization_id = '${CONC_ORG}'::uuid and id = '${CONC_INTEG}'::uuid
  `);
}

async function ownershipStatus(): Promise<string> {
  return psqlScalar(`
    select coalesce(ownership_status, '')
    from public.integration_external_accounts
    where organization_id = '${CONC_ORG}'::uuid
      and integration_id = '${CONC_INTEG}'::uuid
  `);
}

describeLive("SHOPIFY-CONN-1d-C disconnect/revoke (disposable live)", () => {
  beforeAll(async () => {
    const conn = isolatedConnection();
    const identity = await psqlScalar(
      `select current_database() || '|' || current_user || '|' ||
              inet_server_port()::text || '|' ||
              (select setting from pg_settings where name = 'data_directory')`,
    );
    process.stdout.write(`\n[CONN-1d-C] disposable identity: ${identity}\n`);
    expect(identity.startsWith(`${conn.database}|`)).toBe(true);
    expect(identity.split("|")[2]).toBe(EXPECTED_DISPOSABLE_PORT);
    expect(identity).not.toContain("/var/lib/postgresql/data");

    await psqlFile(BOOTSTRAP);
    await psqlFile(MIGRATION_1A);
    await psqlFile(MIGRATION_1C_ALPHA);
    await psqlFile(MIGRATION_1C_BETA);
    await psqlFile(MIGRATION_1D_C);
  }, 120_000);

  afterAll(async () => {
    // Leave disposable DB for owner inspection unless dropped by harness.
  });

  it("applies 1d-C disconnect RPC and terminal-fenced α replace", async () => {
    const present = await psqlScalar(`
      select
        (to_regprocedure(
          'public.disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)'
        ) is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.replace_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,bigint)'
        ) is not null)::text
    `);
    expect(present).toBe("true,true");
  });

  it("keeps vault DML revoked; disconnect EXECUTE service_role only", async () => {
    const tableGranted = await psqlScalar(`
      select coalesce(string_agg(role_name || ':' || priv, ',' order by 1), '')
      from (
        select r.role_name, p.priv
        from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
        where has_table_privilege(
          r.role_name, 'public.integration_credentials', p.priv
        )
      ) as granted
    `);
    expect(tableGranted).toBe("");

    const execMatrix = await psqlScalar(`
      select
        has_function_privilege(
          'service_role',
          'public.disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)',
          'EXECUTE'
        )::text
        || ',' ||
        has_function_privilege(
          'anon',
          'public.disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)',
          'EXECUTE'
        )::text
        || ',' ||
        has_function_privilege(
          'authenticated',
          'public.disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)',
          'EXECUTE'
        )::text
    `);
    expect(execMatrix).toBe("true,false,false");
  });

  it("runs sequential adversarial matrix D1–D14", async () => {
    const output = await psqlFile(ADVERSARIAL);
    expect(output).toMatch(/SHOPIFY-CONN-1d-C ADVERSARIAL PASS/);
  }, 60_000);

  describe("two-connection overlapping transactions", () => {
    let sessionA: PsqlSession;
    let sessionB: PsqlSession;
    let deadlocksBefore = 0;

    beforeEach(async () => {
      deadlocksBefore = Number(
        await psqlScalar(
          `select deadlocks::text from pg_catalog.pg_stat_database
           where datname = current_database()`,
        ),
      );
      await deleteConcurrencyFixture();
      await seedConcurrencyFixture({ withOwnership: true });
      sessionA = new PsqlSession("A");
      sessionB = new PsqlSession("B");
      await sessionA.start(true);
      await sessionB.start(true);
    });

    afterEach(async () => {
      await sessionA?.close();
      await sessionB?.close();
      await deleteConcurrencyFixture();
      const deadlocksAfter = Number(
        await psqlScalar(
          `select deadlocks::text from pg_catalog.pg_stat_database
           where datname = current_database()`,
        ),
      );
      expect(deadlocksAfter).toBe(deadlocksBefore);
    });

    it("R1: overlapping α CAS vs disconnect — gen fence, no silent clear", async () => {
      // Hold integrations row as table owner (service_role has no table DML).
      await sessionA.run("begin; reset role;");
      expect(
        singleRow(
          await sessionA.run(`
            select status from public.integrations
            where id = '${CONC_INTEG}'::uuid for update;
          `),
        ),
      ).toBe("active");

      const pendingB = sessionB.run(
        disconnectSql(1, "disconnected", "merchant_disconnect"),
      );
      await waitUntilBlockedBy(sessionB, sessionA);

      // A CAS under still-active bumps generation 1→2 while B waits with gen=1.
      expect(
        (
          await sessionA.run(`set role service_role; ${alphaCasSql(1, "dd")}`)
        ).rows[0],
      ).toBe("replaced");
      expect(
        (await sessionA.run("commit; set role service_role;")).errors,
      ).toEqual([]);

      const bResult = singleRow(await pendingB);
      expect(bResult.startsWith("conflict|")).toBe(true);
      expect(await vaultCount()).toBe(1);
      expect(await integrationStatus()).toBe("active");
      expect(await ownershipStatus()).toBe("active");
    });

    it("R2: disconnect first then overlapping α create after clear — fenced", async () => {
      await sessionA.run("begin; reset role;");
      expect(
        singleRow(
          await sessionA.run(`
            select status from public.integrations
            where id = '${CONC_INTEG}'::uuid for update;
          `),
        ),
      ).toBe("active");

      const pendingCreate = sessionB.run(alphaCreateSql("dd"));
      await waitUntilBlockedBy(sessionB, sessionA);

      expect(
        (
          await sessionA.run(
            `set role service_role; ${disconnectSql(1, "disconnected", "merchant_disconnect")}`,
          )
        ).rows[0],
      ).toBe("completed|disconnected||false|true");
      expect(
        (await sessionA.run("commit; set role service_role;")).errors,
      ).toEqual([]);

      expect(singleRow(await pendingCreate)).toBe("fenced");
      expect(await vaultCount()).toBe(0);
      expect(await integrationStatus()).toBe("disconnected");
      expect(await ownershipStatus()).toBe("disconnected");
    });

    it("R3: disconnect vs overlapping β acquire — acquire denied after terminal", async () => {
      await sessionA.run("begin; reset role;");
      expect(
        singleRow(
          await sessionA.run(`
            select status from public.integrations
            where id = '${CONC_INTEG}'::uuid for update;
          `),
        ),
      ).toBe("active");

      const pendingAcquire = sessionB.run(acquireSql("race-owner-b"));
      await waitUntilBlockedBy(sessionB, sessionA);

      expect(
        (
          await sessionA.run(
            `set role service_role; ${disconnectSql(1, "revoked", "uninstall")}`,
          )
        ).rows[0],
      ).toBe("completed|revoked||false|true");
      expect(
        (await sessionA.run("commit; set role service_role;")).errors,
      ).toEqual([]);

      const acquire = singleRow(await pendingAcquire);
      expect(acquire.startsWith("false|")).toBe(true);
      expect(await vaultCount()).toBe(0);
      expect(await integrationStatus()).toBe("revoked");
    });

    it("R4: active lease disconnect → lease_held; expiry retry → completed", async () => {
      const acquire = singleRow(await sessionA.run(acquireSql("lease-owner")));
      const [, token, generation] = acquire.split("|");
      expect(token.length).toBeGreaterThan(0);
      expect(generation).toBe("1");

      const held = singleRow(
        await sessionA.run(
          disconnectSql(1, "disconnected", "merchant_disconnect"),
        ),
      );
      expect(held.startsWith("lease_held|disconnected|1|true|false")).toBe(
        true,
      );
      expect(await vaultCount()).toBe(1);
      expect(await ownershipStatus()).toBe("active");

      // β rotate under terminal must fence
      expect(
        singleRow(await sessionA.run(rotateSql("lease-owner", token, 1, "dd"))),
      ).toBe("fenced|");

      await psqlScalar(`
        update public.integration_credentials
        set refresh_lock_claimed_at = clock_timestamp() - interval '120 seconds',
            refresh_lock_expires_at = clock_timestamp() - interval '60 seconds'
        where organization_id = '${CONC_ORG}'::uuid
          and integration_id = '${CONC_INTEG}'::uuid;
      `);

      expect(
        singleRow(
          await sessionA.run(
            disconnectSql(1, "disconnected", "merchant_disconnect"),
          ),
        ),
      ).toBe("completed|disconnected||false|true");
      expect(await vaultCount()).toBe(0);
      expect(await ownershipStatus()).toBe("disconnected");
    });

    it("R5: parallel disconnect/revoke — one completed, other already_terminal/conflict, no deadlock", async () => {
      await sessionA.run("begin; reset role;");
      expect(
        singleRow(
          await sessionA.run(`
            select status from public.integrations
            where id = '${CONC_INTEG}'::uuid for update;
          `),
        ),
      ).toBe("active");

      const pendingB = sessionB.run(
        disconnectSql(1, "revoked", "hard_auth_failure"),
      );
      await waitUntilBlockedBy(sessionB, sessionA);

      expect(
        (
          await sessionA.run(
            `set role service_role; ${disconnectSql(1, "disconnected", "merchant_disconnect")}`,
          )
        ).rows[0],
      ).toBe("completed|disconnected||false|true");
      expect(
        (await sessionA.run("commit; set role service_role;")).errors,
      ).toEqual([]);

      const b = singleRow(await pendingB);
      // After A completed, vault absent → B with gen=1 → conflict.
      expect(b.startsWith("conflict|") || b.startsWith("completed|revoked")).toBe(
        true,
      );
      expect(await vaultCount()).toBe(0);
      expect(["disconnected", "revoked"]).toContain(await integrationStatus());
    });

    it("R6: terminal upgrade with active lease keeps vault; no ownership release", async () => {
      const acquire = singleRow(await sessionA.run(acquireSql("upgrade-owner")));
      expect(acquire.startsWith("true|")).toBe(true);

      expect(
        singleRow(
          await sessionA.run(
            disconnectSql(1, "disconnected", "merchant_disconnect"),
          ),
        ).startsWith("lease_held|disconnected|1|true|false"),
      ).toBe(true);

      expect(
        singleRow(
          await sessionA.run(disconnectSql(1, "revoked", "uninstall")),
        ).startsWith("lease_held|revoked|1|true|false"),
      ).toBe(true);

      expect(await vaultCount()).toBe(1);
      expect(await ownershipStatus()).toBe("active");
      expect(await integrationStatus()).toBe("revoked");
    });
  });

  it("V15 drops disconnect only; α terminal fence retained (unsafe downgrade denied)", async () => {
    // Re-apply 1d-C if a prior local run dropped it; live suite applies once in beforeAll.
    const stillPresent = await psqlScalar(`
      select (to_regprocedure(
        'public.disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)'
      ) is not null)::text
    `);
    if (stillPresent !== "true") {
      await psqlFile(MIGRATION_1D_C);
    }

    const output = await psqlFile(V15_ROLLBACK);
    expect(output).toMatch(/V15 CONN-1d-C rollback PASS/);
    expect(output).toMatch(/unsafe downgrade denied/i);

    const after = await psqlScalar(`
      select
        (to_regprocedure(
          'public.disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)'
        ) is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.replace_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,bigint)'
        ) is not null)::text
    `);
    expect(after).toBe("false,true");
  }, 60_000);
});
