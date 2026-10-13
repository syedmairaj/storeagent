import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";

const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_ID = "a1000000-0000-0000-0000-000000000001";
const STORE_ID = "a2000000-0000-0000-0000-000000000001";
const INTEGRATION_ID = "a3000000-0000-0000-0000-000000000001";

async function loadAdmin() {
  const mod = await import("@/lib/supabase/admin");
  return mod.createSupabaseAdminClient();
}

async function loadPersistence() {
  const mod = await import("@/lib/providers/csv/supabase-persistence");
  return mod.createCsvSupabasePersistence;
}

function requireNoError(
  label: string,
  error: { message: string } | null,
): void {
  if (error !== null) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}

async function cleanupFixture(): Promise<void> {
  const admin = await loadAdmin();

  const { error: bindingError } = await admin
    .from("provider_bindings")
    .delete()
    .eq("organization_id", ORG_ID);

  requireNoError("provider binding cleanup", bindingError);

  const { error: variantError } = await admin
    .from("product_variants")
    .delete()
    .eq("organization_id", ORG_ID);

  requireNoError("product variant cleanup", variantError);

  const { error: productError } = await admin
    .from("products")
    .delete()
    .eq("organization_id", ORG_ID);

  requireNoError("product cleanup", productError);

  const { error: integrationError } = await admin
    .from("integrations")
    .delete()
    .eq("organization_id", ORG_ID);

  requireNoError("integration cleanup", integrationError);

  const { error: storeError } = await admin
    .from("stores")
    .delete()
    .eq("organization_id", ORG_ID);

  requireNoError("store cleanup", storeError);

  const { error: organizationError } = await admin
    .from("organizations")
    .delete()
    .eq("id", ORG_ID);

  requireNoError("organization cleanup", organizationError);
}

const context: CsvTrustedImportContext = {
  organizationId: ORG_ID,
  integrationId: INTEGRATION_ID,
  storeId: STORE_ID,
  provider: "csv",
  scope: {
    organizationId: ORG_ID,
    storeId: STORE_ID,
    source: "integration_binding",
  },
};

describeLive("CSV absent-binding concurrency live Supabase E2E", () => {
  beforeAll(async () => {
    await cleanupFixture();

    const admin = await loadAdmin();

    const { error: orgError } = await admin.from("organizations").insert({
      id: ORG_ID,
      name: "D-F4 Concurrency Org",
      country_code: null,
      default_currency: "USD",
      timezone: "UTC",
    });

    requireNoError("organization fixture", orgError);

    const { error: storeError } = await admin.from("stores").insert({
      id: STORE_ID,
      organization_id: ORG_ID,
      name: "D-F4 Store",
      status: "active",
      currency: "USD",
      timezone: "UTC",
    });

    requireNoError("store fixture", storeError);

    const { error: integrationError } = await admin
      .from("integrations")
      .insert({
        id: INTEGRATION_ID,
        organization_id: ORG_ID,
        store_id: STORE_ID,
        provider: "csv",
        status: "active",
        display_name: "D-F4 CSV",
        configuration: {},
      });

    requireNoError("integration fixture", integrationError);

    const { data: integration, error: lookupError } = await admin
      .from("integrations")
      .select("id, organization_id, store_id, provider, status")
      .eq("id", INTEGRATION_ID)
      .eq("organization_id", ORG_ID)
      .eq("provider", "csv")
      .maybeSingle();

    requireNoError("integration verification", lookupError);

    expect(integration).toMatchObject({
      id: INTEGRATION_ID,
      organization_id: ORG_ID,
      store_id: STORE_ID,
      provider: "csv",
      status: "active",
    });
  });

  it("serializes 50 concurrent first-product creates to one canonical winner", async () => {
    const admin = await loadAdmin();
    const createPersistence = await loadPersistence();
    const persistence = createPersistence(admin);

    const calls = Array.from({ length: 50 }, () =>
      persistence.persistProduct({
        context,
        externalId: "DF4-PRODUCT-1",
        externalParentId: null,
        adapterVersion: "df4-live",
        title: "Concurrent Product",
        brand: "StoreAgent",
        category: "Test",
        status: "active",
      }),
    );

    const results = await Promise.all(calls);

    const canonicalIds = new Set(
      results.map((result) => result.canonicalEntityId),
    );

    expect(canonicalIds.size).toBe(1);

    const dispositions = results.map((result) => result.disposition);

    expect(dispositions.filter((value) => value === "imported")).toHaveLength(
      1,
    );

    expect(dispositions.filter((value) => value === "skipped")).toHaveLength(
      49,
    );

    const [winnerId] = [...canonicalIds];

    const { count: productCount, error: productCountError } = await admin
      .from("products")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID);

    expect(productCountError).toBeNull();
    expect(productCount).toBe(1);

    const { data: bindings, error: bindingError } = await admin
      .from("provider_bindings")
      .select("canonical_entity_id")
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID)
      .eq("provider", "csv")
      .eq("resource_type", "product")
      .eq("external_id", "DF4-PRODUCT-1");

    expect(bindingError).toBeNull();
    expect(bindings).toHaveLength(1);
    expect(bindings?.[0]?.canonical_entity_id).toBe(winnerId);
  });

  it("keeps concurrent immutable-parent conflicts fail-closed with one winner and no orphan variant", async () => {
    const admin = await loadAdmin();
    const createPersistence = await loadPersistence();
    const persistence = createPersistence(admin);

    const parentA = await persistence.persistProduct({
      context,
      externalId: "DF4-PARENT-A",
      externalParentId: null,
      adapterVersion: "df4-live",
      title: "Parent A",
      brand: null,
      category: null,
      status: "active",
    });

    const parentB = await persistence.persistProduct({
      context,
      externalId: "DF4-PARENT-B",
      externalParentId: null,
      adapterVersion: "df4-live",
      title: "Parent B",
      brand: null,
      category: null,
      status: "active",
    });

    const attempt = (productId: string) =>
      persistence.persistProductVariant({
        context,
        externalId: "DF4-VARIANT-RACE",
        externalParentId: null,
        adapterVersion: "df4-live",
        productId,
        sku: "DF4-SKU",
        barcode: null,
        title: "Concurrent Variant",
        status: "active",
        costAmount: null,
        sellingPriceAmount: null,
        currency: null,
      });

    const settled = await Promise.allSettled([
      attempt(parentA.canonicalEntityId),
      attempt(parentB.canonicalEntityId),
    ]);

    const fulfilled = settled.filter(
      (
        entry,
      ): entry is PromiseFulfilledResult<Awaited<ReturnType<typeof attempt>>> =>
        entry.status === "fulfilled",
    );

    const rejected = settled.filter(
      (entry): entry is PromiseRejectedResult => entry.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    expect(rejected[0]?.reason).toMatchObject({
      reasonCode: "BINDING_CONFLICT",
    });

    const { count: variantCount, error: variantCountError } = await admin
      .from("product_variants")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID)
      .eq("sku", "DF4-SKU");

    expect(variantCountError).toBeNull();
    expect(variantCount).toBe(1);

    const { data: bindings, error: bindingError } = await admin
      .from("provider_bindings")
      .select("canonical_entity_id")
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID)
      .eq("provider", "csv")
      .eq("resource_type", "product_variant")
      .eq("external_id", "DF4-VARIANT-RACE");

    expect(bindingError).toBeNull();
    expect(bindings).toHaveLength(1);

    expect(bindings?.[0]?.canonical_entity_id).toBe(
      fulfilled[0]?.value.canonicalEntityId,
    );
  });
  it("keeps the same external ID independent across two CSV integrations", async () => {
    const admin = await loadAdmin();
    const createPersistence = await loadPersistence();
    const persistence = createPersistence(admin);

    const otherIntegrationId = "a3000000-0000-0000-0000-000000000002";

    const { error: integrationError } = await admin
      .from("integrations")
      .insert({
        id: otherIntegrationId,
        organization_id: ORG_ID,
        store_id: STORE_ID,
        provider: "csv",
        status: "active",
        display_name: "D-F4 CSV Other",
        configuration: {},
      });

    requireNoError("second integration fixture", integrationError);

    const otherContext: CsvTrustedImportContext = {
      organizationId: ORG_ID,
      integrationId: otherIntegrationId,
      storeId: STORE_ID,
      provider: "csv",
      scope: {
        organizationId: ORG_ID,
        storeId: STORE_ID,
        source: "integration_binding",
      },
    };

    const externalId = "DF4-SHARED-EXTERNAL-ID";

    const [first, second] = await Promise.all([
      persistence.persistProduct({
        context,
        externalId,
        externalParentId: null,
        adapterVersion: "df4-live",
        title: "Integration One Product",
        brand: null,
        category: null,
        status: "active",
      }),
      persistence.persistProduct({
        context: otherContext,
        externalId,
        externalParentId: null,
        adapterVersion: "df4-live",
        title: "Integration Two Product",
        brand: null,
        category: null,
        status: "active",
      }),
    ]);

    expect(first.disposition).toBe("imported");
    expect(second.disposition).toBe("imported");

    expect(first.canonicalEntityId).not.toBe(second.canonicalEntityId);

    const { data: bindings, error: bindingError } = await admin
      .from("provider_bindings")
      .select("integration_id,canonical_entity_id")
      .eq("organization_id", ORG_ID)
      .eq("provider", "csv")
      .eq("resource_type", "product")
      .eq("external_id", externalId)
      .order("integration_id");

    expect(bindingError).toBeNull();
    expect(bindings).toHaveLength(2);

    const canonicalIds = new Set(
      (bindings ?? []).map((row) => row.canonical_entity_id),
    );

    expect(canonicalIds.size).toBe(2);

    expect(new Set((bindings ?? []).map((row) => row.integration_id))).toEqual(
      new Set([INTEGRATION_ID, otherIntegrationId]),
    );
  });
  afterAll(async () => {
    await cleanupFixture();
  });
});
