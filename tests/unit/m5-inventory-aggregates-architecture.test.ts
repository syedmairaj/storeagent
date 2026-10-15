import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("M5.4 inventory aggregate architecture", () => {
  const source = read("lib/metrics/inventory-aggregates.ts");

  it("reuses the frozen inventory functions and does not recompute M5.3", () => {
    expect(source).toContain("calculateDaysOfStock");
    expect(source).toContain("calculateSafetyStock");
    expect(source).toContain("calculateReorderPoint");
    expect(source).toContain("calculateTargetStock");
    expect(source).toContain("calculateSellThrough");
    expect(source).toContain("calculateDemandTrend");
    expect(source).toContain("calculateInventoryAge");
    expect(source).toContain("calculateSalesVelocity");
    expect(source).not.toContain("sales-aggregates");
    expect(source).not.toContain("aggregateSales");
  });

  it("does not persist or calculate excluded decisions", () => {
    const forbidden = [
      "supabase",
      "next/",
      "react",
      "stripe",
      "openai",
      "@shopify",
      "Date.now",
      "calculateRecommendedOrderQuantity",
      "calculateStockoutRisk",
      "calculateOverstockRisk",
      "calculateValidIncomingPurchaseOrders",
    ];

    for (const value of forbidden) {
      expect(source, value).not.toContain(value);
    }

    expect(source).toContain("INCOMING_STATE_UNKNOWN");
    expect(source).toContain("INVENTORY_AGE_UNKNOWN");
    expect(source).toContain("DEMAND_UNKNOWN");
    expect(source).toContain("ZERO_DEMAND");
  });
});
