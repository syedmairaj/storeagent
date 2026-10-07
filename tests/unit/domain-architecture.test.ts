import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("StoreAgent domain architecture", () => {
  it("keeps canonical commerce domain framework-independent", () => {
    const files = [
      "lib/commerce-domain/types.ts",
      "lib/commerce-domain/invariants.ts",
      "lib/commerce-domain/value-semantics.ts",
      "lib/commerce-domain/history-policy.ts",
    ];

    const forbiddenImports = [
      "next/",
      'from "next"',
      "react",
      "@shopify",
      "shopify-api",
      "stripe",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const file of files) {
      const source = read(file);

      for (const forbidden of forbiddenImports) {
        expect(
          source.includes(forbidden),
          `${file} must not depend on ${forbidden}`,
        ).toBe(false);
      }
    }
  });

  it("keeps provider-specific concepts outside canonical type ownership", () => {
    const source = read("lib/commerce-domain/types.ts");

    expect(source.includes("shopifyProductId")).toBe(false);
    expect(source.includes("shopifyVariantId")).toBe(false);
    expect(source.includes("woocommerceProductId")).toBe(false);
    expect(source.includes("stripeCustomerId")).toBe(false);
  });

  it("keeps AI outside canonical numerical truth", () => {
    const source = read("lib/commerce-domain/types.ts");

    expect(source.includes("aiRecommendedQuantity")).toBe(false);
    expect(source.includes("llmForecast")).toBe(false);
    expect(source.includes("aiConfidence")).toBe(false);
  });

  it("requires algorithm versioning on key derived artifacts", () => {
    const source = read("lib/commerce-domain/types.ts");

    expect(source).toContain("algorithmVersion: string;");
    expect(source).toContain("export interface ForecastRun");
    expect(source).toContain("export interface InventoryAction");
    expect(source).toContain("export interface SkuDailyMetric");
  });

  it("preserves evidence snapshots on inventory actions", () => {
    const source = read("lib/commerce-domain/types.ts");

    expect(source).toContain(
      "evidenceSnapshot: InventoryActionEvidence;",
    );
  });

  it("keeps provider bindings separate from canonical identity", () => {
    const source = read("lib/commerce-domain/types.ts");

    expect(source).toContain("export interface ProviderBinding");
    expect(source).toContain("canonicalEntityId: UUID;");
    expect(source).toContain("externalId: string;");
    expect(source).toContain("integrationId: UUID;");
  });

  it("keeps merchant edits separate from original recommendations", () => {
    const source = read("lib/commerce-domain/types.ts");

    expect(source).toContain("recommendedQuantity: UnitQuantity | null;");
    expect(source).toContain("editedQuantity: UnitQuantity | null;");
  });

  it("models returns and incoming inventory explicitly", () => {
    const source = read("lib/commerce-domain/types.ts");

    expect(source).toContain("export interface ReturnRefund");
    expect(source).toContain("export interface PurchaseOrder");
    expect(source).toContain("export interface PurchaseOrderItem");
    expect(source).toContain("incomingQuantity: UnitQuantity | null;");
  });

  it("models organization tenancy explicitly across core records", () => {
    const source = read("lib/commerce-domain/types.ts");

    const requiredInterfaces = [
      "Product",
      "ProductVariant",
      "InventorySnapshot",
      "Order",
      "SkuDailyMetric",
      "ForecastRun",
      "SkuForecast",
      "InventoryAction",
      "ActionEvent",
      "Integration",
      "SyncRun",
    ];

    for (const name of requiredInterfaces) {
      const declaration = `export interface ${name} {`;
      const start = source.indexOf(declaration);

      expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);

      const bodyStart = start + declaration.length;
      const nextInterface = source.indexOf(
        "export interface ",
        bodyStart,
      );

      const block =
        nextInterface === -1
          ? source.slice(start)
          : source.slice(start, nextInterface);

      expect(
        block.includes("organizationId: UUID;"),
        `${name} must carry organizationId`,
      ).toBe(true);
    }
  });
});
