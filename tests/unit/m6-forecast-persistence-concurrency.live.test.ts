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
 * M6 P3b — genuine multi-session forecast persistence concurrency (local PG17).
 *
 * Proves:
 *   C) Competing same-key writers create exactly one completed result.
 *   D) Same-key altered body never silently replays under contention.
 *   F) Abort / rollback of a losing writer leaves no partial rows.
 *   No global SHARE: Org B commerce write stays available while Org A
 *   persist TX is open after its in-TX snapshot.
 *
 * Remaining race (not claimed solved): commerce may change after the in-TX
 * revalidation snapshot and before commit; publication (P3d) must revalidate.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "61008000-0000-4000-8000-000000000001";
const ORG_B = "61008000-0000-4000-8000-000000000011";
const STORE_A = "61008000-0000-4000-8000-000000000002";
const STORE_B = "61008000-0000-4000-8000-000000000012";
const LOCATION_A = "61008000-0000-4000-8000-000000000003";
const LOCATION_B = "61008000-0000-4000-8000-000000000013";
const PRODUCT_A = "61008000-0000-4000-8000-000000000004";
const PRODUCT_B = "61008000-0000-4000-8000-000000000014";
const VARIANT_A = "61008000-0000-4000-8000-000000000005";
const VARIANT_B = "61008000-0000-4000-8000-000000000015";
const USER_A = "61008000-0000-4000-8000-000000000007";
const ORDER_A = "61008000-0000-4000-8000-000000000021";
const ITEM_A = "61008000-0000-4000-8000-000000000022";
const ORDER_B = "61008000-0000-4000-8000-000000000031";
const ITEM_B = "61008000-0000-4000-8000-000000000032";
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
    dailyDemand: null,
    mode: "unavailable",
    dataSufficiency: "insufficient",
    confidence: "none",
    weightedDailyDemand: null,
    trendApplied: false,
    trendAdjustedDailyDemand: null,
    activeWindows: [],
    quality: { completeDays: 0, incompleteDays: 1 },
    horizons: { leadTimeDemand: null },
    reproducibilityFingerprint: "abcd1234",
    reasonCodes: ["INSUFFICIENT_HISTORY"],
    classifiedDays: [],
    parameters: {},
    provenance: { source: "concurrency" },
    ...overrides,
  };

  return quote(JSON.stringify(body));
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

async function wipeForecastHistory(): Promise<void> {
  // Immutability triggers block DELETE; TRUNCATE bypasses row triggers.
  await psql(`
    truncate table public.sku_forecasts, public.forecast_runs;
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

async function currentToken(): Promise<string> {
  const json = await psql(`
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

  return json.trim();
}

describeLive("M6 P3b forecast persistence concurrency (live)", () => {
  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");

    const def = await psql(`
      select pg_catalog.pg_get_functiondef(
        'public.persist_forecast_sku_demand_result(uuid,uuid,uuid,uuid,date,integer,text,jsonb)'::regprocedure
      )
    `);
    expect(def).toMatch(/forecast_sku_demand_source_snapshot/);
    expect(def).toMatch(/STALE_SOURCE_TOKEN/);
    expect(def.toLowerCase()).not.toMatch(/lock table/);
    expect(def.toLowerCase()).toMatch(/security definer/);

    await clearCommerceAndCorrections();
    await wipeForecastHistory();
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        ${quote(USER_A)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm6-persist-conc@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone) values
        (${quote(ORG_A)}::uuid, 'M6 Persist Conc A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'M6 Persist Conc B', 'USD', 'UTC')
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
        'ev_persist_conc_orders',
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, null, null,
        '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
        'merchant:attestation',
        '2026-07-02T00:00:00Z'::timestamptz,
        '2026-07-02T00:00:00Z'::timestamptz,
        1, null, null, 'persist-conc-orders', null, ${quote(USER_A)}::uuid, null,
        'merchant_day_stream_closure:ev_persist_conc_orders'
      )
      on conflict (evidence_id) do nothing;
    `);
  }, 180000);

  beforeEach(async () => {
    await wipeForecastHistory();
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
    await wipeForecastHistory();
    await clearCommerceAndCorrections();
  }, 180000);

  it("competing same-key writers create exactly one completed result", async () => {
    const token = await currentToken();
    const payload = basePayload();
    const a = await openSession();
    const b = await openSession();

    try {
      await a.run("begin; set role service_role;", "a-ready");
      await b.run("begin; set role service_role;", "b-ready");

      // A inserts first and holds the unique key until commit.
      await a.run(
        `
          select public.persist_forecast_sku_demand_result(
            ${quote(ORG_A)}::uuid,
            ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid,
            ${quote(VARIANT_A)}::uuid,
            ${quote(AS_OF)}::date,
            90,
            ${quote(token)},
            ${payload}::jsonb
          )::text;
        `,
        "a-persisted",
      );

      // B blocks on unique index until A commits; kick it off without awaiting.
      const bPersist = b.run(
        `
          select public.persist_forecast_sku_demand_result(
            ${quote(ORG_A)}::uuid,
            ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid,
            ${quote(VARIANT_A)}::uuid,
            ${quote(AS_OF)}::date,
            90,
            ${quote(token)},
            ${payload}::jsonb
          )::text;
        `,
        "b-persisted",
      );

      await new Promise((resolve) => setTimeout(resolve, 250));
      await a.run("commit;", "a-committed");
      await bPersist;
      await b.run("commit;", "b-committed");

      // JSON prints before the end marker; read from the prior ready marker.
      const aOut = a.readSince("a-ready");
      const bOut = b.readSince("b-ready");
      expect(aOut).toMatch(/"disposition":\s*"created"/);
      expect(bOut).toMatch(/"disposition":\s*"replayed"/);

      expect(
        await psql(`
          select count(*)::text from public.forecast_runs
          where organization_id = ${quote(ORG_A)}::uuid
            and source_token = ${quote(token)}
        `),
      ).toBe("1");
      expect(
        await psql(`
          select count(*)::text from public.sku_forecasts
          where organization_id = ${quote(ORG_A)}::uuid
            and daily_demand is null
        `),
      ).toBe("1");
    } finally {
      await a.close();
      await b.close();
    }
  }, 120000);

  it("same-key altered body under contention never silently replays", async () => {
    const token = await currentToken();
    const good = basePayload();
    const altered = basePayload({
      dailyDemand: 2.5,
      mode: "standard",
      dataSufficiency: "sufficient",
      confidence: "medium",
      reproducibilityFingerprint: "ffff9999",
    });
    const winner = await openSession();
    const loser = await openSession();

    try {
      await winner.run("begin; set role service_role;", "w-ready");
      await loser.run("begin; set role service_role;", "l-ready");

      await winner.run(
        `
          select public.persist_forecast_sku_demand_result(
            ${quote(ORG_A)}::uuid,
            ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid,
            ${quote(VARIANT_A)}::uuid,
            ${quote(AS_OF)}::date,
            90,
            ${quote(token)},
            ${good}::jsonb
          )::text;
        `,
        "w-persisted",
      );

      // Loser blocks on unique key until winner commits, then body-conflicts.
      // Attach catch immediately so ON_ERROR_STOP exit is not an unhandled rejection.
      let loserError = "";
      const loserPersist = loser
        .run(
          `
            select public.persist_forecast_sku_demand_result(
              ${quote(ORG_A)}::uuid,
              ${quote(STORE_A)}::uuid,
              ${quote(LOCATION_A)}::uuid,
              ${quote(VARIANT_A)}::uuid,
              ${quote(AS_OF)}::date,
              90,
              ${quote(token)},
              ${altered}::jsonb
            )::text;
          `,
          "l-persisted",
        )
        .catch((error: unknown) => {
          loserError = String(error);
        });

      await new Promise((resolve) => setTimeout(resolve, 250));
      await winner.run("commit;", "w-committed");
      await loserPersist;

      const loserOut = loser.readSince("l-ready");
      expect(loserError + loserOut).toMatch(/IDEMPOTENCY_BODY_CONFLICT/);
      expect(loserError + loserOut).not.toMatch(
        /"disposition":\s*"replayed"/,
      );

      expect(
        await psql(`
          select count(*)::text from public.forecast_runs
          where organization_id = ${quote(ORG_A)}::uuid
        `),
      ).toBe("1");
      expect(
        await psql(`
          select coalesce(daily_demand::text, 'null')
          from public.sku_forecasts
          where organization_id = ${quote(ORG_A)}::uuid
        `),
      ).toBe("null");
    } finally {
      await winner.close();
      await loser.close();
    }
  }, 120000);

  it("org B commerce write completes while org A persist transaction stays open", async () => {
    const token = await currentToken();
    const payload = basePayload();
    const holder = await openSession();

    try {
      await holder.run(
        `
          begin;
          set role service_role;
          select public.persist_forecast_sku_demand_result(
            ${quote(ORG_A)}::uuid,
            ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid,
            ${quote(VARIANT_A)}::uuid,
            ${quote(AS_OF)}::date,
            90,
            ${quote(token)},
            ${payload}::jsonb
          );
          select pg_catalog.pg_sleep(3);
        `,
        "persist-a-held",
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

      await holder.run("commit;", "persist-a-done");

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

  it("rolled-back persist attempt leaves no partial forecast rows", async () => {
    const token = await currentToken();
    const payload = basePayload({
      reproducibilityFingerprint: "rollback01",
    });
    const session = await openSession();

    try {
      await session.run(
        `
          begin;
          set role service_role;
          select public.persist_forecast_sku_demand_result(
            ${quote(ORG_A)}::uuid,
            ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid,
            ${quote(VARIANT_A)}::uuid,
            ${quote(AS_OF)}::date,
            90,
            ${quote(token)},
            ${payload}::jsonb
          );
        `,
        "persist-uncommitted",
      );

      expect(
        await psql(`
          select count(*)::text from public.forecast_runs
          where organization_id = ${quote(ORG_A)}::uuid
        `),
      ).toBe("0");

      await session.run("rollback;", "persist-rolled");

      expect(
        await psql(`
          select count(*)::text from public.forecast_runs
          where organization_id = ${quote(ORG_A)}::uuid
        `),
      ).toBe("0");
      expect(
        await psql(`
          select count(*)::text from public.sku_forecasts
          where organization_id = ${quote(ORG_A)}::uuid
        `),
      ).toBe("0");
    } finally {
      await session.close();
    }
  }, 120000);
});
