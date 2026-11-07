import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const live = LIVE ? describe : describe.skip;

const ORG_ID = "b1000000-0000-0000-0000-000000000082";
const STORE_ID = "b2000000-0000-0000-0000-000000000082";
const LOCATION_ID = "b3000000-0000-0000-0000-000000000082";
const INTEGRATION_ID = "b4000000-0000-0000-0000-000000000082";
const PRODUCT_ID = "b5000000-0000-0000-0000-000000000082";
const VARIANT_ID = "b6000000-0000-0000-0000-000000000082";

const ORDERED_AT = "2026-10-08T12:00:00.000Z";

const MERCHANT_ORDER_META = {
  adapterVersion: "merchant-sales-import-v1-order",
};
const MERCHANT_ITEM_META = {
  adapterVersion: "merchant-sales-import-v1-order-item",
};

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

live("merchant sales history immutable concurrent writers", () => {
  let admin: Awaited<ReturnType<typeof loadAdmin>>;
  const stamp = Date.now();
  const orderExternalId = `MSI-CONC-ORD-${stamp}`;
  const lineExternalId = `MSI-CONC-LINE-${stamp}`;
  const legacyExternalId = `MSI-LEGACY-LINE-${stamp}`;
  let orderId = "";

  beforeAll(async () => {
    admin = await loadAdmin();

    const { data: existingOrg } = await admin
      .from("organizations")
      .select("id")
      .eq("id", ORG_ID)
      .maybeSingle();

    if (!existingOrg) {
      requireNoError(
        "org",
        (
          await admin.from("organizations").insert({
            id: ORG_ID,
            name: "MSI Concurrent Org",
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
            name: "MSI Concurrent Store",
            status: "active",
            timezone: "UTC",
            currency: "USD",
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
            name: "MSI Concurrent Location",
            status: "active",
            code: "MSI-CONC",
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
            display_name: "MSI Concurrent CSV",
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
            title: "MSI Concurrent Product",
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
            sku: "MSI-CONC-SKU",
            status: "active",
          })
        ).error,
      );
    }

    const { data: orderRows, error: orderError } = await admin.rpc(
      "csv_reconcile_order",
      {
        p_organization_id: ORG_ID,
        p_store_id: STORE_ID,
        p_integration_id: INTEGRATION_ID,
        p_external_id: orderExternalId,
        p_external_parent_id: null,
        p_source_metadata: MERCHANT_ORDER_META,
        p_external_reference: orderExternalId,
        p_status: "completed",
        p_ordered_at: ORDERED_AT,
        p_currency: "USD",
        p_gross_amount: null,
        p_discount_amount: null,
        p_net_amount: null,
      },
    );
    requireNoError("seed order", orderError);
    orderId = String(
      (orderRows as Array<{ canonical_entity_id: string }>)[0]!
        .canonical_entity_id,
    );
  }, 60_000);

  afterAll(async () => {
    // Metric/source-event FKs retain fixtures; local db reset owns wipe.
  });

  async function readLineQuantity(externalId: string): Promise<number> {
    const { data: binding, error: bindingError } = await admin
      .from("provider_bindings")
      .select("canonical_entity_id")
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID)
      .eq("provider", "csv")
      .eq("resource_type", "order_item")
      .eq("external_id", externalId)
      .single();
    requireNoError("read binding", bindingError);

    const { data: item, error: itemError } = await admin
      .from("order_items")
      .select("quantity")
      .eq("id", binding!.canonical_entity_id)
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID)
      .single();
    requireNoError("read item", itemError);
    return Number(item!.quantity);
  }

  it("lets one conflicting concurrent writer win and rejects the other with SA002", async () => {
    const baseArgs = {
      p_organization_id: ORG_ID,
      p_store_id: STORE_ID,
      p_integration_id: INTEGRATION_ID,
      p_external_id: lineExternalId,
      p_external_parent_id: orderExternalId,
      p_source_metadata: MERCHANT_ITEM_META,
      p_order_id: orderId,
      p_variant_id: VARIANT_ID,
      p_location_id: LOCATION_ID,
      p_unit_price_amount: null,
      p_discount_amount: null,
      p_unit_cost_amount: null,
      p_currency: "USD",
    };

    const [a, b] = await Promise.all([
      admin.rpc("csv_reconcile_order_item", { ...baseArgs, p_quantity: 4 }),
      admin.rpc("csv_reconcile_order_item", { ...baseArgs, p_quantity: 99 }),
    ]);

    const results = [a, b];
    const successes = results.filter((r) => r.error == null);
    const conflicts = results.filter((r) => r.error?.code === "SA002");

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(
      (successes[0]!.data as Array<{ disposition: string }>)[0]!.disposition,
    ).toBe("imported");

    const quantity = await readLineQuantity(lineExternalId);
    expect([4, 99]).toContain(quantity);

    const { count: itemCount } = await admin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID)
      .eq("order_id", orderId);
    expect(itemCount).toBe(1);

    const { count: bindingCount } = await admin
      .from("provider_bindings")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID)
      .eq("resource_type", "order_item")
      .eq("external_id", lineExternalId);
    expect(bindingCount).toBe(1);

    const winnerArgs = { ...baseArgs, p_quantity: quantity };
    const loserArgs = {
      ...baseArgs,
      p_quantity: quantity === 4 ? 99 : 4,
    };

    const replay = await admin.rpc("csv_reconcile_order_item", winnerArgs);
    expect(replay.error).toBeNull();
    expect(
      (replay.data as Array<{ disposition: string }>)[0]!.disposition,
    ).toBe("skipped");

    const conflictReplay = await admin.rpc(
      "csv_reconcile_order_item",
      loserArgs,
    );
    expect(conflictReplay.error?.code).toBe("SA002");
    expect(await readLineQuantity(lineExternalId)).toBe(quantity);

    // Existing binding is merchant-sales: legacy adapter cannot overwrite.
    const legacy = await admin.rpc("csv_reconcile_order_item", {
      ...loserArgs,
      p_source_metadata: { adapterVersion: "legacy-csv-order-item-v1" },
    });
    expect(legacy.error?.code).toBe("SA002");
    expect(await readLineQuantity(lineExternalId)).toBe(quantity);
  }, 60_000);

  it("allows non-merchant CSV order-item commercial updates", async () => {
    const legacyMeta = { adapterVersion: "legacy-csv-order-item-v1" };

    const first = await admin.rpc("csv_reconcile_order_item", {
      p_organization_id: ORG_ID,
      p_store_id: STORE_ID,
      p_integration_id: INTEGRATION_ID,
      p_external_id: legacyExternalId,
      p_external_parent_id: orderExternalId,
      p_source_metadata: legacyMeta,
      p_order_id: orderId,
      p_variant_id: VARIANT_ID,
      p_location_id: LOCATION_ID,
      p_quantity: 2,
      p_unit_price_amount: null,
      p_discount_amount: null,
      p_unit_cost_amount: null,
      p_currency: "USD",
    });
    expect(first.error).toBeNull();
    expect(
      (first.data as Array<{ disposition: string }>)[0]!.disposition,
    ).toBe("imported");

    const updated = await admin.rpc("csv_reconcile_order_item", {
      p_organization_id: ORG_ID,
      p_store_id: STORE_ID,
      p_integration_id: INTEGRATION_ID,
      p_external_id: legacyExternalId,
      p_external_parent_id: orderExternalId,
      p_source_metadata: legacyMeta,
      p_order_id: orderId,
      p_variant_id: VARIANT_ID,
      p_location_id: LOCATION_ID,
      p_quantity: 7,
      p_unit_price_amount: null,
      p_discount_amount: null,
      p_unit_cost_amount: null,
      p_currency: "USD",
    });
    expect(updated.error).toBeNull();
    expect(
      (updated.data as Array<{ disposition: string }>)[0]!.disposition,
    ).toBe("updated");

    expect(await readLineQuantity(legacyExternalId)).toBe(7);
  }, 30_000);
});
