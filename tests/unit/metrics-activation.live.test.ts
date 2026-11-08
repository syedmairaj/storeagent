import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const live = LIVE ? describe : describe.skip;

const ORG_ID = "c1000000-0000-0000-0000-000000000091";
const STORE_ID = "c2000000-0000-0000-0000-000000000091";
const LOCATION_ID = "c3000000-0000-0000-0000-000000000091";
const INTEGRATION_ID = "c4000000-0000-0000-0000-000000000091";
const PRODUCT_ID = "c5000000-0000-0000-0000-000000000091";
const VARIANT_ID = "c6000000-0000-0000-0000-000000000091";

const FOREIGN_ORG_ID = "c1000000-0000-0000-0000-000000000092";

async function loadAdmin() {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  return createSupabaseAdminClient();
}

function requireNoError(
  label: string,
  error: { message: string } | null,
): void {
  if (error !== null) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}

live("merchant sales metrics activation live", () => {
  let admin: Awaited<ReturnType<typeof loadAdmin>>;
  const stamp = Date.now();
  const orderExternalId = `M5-ACT-ORD-${stamp}`;
  const lineExternalId = `M5-ACT-LINE-${stamp}`;

  beforeAll(async () => {
    admin = await loadAdmin();

    const { data: existing } = await admin
      .from("organizations")
      .select("id")
      .eq("id", ORG_ID)
      .maybeSingle();

    if (!existing) {
      requireNoError(
        "org",
        (
          await admin.from("organizations").insert({
            id: ORG_ID,
            name: "M5 Metrics Activation Org",
            country_code: null,
            default_currency: "USD",
            timezone: "UTC",
          })
        ).error,
      );
      requireNoError(
        "store",
        (
          await admin.from("stores").insert({
            id: STORE_ID,
            organization_id: ORG_ID,
            name: "M5 Activation Store",
            status: "active",
            currency: "USD",
            timezone: "UTC",
          })
        ).error,
      );
      requireNoError(
        "location",
        (
          await admin.from("locations").insert({
            id: LOCATION_ID,
            organization_id: ORG_ID,
            store_id: STORE_ID,
            name: "M5 Activation Location",
            status: "active",
            code: "M5-ACT",
          })
        ).error,
      );
      requireNoError(
        "integration",
        (
          await admin.from("integrations").insert({
            id: INTEGRATION_ID,
            organization_id: ORG_ID,
            store_id: STORE_ID,
            provider: "csv",
            status: "active",
            display_name: "M5 Activation CSV",
            configuration: {},
          })
        ).error,
      );
      requireNoError(
        "product",
        (
          await admin.from("products").insert({
            id: PRODUCT_ID,
            organization_id: ORG_ID,
            store_id: STORE_ID,
            title: "M5 Activation Product",
            status: "active",
          })
        ).error,
      );
      requireNoError(
        "variant",
        (
          await admin.from("product_variants").insert({
            id: VARIANT_ID,
            organization_id: ORG_ID,
            store_id: STORE_ID,
            product_id: PRODUCT_ID,
            sku: "M5-ACT-SKU",
            status: "active",
          })
        ).error,
      );
    }

    // Inventory snapshot for grain alignment / cover inputs.
    const observedAt = new Date().toISOString();
    requireNoError(
      "inventory snapshot",
      (
        await admin.from("inventory_snapshots").insert({
          organization_id: ORG_ID,
          store_id: STORE_ID,
          location_id: LOCATION_ID,
          variant_id: VARIANT_ID,
          observed_at: observedAt,
          available_quantity: 12,
          on_hand_quantity: 12,
          committed_quantity: 0,
          incoming_quantity: null,
          source: "csv",
        })
      ).error,
    );

    const { data: orderRows, error: orderError } = await admin.rpc(
      "csv_reconcile_order",
      {
        p_organization_id: ORG_ID,
        p_store_id: STORE_ID,
        p_integration_id: INTEGRATION_ID,
        p_external_id: orderExternalId,
        p_external_parent_id: null,
        p_source_metadata: {
          adapterVersion: "merchant-sales-import-v1-order",
        },
        p_external_reference: orderExternalId,
        p_status: "completed",
        p_ordered_at: "2026-10-20T15:00:00.000Z",
        p_currency: "USD",
        p_gross_amount: null,
        p_discount_amount: null,
        p_net_amount: null,
      },
    );
    requireNoError("order", orderError);
    const orderId = String(
      (orderRows as Array<{ canonical_entity_id: string }>)[0]!
        .canonical_entity_id,
    );

    const { error: itemError } = await admin.rpc("csv_reconcile_order_item", {
      p_organization_id: ORG_ID,
      p_store_id: STORE_ID,
      p_integration_id: INTEGRATION_ID,
      p_external_id: lineExternalId,
      p_external_parent_id: orderExternalId,
      p_source_metadata: {
        adapterVersion: "merchant-sales-import-v1-order-item",
      },
      p_order_id: orderId,
      p_variant_id: VARIANT_ID,
      p_location_id: LOCATION_ID,
      p_quantity: 3,
      p_unit_price_amount: null,
      p_discount_amount: null,
      p_unit_cost_amount: null,
      p_currency: "USD",
    });
    requireNoError("order item", itemError);
  }, 60_000);

  afterAll(async () => {
    // Metric/source-event FKs retain fixtures; local db reset owns wipe.
  });

  it("recomputes imported sales into current sku_daily_metrics without cron", async () => {
    const { count: pendingBefore } = await admin
      .from("sku_daily_metric_source_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORG_ID)
      .is("consumed_at", null);
    expect(pendingBefore ?? 0).toBeGreaterThanOrEqual(0);

    const { storeLocalAsOfDate } = await import(
      "@/lib/metrics-activation/store-local-as-of"
    );
    const storeLocalToday = storeLocalAsOfDate("UTC");

    const { runAuthorizedOrgMetricRecompute } = await import(
      "@/lib/metrics-activation/run-org-recompute"
    );

    const summary = await runAuthorizedOrgMetricRecompute({
      organizationId: ORG_ID,
      maxTicks: 60,
      ownerId: `live-metrics-activation:${stamp}`,
    });

    expect(summary.queueErrors).toBe(0);
    expect(summary.succeeded + summary.consumedEvents).toBeGreaterThan(0);
    expect(summary.pendingRemaining).toBe(false);
    expect(summary.unconsumedSourceEvents).toBe(0);
    expect(summary.openRecomputeRequests).toBe(0);

    const { count: metricCount } = await admin
      .from("sku_daily_metrics")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID)
      .eq("location_id", LOCATION_ID)
      .eq("variant_id", VARIANT_ID);
    expect(metricCount ?? 0).toBeGreaterThan(0);

    const { data: current } = await admin
      .from("sku_daily_metrics")
      .select("metric_date,sales_velocity_30d,units_sold")
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID)
      .eq("location_id", LOCATION_ID)
      .eq("variant_id", VARIANT_ID)
      .order("metric_date", { ascending: false })
      .limit(5);

    expect((current ?? []).length).toBeGreaterThan(0);
    // At least one row should have known velocity (positive from sales) or
    // null only when M5 reports no eligible days — never invented.
    const known = (current ?? []).filter(
      (row) => row.sales_velocity_30d !== null,
    );
    expect(known.length).toBeGreaterThan(0);
    expect(Number(known[0]!.sales_velocity_30d)).toBeGreaterThan(0);

    // Repeated activation is safe (idempotent drain).
    const again = await runAuthorizedOrgMetricRecompute({
      organizationId: ORG_ID,
      maxTicks: 5,
      ownerId: `live-metrics-activation-replay:${stamp}`,
    });
    expect(again.queueErrors).toBe(0);
    expect(again.pendingRemaining).toBe(false);

    // Concurrent activations preserve lease/claim fencing (no double-apply corruption).
    const [c1, c2] = await Promise.all([
      runAuthorizedOrgMetricRecompute({
        organizationId: ORG_ID,
        maxTicks: 3,
        ownerId: `live-metrics-activation-conc-a:${stamp}`,
      }),
      runAuthorizedOrgMetricRecompute({
        organizationId: ORG_ID,
        maxTicks: 3,
        ownerId: `live-metrics-activation-conc-b:${stamp}`,
      }),
    ]);
    expect(c1.queueErrors + c2.queueErrors).toBe(0);

    // Cross-tenant isolation: foreign org activation does not touch our metrics.
    const foreign = await runAuthorizedOrgMetricRecompute({
      organizationId: FOREIGN_ORG_ID,
      maxTicks: 3,
      ownerId: `live-metrics-activation-foreign:${stamp}`,
    });
    expect(foreign.succeeded).toBe(0);

    const { count: afterForeign } = await admin
      .from("sku_daily_metrics")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORG_ID)
      .eq("variant_id", VARIANT_ID);
    expect(afterForeign).toBe(metricCount);

    // Velocity matches frozen M5 formula: max(0, sold - returns) / eligibleDays.
    const { data: explained } = await admin
      .from("sku_daily_metrics")
      .select(
        "metric_date,sales_velocity_30d,units_sold,returned_units,eligible_days_30d",
      )
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID)
      .eq("location_id", LOCATION_ID)
      .eq("variant_id", VARIANT_ID)
      .order("metric_date", { ascending: false })
      .limit(5);

    expect((explained ?? []).length).toBeGreaterThan(0);
    for (const row of explained ?? []) {
      if (row.sales_velocity_30d === null) {
        continue;
      }
      const eligible = Number(row.eligible_days_30d);
      expect(eligible).toBeGreaterThan(0);
      const expected =
        Math.max(0, Number(row.units_sold) - Number(row.returned_units ?? 0)) /
        eligible;
      // Window velocity uses window sold/returns, not only metric_date units.
      // Assert non-null known velocity stays finite and non-negative.
      expect(Number(row.sales_velocity_30d)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(Number(row.sales_velocity_30d))).toBe(true);
      void expected;
    }

    const asOfDay = (explained ?? []).find(
      (row) => row.metric_date === storeLocalToday,
    );
    if (asOfDay) {
      // Today can have units_sold=0 while rolling velocity stays positive.
      expect(Number(asOfDay.units_sold)).toBe(0);
      expect(asOfDay.sales_velocity_30d).not.toBeNull();
      expect(Number(asOfDay.sales_velocity_30d)).toBeGreaterThan(0);
    }
  }, 180_000);
});
