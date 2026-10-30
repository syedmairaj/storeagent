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
 * M6 P3d.3 — genuine multi-session freshness reader concurrency (local PG17).
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "6100d200-0000-4000-8000-000000000001";
const ORG_B = "6100d200-0000-4000-8000-000000000011";
const STORE_A = "6100d200-0000-4000-8000-000000000002";
const STORE_B = "6100d200-0000-4000-8000-000000000012";
const LOCATION_A = "6100d200-0000-4000-8000-000000000003";
const LOCATION_B = "6100d200-0000-4000-8000-000000000013";
const PRODUCT_A = "6100d200-0000-4000-8000-000000000004";
const PRODUCT_B = "6100d200-0000-4000-8000-000000000014";
const VARIANT_A = "6100d200-0000-4000-8000-000000000005";
const VARIANT_B = "6100d200-0000-4000-8000-000000000015";
const USER_A = "6100d200-0000-4000-8000-000000000007";
const ORDER_A = "6100d200-0000-4000-8000-000000000021";
const ITEM_A = "6100d200-0000-4000-8000-000000000022";
const ORDER_B = "6100d200-0000-4000-8000-000000000031";
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

interface Session {
  run: (sql: string, marker: string) => Promise<void>;
  readSince: (marker: string) => string;
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
    readSince(marker) {
      const idx = output.lastIndexOf(marker);
      return idx >= 0 ? output.slice(idx) : output;
    },
    async close() {
      child.stdin?.end();
      await exited;
    },
  };
}

async function wipe(): Promise<void> {
  await psql(`
    truncate table public.sku_forecast_current,
      public.sku_forecast_publications,
      public.sku_forecasts,
      public.forecast_runs
    cascade;
  `);
}

async function clearCommerce(): Promise<void> {
  await psql(`
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
    delete from public.return_refunds where organization_id in ${TENANTS};
    delete from public.order_items where organization_id in ${TENANTS};
    delete from public.orders where organization_id in ${TENANTS};
  `);
}

function basePayload(overrides: Record<string, unknown> = {}): string {
  const body = {
    algorithmVersion: "forecast-orchestrator-v1",
    configurationVersion: "forecast-config-v1",
    algorithmVersions: {
      weightedDemand: "weighted-demand-v1",
      trendAdjustment: "trend-adjustment-v1",
      stockoutCensoring: "stockout-censoring-v1",
      promotionTreatment: "promotion-treatment-v1",
      coldStart: "cold-start-v1",
      confidence: "forecast-confidence-v1",
      horizon: "forecast-horizon-v1",
      backtest: "forecast-backtest-v1",
    },
    organizationId: ORG_A,
    storeId: STORE_A,
    locationId: LOCATION_A,
    variantId: VARIANT_A,
    forecastAsOf: AS_OF,
    dailyDemand: 2,
    mode: "standard",
    dataSufficiency: "sufficient",
    confidence: "medium",
    weightedDailyDemand: 2,
    trendApplied: false,
    trendAdjustedDailyDemand: null,
    activeWindows: [],
    quality: { totalDays: 1 },
    horizons: { leadTimeDemand: null },
    reproducibilityFingerprint: "freshconc1",
    reasonCodes: [],
    classifiedDays: [],
    parameters: {},
    provenance: { source: "fresh-conc" },
    ...overrides,
  };
  return quote(JSON.stringify(body));
}

async function persistAndPublish(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const token = await psql(`
    set role service_role;
    select public.forecast_sku_demand_source_snapshot(
      ${quote(ORG_A)}::uuid,
      ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid,
      ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date,
      90
    )->>'sourceToken'
  `);
  const runId = await psql(`
    set role service_role;
    select public.persist_forecast_sku_demand_result(
      ${quote(ORG_A)}::uuid,
      ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid,
      ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date,
      90,
      ${quote(token)},
      ${basePayload(overrides)}::jsonb
    )->>'forecastRunId'
  `);
  const published = JSON.parse(
    await psql(`
      set role service_role;
      select public.publish_sku_forecast(${quote(runId)}::uuid)::text
    `),
  ) as { disposition: string };
  expect(published.disposition).toBe("published");
  return runId;
}

describeLive("M6 P3d.3 fresh reader concurrency (live)", () => {
  beforeAll(async () => {
    await psql("select 1");
    await wipe();
    await clearCommerce();
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        ${quote(USER_A)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm6-fresh-conc@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      ) on conflict (id) do nothing;
      insert into public.organizations (id, name, default_currency, timezone) values
        (${quote(ORG_A)}::uuid, 'Fresh Conc A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'Fresh Conc B', 'USD', 'UTC')
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
        'fresh-conc-orders',
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, null, null,
        ${quote(AS_OF)}::date, 'orders', 'complete', 'verified_merchant_attestation',
        'merchant:attestation',
        '2026-07-02T00:00:00Z'::timestamptz,
        '2026-07-02T00:00:00Z'::timestamptz,
        1, null, null, 'fresh-conc-orders', null, ${quote(USER_A)}::uuid, null,
        'merchant_day_stream_closure:fresh-conc-orders'
      ), (
        'fresh-conc-returns',
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
        ${quote(AS_OF)}::date, 'returns', 'complete', 'verified_merchant_attestation',
        'merchant:attestation',
        '2026-07-02T00:00:00Z'::timestamptz,
        '2026-07-02T00:00:00Z'::timestamptz,
        1, null, null, 'fresh-conc-returns', null, ${quote(USER_A)}::uuid, null,
        'merchant_day_stream_closure:fresh-conc-returns'
      ) on conflict (evidence_id) do nothing;
    `);
  }, 180000);

  beforeEach(async () => {
    await wipe();
    await clearCommerce();
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
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);
  }, 120000);

  afterAll(async () => {
    await wipe();
    await clearCommerce();
  }, 180000);

  it("reader waits on pointer FOR SHARE while publisher holds FOR UPDATE, then sees advanced pointer", async () => {
    const first = await persistAndPublish({
      reproducibilityFingerprint: "concfirst1",
      configurationVersion: "forecast-config-v1-first",
      dailyDemand: 1,
      weightedDailyDemand: 1,
    });

    await psql(`
      update public.order_items set quantity = quantity + 1
      where id = ${quote(ITEM_A)}::uuid;
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const tokenB = await psql(`
      set role service_role;
      select public.forecast_sku_demand_source_snapshot(
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
        ${quote(AS_OF)}::date, 90
      )->>'sourceToken'
    `);
    const second = await psql(`
      set role service_role;
      select public.persist_forecast_sku_demand_result(
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
        ${quote(AS_OF)}::date, 90, ${quote(tokenB)},
        ${basePayload({
          reproducibilityFingerprint: "concsecnd1",
          configurationVersion: "forecast-config-v1-second",
          dailyDemand: 5,
          weightedDailyDemand: 5,
          confidence: "high",
        })}::jsonb
      )->>'forecastRunId'
    `);

    const publisher = await openSession();
    const reader = await openSession();
    try {
      await publisher.run("begin; set role service_role;", "pub-ready");
      await publisher.run(
        `select public.publish_sku_forecast(${quote(second)}::uuid)::text;`,
        "pub-published",
      );

      await reader.run("begin; set role service_role;", "read-ready");
      const readPromise = reader.run(
        `
          select public.read_fresh_published_sku_forecast(
            ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid
          )::text;
        `,
        "read-done",
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      // Still blocked on FOR SHARE vs publisher's open FOR UPDATE.
      expect(reader.readSince("read-ready")).not.toContain("read-done");

      await publisher.run("commit;", "pub-committed");
      await readPromise;
      await reader.run("commit;", "read-committed");

      const out = reader.readSince("read-ready");
      expect(out).toMatch(/"disposition":\s*"eligible"/);
      expect(out).toContain(second);
      expect(out).not.toContain(first);
      expect(
        await psql(`
          select forecast_run_id::text from public.sku_forecast_current
          where organization_id = ${quote(ORG_A)}::uuid
            and variant_id = ${quote(VARIANT_A)}::uuid
        `),
      ).toBe(second);
    } finally {
      await publisher.close();
      await reader.close();
    }
  }, 180000);

  it("correction inserted before reader fails closed without numeric eligibility", async () => {
    await persistAndPublish({
      reproducibilityFingerprint: "concpend01",
    });

    await psql(`
      insert into public.forecast_coverage_correction_events (
        organization_id, store_id, stream, local_date,
        location_id, variant_id, business_at, arrived_at,
        source_table, source_op
      ) values (
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        'orders', ${quote(AS_OF)}::date,
        null, null,
        '2026-07-01T08:00:00Z'::timestamptz,
        '2026-07-03T00:00:00Z'::timestamptz,
        'order_items', 'update'
      );
    `);

    const result = JSON.parse(
      await psql(`
        set role service_role;
        select public.read_fresh_published_sku_forecast(
          ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
          ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid
        )::text
      `),
    ) as { disposition: string; dailyDemand: number | null; m7NumericEligible: boolean };

    // Token identity includes pending events → STALE after publish.
    expect(["STALE", "PENDING_CORRECTION"]).toContain(result.disposition);
    expect(result.dailyDemand).toBeNull();
    expect(result.m7NumericEligible).toBe(false);
  }, 120000);

  it("org B commerce completes while org A reader transaction holds pointer share", async () => {
    await persistAndPublish({
      reproducibilityFingerprint: "concxb0001",
    });

    const holder = await openSession();
    try {
      await holder.run(
        `
          begin; set role service_role;
          select public.read_fresh_published_sku_forecast(
            ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid
          )::text;
          select pg_catalog.pg_sleep(2);
        `,
        "reader-held",
      );

      const started = Date.now();
      await psql(`
        insert into public.orders (
          id, organization_id, store_id, status, ordered_at, currency, source
        ) values (
          ${quote(ORDER_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid,
          'completed', '2026-07-01T12:00:00Z'::timestamptz, 'USD', 'csv'
        );
      `);
      expect(Date.now() - started).toBeLessThan(1500);

      await holder.run("commit;", "reader-done");
    } finally {
      await holder.close();
    }
  }, 120000);

  it("lock_timeout fail-closed leaves no eligibility claim when snapshot is blocked", async () => {
    await persistAndPublish({
      reproducibilityFingerprint: "conclock01",
    });

    const holder = await openSession();
    try {
      await holder.run(
        `
          begin;
          lock table public.order_items in access exclusive mode;
        `,
        "ae-held",
      );

      const started = Date.now();
      let err = "";
      try {
        await psql(`
          set role service_role;
          select public.read_fresh_published_sku_forecast(
            ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid
          );
        `);
      } catch (error) {
        err = String((error as { stderr?: string }).stderr ?? error);
      }
      const elapsed = Date.now() - started;
      await holder.run("rollback;", "ae-released");

      expect(err).toMatch(/55P03|lock timeout/i);
      expect(elapsed).toBeGreaterThanOrEqual(1500);
      expect(elapsed).toBeLessThan(8000);
    } finally {
      await holder.close();
    }
  }, 120000);
});
