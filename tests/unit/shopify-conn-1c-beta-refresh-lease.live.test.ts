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
 * SHOPIFY-CONN-1c-β — disposable local refresh-lease acceptance.
 *
 * Requires an isolated Postgres (not local Supabase 55322 / 54322).
 *
 * Required env when RUN_CONN1C_ISOLATED_LIVE=1:
 *   CONN1C_PGHOST, CONN1C_PGPORT, CONN1C_PGDATABASE, CONN1C_PGUSER
 * Optional: CONN1C_PGPASSWORD
 *
 * Two-connection race tests drive independent long-lived psql backends over
 * stdin and use pg_blocking_pids() barriers (no sleep-based assertions).
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_CONN1C_ISOLATED_LIVE === "1";
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
const ADVERSARIAL =
  "tests/sql/shopify-conn-1c-beta-refresh-lease-adversarial.sql";
const V15_ROLLBACK =
  "tests/sql/shopify-conn-1c-beta-v15-rollback-additive.sql";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `CONN-1c-β isolated live requires ${name} (no silent 55322 fallback)`,
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
      `CONN-1c-β isolated live refuses port ${port} (existing Supabase DB)`,
    );
  }
  if (database === "postgres" && port === "5432") {
    throw new Error(
      "CONN-1c-β isolated live refuses shared postgres DB; use dedicated disposable database",
    );
  }
  if (port !== EXPECTED_DISPOSABLE_PORT) {
    throw new Error(
      `CONN-1c-β isolated live requires disposable port ${EXPECTED_DISPOSABLE_PORT}, got ${port}`,
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

// -----------------------------------------------------------------------------
// Two-connection harness
// -----------------------------------------------------------------------------

const CONC_ORG = "c0cc1c0b-0000-4000-8000-000000000001";
const CONC_STORE = "c0cc1c0b-0000-4000-8000-000000000002";
const CONC_INTEG = "c0cc1c0b-0000-4000-8000-000000000003";
const OWNER_A = "conc-owner-a";
const OWNER_B = "conc-owner-b";
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
    // stderr merged into stdout so ERROR lines precede the completion marker.
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
        `set application_name = 'conn1c_beta_${this.name}';`,
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
    const marker = `__CONN1C_${this.name}_${this.seq}__`;
    const result = new Promise<SessionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`${this.name}: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending = { marker, resolve, reject, timer };
      this.proc.stdin.write(`${sql}\n\\echo ${marker}\n`);
    });
    // In-flight statements abandoned by a failed test are killed in afterEach.
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

/**
 * Resolves once `blocked` is waiting on a heavyweight lock held by one of
 * `blockers` (row-lock waiters queue behind earlier waiters' tuple locks).
 */
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

async function directlyBlockedBy(
  blocked: PsqlSession,
  blocker: PsqlSession,
): Promise<boolean> {
  const raw = await psqlScalar(
    `select (${blocker.pid} = any(pg_catalog.pg_blocking_pids(${blocked.pid})))::text`,
  );
  return raw === "true";
}

function acquireSql(owner: string): string {
  return `
    select a.acquired::text
      || '|' || coalesce(a.refresh_lock_token, '')
      || '|' || coalesce(a.credential_generation::text, '')
      || '|' || coalesce(pg_catalog.encode(a.access_ciphertext, 'hex'), '')
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

function releaseSql(owner: string, token: string): string {
  return `
    select public.release_integration_credential_refresh_lock(
      '${CONC_ORG}'::uuid, '${CONC_INTEG}'::uuid, 'shopify',
      '${owner}', '${token}'
    );`;
}

const STATUS_UPDATE_SQL = (status: string): string => `
  update public.integrations
  set status = '${status}'
  where organization_id = '${CONC_ORG}'::uuid and id = '${CONC_INTEG}'::uuid;`;

type AcquireRow = {
  acquired: boolean;
  token: string;
  generation: string;
  accessHex: string;
};

function parseAcquire(result: SessionResult): AcquireRow {
  expect(result.errors).toEqual([]);
  expect(result.rows).toHaveLength(1);
  const [acquired, token, generation, accessHex] = result.rows[0].split("|");
  return { acquired: acquired === "true", token, generation, accessHex };
}

function singleRow(result: SessionResult): string {
  expect(result.errors).toEqual([]);
  expect(result.rows).toHaveLength(1);
  return result.rows[0];
}

type VaultState = {
  owner: string;
  token: string;
  generation: number;
  accessHex: string;
  refreshHex: string;
  status: string;
  leaseLive: boolean;
};

async function readVaultState(): Promise<VaultState> {
  const raw = await psqlScalar(`
    select coalesce(c.refresh_lock_owner_id, '')
      || '|' || coalesce(c.refresh_lock_token, '')
      || '|' || c.credential_generation::text
      || '|' || pg_catalog.encode(c.access_ciphertext, 'hex')
      || '|' || pg_catalog.encode(c.refresh_ciphertext, 'hex')
      || '|' || i.status
      || '|' || (
        c.refresh_lock_expires_at is not null
        and c.refresh_lock_expires_at > pg_catalog.clock_timestamp()
      )::text
    from public.integration_credentials as c
    join public.integrations as i
      on i.organization_id = c.organization_id and i.id = c.integration_id
    where c.organization_id = '${CONC_ORG}'::uuid
      and c.integration_id = '${CONC_INTEG}'::uuid
  `);
  const [owner, token, generation, accessHex, refreshHex, status, live] =
    raw.split("|");
  return {
    owner,
    token,
    generation: Number(generation),
    accessHex,
    refreshHex,
    status,
    leaseLive: live === "true",
  };
}

async function deleteConcurrencyFixture(): Promise<void> {
  await psqlScalar(`
    delete from public.integration_credentials
    where organization_id = '${CONC_ORG}'::uuid;
    delete from public.integrations where organization_id = '${CONC_ORG}'::uuid;
    delete from public.stores where organization_id = '${CONC_ORG}'::uuid;
    delete from public.organizations where id = '${CONC_ORG}'::uuid;
  `);
}

async function seedConcurrencyFixture(): Promise<void> {
  await psqlScalar(`
    insert into public.organizations (id, name, default_currency, timezone)
    values ('${CONC_ORG}'::uuid, 'CONN-1c-β concurrency org', 'USD', 'UTC');
    insert into public.stores (
      id, organization_id, name, status, currency, timezone
    )
    values (
      '${CONC_STORE}'::uuid, '${CONC_ORG}'::uuid,
      'CONN-1c-β concurrency store', 'active', 'USD', 'UTC'
    );
    insert into public.integrations (
      id, organization_id, store_id, provider, status, display_name
    )
    values (
      '${CONC_INTEG}'::uuid, '${CONC_ORG}'::uuid, '${CONC_STORE}'::uuid,
      'shopify', 'active', 'CONN-1c-β concurrency'
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
}

async function resetLeaseAndStatus(): Promise<void> {
  await psqlScalar(`
    ${STATUS_UPDATE_SQL("active")}
    update public.integration_credentials
    set refresh_lock_token = null,
        refresh_lock_owner_id = null,
        refresh_lock_claimed_at = null,
        refresh_lock_expires_at = null
    where organization_id = '${CONC_ORG}'::uuid
      and integration_id = '${CONC_INTEG}'::uuid;
  `);
}

/** Fixture time travel: moves the current lease into the past (no sleep). */
async function expireCurrentLease(): Promise<void> {
  await psqlScalar(`
    update public.integration_credentials
    set refresh_lock_claimed_at = pg_catalog.clock_timestamp() - interval '120 seconds',
        refresh_lock_expires_at = pg_catalog.clock_timestamp() - interval '60 seconds'
    where organization_id = '${CONC_ORG}'::uuid
      and integration_id = '${CONC_INTEG}'::uuid
      and refresh_lock_token is not null;
  `);
}

async function integrationRowLockFree(): Promise<boolean> {
  try {
    await psqlScalar(`
      select 1 from public.integrations
      where organization_id = '${CONC_ORG}'::uuid and id = '${CONC_INTEG}'::uuid
      for update nowait
    `);
    return true;
  } catch (error) {
    if (/could not obtain lock/.test(String(error))) {
      return false;
    }
    throw error;
  }
}

describeLive("SHOPIFY-CONN-1c-β refresh lease (disposable live)", () => {
  beforeAll(async () => {
    const conn = isolatedConnection();
    const identity = await psqlScalar(
      `select current_database() || '|' || current_user || '|' ||
              inet_server_port()::text || '|' ||
              (select setting from pg_settings where name = 'data_directory')`,
    );
    process.stdout.write(`\n[CONN-1c-β] disposable identity: ${identity}\n`);
    expect(identity.startsWith(`${conn.database}|`)).toBe(true);
    expect(identity.split("|")[2]).toBe(EXPECTED_DISPOSABLE_PORT);
    expect(identity).not.toContain("/var/lib/postgresql/data");

    await psqlFile(BOOTSTRAP);
    await psqlFile(MIGRATION_1A);
    await psqlFile(MIGRATION_1C_ALPHA);
    await psqlFile(MIGRATION_1C_BETA);
  }, 120_000);

  afterAll(async () => {
    // Leave disposable DB for owner inspection unless dropped by harness.
  });

  it("applies β lease RPCs alongside α", async () => {
    const present = await psqlScalar(`
      select
        (to_regprocedure(
          'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'
        ) is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.rotate_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,text,text,bigint)'
        ) is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.release_integration_credential_refresh_lock(uuid,uuid,text,text,text)'
        ) is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.clear_integration_credentials(uuid,uuid,text,bigint)'
        ) is not null)::text
    `);
    expect(present).toBe("true,true,true,true");
  });

  it("keeps table DML revoked; β RPC EXECUTE service_role only", async () => {
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
          ('public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'),
          ('public.release_integration_credential_refresh_lock(uuid,uuid,text,text,text)')
        ) as f(fn)
        where has_function_privilege(r.role_name, f.fn, 'EXECUTE')
      ) s
    `);
    expect(rpcDenied).toBe("");

    const rpcAllowed = await psqlScalar(`
      select has_function_privilege(
        'service_role',
        'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)',
        'EXECUTE'
      )::text
      || ',' ||
      has_function_privilege(
        'service_role',
        'public.rotate_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,text,text,bigint)',
        'EXECUTE'
      )::text
    `);
    expect(rpcAllowed).toBe("true,true");
  });

  it("runs β sequential single-session adversarial matrix (B1–B14)", async () => {
    const out = await psqlFile(ADVERSARIAL);
    expect(out).toContain("CONN-1c-β adversarial checks PASS");
  });

  describe("two-connection overlapping transactions (V5)", () => {
    let sessionA: PsqlSession;
    let sessionB: PsqlSession;
    let gate: PsqlSession;

    beforeAll(async () => {
      const present = await psqlScalar(`
        select (to_regprocedure(
          'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'
        ) is not null)::text
      `);
      if (present !== "true") {
        await psqlFile(MIGRATION_1C_BETA);
      }
      await deleteConcurrencyFixture();
      await seedConcurrencyFixture();
    }, 60_000);

    afterAll(async () => {
      await deleteConcurrencyFixture();
    }, 30_000);

    beforeEach(async () => {
      await resetLeaseAndStatus();
      sessionA = new PsqlSession("A");
      sessionB = new PsqlSession("B");
      gate = new PsqlSession("GATE");
      await sessionA.start(true);
      await sessionB.start(true);
      await gate.start(false);
      expect(new Set([sessionA.pid, sessionB.pid, gate.pid]).size).toBe(3);
    }, 30_000);

    afterEach(async () => {
      await Promise.all([sessionA.close(), sessionB.close(), gate.close()]);
    }, 30_000);

    it("C1: gate-released simultaneous acquire yields exactly one winner", async () => {
      for (let round = 0; round < 5; round += 1) {
        await resetLeaseAndStatus();
        const before = await readVaultState();

        // Gate holds the integration row so both contenders queue behind it,
        // then are released at the same instant.
        expect(singleRow(await gate.run(`
          begin;
          select 'gate' from public.integrations
          where organization_id = '${CONC_ORG}'::uuid and id = '${CONC_INTEG}'::uuid
          for update;`))).toBe("gate");

        const pendingA = sessionA.run(acquireSql(OWNER_A));
        const pendingB = sessionB.run(acquireSql(OWNER_B));
        await waitUntilBlockedBy(sessionA, gate, sessionB);
        await waitUntilBlockedBy(sessionB, gate, sessionA);
        expect(
          (await directlyBlockedBy(sessionA, gate)) ||
            (await directlyBlockedBy(sessionB, gate)),
        ).toBe(true);

        expect((await gate.run("commit;")).errors).toEqual([]);
        const [resultA, resultB] = await Promise.all([pendingA, pendingB]);
        const rowA = parseAcquire(resultA);
        const rowB = parseAcquire(resultB);

        expect([rowA.acquired, rowB.acquired].filter(Boolean)).toHaveLength(1);
        const [winner, loser, winnerOwner] = rowA.acquired
          ? [rowA, rowB, OWNER_A]
          : [rowB, rowA, OWNER_B];
        expect(winner.token).not.toBe("");
        expect(winner.accessHex).toBe(before.accessHex);
        expect(loser).toEqual({
          acquired: false,
          token: "",
          generation: "",
          accessHex: "",
        });

        const after = await readVaultState();
        expect(after.owner).toBe(winnerOwner);
        expect(after.token).toBe(winner.token);
        expect(after.leaseLive).toBe(true);
        expect(after.generation).toBe(before.generation);
        expect(after.accessHex).toBe(before.accessHex);
      }
    }, 60_000);

    it("C2: acquire blocks on credential row lock held by another tx; no double winner", async () => {
      expect(await integrationRowLockFree()).toBe(true);

      // A holds only the credential row lock (release locks credentials only).
      await sessionA.run("begin;");
      expect(
        singleRow(await sessionA.run(releaseSql(OWNER_A, "not-a-live-token"))),
      ).toBe("fenced");
      expect(await integrationRowLockFree()).toBe(true);

      const pendingB = sessionB.run(acquireSql(OWNER_B));
      await waitUntilBlockedBy(sessionB, sessionA);
      // B now owns the integration row lock and is parked on the credential row.
      expect(await integrationRowLockFree()).toBe(false);

      expect((await sessionA.run("commit;")).errors).toEqual([]);
      const rowB = parseAcquire(await pendingB);
      expect(rowB.acquired).toBe(true);

      const lateA = parseAcquire(await sessionA.run(acquireSql(OWNER_A)));
      expect(lateA).toEqual({
        acquired: false,
        token: "",
        generation: "",
        accessHex: "",
      });

      const after = await readVaultState();
      expect(after.owner).toBe(OWNER_B);
      expect(after.token).toBe(rowB.token);
      expect(after.leaseLive).toBe(true);
    }, 60_000);

    it("C3: expired-lease takeover fences previous owner's overlapping rotate", async () => {
      const rowA = parseAcquire(await sessionA.run(acquireSql(OWNER_A)));
      expect(rowA.acquired).toBe(true);
      await expireCurrentLease();
      const before = await readVaultState();

      await sessionB.run("begin;");
      const rowB = parseAcquire(await sessionB.run(acquireSql(OWNER_B)));
      expect(rowB.acquired).toBe(true);
      expect(rowB.token).not.toBe(rowA.token);

      const pendingRotateA = sessionA.run(
        rotateSql(OWNER_A, rowA.token, Number(rowA.generation), "d1"),
      );
      await waitUntilBlockedBy(sessionA, sessionB);

      expect((await sessionB.run("commit;")).errors).toEqual([]);
      expect(singleRow(await pendingRotateA)).toBe("fenced|");

      const after = await readVaultState();
      expect(after.owner).toBe(OWNER_B);
      expect(after.token).toBe(rowB.token);
      expect(after.leaseLive).toBe(true);
      expect(after.generation).toBe(before.generation);
      expect(after.accessHex).toBe(before.accessHex);
      expect(after.refreshHex).toBe(before.refreshHex);
    }, 60_000);

    it("C4: previous owner's overlapping release cannot clear successor lease", async () => {
      const rowA = parseAcquire(await sessionA.run(acquireSql(OWNER_A)));
      expect(rowA.acquired).toBe(true);
      await expireCurrentLease();
      const before = await readVaultState();

      await sessionB.run("begin;");
      const rowB = parseAcquire(await sessionB.run(acquireSql(OWNER_B)));
      expect(rowB.acquired).toBe(true);

      const pendingReleaseA = sessionA.run(releaseSql(OWNER_A, rowA.token));
      await waitUntilBlockedBy(sessionA, sessionB);

      expect((await sessionB.run("commit;")).errors).toEqual([]);
      expect(singleRow(await pendingReleaseA)).toBe("fenced");

      const held = await readVaultState();
      expect(held.owner).toBe(OWNER_B);
      expect(held.token).toBe(rowB.token);
      expect(held.leaseLive).toBe(true);
      expect(held.generation).toBe(before.generation);

      // Late stale rotate also loses; successor then rotates cleanly.
      expect(
        singleRow(
          await sessionA.run(
            rotateSql(OWNER_A, rowA.token, before.generation, "d2"),
          ),
        ),
      ).toBe("fenced|");
      expect(
        singleRow(
          await sessionB.run(
            rotateSql(OWNER_B, rowB.token, before.generation, "d3"),
          ),
        ),
      ).toBe(`rotated|${before.generation + 1}`);

      const after = await readVaultState();
      expect(after.generation).toBe(before.generation + 1);
      expect(after.accessHex).toBe("d3");
      expect(after.owner).toBe("");
      expect(after.token).toBe("");
      expect(after.leaseLive).toBe(false);
    }, 60_000);

    it("C5a: terminal status commit first → overlapping rotate fenced, vault intact", async () => {
      const rowA = parseAcquire(await sessionA.run(acquireSql(OWNER_A)));
      expect(rowA.acquired).toBe(true);
      const before = await readVaultState();

      await sessionB.run("begin; reset role;");
      expect((await sessionB.run(STATUS_UPDATE_SQL("disconnected"))).errors).toEqual([]);

      const pendingRotateA = sessionA.run(
        rotateSql(OWNER_A, rowA.token, Number(rowA.generation), "d4"),
      );
      await waitUntilBlockedBy(sessionA, sessionB);

      expect((await sessionB.run("commit; set role service_role;")).errors).toEqual([]);
      const rotateA = await pendingRotateA;
      expect(rotateA.errors).toEqual([]);
      expect(singleRow(rotateA)).toBe("fenced|");

      const after = await readVaultState();
      expect(after.status).toBe("disconnected");
      expect(after.generation).toBe(before.generation);
      expect(after.accessHex).toBe(before.accessHex);
      expect(after.refreshHex).toBe(before.refreshHex);
      expect(after.owner).toBe(OWNER_A);
      expect(after.token).toBe(rowA.token);

      const lateB = parseAcquire(await sessionB.run(acquireSql(OWNER_B)));
      expect(lateB.acquired).toBe(false);
      expect(lateB.token).toBe("");
    }, 60_000);

    it("C5b: rotate commit first → overlapping terminal status waits, then applies; no deadlock", async () => {
      const rowA = parseAcquire(await sessionA.run(acquireSql(OWNER_A)));
      expect(rowA.acquired).toBe(true);
      const before = await readVaultState();

      await sessionA.run("begin;");
      expect(
        singleRow(
          await sessionA.run(
            rotateSql(OWNER_A, rowA.token, Number(rowA.generation), "d5"),
          ),
        ),
      ).toBe(`rotated|${before.generation + 1}`);

      const pendingStatusB = sessionB.run(
        `reset role; ${STATUS_UPDATE_SQL("revoked")} set role service_role;`,
      );
      await waitUntilBlockedBy(sessionB, sessionA);

      expect((await sessionA.run("commit;")).errors).toEqual([]);
      expect((await pendingStatusB).errors).toEqual([]);

      const after = await readVaultState();
      expect(after.status).toBe("revoked");
      expect(after.generation).toBe(before.generation + 1);
      expect(after.accessHex).toBe("d5");
      expect(after.leaseLive).toBe(false);
      expect(after.owner).toBe("");

      const lateA = parseAcquire(await sessionA.run(acquireSql(OWNER_A)));
      expect(lateA.acquired).toBe(false);
    }, 60_000);

    it("C5c: non-terminal status change serializes with rotate (not over-fenced)", async () => {
      const rowA = parseAcquire(await sessionA.run(acquireSql(OWNER_A)));
      expect(rowA.acquired).toBe(true);
      const before = await readVaultState();

      await sessionB.run("begin; reset role;");
      expect((await sessionB.run(STATUS_UPDATE_SQL("degraded"))).errors).toEqual([]);

      const pendingRotateA = sessionA.run(
        rotateSql(OWNER_A, rowA.token, Number(rowA.generation), "d6"),
      );
      await waitUntilBlockedBy(sessionA, sessionB);

      expect((await sessionB.run("commit; set role service_role;")).errors).toEqual([]);
      expect(singleRow(await pendingRotateA)).toBe(
        `rotated|${before.generation + 1}`,
      );

      const after = await readVaultState();
      expect(after.status).toBe("degraded");
      expect(after.generation).toBe(before.generation + 1);
      expect(after.accessHex).toBe("d6");
      expect(after.leaseLive).toBe(false);
    }, 60_000);
  });

  it("V15: dropping β RPCs leaves α + CONN-1a + M2.6 intact", async () => {
    const out = await psqlFile(V15_ROLLBACK);
    expect(out).toContain("V15 CONN-1c-β rollback PASS");

    const remaining = await psqlScalar(`
      select
        (to_regclass('public.integrations') is not null)::text
        || ',' ||
        (to_regclass('public.integration_credentials') is not null)::text
        || ',' ||
        (to_regprocedure(
          'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'
        ) is null)::text
        || ',' ||
        (to_regprocedure(
          'public.load_integration_credential_envelope(uuid,uuid,text)'
        ) is not null)::text
        || ',' ||
        (exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'integration_credentials'
            and column_name = 'credential_generation'
        ))::text
    `);
    expect(remaining).toBe("true,true,true,true,true");
  });
});
