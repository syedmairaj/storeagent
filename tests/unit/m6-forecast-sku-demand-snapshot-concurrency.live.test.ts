import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

/**
 * M6 P2c.1 — genuine multi-session snapshot concurrency (local PG17 only).
 *
 * Proves:
 *   1) Org A snapshot does not block Org B commerce writes (no global SHARE).
 *   2) Uncommitted corrections are invisible; committed corrections fence;
 *      a correction that commits after a snapshot is outside that token
 *      (publication freshness boundary — not claimed solved).
 *   3) ACCESS EXCLUSIVE blocking the read fails closed via lock_timeout.
 *
 * statement_timeout=15s is set inside the RPC; under ACCESS EXCLUSIVE the
 * tighter lock_timeout=2s aborts first (proven below against the real RPC).
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "61006000-0000-4000-8000-000000000001";
const ORG_B = "61006000-0000-4000-8000-000000000011";
const STORE_A = "61006000-0000-4000-8000-000000000002";
const STORE_B = "61006000-0000-4000-8000-000000000012";
const LOCATION_A = "61006000-0000-4000-8000-000000000003";
const LOCATION_B = "61006000-0000-4000-8000-000000000013";
const PRODUCT_A = "61006000-0000-4000-8000-000000000004";
const PRODUCT_B = "61006000-0000-4000-8000-000000000014";
const VARIANT_A = "61006000-0000-4000-8000-000000000005";
const VARIANT_B = "61006000-0000-4000-8000-000000000015";
const USER_A = "61006000-0000-4000-8000-000000000007";
const ORDER_A = "61006000-0000-4000-8000-000000000021";
const ITEM_A = "61006000-0000-4000-8000-000000000022";
const ORDER_B = "61006000-0000-4000-8000-000000000031";
const ITEM_B = "61006000-0000-4000-8000-000000000032";
const TENANTS = `(${quote(ORG_A)}::uuid, ${quote(ORG_B)}::uuid)`;
const AS_OF = "2026-07-01";

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function psqlArgs(): string[] {
  return [
    "-h", "127.0.0.1",
    "-p", "55322",
    "-U", "postgres",
    "-d", "postgres",
    "-v", "ON_ERROR_STOP=1",
    "-v", "VERBOSITY=verbose",
    "-q", "-t", "-A",
  ];
}

function databaseEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: "postgres" };
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync("psql", [...psqlArgs(), "-c", sql], {
    env: databaseEnv(),
  });

  return stdout.trim();
}

async function psqlError(sql: string): Promise<{ code: string; message: string; elapsedMs: number }> {
  const started = Date.now();

  try {
    await psql(sql);
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    const match = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr);

    if (match) {
      return {
        code: match[1],
        message: match[2],
        elapsedMs: Date.now() - started,
      };
    }

    throw error;
  }

  throw new Error("expected SQL to fail");
}

interface Session {
  run: (sql: string, marker: string) => Promise<void>;
  close: () => Promise<void>;
}

async function openSession(): Promise<Session> {
  const child: ChildProcess = spawn("psql", psqlArgs(), {
    env: databaseEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<void>((resolve) => {
    child.on("exit", () => resolve());
  });

  return {
    async run(sql, marker) {
      child.stdin?.write(`${sql}\nselect '${marker}';\n`);
      const started = Date.now();

      while (!output.includes(marker)) {
        if (child.exitCode !== null || Date.now() - started > 60000) {
          throw new Error(`session did not reach ${marker}: ${output}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    async close() {
      child.stdin?.end();
      await exited;
    },
  };
}

async function clearCommerceAndCorrections(): Promise<void> {
  // Evidence is append-only (DELETE blocked). Local db reset owns wipe.
  await psql(`
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
    delete from public.return_refunds where organization_id in ${TENANTS};
    delete from public.order_items where organization_id in ${TENANTS};
    delete from public.orders where organization_id in ${TENANTS};
  `);
}

async function snapshotOrgA(): Promise<{
  sourceToken: string;
  pendingCorrections: unknown[];
  coverageEvidence: Array<{ pendingCorrection?: boolean }>;
}> {
  const json = await psql(`
    set role service_role;
    select public.forecast_sku_demand_source_snapshot(
      ${quote(ORG_A)}::uuid,
      ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid,
      ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date,
      90
    )::text
  `);

  return JSON.parse(json) as {
    sourceToken: string;
    pendingCorrections: unknown[];
    coverageEvidence: Array<{ pendingCorrection?: boolean }>;
  };
}

describeLive("M6 P2c.1 forecast sku demand snapshot concurrency (live)", () => {
  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");

    const def = await psql(`
      select pg_catalog.pg_get_functiondef(
        'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)'::regprocedure
      )
    `);
    expect(def).toMatch(/statement_timeout/);
    expect(def).toMatch(/'15s'/);
    expect(def).toMatch(/lock_timeout/);
    expect(def).toMatch(/'2s'/);
    expect(def.toLowerCase()).not.toMatch(/lock table/);

    await clearCommerceAndCorrections();
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        ${quote(USER_A)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm6-snap-conc@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone) values
        (${quote(ORG_A)}::uuid, 'M6 Snap Conc A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'M6 Snap Conc B', 'USD', 'UTC')
      on conflict (id) do nothing;
      insert into public.organization_members (organization_id, user_id, role)
      values (${quote(ORG_A)}::uuid, ${quote(USER_A)}::uuid, 'owner')
      on conflict do nothing;
      insert into public.stores (id, organization_id, name, status, currency, timezone) values
        (${quote(STORE_A)}::uuid, ${quote(ORG_A)}::uuid, 'A', 'active', 'USD', 'UTC'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'UTC')
      on conflict (id) do nothing;
      insert into public.locations (id, organization_id, store_id, name, status) values
        (${quote(LOCATION_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, 'A', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active')
      on conflict (id) do nothing;
      insert into public.products (id, organization_id, store_id, title, status) values
        (${quote(PRODUCT_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, 'A', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active')
      on conflict (id) do nothing;
      insert into public.product_variants (id, organization_id, store_id, product_id, sku, status) values
        (${quote(VARIANT_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, ${quote(PRODUCT_A)}::uuid, 'A1', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'B1', 'active')
      on conflict (id) do nothing;

      insert into public.forecast_day_coverage_evidence (
        evidence_id, organization_id, store_id, location_id, variant_id,
        local_date, stream, coverage, trust, source,
        as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
        idempotency_key, integration_id, actor_user_id, provider, closure_id
      ) values (
        'ev_conc_orders',
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, null, null,
        '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
        'merchant:attestation',
        '2026-07-02T00:00:00Z'::timestamptz,
        '2026-07-02T00:00:00Z'::timestamptz,
        1, null, null, 'conc-orders', null, ${quote(USER_A)}::uuid, null,
        'merchant_day_stream_closure:ev_conc_orders'
      )
      on conflict (evidence_id) do nothing;
    `);
  }, 180000);

  beforeEach(async () => {
    await clearCommerceAndCorrections();
    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        ${quote(ORDER_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        'completed', '2026-07-01T12:00:00Z'::timestamptz, 'USD', 'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        ${quote(ITEM_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        ${quote(ORDER_A)}::uuid, ${quote(VARIANT_A)}::uuid, ${quote(LOCATION_A)}::uuid, 3
      );
      -- Commerce capture triggers enqueue corrections; clear so each case
      -- controls pending state explicitly.
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);
  }, 120000);

  afterAll(async () => {
    // Append-only evidence keeps parent FKs; db reset owns final wipe.
    await clearCommerceAndCorrections();
  }, 180000);

  it("org B commerce write completes while org A snapshot transaction stays open", async () => {
    const holder = await openSession();

    try {
      await holder.run(
        `
          begin;
          set role service_role;
          select public.forecast_sku_demand_source_snapshot(
            ${quote(ORG_A)}::uuid,
            ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid,
            ${quote(VARIANT_A)}::uuid,
            ${quote(AS_OF)}::date,
            90
          );
          select pg_catalog.pg_sleep(3);
        `,
        "snap-a-held",
      );

      const started = Date.now();
      await psql(`
        insert into public.orders (
          id, organization_id, store_id, status, ordered_at, currency, source
        ) values (
          ${quote(ORDER_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid,
          'completed', '2026-07-01T12:00:00Z'::timestamptz, 'USD', 'csv'
        );
        insert into public.order_items (
          id, organization_id, store_id, order_id, variant_id, location_id, quantity
        ) values (
          ${quote(ITEM_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid,
          ${quote(ORDER_B)}::uuid, ${quote(VARIANT_B)}::uuid, ${quote(LOCATION_B)}::uuid, 5
        );
      `);
      const elapsedMs = Date.now() - started;

      await holder.run("commit;", "snap-a-done");

      expect(elapsedMs).toBeLessThan(1500);
      expect(
        await psql(`
          select count(*)::text from public.orders
          where id = ${quote(ORDER_B)}::uuid
        `),
      ).toBe("1");
    } finally {
      await holder.close();
    }
  }, 120000);

  it("concurrent correction/read: uncommitted invisible; commit fences; post-snapshot outside prior token", async () => {
    const before = await snapshotOrgA();
    expect(before.pendingCorrections).toHaveLength(0);
    expect(
      before.coverageEvidence.every((row) => row.pendingCorrection === false),
    ).toBe(true);

    const writer = await openSession();

    try {
      await writer.run(
        `
          begin;
          insert into public.forecast_coverage_correction_events (
            organization_id, store_id, stream, local_date,
            location_id, variant_id, business_at, arrived_at,
            source_table, source_op
          ) values (
            ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
            'orders', '2026-07-01',
            null, null,
            '2026-07-01T08:00:00Z'::timestamptz,
            '2026-07-03T00:00:00Z'::timestamptz,
            'order_items', 'update'
          );
        `,
        "corr-uncommitted",
      );

      const mid = await snapshotOrgA();
      expect(mid.pendingCorrections).toHaveLength(0);
      expect(mid.sourceToken).toBe(before.sourceToken);

      await writer.run("commit;", "corr-committed");
    } finally {
      await writer.close();
    }

    const after = await snapshotOrgA();
    expect(after.pendingCorrections.length).toBeGreaterThan(0);
    expect(
      after.coverageEvidence.some((row) => row.pendingCorrection === true),
    ).toBe(true);
    expect(after.sourceToken).not.toBe(before.sourceToken);

    // Publication freshness boundary: prior token does not include the
    // correction that committed after that snapshot statement finished.
    expect(before.sourceToken).not.toBe(after.sourceToken);
  }, 120000);

  it("fail-closes with lock_timeout when ACCESS EXCLUSIVE blocks the snapshot read", async () => {
    const holder = await openSession();

    try {
      await holder.run(
        `
          begin;
          lock table public.order_items in access exclusive mode;
        `,
        "ae-held",
      );

      const error = await psqlError(`
        set role service_role;
        select public.forecast_sku_demand_source_snapshot(
          ${quote(ORG_A)}::uuid,
          ${quote(STORE_A)}::uuid,
          ${quote(LOCATION_A)}::uuid,
          ${quote(VARIANT_A)}::uuid,
          ${quote(AS_OF)}::date,
          90
        );
      `);

      await holder.run("rollback;", "ae-released");

      expect(error.code).toBe("55P03");
      expect(error.elapsedMs).toBeGreaterThanOrEqual(1500);
      expect(error.elapsedMs).toBeLessThan(8000);
      expect(error.message.toLowerCase()).toMatch(/lock|timeout/);
    } finally {
      await holder.close();
    }
  }, 120000);

  it("fail-closes with statement_timeout=15s (RPC binding) when lock_timeout is not the limiter", async () => {
    // Multi-session: ACCESS EXCLUSIVE blocks AccessShare. Apply the RPC's
    // exact statement_timeout (15s) with lock_timeout disabled so the
    // statement budget aborts. Real RPC also sets lock_timeout=2s (proven
    // against forecast_sku_demand_source_snapshot above).
    const holder = await openSession();

    try {
      await holder.run(
        `
          begin;
          lock table public.order_items in access exclusive mode;
        `,
        "ae-held-stmt",
      );

      const error = await psqlError(`
        begin;
        select pg_catalog.set_config('statement_timeout', '15s', true);
        select pg_catalog.set_config('lock_timeout', '0', true);
        select 1 from public.order_items
        where organization_id = ${quote(ORG_A)}::uuid
        limit 1;
      `);

      await holder.run("rollback;", "ae-released-stmt");

      expect(error.code).toBe("57014");
      expect(error.elapsedMs).toBeGreaterThanOrEqual(14000);
      expect(error.elapsedMs).toBeLessThan(25000);
      expect(error.message.toLowerCase()).toMatch(/statement|timeout/);
    } finally {
      await holder.close();
    }
  }, 120000);
});
