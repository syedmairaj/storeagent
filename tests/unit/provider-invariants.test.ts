import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildProviderBindingKey,
} from "@/lib/providers/bindings";

import {
  normalizeExternalId,
} from "@/lib/providers/external-identity";

import {
  normalizeProviderMoneyInput,
} from "@/lib/providers/money";

import {
  normalizeCanonicalOrderStatus,
} from "@/lib/providers/order-status";

import {
  normalizeCanonicalPurchaseOrderStatus,
} from "@/lib/providers/purchase-order-status";

import {
  normalizeOptionalProviderUnitQuantity,
} from "@/lib/providers/quantities";

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
  const absoluteDirectory =
    path.join(
      ROOT,
      relativeDirectory,
    );

  const result: string[] = [];

  function walk(
    absolutePath: string,
  ): void {
    for (
      const entry of
      fs.readdirSync(
        absolutePath,
        {
          withFileTypes: true,
        },
      )
    ) {
      const child =
        path.join(
          absolutePath,
          entry.name,
        );

      if (entry.isDirectory()) {
        walk(child);
        continue;
      }

      if (
        entry.isFile() &&
        entry.name.endsWith(".ts")
      ) {
        result.push(
          path.relative(
            ROOT,
            child,
          ),
        );
      }
    }
  }

  walk(absoluteDirectory);

  return result.sort();
}

describe("M0.7 provider invariants", () => {
  it("keeps all provider modules upstream of deterministic engines", () => {
    const files =
      allTypeScriptFiles(
        "lib/providers",
      );

    const forbiddenImports = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "@/lib/ai",
      "openai",
      "@anthropic",
      "@google/",
      "react",
      "next/",
      "@supabase",
      "stripe",
    ];

    for (const file of files) {
      const source =
        read(file);

      for (
        const forbidden of
        forbiddenImports
      ) {
        expect(
          source.includes(
            forbidden,
          ),
          `${file} must not depend on ${forbidden}`,
        ).toBe(false);
      }
    }
  });

  it("keeps provider-specific types out of canonical commerce domain", () => {
    const canonical =
      read(
        "lib/commerce-domain/types.ts",
      );

    const forbiddenCanonicalNames = [
      "ShopifyGid",
      "ShopifyInventoryScope",
      "CsvAdapterConfig",
      "CsvColumnMapping",
      "shopifyProductId",
      "shopifyVariantId",
      "shopifyLocationId",
      "csvRowNumber",
    ];

    for (
      const forbidden of
      forbiddenCanonicalNames
    ) {
      expect(
        canonical.includes(
          forbidden,
        ),
        `Canonical commerce domain must not contain ${forbidden}`,
      ).toBe(false);
    }
  });

  it("keeps Shopify implementation isolated inside the provider boundary", () => {
    const nonProviderRoots = [
      "lib/metrics",
      "lib/forecasting",
      "lib/decision-engine",
    ];

    for (
      const directory of
      nonProviderRoots
    ) {
      const files =
        allTypeScriptFiles(
          directory,
        );

      for (const file of files) {
        const source =
          read(file);

        expect(
          source.includes(
            "@/lib/providers/shopify",
          ),
          `${file} must not import Shopify provider code`,
        ).toBe(false);
      }
    }
  });

  it("keeps CSV implementation isolated inside the provider boundary", () => {
    const nonProviderRoots = [
      "lib/metrics",
      "lib/forecasting",
      "lib/decision-engine",
    ];

    for (
      const directory of
      nonProviderRoots
    ) {
      const files =
        allTypeScriptFiles(
          directory,
        );

      for (const file of files) {
        const source =
          read(file);

        expect(
          source.includes(
            "@/lib/providers/csv",
          ),
          `${file} must not import CSV provider code`,
        ).toBe(false);
      }
    }
  });

  it("preserves provider external identity as string data", () => {
    expect(
      normalizeExternalId(
        "  00123-AbC  ",
      ),
    ).toBe(
      "00123-AbC",
    );
  });

  it("keeps durable binding identity tenant and provider scoped", () => {
    const shopify =
      buildProviderBindingKey({
        organizationId:
          "org-1",
        integrationId:
          "integration-1",
        provider: "shopify",
        resourceType:
          "product_variant",
        externalId: "123",
      });

    const csv =
      buildProviderBindingKey({
        organizationId:
          "org-1",
        integrationId:
          "integration-1",
        provider: "csv",
        resourceType:
          "product_variant",
        externalId: "123",
      });

    const otherOrganization =
      buildProviderBindingKey({
        organizationId:
          "org-2",
        integrationId:
          "integration-1",
        provider: "shopify",
        resourceType:
          "product_variant",
        externalId: "123",
      });

    expect(
      shopify,
    ).not.toBe(csv);

    expect(
      shopify,
    ).not.toBe(
      otherOrganization,
    );
  });

  it("preserves unknown quantity rather than coercing it to zero", () => {
    expect(
      normalizeOptionalProviderUnitQuantity(
        null,
      ),
    ).toBeNull();

    expect(
      normalizeOptionalProviderUnitQuantity(
        "",
      ),
    ).toBeNull();

    expect(
      normalizeOptionalProviderUnitQuantity(
        "0",
      ),
    ).toBe(0);
  });

  it("rejects binary floating-point money at the generic boundary", () => {
    expect(() =>
      normalizeProviderMoneyInput(
        19.99,
      ),
    ).toThrow(
      "Provider money amount must be supplied as an exact string.",
    );
  });

  it("fails closed for unsupported order status", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "provider_magic_status",
      ),
    ).toBe("unknown");
  });

  it("fails closed for unsupported purchase-order status", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "provider_magic_status",
      ),
    ).toBe("unknown");
  });

  it("keeps credentials out of canonical Integration configuration documentation", () => {
    const canonical =
      read(
        "lib/commerce-domain/types.ts",
      );

    expect(
      canonical,
    ).toContain(
      "Credentials/tokens belong in secure credential storage.",
    );
  });

  it("keeps provider payloads out of inventory and decision truth", () => {
    const inventory =
      read(
        "lib/metrics/inventory-math.ts",
      );

    const decisions =
      allTypeScriptFiles(
        "lib/decision-engine",
      )
        .map(
          (file) =>
            read(file),
        )
        .join("\n");

    const providerTerms = [
      "ShopifyGid",
      "CsvRow",
      "inventoryLevel",
      "inventoryItem",
      "gid://shopify/",
    ];

    for (
      const term of
      providerTerms
    ) {
      expect(
        inventory.includes(term),
        `Inventory math must not contain provider term ${term}`,
      ).toBe(false);

      expect(
        decisions.includes(term),
        `Decision engine must not contain provider term ${term}`,
      ).toBe(false);
    }
  });
});
