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

describe("Shopify adapter architecture", () => {
  it("keeps Shopify-specific implementation isolated under provider boundary", () => {
    const files = [
      "lib/providers/shopify/types.ts",
      "lib/providers/shopify/identity.ts",
      "lib/providers/shopify/pagination.ts",
      "lib/providers/shopify/status.ts",
    ];

    const forbidden = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "stripe",
    ];

    for (const file of files) {
      const source =
        read(file);

      for (
        const dependency
        of forbidden
      ) {
        expect(
          source.includes(
            dependency,
          ),
          `${file} must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("keeps Shopify types out of canonical commerce domain", () => {
    const canonical =
      read(
        "lib/commerce-domain/types.ts",
      );

    expect(
      canonical.includes(
        "ShopifyGid",
      ),
    ).toBe(false);

    expect(
      canonical.includes(
        "ShopifyInventoryScope",
      ),
    ).toBe(false);
  });

  it("does not introduce a Shopify SDK dependency during M0.7", () => {
    const packageJson =
      read(
        "package.json",
      );

    expect(
      packageJson.includes(
        "@shopify",
      ),
    ).toBe(false);

    expect(
      packageJson.includes(
        "shopify-api",
      ),
    ).toBe(false);
  });

  it("does not parse Shopify GID terminal IDs into canonical identity", () => {
    const identity =
      read(
        "lib/providers/shopify/identity.ts",
      );

    expect(
      identity,
    ).not.toContain(
      "parseInt(",
    );

    expect(
      identity,
    ).not.toContain(
      "Number(",
    );
  });
});
