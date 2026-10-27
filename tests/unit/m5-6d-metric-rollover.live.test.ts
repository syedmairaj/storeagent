import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSkuDailyMetricRecomputeExecutor,
  type MetricRecomputeRpcClient,
} from "@/lib/persistence/metric-recompute-queue";

import { holdOrdersLiveLock } from "../support/orders-live-lock";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ALGORITHM = "m5-derived-metrics-v1";
const ORG = "56d60000-0000-4000-8000-000000000001";
const ORG_B = "56d60000-0000-4000-8000-000000000101";
const STORE = "56d60000-0000-4000-8000-000000000002";
const STORE_B = "56d60000-0000-4000-8000-000000000102";
const STORE_C = "56d60000-0000-4000-8000-000000000202";
const LOCATION = "56d60000-0000-4000-8000-000000000003";
const LOCATION_B = "56d60000-0000-4000-8000-000000000103";
const LOCATION_C = "56d60000-0000-4000-8000-000000000203";
const PRODUCT = "56d60000-0000-4000-8000-000000000004";
const PRODUCT_B = "56d60000-0000-4000-8000-000000000104";
const PRODUCT_C = "56d60000-0000-4000-8000-000000000204";
const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;

const AS_OF = "2026-06-15T15:00:00+00";
const METRIC_DAY = "2026-06-15";
const ACTIVITY_AT = "2026-06-01T12:00:00+00";
const GRAIN_COUNT = 1200;

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function variantId(n: number): string {
  return `56d60000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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

async function psqlError(sql: string): Promise<{ code: string; message: string }> {
  try {
    await psql(sql);
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    const match = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr);

    if (match) {
      return { code: match[1], message: match[2] };
    }

    throw error;
  }

  throw new Error("expected SQL to fail");
}

async function rollover(
  limit: number,
  maxStores = 4,
  organizationId: string | null = ORG,
  asOf: string | null = AS_OF,
): Promise<Record<string, number>> {
  const orgLiteral =
    organizationId === null
      ? "null"
      : `${quote(organizationId)}::uuid`;
  const asOfLiteral =
    asOf === null
      ? "null"
      : `${quote(asOf)}::timestamptz`;
  const json = await psql(`
    set role service_role;
    select public.enqueue_sku_daily_metric_daily_rollover(
      ${limit},
      ${maxStores},
      ${orgLiteral},
      ${asOfLiteral}
    )::text;
  `);

  return JSON.parse(json) as Record<string, number>;
}

async function clearWork(): Promise<void> {
  await psql(`
    alter table public.inventory_snapshots
      disable trigger inventory_snapshots_prevent_delete;
    delete from public.order_items
    where organization_id in ${TENANTS};
    delete from public.orders
    where organization_id in ${TENANTS};
    delete from public.return_refunds
    where organization_id in ${TENANTS};
    delete from public.inventory_snapshots
    where organization_id in ${TENANTS};
    alter table public.inventory_snapshots
      enable trigger inventory_snapshots_prevent_delete;
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_recompute_requests
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metrics
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_rollover_enqueues
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_rollover_runs
    where organization_id in ${TENANTS};
  `);
}

async function ensureVariants(count: number): Promise<void> {
  await psql(`
    insert into public.product_variants (
      id, organization_id, store_id, product_id, sku, status
    )
    select
      ('56d60000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
      ${quote(ORG)}::uuid,
      ${quote(STORE)}::uuid,
      ${quote(PRODUCT)}::uuid,
      'D-' || g::text,
      'active'
    from generate_series(1, ${count}) as g
    on conflict do nothing;
  `);
}

async function seedSnapshots(
  count: number,
  observedAt = ACTIVITY_AT,
  storeId = STORE,
  locationId = LOCATION,
  orgId = ORG,
  productId = PRODUCT,
): Promise<void> {
  await psql(`
    insert into public.inventory_snapshots (
      organization_id, store_id, location_id, variant_id,
      observed_at, available_quantity, source
    )
    select
      ${quote(orgId)}::uuid,
      ${quote(storeId)}::uuid,
      ${quote(locationId)}::uuid,
      v.id,
      ${quote(observedAt)}::timestamptz,
      3,
      'csv'
    from public.product_variants as v
    where v.organization_id = ${quote(orgId)}::uuid
      and v.store_id = ${quote(storeId)}::uuid
      and v.product_id = ${quote(productId)}::uuid
    order by v.id
    limit ${count};
  `);
}

function svc(sql: string): Promise<string> {
  return psql(`set role service_role; ${sql}`);
}

const psqlRpcClient: MetricRecomputeRpcClient = {
  rpc(fn, args = {}) {
    const literal = (value: unknown): string => {
      if (value === null || value === undefined) {
        return "null";
      }

      if (typeof value === "number") {
        return String(value);
      }

      if (typeof value === "string") {
        return quote(value);
      }

      return quote(JSON.stringify(value));
    };
    const named = Object.entries(args)
      .map(([key, value]) => `${key} => ${literal(value)}`)
      .join(", ");

    return (async () => {
      try {
        const out = await svc(
          `select pg_catalog.to_jsonb(public.${fn}(${named}))::text`,
        );

        return {
          data: out === "" ? null : JSON.parse(out),
          error: null,
          status: 200,
        };
      } catch (error) {
        const stderr = String((error as { stderr?: string }).stderr ?? "");
        const match = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr);

        return {
          data: null,
          error: {
            code: match?.[1] ?? "",
            message: match?.[2] ?? "psql failed",
          },
          status: 400,
        };
      }
    })();
  },
};

describeLive("M5.6D daily metric rollover", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseOrdersLock = await holdOrdersLiveLock();
    await clearWork();
    await psql(`
      delete from public.product_variants where organization_id in ${TENANTS};
      delete from public.products where organization_id in ${TENANTS};
      delete from public.locations where organization_id in ${TENANTS};
      delete from public.stores where organization_id in ${TENANTS};
      delete from public.organizations where id in ${TENANTS};

      insert into public.organizations (id, name, default_currency, timezone) values
        (${quote(ORG)}::uuid, 'M56D A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'M56D B', 'USD', 'UTC');
      insert into public.stores (id, organization_id, name, status, currency, timezone) values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'A', 'active', 'USD', 'UTC'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'UTC'),
        (${quote(STORE_C)}::uuid, ${quote(ORG)}::uuid, 'C', 'active', 'USD', 'UTC');
      insert into public.locations (id, organization_id, store_id, name, status) values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active'),
        (${quote(LOCATION_C)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE_C)}::uuid, 'C', 'active');
      insert into public.products (id, organization_id, store_id, title, status) values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active'),
        (${quote(PRODUCT_C)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE_C)}::uuid, 'C', 'active');
    `);
    await ensureVariants(GRAIN_COUNT);
    await psql(`
      insert into public.product_variants (
        id, organization_id, store_id, product_id, sku, status
      ) values
        ('56d60000-0000-4000-8000-000000100001'::uuid,
         ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'B1', 'active'),
        ('56d60000-0000-4000-8000-000000200001'::uuid,
         ${quote(ORG)}::uuid, ${quote(STORE_C)}::uuid, ${quote(PRODUCT_C)}::uuid, 'C1', 'active'),
        ('56d60000-0000-4000-8000-000000200002'::uuid,
         ${quote(ORG)}::uuid, ${quote(STORE_C)}::uuid, ${quote(PRODUCT_C)}::uuid, 'C2', 'active')
      on conflict do nothing;
    `);
  }, 300000);

  beforeEach(async () => {
    await clearWork();
  }, 180000);

  afterAll(async () => {
    try {
      await clearWork();
      await psql(`
        delete from public.product_variants where organization_id in ${TENANTS};
        delete from public.products where organization_id in ${TENANTS};
        delete from public.locations where organization_id in ${TENANTS};
        delete from public.stores where organization_id in ${TENANTS};
        delete from public.organizations where id in ${TENANTS};
      `);
    } finally {
      await releaseOrdersLock?.();
    }
  }, 300000);

  it("enqueues 1200 grains with limit 100 without omissions", async () => {
    await seedSnapshots(GRAIN_COUNT);

    let enrolled = 0;
    let completed = 0;

    for (let i = 0; i < 20; i += 1) {
      const result = await rollover(100, 1, ORG, AS_OF);
      enrolled += result.grainsEnrolled;
      completed += result.runsCompleted;

      if (completed > 0) {
        break;
      }
    }

    expect(enrolled).toBe(GRAIN_COUNT);
    expect(completed).toBe(1);
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_enqueues
        where organization_id = ${quote(ORG)}::uuid
          and store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe(String(GRAIN_COUNT));
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
          and dirty_generation = 1
      `),
    ).toBe(String(GRAIN_COUNT));
    expect(
      await psql(`
        select status
        from public.sku_daily_metric_rollover_runs
        where organization_id = ${quote(ORG)}::uuid
          and store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("completed");
  }, 300000);

  it("resumes after a crash without missing or duplicating grains", async () => {
    await seedSnapshots(GRAIN_COUNT);

    for (let i = 0; i < 3; i += 1) {
      const result = await rollover(100, 1, ORG, AS_OF);
      expect(result.grainsEnrolled).toBe(100);
    }

    expect(
      await psql(`
        select enqueued_count::text || ':' || status
        from public.sku_daily_metric_rollover_runs
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("300:in_progress");

    let enrolled = 300;

    for (let i = 0; i < 20; i += 1) {
      const result = await rollover(100, 1, ORG, AS_OF);
      enrolled += result.grainsEnrolled;

      if (result.runsCompleted > 0) {
        break;
      }
    }

    expect(enrolled).toBe(GRAIN_COUNT);
    expect(
      await psql(`
        select sum(dirty_generation)::text
        from public.sku_daily_metric_recompute_requests
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe(String(GRAIN_COUNT));
  }, 300000);

  it("prevents duplicate dirty bumps under concurrent rollover calls", async () => {
    await seedSnapshots(50);

    const sql = `
      set role service_role;
      select public.enqueue_sku_daily_metric_daily_rollover(
        100, 1, ${quote(ORG)}::uuid, ${quote(AS_OF)}::timestamptz
      )::text;
    `;

    const runOnce = () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn("psql", psqlArgs(), {
          env: databaseEnv(),
        });
        let out = "";
        let err = "";
        child.stdout.on("data", (chunk) => {
          out += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          err += String(chunk);
        });
        child.on("close", (code) => {
          if (code === 0) {
            resolve(out.trim());
          } else {
            reject(new Error(err || `psql exited ${code}`));
          }
        });
        child.stdin.write(sql);
        child.stdin.end();
      });

    await Promise.all([runOnce(), runOnce()]);

    expect(
      await psql(`
        select count(*)::text || ':' || coalesce(sum(dirty_generation), 0)::text
          || ':' || coalesce(max(dirty_generation), 0)::text
        from public.sku_daily_metric_recompute_requests
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("50:50:1");
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_enqueues
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("50");
  }, 180000);

  it("leaves newly active grains after cutoff to M5.6B event expansion", async () => {
    await seedSnapshots(50);
    const first = await rollover(50, 1, ORG, AS_OF);
    expect(first.runsCompleted).toBe(1);

    const enrollmentsBefore = await psql(`
      select count(*)::text
      from public.sku_daily_metric_rollover_enqueues
      where store_id = ${quote(STORE)}::uuid
        and metric_date = ${quote(METRIC_DAY)}::date
    `);

    const lateVariant = variantId(60);
    await psql(`
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(lateVariant)}::uuid,
        ${quote(AS_OF)}::timestamptz + interval '1 hour',
        9,
        'csv'
      );
    `);

    await rollover(50, 1, ORG, AS_OF);

    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_enqueues
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe(enrollmentsBefore);
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_enqueues
        where variant_id = ${quote(lateVariant)}::uuid
      `),
    ).toBe("0");

    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_source_events
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(lateVariant)}::uuid
          and consumed_at is null
      `),
    ).not.toBe("0");

    await psql(`
      set role service_role;
      select public.consume_sku_daily_metric_source_events(500, ${quote(ORG)}::uuid);
    `);

    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_recompute_requests
        where store_id = ${quote(STORE)}::uuid
          and variant_id = ${quote(lateVariant)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("1");
  }, 180000);

  it("recovers backdated late-committing source records via capture and consume", async () => {
    // M5.6B expands "today" from clock_timestamp()/now(), so this case uses
    // real store-local today rather than a frozen historical p_as_of.
    const asOfNow = await psql(`select pg_catalog.now()::text`);
    const today = await psql(`
      select (pg_catalog.timezone('UTC', pg_catalog.now()))::date::text
    `);
    const activityAt = await psql(`
      select (pg_catalog.now() - interval '3 days')::text
    `);

    await seedSnapshots(30, activityAt);
    await rollover(10, 1, ORG, asOfNow);

    const earlyVariant = await psql(`
      select id::text
      from public.product_variants
      where store_id = ${quote(STORE)}::uuid
        and product_id = ${quote(PRODUCT)}::uuid
      order by id
      limit 1
    `);

    const cursor = await psql(`
      select cursor_location_id::text || '|' || cursor_variant_id::text
      from public.sku_daily_metric_rollover_runs
      where store_id = ${quote(STORE)}::uuid
        and metric_date = ${quote(today)}::date
    `);

    expect(cursor.includes(LOCATION)).toBe(true);

    await psql(`
      set role service_role;
      select public.consume_sku_daily_metric_source_events(500, ${quote(ORG)}::uuid);
    `);

    const dirtyBefore = await psql(`
      select dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where variant_id = ${quote(earlyVariant)}::uuid
        and metric_date = ${quote(today)}::date
    `);

    expect(Number(dirtyBefore)).toBeGreaterThan(0);

    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '56d60000-0000-4000-8000-000000000901'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'pending',
        ${quote(activityAt)}::timestamptz,
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '56d60000-0000-4000-8000-000000000902'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '56d60000-0000-4000-8000-000000000901'::uuid,
        ${quote(earlyVariant)}::uuid,
        ${quote(LOCATION)}::uuid,
        2
      );
    `);

    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_source_events
        where variant_id = ${quote(earlyVariant)}::uuid
          and consumed_at is null
      `),
    ).not.toBe("0");

    // Cursor has already passed this grain; recovery is via M5.6A/B, not rescan.
    await rollover(100, 1, ORG, asOfNow);

    await psql(`
      set role service_role;
      select public.consume_sku_daily_metric_source_events(500, ${quote(ORG)}::uuid);
    `);

    const dirtyAfter = await psql(`
      select dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where variant_id = ${quote(earlyVariant)}::uuid
        and metric_date = ${quote(today)}::date
    `);

    expect(Number(dirtyAfter)).toBeGreaterThan(Number(dirtyBefore));
  }, 180000);

  it("finishes an unfinished previous day before opening a new local day", async () => {
    await seedSnapshots(250);
    await rollover(100, 1, ORG, AS_OF);

    expect(
      await psql(`
        select status
        from public.sku_daily_metric_rollover_runs
        where metric_date = ${quote(METRIC_DAY)}::date
          and store_id = ${quote(STORE)}::uuid
      `),
    ).toBe("in_progress");

    const nextDay = await rollover(
      100,
      1,
      ORG,
      "2026-06-16T15:00:00+00",
    );

    expect(nextDay.runsOpened).toBe(0);
    expect(nextDay.runsResumed).toBe(1);
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_runs
        where store_id = ${quote(STORE)}::uuid
          and metric_date = '2026-06-16'::date
      `),
    ).toBe("0");

    for (let i = 0; i < 5; i += 1) {
      const result = await rollover(100, 1, ORG, "2026-06-16T15:00:00+00");

      if (result.runsCompleted > 0) {
        break;
      }
    }

    expect(
      await psql(`
        select status
        from public.sku_daily_metric_rollover_runs
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("completed");

    const opened = await rollover(100, 1, ORG, "2026-06-16T15:00:00+00");
    expect(opened.runsOpened).toBe(1);
  }, 180000);

  it("makes fair progress across multiple stores with pending backlog", async () => {
    await seedSnapshots(200);
    await psql(`
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      )
      select
        ${quote(ORG)}::uuid,
        ${quote(STORE_C)}::uuid,
        ${quote(LOCATION_C)}::uuid,
        v.id,
        ${quote(ACTIVITY_AT)}::timestamptz,
        2,
        'csv'
      from public.product_variants as v
      where v.store_id = ${quote(STORE_C)}::uuid;
    `);

    const first = await rollover(100, 2, ORG, AS_OF);
    expect(first.storesSelected).toBe(2);
    expect(first.grainsEnrolled).toBeGreaterThan(0);

    const storeA = await psql(`
      select coalesce(enqueued_count, 0)::text
      from public.sku_daily_metric_rollover_runs
      where store_id = ${quote(STORE)}::uuid
        and metric_date = ${quote(METRIC_DAY)}::date
    `);
    const storeC = await psql(`
      select coalesce(enqueued_count, 0)::text
      from public.sku_daily_metric_rollover_runs
      where store_id = ${quote(STORE_C)}::uuid
        and metric_date = ${quote(METRIC_DAY)}::date
    `);

    expect(Number(storeA)).toBeGreaterThan(0);
    expect(Number(storeC)).toBeGreaterThan(0);
    expect(Number(storeA) + Number(storeC)).toBe(first.grainsEnrolled);
  }, 180000);

  it("computes store-local dates across DST spring and fall", async () => {
    await psql(`
      update public.stores
      set timezone = 'America/New_York'
      where id = ${quote(STORE)}::uuid;
    `);

    try {
      await seedSnapshots(5, "2026-03-08T06:30:00+00");
      const spring = await rollover(
        10,
        1,
        ORG,
        "2026-03-08T10:00:00+00",
      );
      expect(spring.runsOpened + spring.runsResumed).toBeGreaterThan(0);
      expect(
        await psql(`
          select metric_date::text
          from public.sku_daily_metric_rollover_runs
          where store_id = ${quote(STORE)}::uuid
          order by started_at desc
          limit 1
        `),
      ).toBe("2026-03-08");

      await clearWork();
      await seedSnapshots(5, "2026-11-01T05:30:00+00");
      const fall = await rollover(
        10,
        1,
        ORG,
        "2026-11-01T10:00:00+00",
      );
      expect(fall.runsOpened + fall.runsResumed).toBeGreaterThan(0);
      expect(
        await psql(`
          select metric_date::text
          from public.sku_daily_metric_rollover_runs
          where store_id = ${quote(STORE)}::uuid
          order by started_at desc
          limit 1
        `),
      ).toBe("2026-11-01");
    } finally {
      await psql(`
        update public.stores
        set timezone = 'UTC'
        where id = ${quote(STORE)}::uuid;
      `);
    }
  }, 180000);

  it("fails closed on an invalid IANA timezone with zero enqueues", async () => {
    await psql(`
      update public.stores
      set timezone = 'Not/ARealZone'
      where id = ${quote(STORE)}::uuid;
    `);

    try {
      const result = await rollover(10, 1, ORG, AS_OF);
      expect(result.runsFailed).toBe(1);
      expect(
        await psql(`
          select status || ':' || coalesce(fail_reason, '')
          from public.sku_daily_metric_rollover_runs
          where store_id = ${quote(STORE)}::uuid
        `),
      ).toBe("failed:invalid_iana_timezone");
      expect(
        await psql(`
          select count(*)::text
          from public.sku_daily_metric_recompute_requests
          where store_id = ${quote(STORE)}::uuid
        `),
      ).toBe("0");
      expect(
        await psql(`
          select count(*)::text
          from public.sku_daily_metric_rollover_enqueues
          where store_id = ${quote(STORE)}::uuid
        `),
      ).toBe("0");
    } finally {
      await psql(`
        update public.stores
        set timezone = 'UTC'
        where id = ${quote(STORE)}::uuid;
      `);
    }
  }, 120000);

  it("recovers the same store-local day after an invalid timezone is corrected", async () => {
    await seedSnapshots(5);
    await psql(`
      update public.stores
      set timezone = 'Not/ARealZone'
      where id = ${quote(STORE)}::uuid;
    `);

    try {
      const failed = await rollover(10, 1, ORG, AS_OF);
      expect(failed.runsFailed).toBe(1);

      await psql(`
        update public.stores
        set timezone = 'UTC'
        where id = ${quote(STORE)}::uuid;
      `);

      const recovered = await rollover(10, 1, ORG, AS_OF);
      expect(recovered.runsOpened).toBe(1);
      expect(recovered.grainsEnrolled).toBe(5);
      expect(
        await psql(`
          select status || ':' || coalesce(fail_reason, '')
          from public.sku_daily_metric_rollover_runs
          where store_id = ${quote(STORE)}::uuid
            and metric_date = ${quote(METRIC_DAY)}::date
        `),
      ).toBe("completed:");
      expect(
        await psql(`
          select count(*)::text
          from public.sku_daily_metric_rollover_enqueues
          where store_id = ${quote(STORE)}::uuid
            and metric_date = ${quote(METRIC_DAY)}::date
        `),
      ).toBe("5");
    } finally {
      await psql(`
        update public.stores
        set timezone = 'UTC'
        where id = ${quote(STORE)}::uuid;
      `);
    }
  }, 180000);

  it("opens a corrected local date when it differs from the failed UTC key", async () => {
    // 05:00 UTC on 2026-06-15 is still 2026-06-14 in America/Los_Angeles.
    const asOf = "2026-06-15T05:00:00+00";
    await seedSnapshots(3, "2026-06-10T12:00:00+00");
    await psql(`
      update public.stores
      set timezone = 'Not/ARealZone'
      where id = ${quote(STORE)}::uuid;
    `);

    try {
      const failed = await rollover(10, 1, ORG, asOf);
      expect(failed.runsFailed).toBe(1);
      expect(
        await psql(`
          select metric_date::text || ':' || status
          from public.sku_daily_metric_rollover_runs
          where store_id = ${quote(STORE)}::uuid
        `),
      ).toBe("2026-06-15:failed");

      await psql(`
        update public.stores
        set timezone = 'America/Los_Angeles'
        where id = ${quote(STORE)}::uuid;
      `);

      const recovered = await rollover(10, 1, ORG, asOf);
      expect(recovered.runsOpened).toBe(1);
      expect(recovered.grainsEnrolled).toBe(3);
      expect(
        await psql(`
          select string_agg(metric_date::text || ':' || status, ',' order by metric_date)
          from public.sku_daily_metric_rollover_runs
          where store_id = ${quote(STORE)}::uuid
        `),
      ).toBe("2026-06-14:completed,2026-06-15:failed");
    } finally {
      await psql(`
        update public.stores
        set timezone = 'UTC'
        where id = ${quote(STORE)}::uuid;
      `);
    }
  }, 180000);

  it("does not duplicate enrollments under concurrent timezone recovery", async () => {
    await seedSnapshots(20);
    await psql(`
      update public.stores
      set timezone = 'Not/ARealZone'
      where id = ${quote(STORE)}::uuid;
    `);
    await rollover(10, 1, ORG, AS_OF);
    await psql(`
      update public.stores
      set timezone = 'UTC'
      where id = ${quote(STORE)}::uuid;
    `);

    const sql = `
      set role service_role;
      select public.enqueue_sku_daily_metric_daily_rollover(
        100, 1, ${quote(ORG)}::uuid, ${quote(AS_OF)}::timestamptz
      )::text;
    `;

    const runOnce = () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn("psql", psqlArgs(), { env: databaseEnv() });
        let out = "";
        let err = "";
        child.stdout.on("data", (chunk) => {
          out += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          err += String(chunk);
        });
        child.on("close", (code) => {
          if (code === 0) {
            resolve(out.trim());
          } else {
            reject(new Error(err || `psql exited ${code}`));
          }
        });
        child.stdin.write(sql);
        child.stdin.end();
      });

    await Promise.all([runOnce(), runOnce()]);

    expect(
      await psql(`
        select count(*)::text || ':' || coalesce(sum(dirty_generation), 0)::text
          || ':' || coalesce(max(dirty_generation), 0)::text
        from public.sku_daily_metric_recompute_requests
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("20:20:1");
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_enqueues
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("20");
  }, 180000);

  it("does not reopen unrelated failed runs or rewrite completed runs", async () => {
    await seedSnapshots(2);
    await rollover(10, 1, ORG, AS_OF);
    expect(
      await psql(`
        select status
        from public.sku_daily_metric_rollover_runs
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("completed");

    const completedAt = await psql(`
      select completed_at::text
      from public.sku_daily_metric_rollover_runs
      where store_id = ${quote(STORE)}::uuid
        and metric_date = ${quote(METRIC_DAY)}::date
    `);
    const enrollments = await psql(`
      select count(*)::text
      from public.sku_daily_metric_rollover_enqueues
      where store_id = ${quote(STORE)}::uuid
        and metric_date = ${quote(METRIC_DAY)}::date
    `);

    // Unrelated terminal failure on another day (operator-style reason).
    await psql(`
      insert into public.sku_daily_metric_rollover_runs (
        organization_id, store_id, metric_date, algorithm_version,
        status, eligible_cutoff_at, enqueued_count, fail_reason,
        started_at, last_progress_at, created_at, updated_at
      ) values (
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '2026-06-14'::date,
        'm5-derived-metrics-v1',
        'failed',
        ${quote(AS_OF)}::timestamptz,
        0,
        'operator_hold',
        now(),
        now(),
        now(),
        now()
      );
    `);

    await rollover(10, 1, ORG, AS_OF);

    expect(
      await psql(`
        select status || ':' || completed_at::text
        from public.sku_daily_metric_rollover_runs
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe(`completed:${completedAt}`);
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_enqueues
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe(enrollments);
    expect(
      await psql(`
        select status || ':' || fail_reason
        from public.sku_daily_metric_rollover_runs
        where store_id = ${quote(STORE)}::uuid
          and metric_date = '2026-06-14'::date
      `),
    ).toBe("failed:operator_hold");

    // Corrected-day recovery must not reopen operator_hold.
    await psql(`
      update public.stores
      set timezone = 'Not/ARealZone'
      where id = ${quote(STORE)}::uuid;
    `);
    await rollover(10, 1, ORG, "2026-06-14T15:00:00+00");
    await psql(`
      update public.stores
      set timezone = 'UTC'
      where id = ${quote(STORE)}::uuid;
    `);
    await rollover(10, 1, ORG, "2026-06-14T15:00:00+00");
    expect(
      await psql(`
        select status || ':' || fail_reason
        from public.sku_daily_metric_rollover_runs
        where store_id = ${quote(STORE)}::uuid
          and metric_date = '2026-06-14'::date
      `),
    ).toBe("failed:operator_hold");
  }, 180000);

  it("skips historically inactive grains outside the 90-day window", async () => {
    await psql(`
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(variantId(1))}::uuid,
        '2025-01-01T12:00:00+00'::timestamptz,
        1,
        'csv'
      );
    `);

    const result = await rollover(10, 1, ORG, AS_OF);
    expect(result.grainsEnrolled).toBe(0);
    expect(
      await psql(`
        select status
        from public.sku_daily_metric_rollover_runs
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("completed");
  }, 120000);

  it("never writes another organization's rollover or request rows", async () => {
    await seedSnapshots(20);
    await psql(`
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG_B)}::uuid,
        ${quote(STORE_B)}::uuid,
        ${quote(LOCATION_B)}::uuid,
        '56d60000-0000-4000-8000-000000100001'::uuid,
        ${quote(ACTIVITY_AT)}::timestamptz,
        4,
        'csv'
      );
    `);

    await rollover(50, 4, ORG, AS_OF);

    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_runs
        where organization_id = ${quote(ORG_B)}::uuid
      `),
    ).toBe("0");
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG_B)}::uuid
      `),
    ).toBe("0");
  }, 120000);

  it("bumps dirty_generation on claimed requests without clearing the lease", async () => {
    await seedSnapshots(1);
    await rollover(10, 1, ORG, AS_OF);

    await psql(`
      update public.sku_daily_metric_recompute_requests
      set
        status = 'claimed',
        attempt_count = 0,
        lease_owner_id = 'owner-1',
        lease_claim_token = 'token-1',
        lease_claimed_at = now(),
        lease_expires_at = now() + interval '5 minutes',
        claimed_generation = dirty_generation
      where store_id = ${quote(STORE)}::uuid
        and metric_date = ${quote(METRIC_DAY)}::date;
    `);

    // Force a new enrollment attempt by deleting enrollment only — should not
    // be possible through the RPC. Instead open a fresh day after reset of
    // enrollment is not allowed; re-run is no-op. Simulate by direct
    // enrollment delete inside the test tenant only to prove upsert rules
    // when the RPC enrolls again on a new run for the same day after we
    // clear enrollment + completed marker carefully.
    await psql(`
      delete from public.sku_daily_metric_rollover_enqueues
      where store_id = ${quote(STORE)}::uuid;
      delete from public.sku_daily_metric_rollover_runs
      where store_id = ${quote(STORE)}::uuid;
    `);

    const again = await rollover(10, 1, ORG, AS_OF);
    expect(again.grainsEnrolled).toBe(1);

    expect(
      await psql(`
        select status || ':' || lease_claim_token || ':' || dirty_generation::text
        from public.sku_daily_metric_recompute_requests
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("claimed:token-1:2");
  }, 120000);

  it("defers completion while relevant source events remain unconsumed", async () => {
    await seedSnapshots(1);
    await rollover(10, 1, ORG, AS_OF);

    const claim = await psql(`
      set role service_role;
      select coalesce(
        (
          select jsonb_agg(to_jsonb(c))
          from public.claim_sku_daily_metric_recompute_requests(
            'm56d-owner', 1, 120, 4
          ) as c
        ),
        '[]'::jsonb
      )::text;
    `);
    const rows = JSON.parse(claim) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);

    await psql(`
      set role service_role;
      select public.start_sku_daily_metric_recompute(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(String(rows[0].variant_id))}::uuid,
        ${quote(METRIC_DAY)}::date,
        ${quote(ALGORITHM)},
        'm56d-owner',
        ${quote(String(rows[0].lease_claim_token))},
        120
      );
    `);

    const outcome = await psql(`
      set role service_role;
      select public.complete_sku_daily_metric_recompute(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(String(rows[0].variant_id))}::uuid,
        ${quote(METRIC_DAY)}::date,
        ${quote(ALGORITHM)},
        'm56d-owner',
        ${quote(String(rows[0].lease_claim_token))}
      );
    `);

    // Snapshots created unconsumed events; completion must defer.
    expect(outcome).toBe("deferred");
  }, 180000);

  it("runs source-to-persisted-metric end-to-end through rollover and M5.5", async () => {
    await seedSnapshots(1);
    await psql(`
      delete from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid;
    `);
    await rollover(10, 1, ORG, AS_OF);

    const variant = await psql(`
      select variant_id::text
      from public.sku_daily_metric_recompute_requests
      where store_id = ${quote(STORE)}::uuid
        and metric_date = ${quote(METRIC_DAY)}::date
      limit 1
    `);

    const execute = createSkuDailyMetricRecomputeExecutor(psqlRpcClient);
    const result = await execute(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: variant,
        metricDate: METRIC_DAY,
        algorithmVersion: ALGORITHM,
      },
      Date.now() + 40_000,
    );

    expect(result).toEqual({ ok: true });
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metrics
        where organization_id = ${quote(ORG)}::uuid
          and store_id = ${quote(STORE)}::uuid
          and location_id = ${quote(LOCATION)}::uuid
          and variant_id = ${quote(variant)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
          and algorithm_version = ${quote(ALGORITHM)}
      `),
    ).toBe("1");
  }, 180000);

  it("does not double-increment dirty_generation on duplicate enrollment", async () => {
    await seedSnapshots(5);
    const first = await rollover(5, 1, ORG, AS_OF);
    expect(first.grainsEnrolled).toBe(5);
    const second = await rollover(5, 1, ORG, AS_OF);
    expect(second.grainsEnrolled).toBe(0);
    expect(
      await psql(`
        select coalesce(sum(dirty_generation), 0)::text
        from public.sku_daily_metric_recompute_requests
        where store_id = ${quote(STORE)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("5");
  }, 120000);

  it("denies unauthorized RPC execution and direct request writes", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect(
        (
          await psqlError(
            `set role ${role}; select public.enqueue_sku_daily_metric_daily_rollover(1, 1, null, now())`,
          )
        ).code,
      ).toBe("42501");
      expect(
        (
          await psqlError(
            `set role ${role}; select public.sku_daily_metric_rollover_stats()`,
          )
        ).code,
      ).toBe("42501");
    }

    expect(
      (
        await psqlError(
          `set role service_role; update public.sku_daily_metric_rollover_runs set status = 'completed'`,
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await psqlError(
          `set role service_role; insert into public.sku_daily_metric_recompute_requests (
            organization_id, store_id, location_id, variant_id, metric_date,
            algorithm_version, dirty_generation, claimed_generation,
            applied_generation, status, attempt_count, queued_at, updated_at
          ) values (
            ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
            ${quote(variantId(1))}::uuid, ${quote(METRIC_DAY)}::date,
            ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0, now(), now()
          )`,
        )
      ).code,
    ).toBe("42501");

    const privileges = await psql(`
      select pg_catalog.string_agg(
        p.proname || ':' ||
        pg_catalog.has_function_privilege('anon', p.oid, 'execute') || ':' ||
        pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') || ':' ||
        pg_catalog.has_function_privilege('service_role', p.oid, 'execute') || ':' ||
        p.prosecdef || ':' || pg_catalog.array_to_string(p.proconfig, ','),
        ',' order by p.proname
      )
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'enqueue_sku_daily_metric_daily_rollover',
          'sku_daily_metric_rollover_stats'
        )
    `);

    expect(privileges.split(",")).toHaveLength(2);

    for (const entry of privileges.split(",")) {
      expect(entry).toMatch(/:false:false:true:true:search_path=""$/);
    }
  }, 120000);
});
