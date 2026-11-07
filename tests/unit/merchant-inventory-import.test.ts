import { describe, expect, it } from "vitest";

import { buildMerchantCsvImportPlan } from "@/lib/inventory-import/build-csv-plan";
import { MERCHANT_CSV_TEMPLATE } from "@/lib/inventory-import/contract";
import { parseMerchantInventoryCsv } from "@/lib/inventory-import/parse-merchant-csv";

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
});
