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

const ORG = "88118000-0000-4000-8000-000000000001";
const ORG_B = "88118000-0000-4000-8000-000000000011";
const STORE = "88118000-0000-4000-8000-000000000002";
const STORE_B = "88118000-0000-4000-8000-000000000012";
const LOCATION = "88118000-0000-4000-8000-000000000003";
const LOCATION_2 = "88118000-0000-4000-8000-000000000023";
const LOCATION_B = "88118000-0000-4000-8000-000000000013";
const PRODUCT = "88118000-0000-4000-8000-000000000004";
const PRODUCT_B = "88118000-0000-4000-8000-000000000014";
const VARIANT = "88118000-0000-4000-8000-000000000005";
const VARIANT_B = "88118000-0000-4000-8000-000000000015";
const ORDER = "88118000-0000-4000-8000-000000000006";
const ORDER_ITEM = "88118000-0000-4000-8000-000000000007";
const PO = "88118000-0000-4000-8000-000000000008";
const PO_ITEM = "88118000-0000-4000-8000-000000000009";
const PO_ITEM_NULL = "88118000-0000-4000-8000-00000000000a";

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
let releaseLock: (() => Promise<void>) | null = null;

async function incomingRow(
  locationId = LOCATION,
): Promise<string> {
  return psql(`
    select coalesce(eligible_incoming_quantity::text, 'null')
      || ':' || coalesce(eligible_incoming_reason_code::text, 'null')
      || ':' || coalesce(inventory_position::text, 'null')
      || ':' || coalesce(available_quantity::text, 'null')
    from public.sku_daily_metrics
    where organization_id = ${quote(ORG)}::uuid
      and store_id = ${quote(STORE)}::uuid
      and location_id = ${quote(locationId)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid
      and metric_date = ${quote(metricDate)}::date
  `);
}

describeLive("Trusted Incoming Evidence V1 live", () => {
  beforeAll(async () => {
    releaseLock = await holdOrdersLiveLock();
    metricDate = await psql(
      `select (pg_catalog.timezone('UTC', pg_catalog.now()))::date::text`,
    );

    await psql(`
      alter table public.inventory_snapshots
        disable trigger inventory_snapshots_prevent_delete;
      delete from public.sku_daily_metric_recompute_requests
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metrics
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.store_incoming_evidence_attestations
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.purchase_order_items
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.purchase_orders
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.order_items
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.orders
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.inventory_snapshots
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metric_source_events
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_coverage_correction_events
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_day_coverage_evidence
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.forecast_day_promotion_evidence
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
        (${quote(ORG)}::uuid, 'Incoming Live A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'Incoming Live B', 'USD', 'UTC');

      insert into public.stores (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'A', 'active', 'USD', 'UTC'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'UTC');

      insert into public.locations (id, organization_id, store_id, name, status)
      values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'LA', 'active'),
        (${quote(LOCATION_2)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'LA2', 'active'),
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
        5, 'csv'
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
        ${quote(ORDER)}::uuid, ${quote(VARIANT)}::uuid, ${quote(LOCATION)}::uuid, 2
      );
    `);
  }, 120_000);

  afterAll(async () => {
    if (releaseLock) {
      await releaseLock();
    }
  });

  it("keeps empty PO evidence unknown until completeness is attested", async () => {
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
    expect(await incomingRow()).toBe("null:incoming_state_unknown:null:5");

    await psql(`
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, now()
      )
      on conflict on constraint store_incoming_evidence_attestations_pkey
      do update set evidence_complete = true, updated_at = now();
    `);

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
    expect(await incomingRow()).toBe("0:null:5:5");
  });

  it("binds confirmed PO quantity, ignores null destination, and dirties old+new grains", async () => {
    const admin = createSupabaseAdminClient();

    await psql(`
      insert into public.purchase_orders (
        id, organization_id, store_id, status, source, created_at, updated_at
      ) values (
        ${quote(PO)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'confirmed', 'csv', now(), now()
      );

      insert into public.purchase_order_items (
        id, organization_id, store_id, purchase_order_id, variant_id,
        destination_location_id, ordered_quantity, received_quantity
      ) values
        (
          ${quote(PO_ITEM)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
          ${quote(PO)}::uuid, ${quote(VARIANT)}::uuid, ${quote(LOCATION)}::uuid,
          8, null
        ),
        (
          ${quote(PO_ITEM_NULL)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
          ${quote(PO)}::uuid, ${quote(VARIANT)}::uuid, null,
          99, null
        );
    `);

    const beforeEvents = Number(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_source_events
        where organization_id = ${quote(ORG)}::uuid
          and location_id = ${quote(LOCATION)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
      `),
    );

    await psql(`
      update public.purchase_orders
      set status = 'submitted'
      where id = ${quote(PO)}::uuid;
    `);

    const afterHeader = Number(
      await psql(`
        select count(*)::text
        from public.sku_daily_metric_source_events
        where organization_id = ${quote(ORG)}::uuid
          and location_id = ${quote(LOCATION)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
          and consumed_at is null
      `),
    );
    expect(afterHeader).toBeGreaterThan(beforeEvents);

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
    expect(await incomingRow()).toBe("8:null:13:5");

    await psql(`
      update public.purchase_order_items
      set destination_location_id = ${quote(LOCATION_2)}::uuid
      where id = ${quote(PO_ITEM)}::uuid;
    `);

    const moved = await psql(`
      select count(*) filter (
        where location_id = ${quote(LOCATION)}::uuid
      )::text
      || ':' ||
      count(*) filter (
        where location_id = ${quote(LOCATION_2)}::uuid
      )::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and source_date = ${quote(metricDate)}::date
        and consumed_at is null
    `);
    const [oldCount, newCount] = moved.split(":").map(Number);
    expect(oldCount).toBeGreaterThan(0);
    expect(newCount).toBeGreaterThan(0);

    const foreign = await psql(`
      select count(*)::text
      from public.purchase_order_items
      where organization_id = ${quote(ORG_B)}::uuid
        and destination_location_id = ${quote(LOCATION)}::uuid
    `);
    expect(foreign).toBe("0");

    // Null-destination line must never enter the source snapshot payload.
    const snap = await psql(`
      select (public.sku_daily_metric_source_snapshot(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid
      )->'purchaseOrderLines')::text
    `);
    expect(snap).not.toContain("99");
  });

  it("keeps historical metric dates unknown even with live PO rows", async () => {
    const admin = createSupabaseAdminClient();
    const past = await psql(`
      select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date - 1)::text
    `);

    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate: past,
      },
      admin,
    );

    const historical = await psql(`
      select coalesce(eligible_incoming_quantity::text, 'null')
        || ':' || coalesce(eligible_incoming_reason_code::text, 'null')
      from public.sku_daily_metrics
      where organization_id = ${quote(ORG)}::uuid
        and metric_date = ${quote(past)}::date
    `);
    expect(historical).toBe("null:incoming_state_unknown");
  });
});
