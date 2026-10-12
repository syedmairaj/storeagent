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

function variantConfig() {
  return {
    resourceType: "product_variant" as const,

    adapterVersion: "variant-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,

        sourceColumn: "Variant ID",
      },
      {
        canonicalField: "externalParentId" as const,

        sourceColumn: "Product ID",
      },
      {
        canonicalField: "sku" as const,

        sourceColumn: "SKU",
      },
      {
        canonicalField: "status" as const,

        sourceColumn: "Status",
      },
    ],
  };
}

function supplierConfig() {
  return {
    resourceType: "supplier" as const,

    adapterVersion: "supplier-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,

        sourceColumn: "Supplier ID",
      },
      {
        canonicalField: "title" as const,

        sourceColumn: "Name",
      },
    ],
  };
}

describe("CSV import assembly", () => {
  it("executes parent before dependent variant and aggregates the import", async () => {
    const trace: string[] = [];

    const bindings = new Map<string, string>();

    const persistence = {
      resolveBinding: vi.fn(async (lookup) => {
        const id = bindings.get(`${lookup.resourceType}:${lookup.externalId}`);

        return id
          ? {
              canonicalEntityId: id,
            }
          : null;
      }),

      persistProduct: vi.fn(async (input) => {
        trace.push(`product:${input.externalId}`);

        const id = "product-canonical-1";

        bindings.set(`product:${input.externalId}`, id);

        return {
          canonicalEntityId: id,

          disposition: "imported" as const,
        };
      }),

      persistProductVariant: vi.fn(async (input) => {
        trace.push(`variant:${input.externalId}:${input.productId}`);

        return {
          canonicalEntityId: "variant-canonical-1",

          disposition: "imported" as const,
        };
      }),
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,

        productVariants: {
          source: [
            "Variant ID,Product ID,SKU,Status",
            "V-1,P-1,SKU-1,active",
          ].join("\n"),

          config: variantConfig(),
        },

        products: {
          source: ["Product ID,Title,Status", "P-1,Widget,active"].join("\n"),

          config: productConfig(),
        },
      },
      persistence,
    );

    expect(trace).toEqual(["product:P-1", "variant:V-1:product-canonical-1"]);

    expect(result.counts).toEqual({
      discovered: 2,
      imported: 2,
      updated: 0,
      skipped: 0,
      quarantined: 0,
      failed: 0,
    });

    expect(
      result.rows.map((row) => ({
        lane: row.lane,

        rowNumber: row.rowNumber,

        disposition: row.disposition,
      })),
    ).toEqual([
      {
        lane: "product",

        rowNumber: 2,

        disposition: "imported",
      },
      {
        lane: "product_variant",

        rowNumber: 2,

        disposition: "imported",
      },
    ]);
  });

  it("keeps row-number namespaces independent across CSV batches", async () => {
    const persistence = {
      persistProduct: vi.fn(async () => ({
        canonicalEntityId: "product-1",

        disposition: "imported" as const,
      })),

      persistSupplier: vi.fn(async () => ({
        canonicalEntityId: "supplier-1",

        disposition: "imported" as const,
      })),
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,

        products: {
          source: ["Product ID,Title,Status", "P-1,Widget,active"].join("\n"),

          config: productConfig(),
        },

        suppliers: {
          source: ["Supplier ID,Name", "S-1,Acme"].join("\n"),

          config: supplierConfig(),
        },
      },
      persistence,
    );

    expect(result.counts.discovered).toBe(2);

    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lane: "product",

          rowNumber: 2,
        }),

        expect.objectContaining({
          lane: "supplier",

          rowNumber: 2,
        }),
      ]),
    );
  });

  it("finishes normalization quarantine without calling persistence", async () => {
    const persistence = {
      persistProduct: vi.fn(),
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,

        products: {
          source: ["Product ID,Title,Status", ",Widget,active"].join("\n"),

          config: productConfig(),
        },
      },
      persistence,
    );

    expect(result.counts).toEqual({
      discovered: 1,
      imported: 0,
      updated: 0,
      skipped: 0,
      quarantined: 1,
      failed: 0,
    });

    expect(result.quarantines).toHaveLength(1);

    expect(result.quarantines[0]).toMatchObject({
      rowNumber: 2,

      subjectType: "resource",

      resourceType: "product",

      reasonCode: "NORMALIZATION_QUARANTINED",
    });

    expect(persistence.persistProduct).not.toHaveBeenCalled();
  });

  it("quarantines an unresolved dependent relationship and preserves successful parents", async () => {
    const persistence = {
      resolveBinding: vi.fn(async () => null),

      persistProductVariant: vi.fn(),
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,

        productVariants: {
          source: [
            "Variant ID,Product ID,SKU,Status",
            "V-1,MISSING,SKU-1,active",
          ].join("\n"),

          config: variantConfig(),
        },
      },
      persistence,
    );

    expect(result.counts.quarantined).toBe(1);

    expect(result.rows[0]).toMatchObject({
      lane: "product_variant",

      rowNumber: 2,

      disposition: "quarantined",
    });

    expect(result.quarantines[0]).toMatchObject({
      resourceType: "product_variant",

      reasonCode: "RELATIONSHIP_UNRESOLVED",
    });

    expect(persistence.persistProductVariant).not.toHaveBeenCalled();
  });

  it("preflights every CSV before making the first persistence call", async () => {
    const persistProduct = vi.fn();

    const persistence = {
      persistProduct,
    } as unknown as CsvResourcePersistencePort;

    await expect(
      executeCsvImportPlan(
        {
          context,

          products: {
            source: ["Product ID,Title,Status", "P-1,Widget,active"].join("\n"),

            config: productConfig(),
          },

          orders: {
            source: [
              "Order ID,Ordered At,Currency",
              "O-1,2026-10-11T10:00:00Z",
            ].join("\n"),

            config: {
              resourceType: "order",

              adapterVersion: "order-v1",

              mappings: [
                {
                  canonicalField: "externalId",

                  sourceColumn: "Order ID",
                },
                {
                  canonicalField: "orderedAt",

                  sourceColumn: "Ordered At",
                },
                {
                  canonicalField: "currency",

                  sourceColumn: "Currency",
                },
              ],
            },
          },
        },
        persistence,
      ),
    ).rejects.toThrow();

    expect(persistProduct).not.toHaveBeenCalled();
  });
});

function fullOrderConfig() {
  return {
    resourceType: "order" as const,

    adapterVersion: "order-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,

        sourceColumn: "Order ID",
      },
      {
        canonicalField: "orderedAt" as const,

        sourceColumn: "Ordered At",
      },
      {
        canonicalField: "currency" as const,

        sourceColumn: "Currency",
      },
      {
        canonicalField: "status" as const,

        sourceColumn: "Status",
      },
    ],
  };
}

function fullOrderItemConfig() {
  return {
    resourceType: "order_item" as const,

    adapterVersion: "order-item-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,

        sourceColumn: "Item ID",
      },
      {
        canonicalField: "externalParentId" as const,

        sourceColumn: "Order ID",
      },
      {
        canonicalField: "variantExternalId" as const,

        sourceColumn: "Variant ID",
      },
      {
        canonicalField: "locationExternalId" as const,

        sourceColumn: "Location ID",
      },
      {
        canonicalField: "quantity" as const,

        sourceColumn: "Quantity",
      },
    ],
  };
}

function fullInventoryConfig() {
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

function fullSupplierProductConfig() {
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

function fullPurchaseOrderConfig() {
  return {
    resourceType: "purchase_order" as const,

    adapterVersion: "purchase-order-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,

        sourceColumn: "PO ID",
      },
      {
        canonicalField: "supplierExternalId" as const,

        sourceColumn: "Supplier ID",
      },
      {
        canonicalField: "status" as const,

        sourceColumn: "Status",
      },
      {
        canonicalField: "orderedAt" as const,

        sourceColumn: "Ordered At",
      },
      {
        canonicalField: "currency" as const,

        sourceColumn: "Currency",
      },
    ],
  };
}

function fullPurchaseOrderItemConfig() {
  return {
    resourceType: "purchase_order_item" as const,

    adapterVersion: "purchase-order-item-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,

        sourceColumn: "PO Item ID",
      },
      {
        canonicalField: "externalParentId" as const,

        sourceColumn: "PO ID",
      },
      {
        canonicalField: "variantExternalId" as const,

        sourceColumn: "Variant ID",
      },
      {
        canonicalField: "destinationLocationExternalId" as const,

        sourceColumn: "Location ID",
      },
      {
        canonicalField: "orderedQuantity" as const,

        sourceColumn: "Ordered Quantity",
      },
      {
        canonicalField: "receivedQuantity" as const,

        sourceColumn: "Received Quantity",
      },
    ],
  };
}

describe("CSV import assembly full dependency graph", () => {
  it("executes all nine lanes end to end in deterministic dependency order", async () => {
    const trace: string[] = [];

    const bindings = new Map<string, string>([
      ["location:LOC-1", "location-canonical-1"],
    ]);

    const resolveBinding = vi.fn(
      async (lookup: {
        resourceType: string;

        externalId: string;
      }) => {
        const canonicalEntityId = bindings.get(
          `${lookup.resourceType}:${lookup.externalId}`,
        );

        return canonicalEntityId
          ? {
              canonicalEntityId,
            }
          : null;
      },
    );

    const persistence = {
      resolveBinding,

      persistProduct: vi.fn(async (input) => {
        trace.push("product");

        bindings.set(`product:${input.externalId}`, "product-canonical-1");

        return {
          canonicalEntityId: "product-canonical-1",

          disposition: "imported" as const,
        };
      }),

      persistSupplier: vi.fn(async (input) => {
        trace.push("supplier");

        bindings.set(`supplier:${input.externalId}`, "supplier-canonical-1");

        return {
          canonicalEntityId: "supplier-canonical-1",

          disposition: "imported" as const,
        };
      }),

      persistOrder: vi.fn(async (input) => {
        trace.push("order");

        bindings.set(`order:${input.externalId}`, "order-canonical-1");

        return {
          canonicalEntityId: "order-canonical-1",

          disposition: "imported" as const,
        };
      }),

      persistProductVariant: vi.fn(async (input) => {
        trace.push("product_variant");

        expect(input.productId).toBe("product-canonical-1");

        bindings.set(
          `product_variant:${input.externalId}`,
          "variant-canonical-1",
        );

        return {
          canonicalEntityId: "variant-canonical-1",

          disposition: "imported" as const,
        };
      }),

      persistPurchaseOrder: vi.fn(async (input) => {
        trace.push("purchase_order");

        expect(input.supplierId).toBe("supplier-canonical-1");

        bindings.set(
          `purchase_order:${input.externalId}`,
          "purchase-order-canonical-1",
        );

        return {
          canonicalEntityId: "purchase-order-canonical-1",

          disposition: "imported" as const,
        };
      }),

      appendInventorySnapshot: vi.fn(async (input) => {
        trace.push("inventory_snapshot");

        expect(input.variantId).toBe("variant-canonical-1");

        expect(input.locationId).toBe("location-canonical-1");

        return {
          canonicalEntityId: "inventory-canonical-1",

          disposition: "imported" as const,
        };
      }),

      persistSupplierProduct: vi.fn(async (input) => {
        trace.push("supplier_product");

        expect(input.supplierId).toBe("supplier-canonical-1");

        expect(input.variantId).toBe("variant-canonical-1");

        return {
          canonicalEntityId: "supplier-product-canonical-1",

          disposition: "imported" as const,
        };
      }),

      persistOrderItem: vi.fn(async (input) => {
        trace.push("order_item");

        expect(input.orderId).toBe("order-canonical-1");

        expect(input.variantId).toBe("variant-canonical-1");

        expect(input.locationId).toBe("location-canonical-1");

        return {
          canonicalEntityId: "order-item-canonical-1",

          disposition: "imported" as const,
        };
      }),

      persistPurchaseOrderItem: vi.fn(async (input) => {
        trace.push("purchase_order_item");

        expect(input.purchaseOrderId).toBe("purchase-order-canonical-1");

        expect(input.variantId).toBe("variant-canonical-1");

        expect(input.destinationLocationId).toBe("location-canonical-1");

        return {
          canonicalEntityId: "purchase-order-item-canonical-1",

          disposition: "imported" as const,
        };
      }),
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,

        products: {
          source: ["Product ID,Title,Status", "P-1,Widget,active"].join("\n"),

          config: productConfig(),
        },

        suppliers: {
          source: ["Supplier ID,Name", "S-1,Acme"].join("\n"),

          config: supplierConfig(),
        },

        orders: {
          source: [
            "Order ID,Ordered At,Currency,Status",
            "O-1,2026-10-11T10:00:00Z,USD,completed",
          ].join("\n"),

          config: fullOrderConfig(),
        },

        productVariants: {
          source: [
            "Variant ID,Product ID,SKU,Status",
            "V-1,P-1,SKU-1,active",
          ].join("\n"),

          config: variantConfig(),
        },

        purchaseOrders: {
          source: [
            "PO ID,Supplier ID,Status,Ordered At,Currency",
            "PO-1,S-1,submitted,2026-10-11T11:00:00Z,USD",
          ].join("\n"),

          config: fullPurchaseOrderConfig(),
        },

        inventorySnapshots: {
          source: [
            "Variant ID,Location ID,Observed At,On Hand",
            "V-1,LOC-1,2026-10-11T12:00:00Z,25",
          ].join("\n"),

          config: fullInventoryConfig(),
        },

        supplierProducts: {
          source: [
            "Supplier ID,Variant ID,Supplier SKU,Unit Cost,Currency",
            "S-1,V-1,ACME-SKU-1,7.50,USD",
          ].join("\n"),

          config: fullSupplierProductConfig(),
        },

        orderItems: {
          source: [
            "Item ID,Order ID,Variant ID,Location ID,Quantity",
            "OI-1,O-1,V-1,LOC-1,2",
          ].join("\n"),

          config: fullOrderItemConfig(),
        },

        purchaseOrderItems: {
          source: [
            "PO Item ID,PO ID,Variant ID,Location ID,Ordered Quantity,Received Quantity",
            "POI-1,PO-1,V-1,LOC-1,10,4",
          ].join("\n"),

          config: fullPurchaseOrderItemConfig(),
        },
      },
      persistence,
    );

    expect(trace).toEqual([
      "product",
      "supplier",
      "order",
      "product_variant",
      "purchase_order",
      "inventory_snapshot",
      "supplier_product",
      "order_item",
      "purchase_order_item",
    ]);

    expect(result.counts).toEqual({
      discovered: 9,

      imported: 9,

      updated: 0,

      skipped: 0,

      quarantined: 0,

      failed: 0,
    });

    expect(result.rows.map((row) => row.lane)).toEqual([
      "product",
      "supplier",
      "order",
      "product_variant",
      "purchase_order",
      "inventory_snapshot",
      "supplier_product",
      "order_item",
      "purchase_order_item",
    ]);

    expect(result.quarantines).toEqual([]);

    expect(result.failures).toEqual([]);

    expect(resolveBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",

        integrationId: "integration-1",

        provider: "csv",

        resourceType: "location",

        externalId: "LOC-1",
      }),
    );
  });

  it("quarantines inventory when the explicit location binding is missing", async () => {
    const persistence = {
      resolveBinding: vi.fn(
        async (lookup: {
          resourceType: string;

          externalId: string;
        }) => {
          if (
            lookup.resourceType === "product_variant" &&
            lookup.externalId === "V-1"
          ) {
            return {
              canonicalEntityId: "variant-canonical-1",
            };
          }

          return null;
        },
      ),

      appendInventorySnapshot: vi.fn(),
    } as unknown as CsvResourcePersistencePort;

    const result = await executeCsvImportPlan(
      {
        context,

        inventorySnapshots: {
          source: [
            "Variant ID,Location ID,Observed At,On Hand",
            "V-1,UNKNOWN-LOCATION,2026-10-11T12:00:00Z,25",
          ].join("\n"),

          config: fullInventoryConfig(),
        },
      },
      persistence,
    );

    expect(result.counts).toEqual({
      discovered: 1,

      imported: 0,

      updated: 0,

      skipped: 0,

      quarantined: 1,

      failed: 0,
    });

    expect(result.rows[0]).toMatchObject({
      lane: "inventory_snapshot",

      rowNumber: 2,

      disposition: "quarantined",
    });

    expect(result.quarantines[0]).toMatchObject({
      subjectType: "observation",

      observationType: "inventory_snapshot",

      variantExternalId: "V-1",

      locationExternalId: "UNKNOWN-LOCATION",

      reasonCode: "RELATIONSHIP_UNRESOLVED",
    });

    expect(persistence.appendInventorySnapshot).not.toHaveBeenCalled();
  });
});
