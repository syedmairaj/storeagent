import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { executeCsvImportPlan } from "@/lib/providers/csv/import-assembly";

vi.mock("server-only", () => ({}));

const LIVE = process.env.RUN_CSV_LIVE_TESTS === "1";

const ORG_ID = randomUUID();

const STORE_ID = randomUUID();

const LOCATION_ID = randomUUID();

const INTEGRATION_ID = randomUUID();

const LOCATION_EXTERNAL_ID = `M3.9DD3-LOCATION-${INTEGRATION_ID}`;

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

function productConfig() {
  return {
    resourceType: "product" as const,

    adapterVersion: "m3.9dd3-product-v1",

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
        canonicalField: "brand" as const,
        sourceColumn: "Brand",
      },
      {
        canonicalField: "category" as const,
        sourceColumn: "Category",
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

    adapterVersion: "m3.9dd3-variant-v1",

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
        canonicalField: "barcode" as const,
        sourceColumn: "Barcode",
      },
      {
        canonicalField: "title" as const,
        sourceColumn: "Title",
      },
      {
        canonicalField: "status" as const,
        sourceColumn: "Status",
      },
      {
        canonicalField: "costAmount" as const,
        sourceColumn: "Cost",
      },
      {
        canonicalField: "sellingPriceAmount" as const,
        sourceColumn: "Price",
      },
      {
        canonicalField: "currency" as const,
        sourceColumn: "Currency",
      },
    ],
  };
}

function inventoryConfig() {
  return {
    observationType: "inventory_snapshot" as const,

    adapterVersion: "m3.9dd3-inventory-v1",

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
      {
        canonicalField: "availableQuantity" as const,
        sourceColumn: "Available",
      },
      {
        canonicalField: "committedQuantity" as const,
        sourceColumn: "Committed",
      },
      {
        canonicalField: "incomingQuantity" as const,
        sourceColumn: "Incoming",
      },
    ],
  };
}

function orderConfig() {
  return {
    resourceType: "order" as const,

    adapterVersion: "m3.9dd3-order-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,
        sourceColumn: "Order ID",
      },
      {
        canonicalField: "externalReference" as const,
        sourceColumn: "Reference",
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
      {
        canonicalField: "grossAmount" as const,
        sourceColumn: "Gross",
      },
      {
        canonicalField: "discountAmount" as const,
        sourceColumn: "Discount",
      },
      {
        canonicalField: "netAmount" as const,
        sourceColumn: "Net",
      },
    ],
  };
}

function orderItemConfig() {
  return {
    resourceType: "order_item" as const,

    adapterVersion: "m3.9dd3-order-item-v1",

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
      {
        canonicalField: "unitPriceAmount" as const,
        sourceColumn: "Unit Price",
      },
      {
        canonicalField: "discountAmount" as const,
        sourceColumn: "Discount",
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

function supplierConfig() {
  return {
    resourceType: "supplier" as const,

    adapterVersion: "m3.9dd3-supplier-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,
        sourceColumn: "Supplier ID",
      },
      {
        canonicalField: "title" as const,
        sourceColumn: "Name",
      },
      {
        canonicalField: "defaultLeadTimeDays" as const,
        sourceColumn: "Lead Time",
      },
      {
        canonicalField: "currency" as const,
        sourceColumn: "Currency",
      },
      {
        canonicalField: "email" as const,
        sourceColumn: "Email",
      },
      {
        canonicalField: "phone" as const,
        sourceColumn: "Phone",
      },
    ],
  };
}

function supplierProductConfig() {
  return {
    relationshipType: "supplier_product" as const,

    adapterVersion: "m3.9dd3-supplier-product-v1",

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
      {
        canonicalField: "leadTimeDays" as const,
        sourceColumn: "Lead Time",
      },
      {
        canonicalField: "minimumOrderQuantity" as const,
        sourceColumn: "MOQ",
      },
      {
        canonicalField: "packSize" as const,
        sourceColumn: "Pack Size",
      },
      {
        canonicalField: "preferred" as const,
        sourceColumn: "Preferred",
      },
    ],
  };
}

function purchaseOrderConfig() {
  return {
    resourceType: "purchase_order" as const,

    adapterVersion: "m3.9dd3-purchase-order-v1",

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
        canonicalField: "externalReference" as const,
        sourceColumn: "Reference",
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
        canonicalField: "expectedAt" as const,
        sourceColumn: "Expected At",
      },
      {
        canonicalField: "receivedAt" as const,
        sourceColumn: "Received At",
      },
      {
        canonicalField: "currency" as const,
        sourceColumn: "Currency",
      },
    ],
  };
}

function purchaseOrderItemConfig() {
  return {
    resourceType: "purchase_order_item" as const,

    adapterVersion: "m3.9dd3-purchase-order-item-v1",

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

function plan() {
  return {
    context,

    products: {
      source: [
        "Product ID,Title,Brand,Category,Status",
        "P-1,Live Widget,StoreAgent,Widgets,active",
      ].join("\n"),

      config: productConfig(),
    },

    suppliers: {
      source: [
        "Supplier ID,Name,Lead Time,Currency,Email,Phone",
        "S-1,Live Supplier,4,USD,supplier@example.com,+971500000000",
      ].join("\n"),

      config: supplierConfig(),
    },

    orders: {
      source: [
        "Order ID,Reference,Ordered At,Currency,Status,Gross,Discount,Net",
        "O-1,ORDER-1001,2026-10-12T04:00:00Z,USD,completed,40.00,5.00,35.00",
      ].join("\n"),

      config: orderConfig(),
    },

    productVariants: {
      source: [
        "Variant ID,Product ID,SKU,Barcode,Title,Status,Cost,Price,Currency",
        "V-1,P-1,LIVE-SKU-1,1234567890,Live Widget Small,active,7.50,20.00,USD",
      ].join("\n"),

      config: variantConfig(),
    },

    purchaseOrders: {
      source: [
        "PO ID,Supplier ID,Reference,Status,Ordered At,Expected At,Received At,Currency",
        "PO-1,S-1,PO-1001,submitted,2026-10-12T04:30:00Z,2026-10-16T04:30:00Z,,USD",
      ].join("\n"),

      config: purchaseOrderConfig(),
    },

    inventorySnapshots: {
      source: [
        "Variant ID,Location ID,Observed At,On Hand,Available,Committed,Incoming",
        `V-1,${LOCATION_EXTERNAL_ID},2026-10-12T05:00:00Z,25,20,5,10`,
      ].join("\n"),

      config: inventoryConfig(),
    },

    supplierProducts: {
      source: [
        "Supplier ID,Variant ID,Supplier SKU,Unit Cost,Currency,Lead Time,MOQ,Pack Size,Preferred",
        "S-1,V-1,SUP-LIVE-1,7.50,USD,4,5,5,true",
      ].join("\n"),

      config: supplierProductConfig(),
    },

    orderItems: {
      source: [
        "Item ID,Order ID,Variant ID,Location ID,Quantity,Unit Price,Discount,Unit Cost,Currency",
        `OI-1,O-1,V-1,${LOCATION_EXTERNAL_ID},2,20.00,5.00,7.50,USD`,
      ].join("\n"),

      config: orderItemConfig(),
    },

    purchaseOrderItems: {
      source: [
        "PO Item ID,PO ID,Variant ID,Location ID,Ordered Quantity,Received Quantity,Unit Cost,Currency",
        `POI-1,PO-1,V-1,${LOCATION_EXTERNAL_ID},10,4,7.50,USD`,
      ].join("\n"),

      config: purchaseOrderItemConfig(),
    },
  };
}

const describeLive = LIVE ? describe : describe.skip;

describeLive("CSV import assembly live Supabase E2E", () => {
  let admin: Awaited<ReturnType<typeof loadAdmin>>;

  let persistence: Awaited<ReturnType<typeof loadPersistence>>;

  async function loadAdmin() {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

    return createSupabaseAdminClient();
  }

  async function loadPersistence() {
    const { createCsvSupabasePersistence } =
      await import("@/lib/providers/csv/supabase-persistence");

    return createCsvSupabasePersistence(admin);
  }

  beforeAll(async () => {
    if (!LIVE) {
      return;
    }

    admin = await loadAdmin();

    const { error: orgError } = await admin.from("organizations").insert({
      id: ORG_ID,

      name: "M3.9D-D3 Live Org",

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

      name: "M3.9D-D3 Live Store",

      status: "active",

      currency: "USD",

      timezone: "UTC",
    });

    if (storeError) {
      throw new Error(`Live fixture store failed: ${storeError.message}`);
    }

    const { error: locationError } = await admin.from("locations").insert({
      id: LOCATION_ID,

      organization_id: ORG_ID,

      store_id: STORE_ID,

      name: "M3.9D-D3 Warehouse",

      status: "active",

      code: "D3-LIVE",
    });

    if (locationError) {
      throw new Error(`Live fixture location failed: ${locationError.message}`);
    }

    const { error: integrationError } = await admin
      .from("integrations")
      .insert({
        id: INTEGRATION_ID,

        organization_id: ORG_ID,

        store_id: STORE_ID,

        provider: "csv",

        status: "active",

        display_name: "M3.9D-D3 CSV",

        configuration: {},
      });

    if (integrationError) {
      throw new Error(
        `Live fixture integration failed: ${integrationError.message}`,
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
          configuredBy: "m3.9dd3-live-test",
        },
      });

    if (locationBindingError) {
      throw new Error(
        `Live location binding failed: ${locationBindingError.message}`,
      );
    }

    expect(locationBinding).toEqual([
      expect.objectContaining({
        canonical_entity_id: LOCATION_ID,

        disposition: "imported",
      }),
    ]);

    persistence = await loadPersistence();
  });

  it("imports all nine CSV lanes through real RPC persistence and preserves canonical relationships", async () => {
    const result = await executeCsvImportPlan(plan(), persistence);

    expect(result.counts).toEqual({
      discovered: 9,

      imported: 9,

      updated: 0,

      skipped: 0,

      quarantined: 0,

      failed: 0,
    });

    expect(result.quarantines).toEqual([]);

    expect(result.failures).toEqual([]);

    const { data: bindings, error: bindingsError } = await admin
      .from("provider_bindings")
      .select("resource_type,external_id,canonical_entity_id")
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID)
      .eq("provider", "csv");

    expect(bindingsError).toBeNull();

    expect(bindings).toHaveLength(8);

    const bindingMap = new Map(
      (bindings ?? []).map((row) => [
        `${row.resource_type}:${row.external_id}`,
        row.canonical_entity_id,
      ]),
    );

    const productId = bindingMap.get("product:P-1");

    const variantId = bindingMap.get("product_variant:V-1");

    const supplierId = bindingMap.get("supplier:S-1");

    const orderId = bindingMap.get("order:O-1");

    const orderItemId = bindingMap.get("order_item:OI-1");

    const purchaseOrderId = bindingMap.get("purchase_order:PO-1");

    const purchaseOrderItemId = bindingMap.get("purchase_order_item:POI-1");

    expect(bindingMap.get(`location:${LOCATION_EXTERNAL_ID}`)).toBe(
      LOCATION_ID,
    );

    for (const value of [
      productId,
      variantId,
      supplierId,
      orderId,
      orderItemId,
      purchaseOrderId,
      purchaseOrderItemId,
    ]) {
      expect(value).toMatch(/^[0-9a-f-]{36}$/i);
    }

    expect(bindingMap.has("inventory_snapshot:V-1")).toBe(false);

    expect(bindingMap.has("supplier_product:S-1")).toBe(false);

    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .select("id,product_id,sku")
      .eq("id", variantId!)
      .single();

    expect(variantError).toBeNull();

    expect(variant).toEqual({
      id: variantId,

      product_id: productId,

      sku: "LIVE-SKU-1",
    });

    const { data: orderItem, error: orderItemError } = await admin
      .from("order_items")
      .select("id,order_id,variant_id,location_id,quantity")
      .eq("id", orderItemId!)
      .single();

    expect(orderItemError).toBeNull();

    expect(orderItem).toEqual({
      id: orderItemId,

      order_id: orderId,

      variant_id: variantId,

      location_id: LOCATION_ID,

      quantity: 2,
    });

    const { data: supplierProduct, error: supplierProductError } = await admin
      .from("supplier_products")
      .select("supplier_id,variant_id,supplier_sku")
      .eq("organization_id", ORG_ID)
      .single();

    expect(supplierProductError).toBeNull();

    expect(supplierProduct).toEqual({
      supplier_id: supplierId,

      variant_id: variantId,

      supplier_sku: "SUP-LIVE-1",
    });

    const { data: purchaseOrder, error: purchaseOrderError } = await admin
      .from("purchase_orders")
      .select("id,supplier_id")
      .eq("id", purchaseOrderId!)
      .single();

    expect(purchaseOrderError).toBeNull();

    expect(purchaseOrder).toEqual({
      id: purchaseOrderId,

      supplier_id: supplierId,
    });

    const { data: purchaseOrderItem, error: purchaseOrderItemError } =
      await admin
        .from("purchase_order_items")
        .select(
          "id,purchase_order_id,variant_id,destination_location_id,ordered_quantity,received_quantity",
        )
        .eq("id", purchaseOrderItemId!)
        .single();

    expect(purchaseOrderItemError).toBeNull();

    expect(purchaseOrderItem).toEqual({
      id: purchaseOrderItemId,

      purchase_order_id: purchaseOrderId,

      variant_id: variantId,

      destination_location_id: LOCATION_ID,

      ordered_quantity: 10,

      received_quantity: 4,
    });

    const { data: snapshots, error: snapshotsError } = await admin
      .from("inventory_snapshots")
      .select(
        "variant_id,location_id,observed_at,on_hand_quantity,available_quantity,committed_quantity,incoming_quantity",
      )
      .eq("organization_id", ORG_ID);

    expect(snapshotsError).toBeNull();

    expect(snapshots).toHaveLength(1);

    expect(snapshots?.[0]).toMatchObject({
      variant_id: variantId,

      location_id: LOCATION_ID,

      on_hand_quantity: 25,

      available_quantity: 20,

      committed_quantity: 5,

      incoming_quantity: 10,
    });
  });

  it("reconciles current-state resources while exact inventory history replay is skipped", async () => {
    const result = await executeCsvImportPlan(plan(), persistence);

    expect(result.counts).toEqual({
      discovered: 9,

      imported: 0,

      updated: 0,

      skipped: 9,

      quarantined: 0,

      failed: 0,
    });

    const { count: productCount, error: productCountError } = await admin
      .from("products")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(productCountError).toBeNull();

    expect(productCount).toBe(1);

    const { count: variantCount } = await admin
      .from("product_variants")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(variantCount).toBe(1);

    const { count: orderCount } = await admin
      .from("orders")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(orderCount).toBe(1);

    const { count: orderItemCount } = await admin
      .from("order_items")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(orderItemCount).toBe(1);

    const { count: supplierCount } = await admin
      .from("suppliers")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(supplierCount).toBe(1);

    const { count: supplierProductCount } = await admin
      .from("supplier_products")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(supplierProductCount).toBe(1);

    const { count: purchaseOrderCount } = await admin
      .from("purchase_orders")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(purchaseOrderCount).toBe(1);

    const { count: purchaseOrderItemCount } = await admin
      .from("purchase_order_items")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(purchaseOrderItemCount).toBe(1);

    const { count: snapshotCount, error: snapshotCountError } = await admin
      .from("inventory_snapshots")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(snapshotCountError).toBeNull();

    expect(snapshotCount).toBe(1);
  });
});
