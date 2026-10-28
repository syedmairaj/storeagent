import { execFile, spawn, type ChildProcess } from "node:child_process";
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

import { aggregateInventoryMetrics } from "@/lib/metrics/inventory-aggregates";
import {
  aggregateSales,
  type SalesAggregateInventorySnapshot,
  type SalesAggregateOrder,
  type SalesAggregateOrderItem,
  type SalesAggregateReturnRefund,
} from "@/lib/metrics/sales-aggregates";
import { toPersistedSkuDailyMetric } from "@/lib/metrics/sku-daily-metric-record";

import { holdOrdersLiveLock } from "../support/orders-live-lock";

/**
 * M5.7 Phase 3 — adversarial concurrency / isolation / fencing / rollover.
 *
 * Scenarios T4, T5, T6, T7, T11, T12 from the Phase 1 architecture audit.
 * Local Supabase only (127.0.0.1:55322). Does not enable workers or touch hosted.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ALGORITHM = "m5-derived-metrics-v1";
const ORG = "57a30000-0000-4000-8000-000000000001";
const ORG_B = "57a30000-0000-4000-8000-000000000101";
const STORE = "57a30000-0000-4000-8000-000000000002";
const STORE_B = "57a30000-0000-4000-8000-000000000102";
const LOCATION = "57a30000-0000-4000-8000-000000000003";
const LOCATION_B = "57a30000-0000-4000-8000-000000000103";
const PRODUCT = "57a30000-0000-4000-8000-000000000004";
const PRODUCT_B = "57a30000-0000-4000-8000-000000000104";
const BUSY_VARIANT = "57a30000-0000-4000-8000-000000000010";
const FREE_VARIANT = "57a30000-0000-4000-8000-000000000011";
const COMMIT_VARIANT = "57a30000-0000-4000-8000-000000000012";
const VARIANT_B = "57a30000-0000-4000-8000-000000000110";
const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;

const AS_OF = "2026-06-15T15:00:00+00";
const METRIC_DAY = "2026-06-15";
const ACTIVITY_AT = "2026-06-01T12:00:00+00";

type SourceSnapshot = {
  timeZone: string;
  sourceToken: string;
  orders: SalesAggregateOrder[];
  orderItems: SalesAggregateOrderItem[];
  returnRefunds: SalesAggregateReturnRefund[];
  inventorySnapshots: SalesAggregateInventorySnapshot[];
};

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

function svc(sql: string): Promise<string> {
  return psql(`set role service_role; ${sql}`);
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

interface ClaimRow {
  organization_id: string;
  store_id: string;
  location_id: string;
  variant_id: string;
  metric_date: string;
  lease_claim_token: string;
  claimed_generation: number;
  attempt_count: number;
}

async function claim(
  owner: string,
  limit = 4,
  maxActive = 4,
  organizationId: string | null = null,
): Promise<ClaimRow[]> {
  const orgSql =
    organizationId === null
      ? "null::uuid"
      : `${quote(organizationId)}::uuid`;
  const out = await svc(`
    select coalesce(pg_catalog.json_agg(c), '[]'::json)::text
    from public.claim_sku_daily_metric_recompute_requests(
      ${quote(owner)}, ${limit}, 120, ${maxActive}, ${orgSql}
    ) as c
  `);

  return JSON.parse(out) as ClaimRow[];
}

async function clearWork(): Promise<void> {
  await psql(`
    delete from public.sku_daily_metric_rollover_enqueues
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_rollover_runs
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_recompute_requests
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metrics
    where organization_id in ${TENANTS};
    delete from public.order_items where organization_id in ${TENANTS};
    delete from public.orders where organization_id in ${TENANTS};
    delete from public.return_refunds where organization_id in ${TENANTS};
    alter table public.inventory_snapshots
      disable trigger inventory_snapshots_prevent_delete;
    delete from public.inventory_snapshots where organization_id in ${TENANTS};
    alter table public.inventory_snapshots
      enable trigger inventory_snapshots_prevent_delete;
  `);
}

async function snapshotFor(variantId: string): Promise<SourceSnapshot> {
  const json = await svc(`
    select public.sku_daily_metric_source_snapshot(
      ${quote(ORG)}::uuid,
      ${quote(STORE)}::uuid,
      ${quote(LOCATION)}::uuid,
      ${quote(variantId)}::uuid
    )::text
  `);

  return JSON.parse(json) as SourceSnapshot;
}

function metricFrom(
  variantId: string,
  metricDate: string,
  source: SourceSnapshot,
) {
  const sales = aggregateSales({
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId,
    metricDate,
    timeZone: source.timeZone,
    orders: source.orders,
    orderItems: source.orderItems,
    returnRefunds: source.returnRefunds,
    inventorySnapshots: source.inventorySnapshots,
  });
  const day = sales.days.find((candidate) => candidate.metricDate === metricDate);

  if (day === undefined) {
    throw new Error("missing metric day");
  }

  const inventory = aggregateInventoryMetrics({
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId,
    metricDate,
    timeZone: source.timeZone,
    snapshots: source.inventorySnapshots,
    demand: {
      netUnitsSold: day.netUnitsSold,
      salesVelocity30d: sales.windows[30].velocity,
      days: sales.days,
    },
  });

  return toPersistedSkuDailyMetric(metricDate, source.timeZone, sales, inventory);
}

async function commitMetric(
  variantId: string,
  metricDate: string,
  token: string,
  metric: ReturnType<typeof toPersistedSkuDailyMetric>,
): Promise<string> {
  return svc(`
    select public.commit_sku_daily_metric(
      ${quote(ORG)}::uuid,
      ${quote(STORE)}::uuid,
      ${quote(LOCATION)}::uuid,
      ${quote(variantId)}::uuid,
      ${quote(metricDate)}::date,
      ${quote(token)},
      ${quote(JSON.stringify(metric))}::jsonb
    )::text
  `);
}

describeLive("M5.7 Phase 3 adversarial concurrency", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    // Hard requirement: suite talks only to local published Supabase port.
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");

    releaseOrdersLock = await holdOrdersLiveLock();
    await clearWork();
    await psql(`
      delete from public.product_variants where organization_id in ${TENANTS};
      delete from public.products where organization_id in ${TENANTS};
      delete from public.locations where organization_id in ${TENANTS};
      delete from public.stores where organization_id in ${TENANTS};
      delete from public.organizations where id in ${TENANTS};

      insert into public.organizations (id, name, default_currency, timezone) values
        (${quote(ORG)}::uuid, 'M57P3 A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'M57P3 B', 'USD', 'UTC');
      insert into public.stores (id, organization_id, name, status, currency, timezone) values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'A', 'active', 'USD', 'UTC'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'UTC');
      insert into public.locations (id, organization_id, store_id, name, status) values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');
      insert into public.products (id, organization_id, store_id, title, status) values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');
      insert into public.product_variants (id, organization_id, store_id, product_id, sku, status) values
        (${quote(BUSY_VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'BUSY', 'active'),
        (${quote(FREE_VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'FREE', 'active'),
        (${quote(COMMIT_VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'COMMIT', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'B1', 'active');
    `);
  }, 180000);

  beforeEach(async () => {
    await clearWork();
    const foreign = await psql(`
      select pg_catalog.count(*)
      from public.sku_daily_metric_recompute_requests
      where organization_id not in ${TENANTS}
        and status in ('queued', 'claimed', 'running', 'retry_wait')
    `);

    if (foreign !== "0") {
      throw new Error(
        "Local database has claimable/active requests outside M5.7 Phase 3 tenants. Reset local DB first.",
      );
    }
  }, 120000);

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
  }, 180000);

  it("T4: claims free grain despite 500+ busy-grain queued dates", async () => {
    // M5.7 Phase 3B: busy grains are excluded before LIMIT 500 so free
    // grains remain reachable when global slots remain.
    const base = await psql(
      `select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 600)::text`,
    );

    await psql(`
      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id, metric_date,
        algorithm_version, dirty_generation, claimed_generation,
        applied_generation, status, attempt_count, queued_at,
        lease_owner_id, lease_claim_token, lease_claimed_at, lease_expires_at
      )
      select
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(BUSY_VARIANT)}::uuid,
        (${quote(base)}::date + g.n),
        ${quote(ALGORITHM)},
        1, 1, 0,
        case when g.n = 0 then 'claimed' else 'queued' end,
        0,
        pg_catalog.now() - pg_catalog.make_interval(secs => 1000 - g.n),
        case when g.n = 0 then 'busy-owner' else null end,
        case when g.n = 0 then pg_catalog.gen_random_uuid()::text else null end,
        case when g.n = 0 then pg_catalog.now() else null end,
        case when g.n = 0 then pg_catalog.now() + interval '10 minutes' else null end
      from pg_catalog.generate_series(0, 500) as g(n);

      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id, metric_date,
        algorithm_version, dirty_generation, claimed_generation,
        applied_generation, status, attempt_count, queued_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(FREE_VARIANT)}::uuid, ${quote(base)}::date + 501,
        ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0,
        pg_catalog.now()
      );
    `);

    const active = await psql(`
      select pg_catalog.count(*)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and status in ('claimed', 'running')
        and lease_expires_at > pg_catalog.clock_timestamp()
    `);
    expect(active).toBe("1");

    const claimed = await claim("t4-claimer", 1, 4, ORG);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].variant_id).toBe(FREE_VARIANT);
    expect(claimed[0].organization_id).toBe(ORG);

    expect(
      await psql(`
        select pg_catalog.count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and status in ('claimed', 'running')
          and lease_expires_at > pg_catalog.clock_timestamp()
      `),
    ).toBe("2");

    // Busy grain still has exactly one unexpired active lease.
    expect(
      await psql(`
        select pg_catalog.count(*)::text
        from public.sku_daily_metric_recompute_requests
        where variant_id = ${quote(BUSY_VARIANT)}::uuid
          and status in ('claimed', 'running')
          and lease_expires_at > pg_catalog.clock_timestamp()
      `),
    ).toBe("1");
  }, 180000);

  it("T4b: org-scoped claim ignores foreign work; null-org still sees both", async () => {
    const today = await psql(
      `select (pg_catalog.timezone('UTC', pg_catalog.now()))::date::text`,
    );

    await psql(`
      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id, metric_date,
        algorithm_version, dirty_generation, claimed_generation,
        applied_generation, status, attempt_count, queued_at
      ) values
        (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
          ${quote(FREE_VARIANT)}::uuid, ${quote(today)}::date,
          ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0,
          pg_catalog.now() - interval '2 seconds'
        ),
        (
          ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(LOCATION_B)}::uuid,
          ${quote(VARIANT_B)}::uuid, ${quote(today)}::date,
          ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0,
          pg_catalog.now() - interval '1 second'
        );
    `);

    const scoped = await claim("t4b-org", 4, 4, ORG);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].organization_id).toBe(ORG);
    expect(scoped.every((row) => row.organization_id === ORG)).toBe(true);

    // Release the org-A lease so null-org claim can take org B next.
    await psql(`
      update public.sku_daily_metric_recompute_requests
      set status = 'queued',
          lease_owner_id = null,
          lease_claim_token = null,
          lease_claimed_at = null,
          lease_expires_at = null,
          available_at = null,
          queued_at = pg_catalog.now() - interval '2 seconds'
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(FREE_VARIANT)}::uuid;
    `);

    const global = await claim("t4b-global", 2, 4, null);
    expect(global.map((row) => row.organization_id).sort()).toEqual(
      [ORG, ORG_B].sort(),
    );
  }, 120000);

  it("T4c: concurrent claims never create a second active lease on a busy grain", async () => {
    const dates = await Promise.all([
      psql(`select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 2)::text`),
      psql(`select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 1)::text`),
      psql(`select (pg_catalog.timezone('UTC', pg_catalog.now()))::date::text`),
    ]);

    for (const metricDate of dates) {
      await psql(`
        insert into public.sku_daily_metric_recompute_requests (
          organization_id, store_id, location_id, variant_id, metric_date,
          algorithm_version, dirty_generation, claimed_generation,
          applied_generation, status, attempt_count, queued_at
        ) values (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
          ${quote(BUSY_VARIANT)}::uuid, ${quote(metricDate)}::date,
          ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0, pg_catalog.now()
        );
      `);
    }

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, n) => claim(`t4c-${n}`, 1, 4, ORG)),
    );
    const flat = results.flat();
    expect(flat).toHaveLength(1);
    expect(flat[0].variant_id).toBe(BUSY_VARIANT);

    expect(
      await psql(`
        select pg_catalog.count(*)::text
        from public.sku_daily_metric_recompute_requests
        where variant_id = ${quote(BUSY_VARIANT)}::uuid
          and status in ('claimed', 'running')
          and lease_expires_at > pg_catalog.clock_timestamp()
      `),
    ).toBe("1");
  }, 120000);

  it("T5: SHARE lock during commit blocks concurrent source writes (F2 observation)", async () => {
    // Invariant under observation: table SHARE held by commit path conflicts
    // with ROW EXCLUSIVE source writers. This phase documents contention;
    // it does not change locking.
    const holder = await openSession();

    try {
      await holder.run(
        `begin;
         lock table public.orders in share mode;`,
        "share-held",
      );

      const started = Date.now();
      const writerError = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        insert into public.orders (
          id, organization_id, store_id, status, ordered_at, currency, source
        ) values (
          '57a30000-0000-4000-8000-000000000201'::uuid,
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'completed',
          pg_catalog.now(), 'USD', 'csv'
        );
      `);
      const elapsedMs = Date.now() - started;

      await holder.run("rollback;", "share-released");

      // Documented F2 blast radius: writer hits lock_timeout while SHARE held.
      expect(writerError.code).toBe("55P03");
      expect(elapsedMs).toBeGreaterThanOrEqual(1500);
      expect(writerError.message.toLowerCase()).toMatch(/lock|timeout/);
    } finally {
      await holder.close();
    }
  }, 120000);

  it("T6: stale commit after newer commit with changed sources raises SA008", async () => {
    // Use the commerce activity's store-local date so units_sold is non-zero.
    const metricDate = "2026-06-01";
    const orderId = "57a30000-0000-4000-8000-000000000301";
    const itemId = "57a30000-0000-4000-8000-000000000302";

    await psql(`
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(COMMIT_VARIANT)}::uuid, ${quote(ACTIVITY_AT)}::timestamptz,
        7, 'csv'
      );
    `);

    const stale = await snapshotFor(COMMIT_VARIANT);
    const staleMetric = metricFrom(COMMIT_VARIANT, metricDate, stale);

    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        ${quote(orderId)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'completed', ${quote(ACTIVITY_AT)}::timestamptz, 'USD', 'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        ${quote(itemId)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        ${quote(orderId)}::uuid, ${quote(COMMIT_VARIANT)}::uuid,
        ${quote(LOCATION)}::uuid, 2
      );
    `);

    const fresh = await snapshotFor(COMMIT_VARIANT);
    expect(fresh.sourceToken).not.toBe(stale.sourceToken);
    const freshMetric = metricFrom(COMMIT_VARIANT, metricDate, fresh);
    const freshId = await commitMetric(
      COMMIT_VARIANT,
      metricDate,
      fresh.sourceToken,
      freshMetric,
    );
    expect(freshId.length).toBeGreaterThan(10);

    const staleError = await psqlError(`
      set role service_role;
      select public.commit_sku_daily_metric(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(COMMIT_VARIANT)}::uuid,
        ${quote(metricDate)}::date,
        ${quote(stale.sourceToken)},
        ${quote(JSON.stringify(staleMetric))}::jsonb
      );
    `);
    expect(staleError.code).toBe("SA008");

    expect(
      await psql(`
        select units_sold::text
        from public.sku_daily_metrics
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(COMMIT_VARIANT)}::uuid
          and metric_date = ${quote(metricDate)}::date
          and algorithm_version = ${quote(ALGORITHM)}
      `),
    ).toBe("2");
  }, 180000);

  it("T7: stale commit after newer commit with unchanged sources is idempotent", async () => {
    const metricDate = "2026-06-01";

    await psql(`
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(COMMIT_VARIANT)}::uuid, ${quote(ACTIVITY_AT)}::timestamptz,
        5, 'csv'
      );
    `);

    const first = await snapshotFor(COMMIT_VARIANT);
    const metric = metricFrom(COMMIT_VARIANT, metricDate, first);
    const firstId = await commitMetric(
      COMMIT_VARIANT,
      metricDate,
      first.sourceToken,
      metric,
    );

    const second = await snapshotFor(COMMIT_VARIANT);
    expect(second.sourceToken).toBe(first.sourceToken);
    const secondId = await commitMetric(
      COMMIT_VARIANT,
      metricDate,
      first.sourceToken,
      metric,
    );

    expect(secondId).toBe(firstId);
    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metrics
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(COMMIT_VARIANT)}::uuid
          and metric_date = ${quote(metricDate)}::date
          and algorithm_version = ${quote(ALGORITHM)}
      `),
    ).toBe("1");
    expect(
      await psql(`
        select available_quantity::text
        from public.sku_daily_metrics
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(COMMIT_VARIANT)}::uuid
          and metric_date = ${quote(metricDate)}::date
          and algorithm_version = ${quote(ALGORITHM)}
      `),
    ).toBe("5");
  }, 180000);

  it("T11: org-scoped rollover concurrent with global claim does not cross tenants", async () => {
    await psql(`
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values
        (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
          ${quote(BUSY_VARIANT)}::uuid, ${quote(ACTIVITY_AT)}::timestamptz,
          3, 'csv'
        ),
        (
          ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(LOCATION_B)}::uuid,
          ${quote(VARIANT_B)}::uuid, ${quote(ACTIVITY_AT)}::timestamptz,
          9, 'csv'
        );

      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id, metric_date,
        algorithm_version, dirty_generation, claimed_generation,
        applied_generation, status, attempt_count, queued_at
      ) values (
        ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(LOCATION_B)}::uuid,
        ${quote(VARIANT_B)}::uuid, ${quote(METRIC_DAY)}::date,
        ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0, pg_catalog.now()
      );
    `);

    const beforeB = await psql(`
      select
        (select count(*) from public.sku_daily_metric_rollover_runs
          where organization_id = ${quote(ORG_B)}::uuid)::text
        || ':' ||
        (select count(*) from public.sku_daily_metric_rollover_enqueues
          where organization_id = ${quote(ORG_B)}::uuid)::text
        || ':' ||
        (select coalesce(sum(dirty_generation),0)
          from public.sku_daily_metric_recompute_requests
          where organization_id = ${quote(ORG_B)}::uuid)::text
    `);

    const [rolloverJson, claimed] = await Promise.all([
      svc(`
        select public.enqueue_sku_daily_metric_daily_rollover(
          20, 1, ${quote(ORG)}::uuid, ${quote(AS_OF)}::timestamptz
        )::text
      `),
      claim("t11-global", 1, 4, null),
    ]);

    const rollover = JSON.parse(rolloverJson) as Record<string, number>;
    expect(rollover.grainsEnrolled).toBeGreaterThanOrEqual(1);

    expect(claimed.every((row) => row.organization_id === ORG || row.organization_id === ORG_B)).toBe(
      true,
    );

    const afterB = await psql(`
      select
        (select count(*) from public.sku_daily_metric_rollover_runs
          where organization_id = ${quote(ORG_B)}::uuid)::text
        || ':' ||
        (select count(*) from public.sku_daily_metric_rollover_enqueues
          where organization_id = ${quote(ORG_B)}::uuid)::text
        || ':' ||
        (select coalesce(sum(dirty_generation),0)
          from public.sku_daily_metric_recompute_requests
          where organization_id = ${quote(ORG_B)}::uuid)::text
    `);
    expect(afterB).toBe(beforeB);

    expect(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_rollover_runs
        where organization_id = ${quote(ORG)}::uuid
      `),
    ).not.toBe("0");
  }, 180000);

  it("T12: rollover enrollment while running yields superseded completion", async () => {
    await psql(`
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(FREE_VARIANT)}::uuid, ${quote(ACTIVITY_AT)}::timestamptz,
        4, 'csv'
      );
    `);

    // Clear capture events so completion is not deferred by freshness.
    await psql(`
      delete from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid;
    `);

    const enrolled = await svc(`
      select public.enqueue_sku_daily_metric_daily_rollover(
        10, 1, ${quote(ORG)}::uuid, ${quote(AS_OF)}::timestamptz
      )::text
    `);
    expect(JSON.parse(enrolled).grainsEnrolled).toBeGreaterThanOrEqual(1);

    const [row] = await claim("t12-owner", 1, 4, ORG);
    expect(row.variant_id).toBe(FREE_VARIANT);
    expect(row.claimed_generation).toBe(1);

    await svc(`
      select public.start_sku_daily_metric_recompute(
        ${quote(row.organization_id)}::uuid,
        ${quote(row.store_id)}::uuid,
        ${quote(row.location_id)}::uuid,
        ${quote(row.variant_id)}::uuid,
        ${quote(row.metric_date)}::date,
        ${quote(ALGORITHM)},
        't12-owner',
        ${quote(row.lease_claim_token)},
        120
      )
    `);

    // Re-open enrollment for the same store-day so rollover bumps dirty
    // while the lease remains running.
    await psql(`
      delete from public.sku_daily_metric_rollover_enqueues
      where organization_id = ${quote(ORG)}::uuid;
      delete from public.sku_daily_metric_rollover_runs
      where organization_id = ${quote(ORG)}::uuid;
    `);

    const again = await svc(`
      select public.enqueue_sku_daily_metric_daily_rollover(
        10, 1, ${quote(ORG)}::uuid, ${quote(AS_OF)}::timestamptz
      )::text
    `);
    expect(JSON.parse(again).grainsEnrolled).toBeGreaterThanOrEqual(1);

    expect(
      await psql(`
        select status || ':' || dirty_generation::text || ':' || claimed_generation::text
          || ':' || (lease_claim_token is not null)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(FREE_VARIANT)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("running:2:1:true");

    const outcome = await svc(`
      select public.complete_sku_daily_metric_recompute(
        ${quote(row.organization_id)}::uuid,
        ${quote(row.store_id)}::uuid,
        ${quote(row.location_id)}::uuid,
        ${quote(row.variant_id)}::uuid,
        ${quote(row.metric_date)}::date,
        ${quote(ALGORITHM)},
        't12-owner',
        ${quote(row.lease_claim_token)}
      )
    `);
    expect(outcome).toBe("superseded");
    expect(
      await psql(`
        select status || ':' || dirty_generation::text || ':' || claimed_generation::text
          || ':' || attempt_count::text || ':' || (lease_claim_token is null)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(FREE_VARIANT)}::uuid
          and metric_date = ${quote(METRIC_DAY)}::date
      `),
    ).toBe("queued:2:1:0:true");
  }, 180000);
});
