import { describe, expect, it, vi } from "vitest";

import { orchestrateCsvProductVariant } from "@/lib/providers/csv/orchestrate-resource";

import { CsvPersistenceConflictError } from "@/lib/providers/csv/persistence-errors";

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

function persistencePort(): CsvResourcePersistencePort {
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

describe("CSV typed reconciliation conflict classification", () => {
  it("quarantines a typed immutable-parent conflict instead of marking the row failed", async () => {
    const persistence = persistencePort();

    vi.mocked(persistence.resolveBinding).mockResolvedValue({
      canonicalEntityId: "product-2",
    });

    vi.mocked(persistence.persistProductVariant).mockRejectedValue(
      new CsvPersistenceConflictError("csv_reconcile_product_variant"),
    );

    const result = await orchestrateCsvProductVariant(
      context,
      {
        disposition: "accepted",

        provider: "csv",

        resourceType: "product_variant",

        externalId: "VARIANT-1",

        externalParentId: "PRODUCT-2",

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
      disposition: "quarantined",

      reasonCode: "BINDING_CONFLICT",

      issues: [],
    });

    expect(persistence.persistProductVariant).toHaveBeenCalledTimes(1);
  });
});
