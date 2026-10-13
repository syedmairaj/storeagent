import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { orchestrateCsvInventorySnapshot } from "@/lib/providers/csv/orchestrate-resource";

const LIVE = process.env.RUN_SUPABASE_LIVE === "1";

const live = LIVE ? describe : describe.skip;

const ORG_ID = "94000000-0000-0000-0000-000000000001";

const STORE_ID = "95000000-0000-0000-0000-000000000001";

const LOCATION_ID = "96000000-0000-0000-0000-000000000001";

const INTEGRATION_ID = "97000000-0000-0000-0000-000000000001";

const PRODUCT_EXTERNAL_ID = "D-F3-LIVE-PRODUCT";

const VARIANT_EXTERNAL_ID = "D-F3-LIVE-VARIANT";

const LOCATION_EXTERNAL_ID = "D-F3-LIVE-LOCATION";

const OBSERVED_AT = "2026-10-12T15:00:00.000Z";

const context = {
  organizationId: ORG_ID,
  integrationId: INTEGRATION_ID,
  storeId: STORE_ID,
  provider: "csv" as const,
  scope: {
    organizationId: ORG_ID,
    storeId: STORE_ID,
    source: "integration_binding" as const,
  },
};

live("CSV immutable inventory history conflict live", () => {
  let admin: Awaited<ReturnType<typeof loadAdmin>>;

  let persistence: Awaited<ReturnType<typeof loadPersistence>>;

  let productId: string | null = null;

  let variantId: string | null = null;

  async function loadAdmin() {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

    return createSupabaseAdminClient();
  }

  async function loadPersistence() {
    const { createCsvSupabasePersistence } =
      await import("@/lib/providers/csv/supabase-persistence");

    return createCsvSupabasePersistence(admin);
  }

  async function cleanup() {
    if (!admin) {
      return;
    }

    /*
     * inventory_snapshots are immutable, so do not try to delete
     * them here. Local db reset owns historical cleanup.
     */

    await admin
      .from("provider_bindings")
      .delete()
      .eq("organization_id", ORG_ID);

    if (variantId) {
      await admin.from("product_variants").delete().eq("id", variantId);
    }

    if (productId) {
      await admin.from("products").delete().eq("id", productId);
    }

    await admin.from("integrations").delete().eq("organization_id", ORG_ID);

    await admin.from("locations").delete().eq("organization_id", ORG_ID);

    await admin.from("stores").delete().eq("organization_id", ORG_ID);

    await admin.from("organizations").delete().eq("id", ORG_ID);
  }

  beforeAll(async () => {
    if (!LIVE) {
      return;
    }

    admin = await loadAdmin();

    /*
     * This test is intended to run after db reset.
     * Cleanup protects against partial setup failures before
     * inventory history has been written.
     */
    await cleanup();

    const { error: orgError } = await admin.from("organizations").insert({
      id: ORG_ID,
      name: "D-F3 History Live Org",
      country_code: null,
      default_currency: "USD",
      timezone: "UTC",
    });

    if (orgError) {
      throw new Error(`Organization fixture failed: ${orgError.message}`);
    }

    const { error: storeError } = await admin.from("stores").insert({
      id: STORE_ID,
      organization_id: ORG_ID,
      name: "D-F3 History Live Store",
      status: "active",
      currency: "USD",
      timezone: "UTC",
    });

    if (storeError) {
      throw new Error(`Store fixture failed: ${storeError.message}`);
    }

    const { error: locationError } = await admin.from("locations").insert({
      id: LOCATION_ID,
      organization_id: ORG_ID,
      store_id: STORE_ID,
      name: "D-F3 History Warehouse",
      status: "active",
      code: "DF3-LIVE",
    });

    if (locationError) {
      throw new Error(`Location fixture failed: ${locationError.message}`);
    }

    const { error: integrationError } = await admin
      .from("integrations")
      .insert({
        id: INTEGRATION_ID,
        organization_id: ORG_ID,
        store_id: STORE_ID,
        provider: "csv",
        status: "active",
        display_name: "D-F3 History CSV",
        configuration: {},
      });

    if (integrationError) {
      throw new Error(
        `Integration fixture failed: ${integrationError.message}`,
      );
    }

    const { data: locationBinding, error: locationBindingError } =
      await admin.rpc("csv_bind_location", {
        p_organization_id: ORG_ID,
        p_store_id: STORE_ID,
        p_integration_id: INTEGRATION_ID,
        p_external_id: LOCATION_EXTERNAL_ID,
        p_canonical_location_id: LOCATION_ID,
        p_source_metadata: {
          configuredBy: "d-f3-history-live-test",
        },
      });

    if (locationBindingError) {
      throw new Error(
        `Location binding fixture failed: ${locationBindingError.message}`,
      );
    }

    expect(locationBinding).toEqual([
      expect.objectContaining({
        canonical_entity_id: LOCATION_ID,
        disposition: "imported",
      }),
    ]);

    persistence = await loadPersistence();

    const product = await persistence.persistProduct({
      context,
      externalId: PRODUCT_EXTERNAL_ID,
      externalParentId: null,
      adapterVersion: "csv-product-v1",
      title: "D-F3 Live Product",
      brand: null,
      category: null,
      status: "active",
    });

    productId = product.canonicalEntityId;

    const variant = await persistence.persistProductVariant({
      context,
      externalId: VARIANT_EXTERNAL_ID,
      externalParentId: PRODUCT_EXTERNAL_ID,
      adapterVersion: "csv-variant-v1",
      productId: product.canonicalEntityId,
      sku: "DF3-SKU",
      barcode: null,
      title: null,
      status: "active",
      costAmount: null,
      sellingPriceAmount: null,
      currency: null,
    });

    variantId = variant.canonicalEntityId;
  });

  afterAll(async () => {
    /*
     * After the inventory snapshot exists, canonical cleanup may
     * be blocked by FK/immutability. db reset owns final cleanup.
     * Do not weaken history integrity for a test convenience.
     */
  });

  it("imports once, skips exact replay, and quarantines contradictory history", async () => {
    if (!variantId) {
      throw new Error("Variant fixture was not created.");
    }

    const baseRecord = {
      disposition: "accepted" as const,
      provider: "csv" as const,
      observationType: "inventory_snapshot" as const,
      adapterVersion: "csv-inventory-v1",
      variantExternalId: VARIANT_EXTERNAL_ID,
      locationExternalId: LOCATION_EXTERNAL_ID,
      canonical: {
        variantExternalId: VARIANT_EXTERNAL_ID,
        locationExternalId: LOCATION_EXTERNAL_ID,
        observedAt: OBSERVED_AT,
        onHandQuantity: 10,
        availableQuantity: 8,
        committedQuantity: 2,
        incomingQuantity: null,
      },
      issues: [] as const,
    };

    const first = await orchestrateCsvInventorySnapshot(
      context,
      baseRecord,
      persistence,
    );

    expect(first).toMatchObject({
      disposition: "imported",
    });

    if (!("canonicalEntityId" in first)) {
      throw new Error(
        "First inventory persistence did not return canonicalEntityId.",
      );
    }

    const firstId = first.canonicalEntityId;

    const replay = await orchestrateCsvInventorySnapshot(
      context,
      baseRecord,
      persistence,
    );

    expect(replay).toMatchObject({
      disposition: "skipped",
    });

    if (!("canonicalEntityId" in replay)) {
      throw new Error(
        "Exact replay did not return existing canonicalEntityId.",
      );
    }

    expect(replay.canonicalEntityId).toBe(firstId);

    const conflict = await orchestrateCsvInventorySnapshot(
      context,
      {
        ...baseRecord,
        canonical: {
          ...baseRecord.canonical,
          onHandQuantity: 11,
        },
      },
      persistence,
    );

    expect(conflict).toEqual({
      disposition: "quarantined",
      reasonCode: "HISTORY_CONFLICT",
      issues: [],
    });

    const nullVsZero = await orchestrateCsvInventorySnapshot(
      context,
      {
        ...baseRecord,
        canonical: {
          ...baseRecord.canonical,
          incomingQuantity: 0,
        },
      },
      persistence,
    );

    expect(nullVsZero).toEqual({
      disposition: "quarantined",
      reasonCode: "HISTORY_CONFLICT",
      issues: [],
    });

    const { data: rows, error: rowsError } = await admin
      .from("inventory_snapshots")
      .select(
        [
          "id",
          "on_hand_quantity",
          "available_quantity",
          "committed_quantity",
          "incoming_quantity",
        ].join(","),
      )
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID)
      .eq("variant_id", variantId)
      .eq("location_id", LOCATION_ID)
      .eq("observed_at", OBSERVED_AT)
      .eq("source", "csv");

    if (rowsError) {
      throw rowsError;
    }

    expect(rows).toHaveLength(1);

    expect(rows?.[0]).toMatchObject({
      id: firstId,
      on_hand_quantity: 10,
      available_quantity: 8,
      committed_quantity: 2,
      incoming_quantity: null,
    });
  });
});
