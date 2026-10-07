import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applySupplierOrderConstraints,
  calculateRecommendedOrderQuantity,
  calculateValidIncomingPurchaseOrderLine,
} from "@/lib/metrics/inventory-math";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("StoreAgent inventory formula architecture", () => {
  it("keeps deterministic inventory math independent from UI, AI and provider SDKs", () => {
    const source = read(
      "lib/metrics/inventory-math.ts",
    );

    const forbidden = [
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "@shopify",
      "stripe",
    ];

    for (const value of forbidden) {
      expect(
        source.includes(value),
        `inventory math must not depend on ${value}`,
      ).toBe(false);
    }
  });

  it("never produces negative recommended order quantity", () => {
    for (const target of [0, 1, 10, 100]) {
      for (const available of [0, 1, 10, 100, 200]) {
        for (const incoming of [0, 1, 10, 100]) {
          const result =
            calculateRecommendedOrderQuantity({
              targetStockUnits: target,
              availableQuantity: available,
              validIncomingQuantity: incoming,
              incomingStateKnown: true,
            });

          expect(result.value).not.toBeNull();

          expect(
            result.value as number,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("never constrains positive need below required quantity", () => {
    const cases = [
      {
        requiredQuantity: 1,
        minimumOrderQuantity: null,
        packSize: null,
      },
      {
        requiredQuantity: 5,
        minimumOrderQuantity: 12,
        packSize: null,
      },
      {
        requiredQuantity: 13,
        minimumOrderQuantity: 12,
        packSize: 6,
      },
      {
        requiredQuantity: 25,
        minimumOrderQuantity: null,
        packSize: 6,
      },
    ];

    for (const input of cases) {
      const result =
        applySupplierOrderConstraints(input);

      expect(
        result.constrainedQuantity,
      ).toBeGreaterThanOrEqual(
        input.requiredQuantity,
      );
    }
  });

  it("always returns a valid pack multiple when pack size exists", () => {
    for (let requiredQuantity = 1; requiredQuantity <= 50; requiredQuantity++) {
      const result =
        applySupplierOrderConstraints({
          requiredQuantity,
          minimumOrderQuantity: 7,
          packSize: 6,
        });

      expect(
        result.constrainedQuantity % 6,
      ).toBe(0);
    }
  });

  it("never produces negative incoming quantity", () => {
    const result =
      calculateValidIncomingPurchaseOrderLine({
        status: "partially_received",
        orderedQuantity: 10,
        receivedQuantity: 11,
      });

    expect(result).toEqual({
      validIncomingQuantity: null,
      incomingStateKnown: false,
      reasonCode: "RECEIVED_EXCEEDS_ORDERED",
    });
  });

  it("documents null as unknown and zero as known zero", () => {
    const spec = read(
      "docs/INVENTORY_FORMULAS.md",
    );

    expect(spec).toContain(
      "Null means unknown.",
    );

    expect(spec).toContain(
      "Zero means known zero.",
    );
  });

  it("documents algorithm versioning for commercial calculations", () => {
    const spec = read(
      "docs/INVENTORY_FORMULAS.md",
    );

    expect(spec).toContain(
      "sales-velocity-v1",
    );

    expect(spec).toContain(
      "reorder-point-v1",
    );

    expect(spec).toContain(
      "order-quantity-v1",
    );

    expect(spec).toContain(
      "overstock-risk-v1",
    );
  });

  it("documents that AI does not own inventory formulas", () => {
    const spec = read(
      "docs/INVENTORY_FORMULAS.md",
    );

    expect(spec).toContain(
      "AI does not calculate inventory truth.",
    );
  });
});
