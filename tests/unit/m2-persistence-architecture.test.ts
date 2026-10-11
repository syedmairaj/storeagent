import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("M2 persistence architecture", () => {
  const domain = read("lib/commerce-domain/types.ts");
  const contract = read("docs/M2_CANONICAL_PERSISTENCE.md");

  it("maps only existing canonical domain entities", () => {
    const requiredInterfaces = [
      "Product",
      "ProductVariant",
      "InventorySnapshot",
      "Order",
      "OrderItem",
      "ReturnRefund",
      "Supplier",
      "SupplierProduct",
      "PurchaseOrder",
      "PurchaseOrderItem",
      "Integration",
      "ProviderBinding",
      "SyncRun",
    ];

    for (const name of requiredInterfaces) {
      expect(domain).toContain(`export interface ${name} {`);
    }
  });

  it("keeps derived metric persistence out of M2", () => {
    expect(contract).toContain("`SkuDailyMetric` -> M5");
    expect(contract).toContain("derived SKU metrics");
  });

  it("keeps forecast persistence out of M2", () => {
    expect(contract).toContain("`ForecastRun` -> M6");
    expect(contract).toContain("`SkuForecast` -> M6");
  });

  it("keeps decision persistence out of M2", () => {
    expect(contract).toContain("`InventoryAction` -> M7");
    expect(contract).toContain("`ActionEvent` -> M7");
  });

  it("keeps data-quality persistence deferred", () => {
    expect(contract).toContain("`DataQualityIssue` -> M4");
  });

  it("keeps AI and provider execution outside M2", () => {
    for (const forbiddenOwnership of [
      "AI explanation",
      "CSV parsing",
      "Shopify synchronization",
      "billing",
    ]) {
      expect(contract).toContain(forbiddenOwnership);
    }
  });

  it("preserves decimal-string commercial truth in the canonical domain", () => {
    expect(domain).toContain("export type DecimalString = string;");
    expect(domain).toContain("costAmount: DecimalString | null;");
    expect(domain).toContain("sellingPriceAmount: DecimalString | null;");
  });

  it("preserves nullable inventory observations", () => {
    for (const field of [
      "onHandQuantity: UnitQuantity | null;",
      "availableQuantity: UnitQuantity | null;",
      "committedQuantity: UnitQuantity | null;",
      "incomingQuantity: UnitQuantity | null;",
    ]) {
      expect(domain).toContain(field);
    }
  });

  it("preserves provider-independent canonical product identity", () => {
    expect(domain).toContain("canonicalEntityId: UUID;");
    expect(domain).toContain("externalId: string;");

    expect(domain).not.toContain("shopifyProductId:");
    expect(domain).not.toContain("shopifyVariantId:");
  });

  it("keeps deferred derived persistence out of current M2 migrations", () => {
    const migrationDirectory = path.join(ROOT, "supabase/migrations");

    const sources = fs
      .readdirSync(migrationDirectory)
      .filter((name) => name.toLowerCase().includes("m2_"))
      .map((name) =>
        fs.readFileSync(
          path.join(migrationDirectory, name),
          "utf8",
        ),
      )
      .join("\n")
      .replace(/\s+/g, " ")
      .toLowerCase();

    for (const deferredTable of [
      "data_quality_issues",
      "sku_daily_metrics",
      "forecast_runs",
      "sku_forecasts",
      "inventory_actions",
      "action_events",
    ]) {
      expect(sources).not.toContain(
        `create table public.${deferredTable}`,
      );
    }
  });
});
