import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(
  relativePath: string,
): string {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath,
    ),
    "utf8",
  );
}

function allTypeScriptFiles(
  relativeDirectory: string,
): string[] {
  const absoluteDirectory = path.join(
    ROOT,
    relativeDirectory,
  );

  const result: string[] = [];

  function walk(absolutePath: string): void {
    for (const entry of fs.readdirSync(absolutePath, {
      withFileTypes: true,
    })) {
      const child = path.join(absolutePath, entry.name);

      if (entry.isDirectory()) {
        walk(child);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".ts")) {
        result.push(path.relative(ROOT, child));
      }
    }
  }

  walk(absoluteDirectory);

  return result.sort();
}

describe("Shopify adapter architecture", () => {
  it("keeps Shopify-specific implementation isolated under provider boundary", () => {
    const files = allTypeScriptFiles("lib/providers/shopify");

    const forbidden = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "stripe",
      "@supabase",
      "shopify-api",
      "@shopify",
    ];

    expect(files.length).toBeGreaterThan(4);

    for (const file of files) {
      const source = read(file);

      for (const dependency of forbidden) {
        expect(
          source.includes(dependency),
          `${file} must not depend on ${dependency}`,
        ).toBe(false);
      }

      expect(
        source.includes("fetch("),
        `${file} must not perform network fetch`,
      ).toBe(false);
    }
  });

  it("keeps Shopify types out of canonical commerce domain", () => {
    const canonical = read("lib/commerce-domain/types.ts");

    expect(canonical.includes("ShopifyGid")).toBe(false);
    expect(canonical.includes("ShopifyInventoryScope")).toBe(false);
    expect(canonical.includes("ShopifyRo1")).toBe(false);
    expect(canonical.includes("normalizeShopify")).toBe(false);
  });

  it("does not introduce a Shopify SDK dependency during RO.1", () => {
    const packageJson = read("package.json");

    expect(packageJson.includes("@shopify")).toBe(false);
    expect(packageJson.includes("shopify-api")).toBe(false);
  });

  it("does not parse Shopify GID terminal IDs into canonical identity", () => {
    const identity = read("lib/providers/shopify/identity.ts");

    expect(identity).not.toContain("parseInt(");
    expect(identity).not.toContain("Number(");
  });

  it("keeps Shopify normalization out of metrics, forecasting, and decision engine", () => {
    const nonProviderRoots = [
      "lib/metrics",
      "lib/forecasting",
      "lib/decision-engine",
    ];

    const forbidden = [
      "@/lib/providers/shopify",
      "normalizeShopify",
      "shopify-ro.1",
      "gid://shopify/",
      "displayFinancialStatus",
      "InventoryLevel",
      "MoneyV2",
    ];

    for (const directory of nonProviderRoots) {
      for (const file of allTypeScriptFiles(directory)) {
        const source = read(file);

        for (const term of forbidden) {
          expect(
            source.includes(term),
            `${file} must not contain Shopify term ${term}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps Shopify provider-observed incoming out of trusted incoming and readiness paths", () => {
    const trustBoundaryFiles = [
      "lib/metrics/resolve-eligible-incoming.ts",
      "lib/metrics/inventory-math.ts",
      "lib/inventory-readiness/assess.ts",
      "lib/inventory-readiness/load.ts",
      "lib/inventory-readiness/types.ts",
    ];

    const forbidden = [
      "@/lib/providers/shopify",
      "normalizeShopifyInventoryLevelPayload",
      "incomingQuantityTrust",
      "gid://shopify/",
      "displayFinancialStatus",
    ];

    for (const file of trustBoundaryFiles) {
      const source = read(file);

      for (const term of forbidden) {
        expect(
          source.includes(term),
          `${file} must not consume Shopify provider-observed incoming via ${term}`,
        ).toBe(false);
      }
    }

    const readinessTypes = read(
      "lib/inventory-readiness/types.ts",
    );

    expect(readinessTypes).toContain(
      "Shopify-RO.1 provider-observed incoming is never counted here.",
    );
  });

  it("records RO.1 closure guardrails in provider adapter contract", () => {
    const adapters = read("docs/PROVIDER_ADAPTERS.md");
    const fixtures = read(
      "tests/fixtures/shopify/ro1-v1/payloads.ts",
    );

    expect(adapters).toContain(
      "Shopify-RO.1 closure guardrails (owner decisions)",
    );
    expect(adapters).toContain("quarantine");
    expect(adapters).toContain("provider-observed");
    expect(adapters).toContain("not Admin API-version-certified");
    expect(adapters).toContain("displayFinancialStatus");
    expect(fixtures).toContain(
      "SHOPIFY_RO1_FIXTURES_API_VERSION_CERTIFIED = false",
    );
  });

  it("ships versioned RO.1 normalizers and fixtures without network transport", () => {
    const requiredFiles = [
      "lib/providers/shopify/mapping.ts",
      "lib/providers/shopify/product-normalization.ts",
      "lib/providers/shopify/inventory-normalization.ts",
      "lib/providers/shopify/order-normalization.ts",
      "lib/providers/shopify/duplicate-analysis.ts",
      "tests/fixtures/shopify/ro1-v1/payloads.ts",
    ];

    for (const file of requiredFiles) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }

    const version = read("lib/providers/shopify/version.ts");
    const mapping = read("lib/providers/shopify/mapping.ts");

    expect(version).toContain("shopify-ro.1-v1");
    expect(mapping).toContain("SHOPIFY_RO1_ADAPTER_VERSION");
  });
});
