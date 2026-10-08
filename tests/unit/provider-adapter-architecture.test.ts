import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  acceptedProviderRecord,
  quarantinedProviderRecord,
  skippedProviderRecord,
} from "@/lib/providers/results";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("provider adapter architecture", () => {
  it("keeps provider normalization upstream of metrics forecast and decisions", () => {
    const spec = read(
      "docs/PROVIDER_ADAPTERS.md",
    );

    expect(spec).toContain(
      "provider adapter",
    );

    expect(spec).toContain(
      "canonical StoreAgent domain",
    );

    expect(spec).toContain(
      "metrics",
    );

    expect(spec).toContain(
      "forecasting",
    );

    expect(spec).toContain(
      "decision engine",
    );
  });

  it("treats raw provider payload as unknown", () => {
    const contract = read(
      "lib/providers/types.ts",
    );

    expect(contract).toContain(
      "payload: unknown",
    );
  });

  it("separates transport from normalization", () => {
    const spec = read(
      "docs/PROVIDER_ADAPTERS.md",
    );

    expect(spec).toContain(
      "Transport and normalization separation",
    );

    expect(spec).toContain(
      "A provider adapter must not:",
    );

    expect(spec).toContain(
      "call external APIs",
    );
  });

  it("supports accepted quarantined and skipped normalization outcomes", () => {
    const contract = read(
      "lib/providers/types.ts",
    );

    expect(contract).toContain(
      '"accepted"',
    );

    expect(contract).toContain(
      '"quarantined"',
    );

    expect(contract).toContain(
      '"skipped"',
    );
  });

  it("creates accepted results only with explicit external identity", () => {
    const result =
      acceptedProviderRecord(
        {
          provider: "csv",
          resourceType:
            "product_variant",
          externalId: "sku-1",
          externalParentId: null,
          adapterVersion:
            "csv-variant-v1",
        },
        {
          sku: "SKU-1",
        },
      );

    expect(result.disposition).toBe(
      "accepted",
    );

    expect(result.externalId).toBe(
      "sku-1",
    );

    expect(result.canonical).toEqual({
      sku: "SKU-1",
    });
  });

  it("requires quarantine to explain why normalization failed", () => {
    expect(() =>
      quarantinedProviderRecord(
        {
          provider: "csv",
          resourceType: "order",
          externalId: null,
          externalParentId: null,
          adapterVersion:
            "csv-order-v1",
        },
        [],
      ),
    ).toThrow(
      "Quarantined provider records require at least one issue.",
    );
  });

  it("requires skipped records to carry an explicit reason", () => {
    expect(() =>
      skippedProviderRecord(
        {
          provider: "shopify",
          resourceType: "order",
          externalId: "100",
          externalParentId: null,
          adapterVersion:
            "shopify-order-v1",
        },
        [],
      ),
    ).toThrow(
      "Skipped provider records require at least one issue.",
    );
  });

  it("keeps provider modules independent from metrics forecasting decisions UI and AI", () => {
    const directory = path.join(
      ROOT,
      "lib/providers",
    );

    const files = fs
      .readdirSync(directory)
      .filter((file) =>
        file.endsWith(".ts"),
      );

    const forbidden = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const file of files) {
      const source = read(
        `lib/providers/${file}`,
      );

      for (const dependency of forbidden) {
        expect(
          source.includes(dependency),
          `${file} must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("documents that provider credentials stay outside normalization payloads", () => {
    const spec = read(
      "docs/PROVIDER_ADAPTERS.md",
    );

    expect(spec).toContain(
      "Provider credentials and tokens do not belong in normalization payloads",
    );
  });
});
