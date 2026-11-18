import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildMerchantCsvImportPlan } from "@/lib/inventory-import/build-csv-plan";
import { MERCHANT_CSV_TEMPLATE } from "@/lib/inventory-import/contract";
import { parseMerchantInventoryCsv } from "@/lib/inventory-import/parse-merchant-csv";

/** Exact owner fixture that previously failed preview as 1 ready / 19 rejected. */
const SNAPSTORE_INVENTORY_TEST_CSV = readFileSync(
  path.join(
    process.cwd(),
    "tests/fixtures/storeagent_snapstore_inventory_test.csv",
  ),
  "utf8",
);

describe("merchant inventory CSV V1", () => {
  it("accepts the published template shape", () => {
    const parsed = parseMerchantInventoryCsv({
      source: MERCHANT_CSV_TEMPLATE,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.readyCount).toBe(2);
    expect(parsed.rejectedCount).toBe(0);
    expect(parsed.rows[0]?.sku).toBe("WIDGET-S");
    expect(parsed.rows[0]?.availableQuantity).toBe(20);
    expect(parsed.rows[1]?.incomingQuantity).toBeNull();
  });

  it("rejects negative and blank available quantities without inventing zero", () => {
    const parsed = parseMerchantInventoryCsv({
      source: [
        "sku,product_name,available_quantity",
        "A,Alpha,-1",
        "B,Beta,",
      ].join("\n"),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.readyCount).toBe(0);
    expect(parsed.rejectedCount).toBe(2);
    expect(parsed.rows[0]?.errors[0]?.code).toBe("INVALID_QUANTITY");
    expect(parsed.rows[1]?.errors[0]?.code).toBe("REQUIRED_FIELD");
  });

  it("rejects duplicate SKUs in the same file", () => {
    const parsed = parseMerchantInventoryCsv({
      source: [
        "sku,product_name,available_quantity",
        "DUP,One,1",
        "DUP,Two,2",
      ].join("\n"),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.readyCount).toBe(0);
    expect(parsed.rows.every((row) =>
      row.errors.some((error) => error.code === "DUPLICATE_SKU"),
    )).toBe(true);
  });

  it("builds M3 lanes from ready merchant rows", () => {
    const parsed = parseMerchantInventoryCsv({
      source: [
        "sku,product_name,available_quantity",
        "SKU-1,Widget,5",
      ].join("\n"),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const plan = buildMerchantCsvImportPlan({
      context: {
        organizationId: "11111111-1111-4111-8111-111111111111",
        integrationId: "22222222-2222-4222-8222-222222222222",
        storeId: "33333333-3333-4333-8333-333333333333",
        provider: "csv",
        scope: {
          organizationId: "11111111-1111-4111-8111-111111111111",
          storeId: "33333333-3333-4333-8333-333333333333",
          source: "integration_binding",
        },
      },
      rows: parsed.rows,
      storeCurrency: "USD",
      observedAt: "2026-11-07T12:00:00.000Z",
    });

    expect(plan.products?.source).toContain("SKU-1,Widget,active");
    expect(plan.productVariants?.source).toContain("SKU-1,SKU-1,SKU-1,Widget,active,USD");
    expect(plan.inventorySnapshots?.source).toContain(
      "SKU-1,Main,2026-11-07T12:00:00.000Z,,5,,",
    );
  });

  it("accepts the exact snapstore 20-row fixture including Excel .0 whole quantities", () => {
    expect(SNAPSTORE_INVENTORY_TEST_CSV.startsWith("sku,product_name")).toBe(
      true,
    );
    expect(SNAPSTORE_INVENTORY_TEST_CSV).toContain("47.0");
    expect(SNAPSTORE_INVENTORY_TEST_CSV).toContain("SNAP-KEYCHAIN,Metal Keychain,5,,,,");

    const parsed = parseMerchantInventoryCsv({
      source: SNAPSTORE_INVENTORY_TEST_CSV,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.readyCount).toBe(20);
    expect(parsed.rejectedCount).toBe(0);
    expect(parsed.headers).toEqual([
      "sku",
      "product_name",
      "available_quantity",
      "on_hand_quantity",
      "committed_quantity",
      "incoming_quantity",
      "barcode",
    ]);
    expect(parsed.mapping).toMatchObject({
      sku: "sku",
      product_name: "product_name",
      available_quantity: "available_quantity",
      on_hand_quantity: "on_hand_quantity",
      committed_quantity: "committed_quantity",
      incoming_quantity: "incoming_quantity",
      barcode: "barcode",
    });

    const first = parsed.rows[0];
    expect(first?.status).toBe("ready");
    expect(first?.availableQuantity).toBe(42);
    expect(first?.onHandQuantity).toBe(47);
    expect(first?.committedQuantity).toBe(5);
    expect(first?.incomingQuantity).toBe(20);
    expect(first?.barcode).toBeNull();

    const blankOptional = parsed.rows.find((row) => row.sku === "SNAP-KEYCHAIN");
    expect(blankOptional?.status).toBe("ready");
    expect(blankOptional?.availableQuantity).toBe(5);
    expect(blankOptional?.onHandQuantity).toBeNull();
    expect(blankOptional?.committedQuantity).toBeNull();
    expect(blankOptional?.incomingQuantity).toBeNull();
  });

  it("keeps blank optional quantities as null and never invents zero", () => {
    const parsed = parseMerchantInventoryCsv({
      source: [
        "sku,product_name,available_quantity,on_hand_quantity,committed_quantity,incoming_quantity,barcode",
        "A,Alpha,5,,,,",
      ].join("\n"),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.readyCount).toBe(1);
    expect(parsed.rows[0]?.onHandQuantity).toBeNull();
    expect(parsed.rows[0]?.committedQuantity).toBeNull();
    expect(parsed.rows[0]?.incomingQuantity).toBeNull();
    expect(parsed.rows[0]?.barcode).toBeNull();
  });

  it("still rejects true fractional quantities while accepting Excel .0 wholes", () => {
    const parsed = parseMerchantInventoryCsv({
      source: [
        "sku,product_name,available_quantity,on_hand_quantity,committed_quantity,incoming_quantity",
        "OK,Ok,1,2.0,3.00,4.0",
        "BAD,Bad,1,2.5,3,4",
      ].join("\n"),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.readyCount).toBe(1);
    expect(parsed.rejectedCount).toBe(1);
    expect(parsed.rows[0]?.onHandQuantity).toBe(2);
    expect(parsed.rows[0]?.committedQuantity).toBe(3);
    expect(parsed.rows[0]?.incomingQuantity).toBe(4);
    expect(parsed.rows[1]?.errors.some((error) =>
      error.field === "on_hand_quantity" && error.code === "INVALID_QUANTITY",
    )).toBe(true);
  });

  it("rejects bad mapping overrides that point optional fields at non-quantity columns", () => {
    const parsed = parseMerchantInventoryCsv({
      source: [
        "sku,product_name,available_quantity,note",
        "A,Alpha,5,not-a-qty",
      ].join("\n"),
      mappingOverride: {
        on_hand_quantity: "note",
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.readyCount).toBe(0);
    expect(parsed.rejectedCount).toBe(1);
    expect(parsed.rows[0]?.errors[0]?.field).toBe("on_hand_quantity");
    expect(parsed.rows[0]?.errors[0]?.code).toBe("INVALID_QUANTITY");
  });
});
