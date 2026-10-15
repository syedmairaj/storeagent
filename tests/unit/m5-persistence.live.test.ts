import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { aggregateInventoryMetrics } from "@/lib/metrics/inventory-aggregates";
import {
  aggregateSales,
  type SalesAggregateOrder,
  type SalesAggregateOrderItem,
} from "@/lib/metrics/sales-aggregates";
import { toPersistedSkuDailyMetric } from "@/lib/metrics/sku-daily-metric-record";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "55150000-0000-4000-8000-000000000001";
const ORG_B = "55150000-0000-4000-8000-000000000011";
const STORE = "55150000-0000-4000-8000-000000000002";
const STORE_B = "55150000-0000-4000-8000-000000000012";
const LOCATION = "55150000-0000-4000-8000-000000000003";
const LOCATION_B = "55150000-0000-4000-8000-000000000013";
const LOCATION_OTHER = "55150000-0000-4000-8000-000000000023";
const PRODUCT = "55150000-0000-4000-8000-000000000004";
const PRODUCT_B = "55150000-0000-4000-8000-000000000014";
const VARIANT = "55150000-0000-4000-8000-000000000005";
const VARIANT_B = "55150000-0000-4000-8000-000000000015";
const METRIC_DATE = "2026-10-14";

type SourceSnapshot = {
  timeZone: string;
  sourceToken: string;
  orders: SalesAggregateOrder[];
  orderItems: SalesAggregateOrderItem[];
  returnRefunds: [];
  inventorySnapshots: [];
};

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: "postgres",
      },
    },
  );

  return stdout.trim();
}

async function psqlAllowError(sql: string): Promise<string> {
  try {
    return await psql(sql);
  } catch (error) {
    const stderr = (
      error as { stderr?: string; message?: string }
    ).stderr;
    return `${stderr ?? ""} ${(error as Error).message}`;
  }
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function snapshot(): Promise<SourceSnapshot> {
  const json = await psql(`
    select public.sku_daily_metric_source_snapshot(
      ${quote(ORG)}::uuid,
      ${quote(STORE)}::uuid,
      ${quote(LOCATION)}::uuid,
      ${quote(VARIANT)}::uuid
    )::text;
  `);

  return JSON.parse(json) as SourceSnapshot;
}

async function commitMetric(
  token: string,
  metric: ReturnType<typeof toPersistedSkuDailyMetric>,
): Promise<string> {
  return psql(`
    select public.commit_sku_daily_metric(
      ${quote(ORG)}::uuid,
      ${quote(STORE)}::uuid,
      ${quote(LOCATION)}::uuid,
      ${quote(VARIANT)}::uuid,
      ${quote(METRIC_DATE)}::date,
      ${quote(token)},
      ${quote(JSON.stringify(metric))}::jsonb
    )::text;
  `);
}

function metricFrom(source: SourceSnapshot) {
  const sales = aggregateSales({
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    metricDate: METRIC_DATE,
    timeZone: source.timeZone,
    orders: source.orders,
    orderItems: source.orderItems,
    returnRefunds: source.returnRefunds,
    inventorySnapshots: source.inventorySnapshots,
  });
  const day = sales.days.find(
    (candidate) => candidate.metricDate === METRIC_DATE,
  );

  if (day === undefined) {
    throw new Error("missing metric day");
  }

  const inventory = aggregateInventoryMetrics({
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    metricDate: METRIC_DATE,
    timeZone: source.timeZone,
    snapshots: source.inventorySnapshots,
    demand: {
      netUnitsSold: day.netUnitsSold,
      salesVelocity30d: sales.windows[30].velocity,
      days: sales.days,
    },
  });

  return toPersistedSkuDailyMetric(
    METRIC_DATE,
    source.timeZone,
    sales,
    inventory,
  );
}

describeLive("M5.5 sku daily metric persistence", () => {
  beforeAll(async () => {
    await psql(`
      alter table public.inventory_snapshots
        disable trigger inventory_snapshots_prevent_delete;
      delete from public.sku_daily_metrics
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.inventory_snapshots
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      alter table public.inventory_snapshots
        enable trigger inventory_snapshots_prevent_delete;
      delete from public.return_refunds
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.order_items
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.orders
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.product_variants
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.products
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.locations
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.stores
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.organizations
      where id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
    `);
    await psql(`
      insert into public.organizations
        (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'M55 A', 'USD', 'Asia/Dubai'),
        (${quote(ORG_B)}::uuid, 'M55 B', 'USD', 'Asia/Dubai');

      insert into public.stores
        (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'A', 'active', 'USD', 'Asia/Dubai'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'Asia/Dubai');

      insert into public.locations
        (id, organization_id, store_id, name, status)
      values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(LOCATION_OTHER)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'Other', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');

      insert into public.products
        (id, organization_id, store_id, title, status)
      values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');

      insert into public.product_variants
        (id, organization_id, store_id, product_id, sku, status)
      values
        (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'SKU-A', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'SKU-B', 'active');
    `);
  });

  afterAll(async () => {
    await psql(`
      delete from public.sku_daily_metrics
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      alter table public.inventory_snapshots
        disable trigger inventory_snapshots_prevent_delete;
      delete from public.inventory_snapshots
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      alter table public.inventory_snapshots
        enable trigger inventory_snapshots_prevent_delete;
      delete from public.return_refunds
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.order_items
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.orders
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.product_variants
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.products
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.locations
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.stores
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.organizations
      where id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
    `);
  });

  it("checks service-role-only execution", async () => {
    const snapshotSignature =
      "public.sku_daily_metric_source_snapshot(uuid,uuid,uuid,uuid)";
    const commitSignature =
      "public.commit_sku_daily_metric(uuid,uuid,uuid,uuid,date,text,jsonb)";
    const privileges = await psql(`
      select
        has_function_privilege('service_role', '${snapshotSignature}', 'execute')::text
        || ',' ||
        has_function_privilege('authenticated', '${snapshotSignature}', 'execute')::text
        || ',' ||
        has_function_privilege('anon', '${snapshotSignature}', 'execute')::text
        || ',' ||
        has_function_privilege('service_role', '${commitSignature}', 'execute')::text
        || ',' ||
        has_function_privilege('authenticated', '${commitSignature}', 'execute')::text
        || ',' ||
        has_function_privilege('anon', '${commitSignature}', 'execute')::text;
    `);

    expect(privileges).toBe("true,false,false,true,false,false");
  });

  it("persists an identical recompute once and keeps another algorithm version", async () => {
    const source = await snapshot();
    const metric = metricFrom(source);
    const firstId = await commitMetric(source.sourceToken, metric);
    const createdAt = await psql(`
      select created_at::text
      from public.sku_daily_metrics
      where id = ${quote(firstId)}::uuid;
    `);
    const secondId = await commitMetric(source.sourceToken, metric);
    const row = await psql(`
      select id::text || ',' || created_at::text || ',' ||
        (coverage_ratio_7d * 7 = eligible_days_7d)::text || ',' ||
        (coverage_ratio_90d * 90 = eligible_days_90d)::text || ',' ||
        coalesce(eligible_incoming_quantity::text, 'null') || ',' ||
        inventory_age_quality || ',' ||
        count(*) over ()::text
      from public.sku_daily_metrics
      where
        organization_id = ${quote(ORG)}::uuid
        and algorithm_version = 'm5-derived-metrics-v1'
        and metric_date = ${quote(METRIC_DATE)}::date;
    `);

    await psql(`
      insert into public.sku_daily_metrics (
        organization_id, store_id, location_id, variant_id,
        metric_date, algorithm_version,
        units_sold, returned_units, net_units_sold,
        eligible_days_7d, eligible_days_14d, eligible_days_30d, eligible_days_90d,
        coverage_ratio_7d, coverage_ratio_14d, coverage_ratio_30d, coverage_ratio_90d,
        sales_velocity_7d_reason_code, sales_velocity_14d_reason_code,
        sales_velocity_30d_reason_code, sales_velocity_90d_reason_code,
        eligible_incoming_reason_code,
        days_of_stock_reason_code,
        inventory_age_quality, inventory_age_reason_code,
        demand_trend, demand_trend_reason_code,
        safety_stock_reason_code, reorder_point_reason_code,
        target_stock_reason_code
      )
      select
        organization_id, store_id, location_id, variant_id,
        metric_date, 'other-version',
        9, returned_units, 9,
        eligible_days_7d, eligible_days_14d, eligible_days_30d, eligible_days_90d,
        coverage_ratio_7d, coverage_ratio_14d, coverage_ratio_30d, coverage_ratio_90d,
        sales_velocity_7d_reason_code, sales_velocity_14d_reason_code,
        sales_velocity_30d_reason_code, sales_velocity_90d_reason_code,
        eligible_incoming_reason_code,
        days_of_stock_reason_code,
        inventory_age_quality, inventory_age_reason_code,
        demand_trend, demand_trend_reason_code,
        safety_stock_reason_code, reorder_point_reason_code,
        target_stock_reason_code
      from public.sku_daily_metrics
      where id = ${quote(firstId)}::uuid;
    `);
    await commitMetric(source.sourceToken, metric);
    const versions = await psql(`
      select algorithm_version || ':' || units_sold::text
      from public.sku_daily_metrics
      where
        organization_id = ${quote(ORG)}::uuid
        and location_id = ${quote(LOCATION)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(METRIC_DATE)}::date
      order by algorithm_version;
    `);

    expect(secondId).toBe(firstId);
    expect(row.startsWith(`${firstId},${createdAt},true,true,null,unavailable,`)).toBe(true);
    expect(versions).toBe(
      "m5-derived-metrics-v1:0\nother-version:9",
    );
  });

  it("rejects a negative coverage ratio and a ratio above 1", async () => {
    const above = await psqlAllowError(`
      update public.sku_daily_metrics
      set coverage_ratio_7d = 1.1
      where
        organization_id = ${quote(ORG)}::uuid
        and algorithm_version = 'm5-derived-metrics-v1'
        and metric_date = ${quote(METRIC_DATE)}::date;
    `);
    const negative = await psqlAllowError(`
      update public.sku_daily_metrics
      set coverage_ratio_14d = -0.01
      where
        organization_id = ${quote(ORG)}::uuid
        and algorithm_version = 'm5-derived-metrics-v1'
        and metric_date = ${quote(METRIC_DATE)}::date;
    `);

    expect(above).toContain("sku_daily_metrics_coverage_7d_identity");
    expect(negative).toContain("sku_daily_metrics_coverage_14d_identity");
  });

  it("rejects a stale token and applies a status correction", async () => {
    const before = await snapshot();
    const stale = await psqlAllowError(`
      select public.commit_sku_daily_metric(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(METRIC_DATE)}::date,
        'stale-token',
        ${quote(JSON.stringify(metricFrom(before)))}::jsonb
      );
    `);

    expect(stale).toContain("source token mismatch");

    const orderId = "55150000-0000-4000-8000-000000000021";
    const itemId = "55150000-0000-4000-8000-000000000022";
    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        ${quote(orderId)}::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-10-14T08:00:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        ${quote(itemId)}::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(orderId)}::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION)}::uuid,
        4
      );
    `);
    const sold = await snapshot();
    expect(sold.sourceToken).not.toBe(before.sourceToken);
    const soldMetric = metricFrom(sold);
    expect(soldMetric.unitsSold).toBe(4);
    expect(soldMetric.eligibleDays7d).toBe(1);
    await commitMetric(sold.sourceToken, soldMetric);
    const soldCoverage = await psql(`
      select
        (abs(coverage_ratio_7d * 7 - eligible_days_7d) < 0.000001)::text
        || ',' ||
        (abs(coverage_ratio_14d * 14 - eligible_days_14d) < 0.000001)::text
        || ',' ||
        (abs(coverage_ratio_30d * 30 - eligible_days_30d) < 0.000001)::text
        || ',' ||
        (abs(coverage_ratio_90d * 90 - eligible_days_90d) < 0.000001)::text
        || ',' || eligible_days_7d::text
      from public.sku_daily_metrics
      where
        organization_id = ${quote(ORG)}::uuid
        and algorithm_version = 'm5-derived-metrics-v1'
        and metric_date = ${quote(METRIC_DATE)}::date;
    `);

    await psql(`
      update public.orders
      set status = 'pending'
      where id = ${quote(orderId)}::uuid;
    `);
    const pending = await snapshot();
    const pendingMetric = metricFrom(pending);
    expect(pendingMetric.unitsSold).toBe(0);
    expect(pendingMetric.salesVelocity30dReasonCode).toBe(
      "no_eligible_days",
    );
    await commitMetric(pending.sourceToken, pendingMetric);
    const stored = await psql(`
      select units_sold::text
      from public.sku_daily_metrics
      where
        organization_id = ${quote(ORG)}::uuid
        and algorithm_version = 'm5-derived-metrics-v1'
        and metric_date = ${quote(METRIC_DATE)}::date;
    `);

    expect(stored).toBe("0");
    expect(soldCoverage).toBe("true,true,true,true,1");
  });

  it("ignores another tenant and another location", async () => {
    const before = (await snapshot()).sourceToken;
    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '55150000-0000-4000-8000-000000000031'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-10-14T08:00:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '55150000-0000-4000-8000-000000000032'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '55150000-0000-4000-8000-000000000031'::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION_OTHER)}::uuid,
        8
      );
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '55150000-0000-4000-8000-000000000041'::uuid,
        ${quote(ORG_B)}::uuid,
        ${quote(STORE_B)}::uuid,
        'completed',
        '2026-10-14T08:00:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '55150000-0000-4000-8000-000000000042'::uuid,
        ${quote(ORG_B)}::uuid,
        ${quote(STORE_B)}::uuid,
        '55150000-0000-4000-8000-000000000041'::uuid,
        ${quote(VARIANT_B)}::uuid,
        ${quote(LOCATION_B)}::uuid,
        8
      );
    `);

    expect((await snapshot()).sourceToken).toBe(before);
  });

  it("keeps the source token on the same snapshot as the payloads", async () => {
    const installed = await psql(`
      select pg_catalog.pg_get_functiondef(
        'public.sku_daily_metric_source_snapshot(uuid,uuid,uuid,uuid)'::regprocedure
      );
    `);
    expect(installed.toLowerCase()).not.toContain("into source_token");
    expect(installed.toLowerCase()).not.toContain("into orders_json");

    const before = await snapshot();
    const orderId = "55150000-0000-4000-8000-000000000061";
    const itemId = "55150000-0000-4000-8000-000000000062";
    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        ${quote(orderId)}::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-10-14T08:00:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        ${quote(itemId)}::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(orderId)}::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION)}::uuid,
        4
      );
    `);
    const inserted = await snapshot();
    expect(inserted.sourceToken).not.toBe(before.sourceToken);
    expect(inserted.orderItems.map((item) => item.id)).toContain(itemId);

    await psql(`
      update public.orders
      set status = 'pending'
      where id = ${quote(orderId)}::uuid;
    `);
    const pending = await snapshot();
    expect(pending.sourceToken).not.toBe(inserted.sourceToken);
    expect(
      pending.orders.find((order) => order.id === orderId)?.status,
    ).toBe("pending");

    await psql(`
      update public.orders
      set status = 'completed'
      where id = ${quote(orderId)}::uuid;
    `);
    const reverted = await snapshot();
    expect(reverted.sourceToken).toBe(inserted.sourceToken);
    expect(reverted.orderItems.map((item) => item.id)).toContain(itemId);

    await psql(`
      delete from public.order_items where id = ${quote(itemId)}::uuid;
      delete from public.orders where id = ${quote(orderId)}::uuid;
    `);
    const deleted = await snapshot();
    expect(deleted.sourceToken).toBe(before.sourceToken);
    expect(deleted.orderItems.map((item) => item.id)).not.toContain(itemId);
    expect(deleted.orders.map((order) => order.id)).not.toContain(orderId);
  });

  it("holds source locks until the commit transaction ends", async () => {
    const source = await snapshot();
    const metric = metricFrom(source);
    const holder = psql(`
      begin;
      select public.commit_sku_daily_metric(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(METRIC_DATE)}::date,
        ${quote(source.sourceToken)},
        ${quote(JSON.stringify(metric))}::jsonb
      );
      select pg_sleep(2);
      commit;
    `);
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    const blocked = await psqlAllowError(`
      set statement_timeout = '400ms';
      insert into public.orders (
        organization_id, store_id, status, ordered_at, currency, source
      ) values (
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-10-14T11:00:00Z',
        'USD',
        'csv'
      );
    `);
    await holder;

    expect(blocked.toLowerCase()).toContain("statement timeout");
  });
});
