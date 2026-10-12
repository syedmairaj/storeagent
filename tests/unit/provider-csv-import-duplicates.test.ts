import { describe, expect, it, vi } from "vitest";

import { executeCsvImportPlan } from "@/lib/providers/csv/import-assembly";

import type { CsvResourcePersistencePort } from "@/lib/providers/csv/resource-orchestration";

import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";

const context: CsvTrustedImportContext = {
  organizationId: "org-1",
  integrationId: "integration-1",
  storeId: "store-1",
  provider: "csv",
  scope: {
    organizationId: "org-1",
    storeId: "store-1",
    source: "integration_binding",
  },
};

function productConfig() {
  return {
    resourceType: "product" as const,
    adapterVersion: "product-v1",
    mappings: [
      {
        canonicalField: "externalId" as const,
        sourceColumn: "Product ID",
      },
      {
        canonicalField: "title" as const,
        sourceColumn: "Title",
      },
      {
        canonicalField: "status" as const,
        sourceColumn: "Status",
      },
    ],
  };
}

function inventoryConfig() {
  return {
    observationType: "inventory_snapshot" as const,
    adapterVersion: "inventory-v1",
    mappings: [
      {
        canonicalField: "variantExternalId" as const,
        sourceColumn: "Variant ID",
      },
      {
        canonicalField: "locationExternalId" as const,
        sourceColumn: "Location ID",
      },
      {
        canonicalField: "observedAt" as const,
        sourceColumn: "Observed At",
      },
      {
        canonicalField: "onHandQuantity" as const,
        sourceColumn: "On Hand",
      },
    ],
  };
}

function supplierProductConfig() {
  return {
    relationshipType: "supplier_product" as const,
    adapterVersion: "supplier-product-v1",
    mappings: [
      {
        canonicalField: "supplierExternalId" as const,
        sourceColumn: "Supplier ID",
      },
      {
        canonicalField: "variantExternalId" as const,
        sourceColumn: "Variant ID",
      },
      {
        canonicalField: "supplierSku" as const,
        sourceColumn: "Supplier SKU",
      },
      {
        canonicalField: "unitCostAmount" as const,
        sourceColumn: "Unit Cost",
      },
      {
        canonicalField: "currency" as const,
        sourceColumn: "Currency",
      },
    ],
  };
}

describe("CSV import duplicate preflight", () => {
  it("persists one representative and skips an identical product duplicate", async () => {
    const persistProduct = vi.fn(async () => ({
      canonicalEntityId: "product-1",
      disposition: "imported" as const,
    }));

    const persistence = {
      persistProduct,
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,
        products: {
          source: [
            "Product ID,Title,Status",
            "P-1,Widget,active",
            "P-1,Widget,active",
          ].join("\n"),
          config: productConfig(),
        },
      },
      persistence,
    );

    expect(persistProduct).toHaveBeenCalledTimes(1);

    expect(result.counts).toEqual({
      discovered: 2,
      imported: 1,
      updated: 0,
      skipped: 1,
      quarantined: 0,
      failed: 0,
    });
  });

  it("quarantines every contradictory product duplicate before persistence", async () => {
    const persistProduct = vi.fn();

    const persistence = {
      persistProduct,
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,
        products: {
          source: [
            "Product ID,Title,Status",
            "P-1,Alpha,active",
            "P-1,Beta,active",
          ].join("\n"),
          config: productConfig(),
        },
      },
      persistence,
    );

    expect(persistProduct).not.toHaveBeenCalled();

    expect(result.counts).toEqual({
      discovered: 2,
      imported: 0,
      updated: 0,
      skipped: 0,
      quarantined: 2,
      failed: 0,
    });

    expect(result.quarantines.map((entry) => entry.reasonCode)).toEqual([
      "DUPLICATE_CONFLICT",
      "DUPLICATE_CONFLICT",
    ]);
  });

  it("keeps contradictory product outcome invariant when source rows are reversed", async () => {
    async function run(rows: readonly string[]) {
      const persistProduct = vi.fn();

      const result = await executeCsvImportPlan(
        {
          context,
          products: {
            source: ["Product ID,Title,Status", ...rows].join("\n"),
            config: productConfig(),
          },
        },
        {
          persistProduct,
        } as unknown as CsvResourcePersistencePort,
      );

      return {
        result,
        persistProduct,
      };
    }

    const first = await run(["P-1,Alpha,active", "P-1,Beta,active"]);

    const reversed = await run(["P-1,Beta,active", "P-1,Alpha,active"]);

    expect(first.persistProduct).not.toHaveBeenCalled();
    expect(reversed.persistProduct).not.toHaveBeenCalled();

    expect(first.result.counts).toEqual(reversed.result.counts);
  });

  it("appends exactly one identical inventory observation", async () => {
    const appendInventorySnapshot = vi.fn(async () => ({
      canonicalEntityId: "snapshot-1",
      disposition: "imported" as const,
    }));

    const resolveBinding = vi.fn(async (lookup: { resourceType: string }) => {
      if (lookup.resourceType === "product_variant") {
        return {
          canonicalEntityId: "variant-1",
        };
      }

      if (lookup.resourceType === "location") {
        return {
          canonicalEntityId: "location-1",
        };
      }

      return null;
    });

    const persistence = {
      resolveBinding,
      appendInventorySnapshot,
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,
        inventorySnapshots: {
          source: [
            "Variant ID,Location ID,Observed At,On Hand",
            "V-1,L-1,2026-10-12T08:00:00Z,10",
            "V-1,L-1,2026-10-12T08:00:00Z,10",
          ].join("\n"),
          config: inventoryConfig(),
        },
      },
      persistence,
    );

    expect(appendInventorySnapshot).toHaveBeenCalledTimes(1);

    expect(result.counts).toEqual({
      discovered: 2,
      imported: 1,
      updated: 0,
      skipped: 1,
      quarantined: 0,
      failed: 0,
    });
  });

  it("quarantines contradictory inventory observations with the same observation identity", async () => {
    const appendInventorySnapshot = vi.fn();
    const resolveBinding = vi.fn();

    const persistence = {
      resolveBinding,
      appendInventorySnapshot,
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,
        inventorySnapshots: {
          source: [
            "Variant ID,Location ID,Observed At,On Hand",
            "V-1,L-1,2026-10-12T08:00:00Z,10",
            "V-1,L-1,2026-10-12T08:00:00Z,11",
          ].join("\n"),
          config: inventoryConfig(),
        },
      },
      persistence,
    );

    expect(resolveBinding).not.toHaveBeenCalled();
    expect(appendInventorySnapshot).not.toHaveBeenCalled();

    expect(result.counts).toEqual({
      discovered: 2,
      imported: 0,
      updated: 0,
      skipped: 0,
      quarantined: 2,
      failed: 0,
    });
  });

  it("persists exactly one identical supplier-product relationship", async () => {
    const persistSupplierProduct = vi.fn(async () => ({
      canonicalEntityId: "supplier-product-1",
      disposition: "imported" as const,
    }));

    const resolveBinding = vi.fn(async (lookup: { resourceType: string }) => {
      if (lookup.resourceType === "supplier") {
        return {
          canonicalEntityId: "supplier-1",
        };
      }

      if (lookup.resourceType === "product_variant") {
        return {
          canonicalEntityId: "variant-1",
        };
      }

      return null;
    });

    const persistence = {
      resolveBinding,
      persistSupplierProduct,
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,
        supplierProducts: {
          source: [
            "Supplier ID,Variant ID,Supplier SKU,Unit Cost,Currency",
            "S-1,V-1,SUP-1,4.25,USD",
            "S-1,V-1,SUP-1,4.25,USD",
          ].join("\n"),
          config: supplierProductConfig(),
        },
      },
      persistence,
    );

    expect(persistSupplierProduct).toHaveBeenCalledTimes(1);

    expect(result.counts).toEqual({
      discovered: 2,
      imported: 1,
      updated: 0,
      skipped: 1,
      quarantined: 0,
      failed: 0,
    });
  });

  it("quarantines contradictory supplier-product relationships before persistence", async () => {
    const resolveBinding = vi.fn();
    const persistSupplierProduct = vi.fn();

    const persistence = {
      resolveBinding,
      persistSupplierProduct,
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,
        supplierProducts: {
          source: [
            "Supplier ID,Variant ID,Supplier SKU,Unit Cost,Currency",
            "S-1,V-1,SUP-A,4.25,USD",
            "S-1,V-1,SUP-B,4.25,USD",
          ].join("\n"),
          config: supplierProductConfig(),
        },
      },
      persistence,
    );

    expect(resolveBinding).not.toHaveBeenCalled();
    expect(persistSupplierProduct).not.toHaveBeenCalled();

    expect(result.counts).toEqual({
      discovered: 2,
      imported: 0,
      updated: 0,
      skipped: 0,
      quarantined: 2,
      failed: 0,
    });
  });
});
