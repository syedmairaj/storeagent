import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { orchestrateCsvProductVariant } from "@/lib/providers/csv/orchestrate-resource";

import { CsvPersistenceConflictError } from "@/lib/providers/csv/persistence-errors";

const LIVE = process.env.RUN_CSV_LIVE_TESTS === "1";

const ORG_ID = randomUUID();
const STORE_ID = randomUUID();
const INTEGRATION_ID = randomUUID();

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

const describeLive = LIVE ? describe : describe.skip;

type AdminModule = typeof import("@/lib/supabase/admin");

type AdminClient = ReturnType<AdminModule["createSupabaseAdminClient"]>;

type PersistenceModule =
  typeof import("@/lib/providers/csv/supabase-persistence");

type CsvPersistence = ReturnType<
  PersistenceModule["createCsvSupabasePersistence"]
>;

describeLive("CSV typed reconciliation conflict live", () => {
  let admin: AdminClient;
  let persistence: CsvPersistence;
  let productOneId: string;
  let productTwoId: string;

  beforeAll(async () => {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { createCsvSupabasePersistence } =
      await import("@/lib/providers/csv/supabase-persistence");

    admin = createSupabaseAdminClient();
    persistence = createCsvSupabasePersistence(admin);

    const { error: orgError } = await admin.from("organizations").insert({
      id: ORG_ID,
      name: "M3.9D-F1 Live Org",
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
      name: "M3.9D-F1 Live Store",
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
        display_name: "M3.9D-F1 CSV",
        configuration: {},
      });

    if (integrationError) {
      throw new Error(
        `Live fixture integration failed: ${integrationError.message}`,
      );
    }

    const productOne = await persistence.persistProduct({
      context,
      externalId: "PRODUCT-1",
      externalParentId: null,
      adapterVersion: "m3.9df1-product-v1",
      title: "Product One",
      brand: null,
      category: null,
      status: "active",
    });

    const productTwo = await persistence.persistProduct({
      context,
      externalId: "PRODUCT-2",
      externalParentId: null,
      adapterVersion: "m3.9df1-product-v1",
      title: "Product Two",
      brand: null,
      category: null,
      status: "active",
    });

    productOneId = productOne.canonicalEntityId;
    productTwoId = productTwo.canonicalEntityId;

    await persistence.persistProductVariant({
      context,
      externalId: "VARIANT-1",
      externalParentId: "PRODUCT-1",
      adapterVersion: "m3.9df1-variant-v1",
      productId: productOneId,
      sku: "DF1-SKU-1",
      barcode: null,
      title: null,
      status: "active",
      costAmount: null,
      sellingPriceAmount: null,
      currency: null,
    });
  });

  it("maps SA001 to typed conflict and quarantines through orchestration", async () => {
    let directError: unknown;

    try {
      await persistence.persistProductVariant({
        context,
        externalId: "VARIANT-1",
        externalParentId: "PRODUCT-2",
        adapterVersion: "m3.9df1-variant-v1",
        productId: productTwoId,
        sku: "DF1-SKU-1",
        barcode: null,
        title: null,
        status: "active",
        costAmount: null,
        sellingPriceAmount: null,
        currency: null,
      });
    } catch (error) {
      directError = error;
    }

    expect(directError).toBeInstanceOf(CsvPersistenceConflictError);

    const result = await orchestrateCsvProductVariant(
      context,
      {
        disposition: "accepted",
        provider: "csv",
        resourceType: "product_variant",
        externalId: "VARIANT-1",
        externalParentId: "PRODUCT-2",
        adapterVersion: "m3.9df1-variant-v1",
        canonical: {
          sku: "DF1-SKU-1",
          barcode: null,
          title: null,
          status: "active",
          costAmount: null,
          sellingPriceAmount: null,
          currency: null,
        },
        issues: [],
      },
      persistence,
    );

    expect(result).toEqual({
      disposition: "quarantined",
      reasonCode: "BINDING_CONFLICT",
      issues: [],
    });

    const { data: binding, error: bindingError } = await admin
      .from("provider_bindings")
      .select("canonical_entity_id")
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID)
      .eq("provider", "csv")
      .eq("resource_type", "product_variant")
      .eq("external_id", "VARIANT-1")
      .single();

    expect(bindingError).toBeNull();
    expect(binding?.canonical_entity_id).toBeTruthy();

    if (!binding?.canonical_entity_id) {
      throw new Error(
        "Expected product variant ProviderBinding to exist after reconciliation.",
      );
    }

    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .select("product_id")
      .eq("id", binding.canonical_entity_id)
      .single();

    expect(variantError).toBeNull();
    expect(variant?.product_id).toBe(productOneId);
  });
});
