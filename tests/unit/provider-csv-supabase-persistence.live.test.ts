import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ORG_ID = "91000000-0000-0000-0000-000000000001";

const STORE_ID = "92000000-0000-0000-0000-000000000001";

const INTEGRATION_ID = "93000000-0000-0000-0000-000000000001";

const OTHER_INTEGRATION_ID = "93000000-0000-0000-0000-000000000002";

const PRODUCT_EXTERNAL_ID = "M3.9D-LIVE-PRODUCT";

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

describe("CSV Supabase persistence live", () => {
  let admin: Awaited<ReturnType<typeof loadAdmin>>;

  let persistence: Awaited<ReturnType<typeof loadPersistence>>;

  async function loadAdmin() {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

    return createSupabaseAdminClient();
  }

  async function loadPersistence() {
    const { createCsvSupabasePersistence } =
      await import("@/lib/providers/csv/supabase-persistence");

    return createCsvSupabasePersistence();
  }

  async function cleanup() {
    if (!admin) {
      return;
    }

    const { data: productBindings } = await admin
      .from("provider_bindings")
      .select("canonical_entity_id")
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID)
      .eq("provider", "csv")
      .eq("resource_type", "product")
      .eq("external_id", PRODUCT_EXTERNAL_ID);

    const productIds = (productBindings ?? [])
      .map((row) => row.canonical_entity_id)
      .filter((value): value is string => typeof value === "string");

    await admin
      .from("provider_bindings")
      .delete()
      .eq("organization_id", ORG_ID);

    if (productIds.length > 0) {
      await admin.from("products").delete().in("id", productIds);
    }

    await admin.from("integrations").delete().eq("organization_id", ORG_ID);

    await admin.from("stores").delete().eq("organization_id", ORG_ID);

    await admin.from("organizations").delete().eq("id", ORG_ID);
  }

  beforeAll(async () => {
    admin = await loadAdmin();

    await cleanup();

    const { error: orgError } = await admin.from("organizations").insert({
      id: ORG_ID,
      name: "M3.9D Live Org",
      country_code: null,
      default_currency: "USD",
      timezone: "UTC",
    });

    if (orgError) {
      throw new Error(`Live fixture organization failed: ${orgError.message}`);
    }

    const { error: storeError } = await admin.from("stores").insert({
      id: STORE_ID,
      organization_id: ORG_ID,
      name: "M3.9D Live Store",
      status: "active",
      currency: "USD",
      timezone: "UTC",
    });

    if (storeError) {
      throw new Error(`Live fixture store failed: ${storeError.message}`);
    }

    const { error: integrationError } = await admin
      .from("integrations")
      .insert({
        id: INTEGRATION_ID,
        organization_id: ORG_ID,
        store_id: STORE_ID,
        provider: "csv",
        status: "active",
        display_name: "M3.9D Live CSV",
        configuration: {},
      });

    if (integrationError) {
      throw new Error(
        `Live fixture integration failed: ${integrationError.message}`,
      );
    }

    persistence = await loadPersistence();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("imports, resolves, replays, and updates one CSV product through the real Supabase adapter", async () => {
    const imported = await persistence.persistProduct({
      context,
      externalId: PRODUCT_EXTERNAL_ID,
      externalParentId: null,
      adapterVersion: "csv-product-v1",
      title: "M3.9D Live Product",
      brand: "Live Brand",
      category: "Live Category",
      status: "active",
    });

    expect(imported.disposition).toBe("imported");

    expect(imported.canonicalEntityId).toMatch(/^[0-9a-f-]{36}$/i);

    const resolved = await persistence.resolveBinding({
      organizationId: ORG_ID,
      integrationId: INTEGRATION_ID,
      provider: "csv",
      resourceType: "product",
      externalId: PRODUCT_EXTERNAL_ID,
    });

    expect(resolved).toEqual({
      canonicalEntityId: imported.canonicalEntityId,
    });

    const replay = await persistence.persistProduct({
      context,
      externalId: PRODUCT_EXTERNAL_ID,
      externalParentId: null,
      adapterVersion: "csv-product-v1",
      title: "M3.9D Live Product",
      brand: "Live Brand",
      category: "Live Category",
      status: "active",
    });

    expect(replay).toEqual({
      canonicalEntityId: imported.canonicalEntityId,
      disposition: "skipped",
    });

    const updated = await persistence.persistProduct({
      context,
      externalId: PRODUCT_EXTERNAL_ID,
      externalParentId: null,
      adapterVersion: "csv-product-v1",
      title: "M3.9D Live Product Updated",
      brand: "Live Brand",
      category: "Live Category",
      status: "active",
    });

    expect(updated).toEqual({
      canonicalEntityId: imported.canonicalEntityId,
      disposition: "updated",
    });

    const { data: product, error: productError } = await admin
      .from("products")
      .select("id,title")
      .eq("id", imported.canonicalEntityId)
      .single();

    expect(productError).toBeNull();

    expect(product).toEqual({
      id: imported.canonicalEntityId,
      title: "M3.9D Live Product Updated",
    });
  });

  it("does not resolve the same external ID outside the durable integration namespace", async () => {
    const result = await persistence.resolveBinding({
      organizationId: ORG_ID,
      integrationId: OTHER_INTEGRATION_ID,
      provider: "csv",
      resourceType: "product",
      externalId: PRODUCT_EXTERNAL_ID,
    });

    expect(result).toBeNull();
  });
});
