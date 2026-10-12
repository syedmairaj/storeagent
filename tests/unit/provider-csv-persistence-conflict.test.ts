import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { CsvPersistenceConflictError } from "@/lib/providers/csv/persistence-errors";

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

function variantInput() {
  return {
    context,

    externalId: "VARIANT-1",

    externalParentId: "PRODUCT-2",

    adapterVersion: "csv-variant-v1",

    productId: "product-2",

    sku: "SKU-1",

    barcode: null,

    title: null,

    status: "active",

    costAmount: null,

    sellingPriceAmount: null,

    currency: null,
  };
}

describe("CSV persistence conflict typing", () => {
  it("maps SA001 RPC errors to CsvPersistenceConflictError", async () => {
    const client = {
      from: vi.fn(),

      rpc: vi.fn().mockResolvedValue({
        data: null,

        error: {
          code: "SA001",

          message: "CSV product variant canonical parent cannot be reassigned",
        },
      }),
    };

    const persistence = createCsvSupabasePersistence(client as never);

    const promise = persistence.persistProductVariant(variantInput());

    await expect(promise).rejects.toBeInstanceOf(CsvPersistenceConflictError);
  });

  it("does not misclassify ordinary RPC errors as reconciliation conflicts", async () => {
    const client = {
      from: vi.fn(),

      rpc: vi.fn().mockResolvedValue({
        data: null,

        error: {
          code: "P0001",

          message: "database unavailable",
        },
      }),
    };

    const persistence = createCsvSupabasePersistence(client as never);

    let caught: unknown;

    try {
      await persistence.persistProductVariant(variantInput());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);

    expect(caught).not.toBeInstanceOf(CsvPersistenceConflictError);

    expect((caught as Error).message).toBe(
      'CSV persistence RPC "csv_reconcile_product_variant" failed: database unavailable',
    );

    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
});
