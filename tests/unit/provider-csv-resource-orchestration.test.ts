import { describe, expect, it, vi } from "vitest";

import {
  orchestrateCsvInventorySnapshot,
  orchestrateCsvOrderItem,
  orchestrateCsvProductVariant,
  orchestrateCsvSupplierProduct,
} from "@/lib/providers/csv/orchestrate-resource";

import type { CsvResourcePersistencePort } from "@/lib/providers/csv/resource-orchestration";

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

function port(): CsvResourcePersistencePort {
  return {
    resolveBinding: vi.fn(),

    persistProduct: vi.fn(),

    persistProductVariant: vi.fn(),

    appendInventorySnapshot: vi.fn(),

    persistOrder: vi.fn(),

    persistOrderItem: vi.fn(),

    persistSupplier: vi.fn(),

    persistSupplierProduct: vi.fn(),

    persistPurchaseOrder: vi.fn(),

    persistPurchaseOrderItem: vi.fn(),
  };
}

describe("CSV resource orchestration", () => {
  it("resolves variant parent strictly through product ProviderBinding", async () => {
    const persistence = port();

    vi.mocked(persistence.resolveBinding).mockResolvedValue({
      canonicalEntityId: "product-1",
    });

    vi.mocked(persistence.persistProductVariant).mockResolvedValue({
      canonicalEntityId: "variant-1",
      disposition: "imported",
    });

    const result = await orchestrateCsvProductVariant(
      context,
      {
        disposition: "accepted",
        provider: "csv",
        resourceType: "product_variant",
        externalId: "variant-ext",
        externalParentId: "product-ext",
        adapterVersion: "csv-variant-v1",
        canonical: {
          sku: "SKU-1",
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
      canonicalEntityId: "variant-1",
      disposition: "imported",
    });

    expect(persistence.resolveBinding).toHaveBeenCalledWith({
      organizationId: "org-1",
      integrationId: "integration-1",
      provider: "csv",
      resourceType: "product",
      externalId: "product-ext",
    });
  });

  it("resolves inventory SKU fallback only as ProviderBinding external identity", async () => {
    const persistence = port();

    vi.mocked(persistence.resolveBinding)
      .mockResolvedValueOnce({
        canonicalEntityId: "variant-1",
      })
      .mockResolvedValueOnce({
        canonicalEntityId: "location-1",
      });

    vi.mocked(persistence.appendInventorySnapshot).mockResolvedValue({
      canonicalEntityId: "snapshot-1",
      disposition: "imported",
    });

    const result = await orchestrateCsvInventorySnapshot(
      context,
      {
        disposition: "accepted",
        provider: "csv",
        observationType: "inventory_snapshot",
        adapterVersion: "inventory-v1",
        variantExternalId: "sku=AbC-123",
        locationExternalId: "LOCATION-1",
        canonical: {
          variantExternalId: "sku=AbC-123",
          locationExternalId: "LOCATION-1",
          observedAt: "2026-10-11T10:00:00.000Z",
          onHandQuantity: 10,
          availableQuantity: 8,
          committedQuantity: 2,
          incomingQuantity: null,
        },
        issues: [],
      },
      persistence,
    );

    expect(result).toEqual({
      canonicalEntityId: "snapshot-1",
      disposition: "imported",
    });

    expect(persistence.resolveBinding).toHaveBeenNthCalledWith(1, {
      organizationId: "org-1",
      integrationId: "integration-1",
      provider: "csv",
      resourceType: "product_variant",
      externalId: "sku=AbC-123",
    });

    expect(persistence.resolveBinding).toHaveBeenNthCalledWith(2, {
      organizationId: "org-1",
      integrationId: "integration-1",
      provider: "csv",
      resourceType: "location",
      externalId: "LOCATION-1",
    });
  });

  it("quarantines unresolved required relationship without persisting child", async () => {
    const persistence = port();

    vi.mocked(persistence.resolveBinding).mockResolvedValue(null);

    const result = await orchestrateCsvOrderItem(
      context,
      {
        disposition: "accepted",
        provider: "csv",
        resourceType: "order_item",
        externalId: "line-1",
        externalParentId: "order-1",
        adapterVersion: "order-item-v1",
        canonical: {
          orderExternalId: "order-1",
          variantExternalId: "variant-1",
          locationExternalId: null,
          quantity: 1,
          unitPriceAmount: "10",
          discountAmount: null,
          unitCostAmount: null,
          currency: "USD",
        },
        issues: [],
      },
      persistence,
    );

    expect(result.disposition).toBe("quarantined");

    if (result.disposition === "quarantined") {
      expect(result.reasonCode).toBe("RELATIONSHIP_UNRESOLVED");
    }

    expect(persistence.persistOrderItem).not.toHaveBeenCalled();
  });

  it("resolves supplier-product through supplier and variant ProviderBindings", async () => {
    const persistence = port();

    vi.mocked(persistence.resolveBinding)
      .mockResolvedValueOnce({
        canonicalEntityId: "supplier-1",
      })
      .mockResolvedValueOnce({
        canonicalEntityId: "variant-1",
      });

    vi.mocked(persistence.persistSupplierProduct).mockResolvedValue({
      canonicalEntityId: "supplier-product-1",
      disposition: "updated",
    });

    const result = await orchestrateCsvSupplierProduct(
      context,
      {
        disposition: "accepted",
        provider: "csv",
        relationshipType: "supplier_product",
        adapterVersion: "supplier-product-v1",
        supplierExternalId: "supplier-ext",
        variantExternalId: "variant-ext",
        canonical: {
          supplierExternalId: "supplier-ext",
          variantExternalId: "variant-ext",
          supplierSku: "SUP-SKU",
          unitCostAmount: "4.25",
          currency: "USD",
          leadTimeDays: 5,
          minimumOrderQuantity: 10,
          packSize: 2,
          preferred: true,
        },
        issues: [],
      },
      persistence,
    );

    expect(result).toEqual({
      canonicalEntityId: "supplier-product-1",
      disposition: "updated",
    });

    expect(persistence.resolveBinding).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resourceType: "supplier",
        externalId: "supplier-ext",
      }),
    );

    expect(persistence.resolveBinding).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        resourceType: "product_variant",
        externalId: "variant-ext",
      }),
    );
  });

  it("classifies unexpected persistence errors as failed", async () => {
    const persistence = port();

    vi.mocked(persistence.resolveBinding).mockRejectedValue(
      new Error("database unavailable"),
    );

    const result = await orchestrateCsvProductVariant(
      context,
      {
        disposition: "accepted",
        provider: "csv",
        resourceType: "product_variant",
        externalId: "variant-ext",
        externalParentId: "product-ext",
        adapterVersion: "variant-v1",
        canonical: {
          sku: "SKU-1",
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

    expect(result.disposition).toBe("failed");
  });
});
