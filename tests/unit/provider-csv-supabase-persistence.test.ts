import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { createCsvSupabasePersistence } from "@/lib/providers/csv/supabase-persistence";

const context = {
  organizationId: "org-1",
  integrationId: "integration-1",
  storeId: "store-1",
  provider: "csv" as const,
  scope: {
    organizationId: "org-1",
    storeId: "store-1",
    source: "integration_binding" as const,
  },
};

function rpcClient() {
  const rpc = vi.fn().mockResolvedValue({
    data: [
      {
        canonical_entity_id: "canonical-1",
        disposition: "imported",
      },
    ],
    error: null,
  });

  return {
    rpc,
    from: vi.fn(),
  };
}

describe("CSV Supabase persistence", () => {
  it("uses the full durable ProviderBinding namespace", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        canonical_entity_id: "variant-1",
      },
      error: null,
    });

    const eqExternalId = vi.fn(() => ({
      maybeSingle,
    }));

    const eqResourceType = vi.fn(() => ({
      eq: eqExternalId,
    }));

    const eqProvider = vi.fn(() => ({
      eq: eqResourceType,
    }));

    const eqIntegration = vi.fn(() => ({
      eq: eqProvider,
    }));

    const eqOrganization = vi.fn(() => ({
      eq: eqIntegration,
    }));

    const select = vi.fn(() => ({
      eq: eqOrganization,
    }));

    const from = vi.fn(() => ({
      select,
    }));

    const client = {
      from,
      rpc: vi.fn(),
    };

    const persistence = createCsvSupabasePersistence(client as never);

    const result = await persistence.resolveBinding({
      organizationId: "org-1",
      integrationId: "integration-1",
      provider: "csv",
      resourceType: "product_variant",
      externalId: "sku=AbC-123",
    });

    expect(result).toEqual({
      canonicalEntityId: "variant-1",
    });

    expect(from).toHaveBeenCalledWith("provider_bindings");

    expect(select).toHaveBeenCalledWith("canonical_entity_id");

    expect(eqOrganization).toHaveBeenCalledWith("organization_id", "org-1");

    expect(eqIntegration).toHaveBeenCalledWith(
      "integration_id",
      "integration-1",
    );

    expect(eqProvider).toHaveBeenCalledWith("provider", "csv");

    expect(eqResourceType).toHaveBeenCalledWith(
      "resource_type",
      "product_variant",
    );

    expect(eqExternalId).toHaveBeenCalledWith("external_id", "sku=AbC-123");
  });

  it("returns null when ProviderBinding is absent", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    const chain: {
      eq: ReturnType<typeof vi.fn>;
      maybeSingle: typeof maybeSingle;
    } = {
      eq: vi.fn(),
      maybeSingle,
    };

    chain.eq.mockReturnValue(chain);

    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => chain),
      })),
      rpc: vi.fn(),
    };

    const persistence = createCsvSupabasePersistence(client as never);

    const result = await persistence.resolveBinding({
      organizationId: "org-1",
      integrationId: "integration-1",
      provider: "csv",
      resourceType: "product",
      externalId: "missing",
    });

    expect(result).toBeNull();
  });

  it("calls product reconciliation with exact RPC payload keys", async () => {
    const client = rpcClient();

    const persistence = createCsvSupabasePersistence(client as never);

    const result = await persistence.persistProduct({
      context,
      externalId: "PRODUCT-1",
      externalParentId: null,
      adapterVersion: "csv-product-v1",
      title: "Product 1",
      brand: "Brand",
      category: "Category",
      status: "active",
    });

    expect(result).toEqual({
      canonicalEntityId: "canonical-1",
      disposition: "imported",
    });

    expect(client.rpc).toHaveBeenCalledWith("csv_reconcile_product", {
      p_organization_id: "org-1",
      p_store_id: "store-1",
      p_integration_id: "integration-1",
      p_external_id: "PRODUCT-1",
      p_external_parent_id: null,
      p_source_metadata: {
        adapterVersion: "csv-product-v1",
      },
      p_title: "Product 1",
      p_brand: "Brand",
      p_category: "Category",
      p_status: "active",
    });
  });

  it("preserves exact decimal strings in variant RPC arguments", async () => {
    const client = rpcClient();

    const persistence = createCsvSupabasePersistence(client as never);

    await persistence.persistProductVariant({
      context,
      externalId: "VARIANT-1",
      externalParentId: "PRODUCT-1",
      adapterVersion: "csv-variant-v1",
      productId: "product-uuid",
      sku: "SKU-1",
      barcode: null,
      title: null,
      status: "active",
      costAmount: "10.2500",
      sellingPriceAmount: "19.9900",
      currency: "USD",
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "csv_reconcile_product_variant",
      expect.objectContaining({
        p_cost_amount: "10.2500",
        p_selling_price_amount: "19.9900",
      }),
    );
  });

  it("calls inventory append RPC without ProviderBinding metadata", async () => {
    const client = rpcClient();

    const persistence = createCsvSupabasePersistence(client as never);

    await persistence.appendInventorySnapshot({
      context,
      variantId: "variant-uuid",
      locationId: "location-uuid",
      observedAt: "2026-10-11T10:00:00.000Z",
      onHandQuantity: 10,
      availableQuantity: 8,
      committedQuantity: 2,
      incomingQuantity: null,
    });

    expect(client.rpc).toHaveBeenCalledWith("csv_append_inventory_snapshot", {
      p_organization_id: "org-1",
      p_store_id: "store-1",
      p_integration_id: "integration-1",
      p_variant_id: "variant-uuid",
      p_location_id: "location-uuid",
      p_observed_at: "2026-10-11T10:00:00.000Z",
      p_on_hand_quantity: 10,
      p_available_quantity: 8,
      p_committed_quantity: 2,
      p_incoming_quantity: null,
    });
  });

  it("calls supplier-product reconciliation with canonical relationship IDs", async () => {
    const client = rpcClient();

    const persistence = createCsvSupabasePersistence(client as never);

    await persistence.persistSupplierProduct({
      context,
      supplierId: "supplier-uuid",
      variantId: "variant-uuid",
      supplierSku: "SUP-SKU",
      unitCostAmount: "4.2500",
      currency: "USD",
      leadTimeDays: 5,
      minimumOrderQuantity: 10,
      packSize: 2,
      preferred: true,
    });

    expect(client.rpc).toHaveBeenCalledWith("csv_reconcile_supplier_product", {
      p_organization_id: "org-1",
      p_integration_id: "integration-1",
      p_supplier_id: "supplier-uuid",
      p_variant_id: "variant-uuid",
      p_supplier_sku: "SUP-SKU",
      p_unit_cost_amount: "4.2500",
      p_currency: "USD",
      p_lead_time_days: 5,
      p_minimum_order_quantity: 10,
      p_pack_size: 2,
      p_preferred: true,
    });
  });

  it("fails closed when store-scoped persistence receives org-only context", async () => {
    const client = rpcClient();

    const persistence = createCsvSupabasePersistence(client as never);

    await expect(
      persistence.persistProduct({
        context: {
          ...context,
          storeId: null,
          scope: {
            organizationId: "org-1",
            storeId: null,
            source: "integration_binding",
          },
        },
        externalId: "PRODUCT-1",
        externalParentId: null,
        adapterVersion: "csv-product-v1",
        title: "Product 1",
        brand: null,
        category: null,
        status: "active",
      }),
    ).rejects.toThrow(
      "CSV persistence requires a store-scoped trusted integration.",
    );

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects unexpected RPC disposition", async () => {
    const client = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            canonical_entity_id: "canonical-1",
            disposition: "mystery",
          },
        ],
        error: null,
      }),
    };

    const persistence = createCsvSupabasePersistence(client as never);

    await expect(
      persistence.persistSupplier({
        context,
        externalId: "SUP-1",
        externalParentId: null,
        adapterVersion: "csv-supplier-v1",
        name: "Supplier",
        defaultLeadTimeDays: null,
        currency: null,
        email: null,
        phone: null,
      }),
    ).rejects.toThrow('Unexpected CSV persistence disposition "mystery".');
  });

  it("surfaces Supabase RPC errors as operational failures", async () => {
    const client = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message: "database unavailable",
        },
      }),
    };

    const persistence = createCsvSupabasePersistence(client as never);

    await expect(
      persistence.persistSupplier({
        context,
        externalId: "SUP-1",
        externalParentId: null,
        adapterVersion: "csv-supplier-v1",
        name: "Supplier",
        defaultLeadTimeDays: null,
        currency: null,
        email: null,
        phone: null,
      }),
    ).rejects.toThrow(
      'CSV persistence RPC "csv_reconcile_supplier" failed: database unavailable',
    );
  });
});
