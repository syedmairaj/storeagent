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
 * M6 P3d.1 — genuine multi-session publication concurrency (local PG17).
 *
 * Proves pointer races, unrelated-tenant commerce availability, and
 * lock_timeout fail-closed without partial pointer/event mutation.
 *
 * Remaining race (not solved): commerce may change after in-TX revalidation
 * and before commit; pointer is not a freshness claim.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "6100b000-0000-4000-8000-000000000001";
const ORG_B = "6100b000-0000-4000-8000-000000000011";
const STORE_A = "6100b000-0000-4000-8000-000000000002";
const STORE_B = "6100b000-0000-4000-8000-000000000012";
const LOCATION_A = "6100b000-0000-4000-8000-000000000003";
const LOCATION_B = "6100b000-0000-4000-8000-000000000013";
const PRODUCT_A = "6100b000-0000-4000-8000-000000000004";
const PRODUCT_B = "6100b000-0000-4000-8000-000000000014";
const VARIANT_A = "6100b000-0000-4000-8000-000000000005";
const VARIANT_B = "6100b000-0000-4000-8000-000000000015";
const USER_A = "6100b000-0000-4000-8000-000000000007";
const ORDER_A = "6100b000-0000-4000-8000-000000000021";
const ITEM_A = "6100b000-0000-4000-8000-000000000022";
const ORDER_B = "6100b000-0000-4000-8000-000000000031";
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

async function psqlError(
  sql: string,
): Promise<{ code: string; message: string; elapsedMs: number }> {
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

async function wipePublicationState(): Promise<void> {
  await psql(`
    truncate table public.sku_forecast_current,
      public.sku_forecast_publications,
      public.sku_forecasts,
      public.forecast_runs
    cascade;
  `);
}

async function clearCommerceAndCorrections(): Promise<void> {
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
    dailyDemand: 1,
    mode: "standard",
    dataSufficiency: "sufficient",
    confidence: "medium",
    weightedDailyDemand: 1,
    trendApplied: false,
    trendAdjustedDailyDemand: null,
    activeWindows: [],
    quality: { totalDays: 1 },
    horizons: { leadTimeDemand: null },
    reproducibilityFingerprint: "conc0001",
    reasonCodes: [],
    classifiedDays: [],
    parameters: {},
    provenance: { source: "pub-conc" },
    ...overrides,
  };
  return quote(JSON.stringify(body));
}

async function currentToken(): Promise<string> {
  return psql(`
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
}

async function persistRun(
  payloadOverrides: Record<string, unknown> = {},
): Promise<string> {
  const token = await currentToken();
  const json = await psql(`
    set role service_role;
    select public.persist_forecast_sku_demand_result(
      ${quote(ORG_A)}::uuid,
      ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid,
      ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date,
      90,
      ${quote(token)},
      ${basePayload(payloadOverrides)}::jsonb
    )->>'forecastRunId'
  `);
  return json.trim();
}

describeLive("M6 P3d.1 forecast publication concurrency (live)", () => {
  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");

    const def = await psql(`
      select pg_catalog.pg_get_functiondef(
        'public.publish_sku_forecast(uuid)'::regprocedure
      )
    `);
    expect(def).toMatch(/forecast_sku_demand_source_snapshot/);
    expect(def).toMatch(/pg_advisory_xact_lock/);
    expect(def).toMatch(/statement_timeout/);
    expect(def).toMatch(/lock_timeout/);
    expect(def).toMatch(/completed_at/);
    expect(def.toLowerCase()).not.toMatch(/lock table/);

    await wipePublicationState();
    await clearCommerceAndCorrections();
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        ${quote(USER_A)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm6-pub-conc@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      ) on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone) values
        (${quote(ORG_A)}::uuid, 'M6 Pub Conc A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'M6 Pub Conc B', 'USD', 'UTC')
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
        'ev_pub_conc_orders',
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, null, null,
        '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
        'merchant:attestation',
        '2026-07-02T00:00:00Z'::timestamptz,
        '2026-07-02T00:00:00Z'::timestamptz,
        1, null, null, 'pub-conc-orders', null, ${quote(USER_A)}::uuid, null,
        'merchant_day_stream_closure:ev_pub_conc_orders'
      ) on conflict (evidence_id) do nothing;
    `);
  }, 180000);

  beforeEach(async () => {
    await wipePublicationState();
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
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);
  }, 120000);

  afterAll(async () => {
    await wipePublicationState();
    await clearCommerceAndCorrections();
  }, 180000);

  it("first-pointer concurrent publishers serialize to exactly one current", async () => {
    const runA = await persistRun({
      reproducibilityFingerprint: "firsta01",
      configurationVersion: "forecast-config-v1-first-a",
      dailyDemand: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const runB = await persistRun({
      reproducibilityFingerprint: "firstb01",
      configurationVersion: "forecast-config-v1-first-b",
      dailyDemand: 2,
    });

    const completed = await psql(`
      select id::text
      from public.forecast_runs
      where id in (${quote(runA)}::uuid, ${quote(runB)}::uuid)
      order by completed_at desc, id::text desc
      limit 1
    `);

    const a = await openSession();
    const b = await openSession();

    try {
      await a.run("begin; set role service_role;", "a-ready");
      await b.run("begin; set role service_role;", "b-ready");

      // A takes grain advisory + publishes first pointer; B waits on advisory.
      await a.run(
        `select public.publish_sku_forecast(${quote(runA)}::uuid)::text;`,
        "a-published",
      );
      const bPublish = b.run(
        `select public.publish_sku_forecast(${quote(runB)}::uuid)::text;`,
        "b-published",
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      await a.run("commit;", "a-committed");
      await bPublish;
      await b.run("commit;", "b-committed");

      expect(
        await psql(`
          select count(*)::text from public.sku_forecast_current
          where organization_id = ${quote(ORG_A)}::uuid
            and variant_id = ${quote(VARIANT_A)}::uuid
        `),
      ).toBe("1");
      expect(
        await psql(`
          select forecast_run_id::text from public.sku_forecast_current
          where organization_id = ${quote(ORG_A)}::uuid
            and variant_id = ${quote(VARIANT_A)}::uuid
        `),
      ).toBe(completed);
    } finally {
      await a.close();
      await b.close();
    }
  }, 120000);

  it("same-run concurrent publishers yield one published event and one pointer", async () => {
    const runId = await persistRun({
      reproducibilityFingerprint: "race0001",
    });
    const a = await openSession();
    const b = await openSession();

    try {
      await a.run("begin; set role service_role;", "a-ready");
      await b.run("begin; set role service_role;", "b-ready");

      await a.run(
        `select public.publish_sku_forecast(${quote(runId)}::uuid)::text;`,
        "a-published",
      );

      const bPublish = b.run(
        `select public.publish_sku_forecast(${quote(runId)}::uuid)::text;`,
        "b-published",
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      await a.run("commit;", "a-committed");
      await bPublish;
      await b.run("commit;", "b-committed");

      const combined = a.readSince("a-ready") + b.readSince("b-ready");
      expect(combined).toMatch(/"disposition":\s*"published"/);
      expect(combined).toMatch(/"disposition":\s*"replayed"/);

      expect(
        await psql(`
          select count(*)::text from public.sku_forecast_publications
          where forecast_run_id = ${quote(runId)}::uuid
            and outcome = 'published'
        `),
      ).toBe("1");
      expect(
        await psql(`
          select count(*)::text from public.sku_forecast_current
          where organization_id = ${quote(ORG_A)}::uuid
            and forecast_run_id = ${quote(runId)}::uuid
        `),
      ).toBe("1");
    } finally {
      await a.close();
      await b.close();
    }
  }, 120000);

  it("same-token newer configuration supersedes; older completed_at cannot", async () => {
    const older = await persistRun({
      reproducibilityFingerprint: "older001",
      configurationVersion: "forecast-config-v1-older",
      dailyDemand: 1,
      confidence: "medium",
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const newer = await persistRun({
      reproducibilityFingerprint: "newer001",
      configurationVersion: "forecast-config-v1-newer",
      dailyDemand: 2,
      confidence: "low",
    });

    const newerPub = JSON.parse(
      await psql(`
        set role service_role;
        select public.publish_sku_forecast(${quote(newer)}::uuid)::text
      `),
    ) as { disposition: string; m7Eligible: boolean };
    expect(newerPub.disposition).toBe("published");
    expect(newerPub.m7Eligible).toBe(false);

    const olderPub = JSON.parse(
      await psql(`
        set role service_role;
        select public.publish_sku_forecast(${quote(older)}::uuid)::text
      `),
    ) as { disposition: string; withholdReason?: string };
    expect(olderPub.disposition).toBe("withheld");
    expect(olderPub.withholdReason).toBe("OLDER_SOURCE_VERSION");
    expect(
      await psql(`
        select forecast_run_id::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
          and variant_id = ${quote(VARIANT_A)}::uuid
      `),
    ).toBe(newer);
  }, 120000);

  it("older completed_at with different token cannot replace newer current", async () => {
    const older = await persistRun({
      reproducibilityFingerprint: "tokold01",
      configurationVersion: "forecast-config-v1-tok-old",
      dailyDemand: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));

    await psql(`
      update public.order_items
      set quantity = quantity + 1
      where id = ${quote(ITEM_A)}::uuid;
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);

    const newer = await persistRun({
      reproducibilityFingerprint: "toknew01",
      configurationVersion: "forecast-config-v1-tok-new",
      dailyDemand: 3,
    });
    const newerToken = await psql(`
      select source_token from public.forecast_runs
      where id = ${quote(newer)}::uuid
    `);
    const olderToken = await psql(`
      select source_token from public.forecast_runs
      where id = ${quote(older)}::uuid
    `);
    expect(newerToken).not.toBe(olderToken);

    expect(
      JSON.parse(
        await psql(`
          set role service_role;
          select public.publish_sku_forecast(${quote(newer)}::uuid)::text
        `),
      ).disposition,
    ).toBe("published");

    const olderAttempt = JSON.parse(
      await psql(`
        set role service_role;
        select public.publish_sku_forecast(${quote(older)}::uuid)::text
      `),
    ) as { disposition: string; withholdReason?: string };
    expect(olderAttempt.disposition).toBe("withheld");
    expect(["STALE_SOURCE_TOKEN", "OLDER_SOURCE_VERSION"]).toContain(
      olderAttempt.withholdReason,
    );
    expect(
      await psql(`
        select forecast_run_id::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
          and variant_id = ${quote(VARIANT_A)}::uuid
      `),
    ).toBe(newer);
  }, 120000);

  it("pending inserted during grain-lock wait fails closed after post-lock revalidation", async () => {
    const runId = await persistRun({
      reproducibilityFingerprint: "lockpend1",
      configurationVersion: "forecast-config-v1-lockpend",
      dailyDemand: 1,
    });
    const grainKeySql = `pg_catalog.hashtext(
      ${quote(ORG_A)} || chr(31) || ${quote(STORE_A)} || chr(31) ||
      ${quote(LOCATION_A)} || chr(31) || ${quote(VARIANT_A)}
    )`;
    const holder = await openSession();

    try {
      await holder.run(
        `
          begin;
          select pg_catalog.pg_advisory_xact_lock(1347765297, ${grainKeySql});
        `,
        "adv-held",
      );

      const pendingPublish = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return psql(`
          set role service_role;
          select public.publish_sku_forecast(${quote(runId)}::uuid)::text
        `);
      })();

      await new Promise((resolve) => setTimeout(resolve, 300));
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
          '2026-07-04T00:00:00Z'::timestamptz,
          'order_items', 'update'
        );
      `);

      await holder.run("commit;", "adv-released");
      const result = JSON.parse(await pendingPublish) as {
        disposition: string;
        withholdReason?: string;
        pointerAdvanced: boolean;
      };

      expect(result.disposition).toBe("withheld");
      expect(["PENDING_CORRECTION", "STALE_SOURCE_TOKEN"]).toContain(
        result.withholdReason,
      );
      expect(result.pointerAdvanced).toBe(false);
      expect(
        await psql(`
          select count(*)::text from public.sku_forecast_current
          where organization_id = ${quote(ORG_A)}::uuid
            and variant_id = ${quote(VARIANT_A)}::uuid
        `),
      ).toBe("0");
    } finally {
      await holder.close();
    }
  }, 120000);

  it("org B commerce completes while org A publish transaction stays open", async () => {
    const runId = await persistRun({
      reproducibilityFingerprint: "hold0001",
    });
    const holder = await openSession();

    try {
      await holder.run(
        `
          begin;
          set role service_role;
          select public.publish_sku_forecast(${quote(runId)}::uuid);
          select pg_catalog.pg_sleep(3);
        `,
        "pub-held",
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
      const elapsedMs = Date.now() - started;
      await holder.run("commit;", "pub-done");

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

  it("lock_timeout fail-closed leaves no partial pointer or published event", async () => {
    const runId = await persistRun({
      reproducibilityFingerprint: "lock0001",
      configurationVersion: "forecast-config-v1-lock",
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

      const beforePubs = await psql(`
        select count(*)::text from public.sku_forecast_publications
        where organization_id = ${quote(ORG_A)}::uuid
      `);
      const beforeCurrent = await psql(`
        select count(*)::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
      `);

      const error = await psqlError(`
        set role service_role;
        select public.publish_sku_forecast(${quote(runId)}::uuid);
      `);

      await holder.run("rollback;", "ae-released");

      expect(error.code).toBe("55P03");
      expect(error.elapsedMs).toBeGreaterThanOrEqual(1500);
      expect(error.elapsedMs).toBeLessThan(8000);

      expect(
        await psql(`
          select count(*)::text from public.sku_forecast_publications
          where organization_id = ${quote(ORG_A)}::uuid
        `),
      ).toBe(beforePubs);
      expect(
        await psql(`
          select count(*)::text from public.sku_forecast_current
          where organization_id = ${quote(ORG_A)}::uuid
        `),
      ).toBe(beforeCurrent);
    } finally {
      await holder.close();
    }
  }, 120000);
});
