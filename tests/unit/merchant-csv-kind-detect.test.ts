import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  detectMerchantCsvImportKind,
  rejectIfWrongMerchantCsvKind,
} from "@/lib/merchant-csv/detect-import-kind";
import { parseMerchantInventoryCsv } from "@/lib/inventory-import/parse-merchant-csv";
import { parseMerchantSalesCsv } from "@/lib/sales-import/parse-merchant-sales-csv";

const ROOT = process.cwd();

function fixture(name: string): string {
  return fs.readFileSync(
    path.join(ROOT, "tests/fixtures", name),
    "utf8",
  );
}

describe("merchant CSV kind detection", () => {
  it("classifies snapstore fixtures", () => {
    expect(
      detectMerchantCsvImportKind([
        "sku",
        "product_name",
        "available_quantity",
      ]),
    ).toBe("inventory");
    expect(
      detectMerchantCsvImportKind([
        "order_id",
        "line_id",
        "sku",
        "quantity",
        "ordered_at",
      ]),
    ).toBe("sales");
  });

  it("rejects sales CSV in the inventory importer without writing", () => {
    const result = parseMerchantInventoryCsv({
      source: fixture("storeagent_snapstore_sales_history_test.csv"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("WRONG_CSV_KIND");
    expect(result.error).toMatch(/sales history/i);
    expect(result.error).toMatch(/Import sales history/i);
  });

  it("rejects inventory CSV in the sales importer without writing", () => {
    const result = parseMerchantSalesCsv({
      source: fixture("storeagent_snapstore_inventory_test.csv"),
      storeTimezone: "America/Chicago",
      storeCurrency: "USD",
      knownSkus: new Set(["SNAP-TEE-BLK-S"]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("WRONG_CSV_KIND");
    expect(result.error).toMatch(/inventory/i);
    expect(result.error).toMatch(/Import inventory/i);
  });

  it("still accepts the correct inventory fixture", () => {
    const result = parseMerchantInventoryCsv({
      source: fixture("storeagent_snapstore_inventory_test.csv"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.readyCount).toBe(20);
    expect(result.rejectedCount).toBe(0);
  });

  it("still accepts the correct sales fixture", () => {
    const source = fixture("storeagent_snapstore_sales_history_test.csv");
    const skus = new Set(
      source
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split(",")[2] ?? "")
        .filter(Boolean),
    );
    const result = parseMerchantSalesCsv({
      source,
      storeTimezone: "America/Chicago",
      storeCurrency: "USD",
      knownSkus: skus,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.readyCount).toBe(25);
    expect(result.rejectedCount).toBe(0);
  });

  it("leaves unknown shapes to normal mapping errors", () => {
    expect(rejectIfWrongMerchantCsvKind("inventory", ["sku", "foo"])).toBeNull();
    expect(rejectIfWrongMerchantCsvKind("sales", ["sku", "foo"])).toBeNull();
  });
});
