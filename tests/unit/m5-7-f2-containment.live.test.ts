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
 * M5.7 Phase 5B — F2 production containment adversarial tests (C1–C7).
 *
 * Local Supabase only (127.0.0.1:55322). Does not enable workers, cron,
 * or HTTP routes. Does not touch hosted or the E.4 canary.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ALGORITHM = "m5-derived-metrics-v1";
const ORG = "57b50000-0000-4000-8000-000000000001";
const ORG_B = "57b50000-0000-4000-8000-000000000101";
const STORE = "57b50000-0000-4000-8000-000000000002";
const STORE_B = "57b50000-0000-4000-8000-000000000102";
const LOCATION = "57b50000-0000-4000-8000-000000000003";
const LOCATION_B = "57b50000-0000-4000-8000-000000000103";
const PRODUCT = "57b50000-0000-4000-8000-000000000004";
const PRODUCT_B = "57b50000-0000-4000-8000-000000000104";
const VARIANT_A = "57b50000-0000-4000-8000-000000000010";
const VARIANT_B = "57b50000-0000-4000-8000-000000000011";
const VARIANT_C = "57b50000-0000-4000-8000-000000000012";
const BUSY_VARIANT = "57b50000-0000-4000-8000-000000000013";
const FREE_VARIANT = "57b50000-0000-4000-8000-000000000014";
const COMMIT_VARIANT = "57b50000-0000-4000-8000-000000000015";
const TENANT_B_VARIANT = "57b50000-0000-4000-8000-000000000110";
const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;

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
  limit: number,
  maxActive: number,
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

async function activeLeaseCount(): Promise<number> {
  const out = await psql(`
    select pg_catalog.count(*)::text
    from public.sku_daily_metric_recompute_requests
    where organization_id in ${TENANTS}
      and status in ('claimed', 'running')
      and lease_expires_at > pg_catalog.clock_timestamp()
  `);

  return Number(out);
}

async function enqueueQueued(
  variantId: string,
  metricDate: string,
  organizationId = ORG,
  storeId = STORE,
  locationId = LOCATION,
): Promise<void> {
  await psql(`
    insert into public.sku_daily_metric_recompute_requests (
      organization_id, store_id, location_id, variant_id, metric_date,
      algorithm_version, dirty_generation, claimed_generation,
      applied_generation, status, attempt_count, queued_at
    ) values (
      ${quote(organizationId)}::uuid, ${quote(storeId)}::uuid,
      ${quote(locationId)}::uuid, ${quote(variantId)}::uuid,
      ${quote(metricDate)}::date, ${quote(ALGORITHM)},
      1, 0, 0, 'queued', 0, pg_catalog.now() - interval '1 second'
    )
    on conflict do nothing;
  `);
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

describeLive("M5.7 Phase 5B F2 containment", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);

    const hostPort = await psql(
      "select inet_server_addr()::text || ':' || inet_server_port()::text",
    );
    // Docker Desktop may report a bridge address; connection args stay localhost.
    expect(psqlArgs()[0]).toBe("-h");
    expect(psqlArgs()[1]).toBe("127.0.0.1");
    expect(psqlArgs()[3]).toBe("55322");
    expect(hostPort.length).toBeGreaterThan(0);

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
        (${quote(ORG)}::uuid, 'M57P5B A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'M57P5B B', 'USD', 'UTC');
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
        (${quote(VARIANT_A)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'A1', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'A2', 'active'),
        (${quote(VARIANT_C)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'A3', 'active'),
        (${quote(BUSY_VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'BUSY', 'active'),
        (${quote(FREE_VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'FREE', 'active'),
        (${quote(COMMIT_VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'COMMIT', 'active'),
        (${quote(TENANT_B_VARIANT)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'B1', 'active');
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
        "Local database has claimable/active requests outside M5.7 Phase 5B tenants. Reset local DB first.",
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

  it("C1: maxActive=1 claimLimit=1 keeps at most one active lease for one worker", async () => {
    const day = await psql(
      `select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 1)::text`,
    );

    await enqueueQueued(VARIANT_A, day);
    await enqueueQueued(VARIANT_B, day);
    await enqueueQueued(VARIANT_C, day);

    const first = await claim("c1-owner", 1, 1);
    expect(first).toHaveLength(1);
    expect(await activeLeaseCount()).toBe(1);

    const second = await claim("c1-owner", 1, 1);
    expect(second).toHaveLength(0);
    expect(await activeLeaseCount()).toBe(1);

    // Release the lease via status update and claim again — still one at a time.
    await psql(`
      update public.sku_daily_metric_recompute_requests
      set status = 'succeeded',
          lease_owner_id = null,
          lease_claim_token = null,
          lease_claimed_at = null,
          lease_expires_at = null,
          applied_generation = dirty_generation,
          finished_at = pg_catalog.now()
      where lease_claim_token = ${quote(first[0].lease_claim_token)};
    `);

    const third = await claim("c1-owner", 1, 1);
    expect(third).toHaveLength(1);
    expect(await activeLeaseCount()).toBe(1);
  }, 120000);

  it("C2: two concurrent independent claims never exceed one unexpired active lease", async () => {
    const day = await psql(
      `select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 2)::text`,
    );

    await enqueueQueued(VARIANT_A, day);
    await enqueueQueued(VARIANT_B, day);
    await enqueueQueued(VARIANT_C, day);

    const results = await Promise.all([
      claim("c2-a", 1, 1),
      claim("c2-b", 1, 1),
      claim("c2-c", 1, 1),
      claim("c2-d", 1, 1),
    ]);
    const flat = results.flat();

    expect(flat).toHaveLength(1);
    expect(await activeLeaseCount()).toBe(1);
  }, 120000);

  it("C3: maxActive=1 with claimLimit=4 still yields at most one claim", async () => {
    const day = await psql(
      `select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 3)::text`,
    );

    await enqueueQueued(VARIANT_A, day);
    await enqueueQueued(VARIANT_B, day);
    await enqueueQueued(VARIANT_C, day);

    const rows = await claim("c3-owner", 4, 1);
    expect(rows).toHaveLength(1);
    expect(await activeLeaseCount()).toBe(1);
  }, 120000);

  it("C4: expired lease recovers without stranding; fencing preserved (zombie overlap documented)", async () => {
    /**
     * Residual risk (accepted): if a worker stalls past lease expiry while
     * still inside commit_sku_daily_metric, a recovered claim may start and
     * a late zombie commit can overlap. SHARE + SA008 + claim-token fencing
     * still protect correctness; containment is best-effort for zombies.
     */
    const day = await psql(
      `select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 4)::text`,
    );

    await enqueueQueued(VARIANT_A, day);
    const [held] = await claim("c4-owner", 1, 1);
    expect(held).toBeDefined();

    await psql(`
      update public.sku_daily_metric_recompute_requests
      set lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
      where lease_claim_token = ${quote(held.lease_claim_token)};
    `);

    const recovery = JSON.parse(
      await svc(`
        select pg_catalog.row_to_json(r)::text
        from public.recover_expired_sku_daily_metric_recompute_leases(
          5, 30, 1800, null::uuid
        ) as r
      `),
    ) as { requeued: number; retry_scheduled: number; failed: number };

    expect(recovery.requeued + recovery.retry_scheduled).toBeGreaterThanOrEqual(1);

    const status = await psql(`
      select status
      from public.sku_daily_metric_recompute_requests
      where variant_id = ${quote(VARIANT_A)}::uuid
        and metric_date = ${quote(day)}::date
    `);
    expect(["queued", "retry_wait"]).toContain(status);

    // Stale start with the expired claim token must return no rows (fenced).
    const fenced = await svc(`
      select coalesce(pg_catalog.json_agg(s), '[]'::json)::text
      from public.start_sku_daily_metric_recompute(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT_A)}::uuid,
        ${quote(day)}::date,
        ${quote(ALGORITHM)},
        ${quote("c4-owner")},
        ${quote(held.lease_claim_token)},
        120
      ) as s
    `);
    expect(JSON.parse(fenced)).toEqual([]);

    if (status === "retry_wait") {
      await psql(`
        update public.sku_daily_metric_recompute_requests
        set available_at = pg_catalog.clock_timestamp() - interval '1 second'
        where variant_id = ${quote(VARIANT_A)}::uuid
          and metric_date = ${quote(day)}::date;
      `);
    }

    const next = await claim("c4-reclaim", 1, 1);
    expect(next).toHaveLength(1);
    expect(next[0].lease_claim_token).not.toBe(held.lease_claim_token);
    expect(await activeLeaseCount()).toBe(1);
  }, 180000);

  it("C5: SHARE contention classifies as 55P03; no silent stale overwrite", async () => {
    const holder = await openSession();

    try {
      await holder.run(
        `begin;
         lock table public.orders in share mode;`,
        "c5-share-held",
      );

      const writerError = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        insert into public.orders (
          id, organization_id, store_id, status, ordered_at, currency, source
        ) values (
          '57b50000-0000-4000-8000-000000000201'::uuid,
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'completed',
          pg_catalog.now(), 'USD', 'csv'
        );
      `);

      await holder.run("rollback;", "c5-share-released");

      expect(writerError.code).toBe("55P03");
    } finally {
      await holder.close();
    }

    // Cross-tenant org B must remain untouched by org A fixture activity.
    expect(
      await psql(`
        select pg_catalog.count(*)::text
        from public.orders
        where organization_id = ${quote(ORG_B)}::uuid
      `),
    ).toBe("0");
  }, 120000);

  it("C6: SA008 fencing rejects stale token; F1 deferred attempt reset remains", async () => {
    const metricDate = "2026-06-01";
    const orderId = "57b50000-0000-4000-8000-000000000301";
    const itemId = "57b50000-0000-4000-8000-000000000302";

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
    await commitMetric(
      COMMIT_VARIANT,
      metricDate,
      fresh.sourceToken,
      freshMetric,
    );

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

    // F1: deferred completion resets attempt_count to 0.
    await enqueueQueued(VARIANT_A, metricDate);
    const [claimed] = await claim("c6-defer", 1, 1);
    await svc(`
      select coalesce(pg_catalog.json_agg(s), '[]'::json)::text
      from public.start_sku_daily_metric_recompute(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT_A)}::uuid,
        ${quote(metricDate)}::date,
        ${quote(ALGORITHM)},
        ${quote("c6-defer")},
        ${quote(claimed.lease_claim_token)},
        120
      ) as s
    `);
    await psql(`
      update public.sku_daily_metric_recompute_requests
      set attempt_count = 3
      where lease_claim_token = ${quote(claimed.lease_claim_token)};

      insert into public.sku_daily_metric_source_events (
        organization_id, store_id, location_id, variant_id,
        source_date, algorithm_version
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(VARIANT_A)}::uuid, ${quote(metricDate)}::date, ${quote(ALGORITHM)}
      );
    `);

    const deferred = await svc(`
      select public.complete_sku_daily_metric_recompute(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT_A)}::uuid,
        ${quote(metricDate)}::date,
        ${quote(ALGORITHM)},
        ${quote("c6-defer")},
        ${quote(claimed.lease_claim_token)}
      )::text
    `);
    expect(deferred).toBe("deferred");

    expect(
      await psql(`
        select status || ':' || attempt_count::text
        from public.sku_daily_metric_recompute_requests
        where variant_id = ${quote(VARIANT_A)}::uuid
          and metric_date = ${quote(metricDate)}::date
      `),
    ).toBe("queued:0");
  }, 180000);

  it("C7: T4 busy-grain exclusion still permits free-grain progress; maxActive=1 blocks when slot full", async () => {
    const base = await psql(
      `select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 600)::text`,
    );

    await psql(`
      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id, metric_date,
        algorithm_version, dirty_generation, claimed_generation,
        applied_generation, status, attempt_count, queued_at
      )
      select
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(BUSY_VARIANT)}::uuid,
        (${quote(base)}::date + (g.n || ' days')::interval)::date,
        ${quote(ALGORITHM)},
        1, 0, 0, 'queued', 0,
        pg_catalog.now() - interval '10 seconds'
      from generate_series(0, 509) as g(n);

      -- Hold one busy-grain date so T4 excludes the rest of that grain.
      update public.sku_daily_metric_recompute_requests
      set status = 'running',
          lease_owner_id = 'c7-busy',
          lease_claim_token = 'c7-busy-token',
          lease_claimed_at = pg_catalog.now(),
          lease_expires_at = pg_catalog.now() + interval '2 minutes',
          claimed_generation = dirty_generation
      where variant_id = ${quote(BUSY_VARIANT)}::uuid
        and metric_date = ${quote(base)}::date;
    `);

    await enqueueQueued(FREE_VARIANT, base);

    // Containment: the single global slot is occupied → no claim.
    expect(await claim("c7-blocked", 1, 1)).toHaveLength(0);

    // T4 still works when a slot remains (maxActive=2): free grain is claimed
    // despite 500+ queued busy-grain dates ahead of a naive LIMIT.
    const freed = await claim("c7-free", 1, 2);
    expect(freed).toHaveLength(1);
    expect(freed[0].variant_id).toBe(FREE_VARIANT);
    expect(await activeLeaseCount()).toBe(2);

    expect(
      await psql(`
        select pg_catalog.count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG_B)}::uuid
      `),
    ).toBe("0");
  }, 180000);
});
