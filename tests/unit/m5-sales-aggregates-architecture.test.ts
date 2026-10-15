import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("M5.3 sales aggregate architecture", () => {
  const source = read("lib/metrics/sales-aggregates.ts");

  it("reuses calculateSalesVelocity and passes cancelled units as zero", () => {
    expect(source).toContain("calculateSalesVelocity");
    expect(source).toContain("cancelledUnits: 0");
    expect(source).not.toContain("function calculateSalesVelocity");
  });

  it("does not persist, call a provider, or read the clock", () => {
    const forbidden = [
      "supabase",
      "next/",
      "react",
      "stripe",
      "openai",
      "@shopify",
      "Date.now",
      "Math.random",
      "sku_daily_metrics",
      "refundedAmount",
      "refunded_amount",
    ];

    for (const value of forbidden) {
      expect(source, value).not.toContain(value);
    }
  });
});
