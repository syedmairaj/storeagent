import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recomputeSkuDailyMetric } from "@/lib/persistence/recompute-sku-daily-metric";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { holdOrdersLiveLock } from "../support/orders-live-lock";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "88004000-0000-4000-8000-000000000001";
const ORG_B = "88004000-0000-4000-8000-000000000011";
const STORE = "88004000-0000-4000-8000-000000000002";
const STORE_B = "88004000-0000-4000-8000-000000000012";
const LOCATION = "88004000-0000-4000-8000-000000000003";
const LOCATION_B = "88004000-0000-4000-8000-000000000013";
const PRODUCT = "88004000-0000-4000-8000-000000000004";
const PRODUCT_B = "88004000-0000-4000-8000-000000000014";
const VARIANT = "88004000-0000-4000-8000-000000000005";
const VARIANT_B = "88004000-0000-4000-8000-000000000015";
const ORDER = "88004000-0000-4000-8000-000000000006";
const ORDER_ITEM = "88004000-0000-4000-8000-000000000007";

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

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

let metricDate = "";

async function thresholdRow(): Promise<string> {
  return psql(`
    select coalesce(safety_stock::text, 'null')
      || ':' || coalesce(safety_stock_reason_code::text, 'null')
      || ':' || coalesce(reorder_point::text, 'null')
      || ':' || coalesce(reorder_point_reason_code::text, 'null')
      || ':' || coalesce(target_stock::text, 'null')
      || ':' || coalesce(target_stock_reason_code::text, 'null')
      || ':' || coalesce(eligible_incoming_quantity::text, 'null')
      || ':' || coalesce(eligible_incoming_reason_code::text, 'null')
      || ':' || coalesce(sales_velocity_30d::text, 'null')
    from public.sku_daily_metrics
    where organization_id = ${quote(ORG)}::uuid
      and metric_date = ${quote(metricDate)}::date
  `);
}

async function dirtyState(): Promise<string> {
  return psql(`
    select coalesce(dirty_generation::text, 'none')
      || ':' || coalesce(claimed_generation::text, 'none')
      || ':' || coalesce(applied_generation::text, 'none')
      || ':' || coalesce(status, 'none')
    from public.sku_daily_metric_recompute_requests
    where organization_id = ${quote(ORG)}::uuid
      and metric_date = ${quote(metricDate)}::date
  `);
}

describeLive("Planning evidence binding live M5 fixture", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseOrdersLock = await holdOrdersLiveLock();
    metricDate = await psql(
      `select (pg_catalog.timezone('UTC', pg_catalog.now()))::date::text`,
    );

    await psql(`
      alter table public.inventory_snapshots
        disable trigger inventory_snapshots_prevent_delete;
      delete from public.action_events
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.inventory_actions
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_evaluation_model_scores
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_evaluation_runs
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_forecast_current
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_forecast_publications
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_forecasts
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_runs
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_coverage_correction_events
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_day_coverage_evidence
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_day_promotion_evidence
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metric_recompute_requests
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metrics
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.order_items
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.orders
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.inventory_snapshots
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      -- Commerce deletes can recreate source/correction outbox rows; clear again.
      delete from public.sku_daily_metric_source_events
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_coverage_correction_events
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.organization_planning_inputs
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
      alter table public.inventory_snapshots
        enable trigger inventory_snapshots_prevent_delete;

      insert into public.organizations (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'Plan Bind Live A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'Plan Bind Live B', 'USD', 'UTC');

      insert into public.stores (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'A', 'active', 'USD', 'UTC'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'UTC');

      insert into public.locations (id, organization_id, store_id, name, status)
      values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'LA', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'LB', 'active');

      insert into public.products (id, organization_id, store_id, title, status)
      values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'PA', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'PB', 'active');

      insert into public.product_variants (
        id, organization_id, store_id, product_id, sku, status
      ) values
        (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'SKU-A', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'SKU-B', 'active');

      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid, ${quote(VARIANT)}::uuid,
        (${quote(metricDate)}::date + interval '12 hours')::timestamptz,
        50, 'csv'
      );

      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        ${quote(ORDER)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'completed',
        (${quote(metricDate)}::date + interval '10 hours')::timestamptz,
        'USD', 'csv'
      );

      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        ${quote(ORDER_ITEM)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        ${quote(ORDER)}::uuid, ${quote(VARIANT)}::uuid, ${quote(LOCATION)}::uuid,
        30
      );
    `);
  }, 60_000);

  afterAll(async () => {
    await releaseOrdersLock?.();
  });

  it("keeps thresholds unknown when planning defaults are missing", async () => {
    const admin = createSupabaseAdminClient();
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );

    const row = await thresholdRow();
    expect(row.startsWith("null:safety_stock_days_unknown:null:lead_time_unknown:null:lead_time_unknown:null:incoming_state_unknown:")).toBe(
      true,
    );
    // Demand is known from sales; missing planning must not coerce days to zero.
    expect(row.endsWith(":null")).toBe(false);
  });

  it("configures planning and recomputes non-zero frozen thresholds", async () => {
    await psql(`
      insert into public.organization_planning_inputs (
        organization_id, lead_time_days, safety_stock_days, review_period_days
      ) values (
        ${quote(ORG)}::uuid, 7, 3, 14
      );

      set role service_role;
      select public.enqueue_sku_daily_metric_planning_invalidation(${quote(ORG)}::uuid);
      reset role;
    `);

    const dirty = await dirtyState();
    expect(dirty.split(":")[0]).not.toBe("none");
    const dirtyGen = Number(dirty.split(":")[0]);
    expect(dirtyGen).toBeGreaterThanOrEqual(1);

    const foreign = await psql(`
      select count(*)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG_B)}::uuid
    `);
    expect(foreign).toBe("0");

    const admin = createSupabaseAdminClient();
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );

    const row = await thresholdRow();
    const [
      safety,
      safetyReason,
      reorder,
      reorderReason,
      target,
      targetReason,
      incoming,
      incomingReason,
      velocity,
    ] = row.split(":");

    expect(safetyReason).toBe("null");
    expect(reorderReason).toBe("null");
    expect(targetReason).toBe("null");
    expect(incoming).toBe("null");
    expect(incomingReason).toBe("incoming_state_unknown");
    expect(Number(velocity)).toBeGreaterThan(0);
    // safety = ceil(v*3), ROP = ceil(v*7 + safety), target = ceil(v*(7+14) + safety)
    const v = Number(velocity);
    expect(Number(safety)).toBe(Math.ceil(v * 3));
    expect(Number(reorder)).toBe(Math.ceil(v * 7 + Number(safety)));
    expect(Number(target)).toBe(Math.ceil(v * 21 + Number(safety)));
    expect(Number(safety)).toBeGreaterThan(0);
    expect(Number(reorder)).toBeGreaterThan(0);
    expect(Number(target)).toBeGreaterThan(0);
  });

  it("edits planning days and bumps dirty_generation before recomputing", async () => {
    const before = await dirtyState();
    const beforeDirty = Number(before.split(":")[0]);

    await psql(`
      update public.organization_planning_inputs
      set lead_time_days = 2,
          safety_stock_days = 1,
          review_period_days = 0
      where organization_id = ${quote(ORG)}::uuid;

      set role service_role;
      select public.enqueue_sku_daily_metric_planning_invalidation(${quote(ORG)}::uuid);
      reset role;
    `);

    const afterDirty = await dirtyState();
    expect(Number(afterDirty.split(":")[0])).toBe(beforeDirty + 1);

    const admin = createSupabaseAdminClient();
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );

    const row = await thresholdRow();
    const [safety, , reorder, , target, , incoming, , velocity] = row.split(":");
    const v = Number(velocity);
    expect(Number(safety)).toBe(Math.ceil(v * 1));
    expect(Number(reorder)).toBe(Math.ceil(v * 2 + Number(safety)));
    // reviewPeriodDays=0 is known zero, not unknown.
    expect(Number(target)).toBe(Math.ceil(v * (2 + 0) + Number(safety)));
    expect(incoming).toBe("null");
  });

  it("clears planning back to unknown after invalidation/recompute", async () => {
    await psql(`
      update public.organization_planning_inputs
      set lead_time_days = null,
          safety_stock_days = null,
          review_period_days = null
      where organization_id = ${quote(ORG)}::uuid;

      set role service_role;
      select public.enqueue_sku_daily_metric_planning_invalidation(${quote(ORG)}::uuid);
      reset role;
    `);

    const admin = createSupabaseAdminClient();
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );

    const row = await thresholdRow();
    expect(row.startsWith("null:safety_stock_days_unknown:null:lead_time_unknown:null:lead_time_unknown:null:incoming_state_unknown:")).toBe(
      true,
    );
  });
});
