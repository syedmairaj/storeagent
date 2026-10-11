import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("CSV adapter architecture", () => {
  it("keeps CSV adapters free from commercial engine imports", () => {
    const files = [
      "lib/providers/csv/mapping.ts",
      "lib/providers/csv/identity.ts",
    ];

    const forbidden = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const file of files) {
      const source = read(file);

      for (const dependency of forbidden) {
        expect(
          source.includes(dependency),
          `${file} must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("keeps resource orchestration independent from Supabase transport", () => {
    const files = [
      "lib/providers/csv/resource-orchestration.ts",
      "lib/providers/csv/relationship-resolution.ts",
      "lib/providers/csv/orchestrate-resource.ts",
    ];

    for (const file of files) {
      const source = read(file);

      expect(source).not.toContain("@supabase/supabase-js");

      expect(source).not.toContain("createSupabaseAdminClient");

      expect(source).not.toContain(".from(");

      expect(source).not.toContain(".rpc(");
    }
  });

  it("keeps Supabase transport in the dedicated CSV persistence adapter", () => {
    const adapter = read("lib/providers/csv/supabase-persistence.ts");

    expect(adapter).toContain('import "server-only"');

    expect(adapter).toContain("createSupabaseAdminClient");

    expect(adapter).toContain('.from("provider_bindings")');

    expect(adapter).toContain(".rpc(");

    const pureFiles = [
      "lib/providers/csv/resource-orchestration.ts",
      "lib/providers/csv/relationship-resolution.ts",
      "lib/providers/csv/orchestrate-resource.ts",
    ];

    for (const file of pureFiles) {
      const source = read(file);

      expect(source).not.toContain("createSupabaseAdminClient");

      expect(source).not.toContain("@supabase/supabase-js");
    }
  });

  it("does not resolve CSV relationships from canonical SKU", () => {
    const source = read("lib/providers/csv/orchestrate-resource.ts");

    expect(source).not.toContain("product_variants");

    expect(source).not.toContain(".sku");

    expect(source).toContain('"product_variant"');

    expect(source).toContain("resolveCsvBinding");
  });

  it("keeps M3.9D upstream of commercial engines and AI", () => {
    const source = [
      read("lib/providers/csv/resource-orchestration.ts"),
      read("lib/providers/csv/relationship-resolution.ts"),
      read("lib/providers/csv/orchestrate-resource.ts"),
    ].join("\n");

    for (const dependency of [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "stripe",
    ]) {
      expect(source).not.toContain(dependency);
    }
  });

  it("does not use row number as a successful identity fallback", () => {
    const source = read("lib/providers/csv/identity.ts");

    expect(source).not.toContain('name: "row"');
  });

  it("keeps structural parsing independent from mapping, identity, persistence, and business engines", () => {
    const source = read("lib/providers/csv/parser.ts");

    const forbidden = [
      "@/lib/providers/csv/mapping",
      "@/lib/providers/csv/identity",
      "@/lib/providers/bindings",
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "@supabase",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const dependency of forbidden) {
      expect(
        source.includes(dependency),
        `CSV parser must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("keeps product and variant CSV normalization upstream of persistence and commercial engines", () => {
    const source = read("lib/providers/csv/product-normalization.ts");

    const forbidden = [
      "@supabase",
      "@/lib/supabase",
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const dependency of forbidden) {
      expect(
        source.includes(dependency),
        `CSV product normalizer must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("does not manufacture canonical UUIDs or tenant ownership during CSV normalization", () => {
    const source = read("lib/providers/csv/product-normalization.ts");

    expect(source).not.toContain("randomUUID");

    expect(source).not.toContain("organizationId:");

    expect(source).not.toContain("storeId:");

    expect(source).not.toContain("canonicalEntityId:");
  });

  it("keeps CSV inventory observations outside ProviderBinding identity", () => {
    const source = read("lib/providers/csv/inventory-normalization.ts");

    expect(source).toContain("observationType:");

    expect(source).not.toContain("ProviderBinding");

    expect(source).not.toContain("ProviderNormalizationResult");

    expect(source).not.toContain("canonicalEntityId");
  });

  it("keeps CSV inventory normalization upstream of persistence and commercial engines", () => {
    const source = read("lib/providers/csv/inventory-normalization.ts");

    const forbidden = [
      "@supabase",
      "@/lib/supabase",
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const dependency of forbidden) {
      expect(
        source.includes(dependency),
        `CSV inventory normalizer must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("does not manufacture tenant ownership or canonical inventory IDs", () => {
    const source = read("lib/providers/csv/inventory-normalization.ts");

    for (const forbidden of [
      "randomUUID",
      "organizationId:",
      "storeId:",
      "locationId:",
      "variantId:",
    ]) {
      expect(source.includes(forbidden)).toBe(false);
    }
  });

  it("keeps CSV order normalization upstream of persistence and demand metrics", () => {
    const source = read("lib/providers/csv/order-normalization.ts");

    const forbidden = [
      "@supabase",
      "@/lib/supabase",
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const dependency of forbidden) {
      expect(
        source.includes(dependency),
        `CSV order normalizer must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("does not manufacture canonical order ownership or UUIDs", () => {
    const source = read("lib/providers/csv/order-normalization.ts");

    for (const forbidden of [
      "randomUUID",
      "organizationId:",
      "storeId:",
      "orderId:",
      "variantId:",
      "locationId:",
      "canonicalEntityId:",
    ]) {
      expect(source.includes(forbidden)).toBe(false);
    }
  });

  it("does not promote order externalReference into provider identity", () => {
    const source = read("lib/providers/csv/order-normalization.ts");

    expect(source).toContain("externalReference:");

    expect(source).not.toContain("externalId: mapped(");
  });

  it("keeps supplier-product CSV normalization outside ProviderBinding identity", () => {
    const source = read("lib/providers/csv/supplier-normalization.ts");

    expect(source).toContain("relationshipType");

    expect(source).not.toContain('"supplier_product" as ProviderResourceType');

    expect(source).not.toContain("canonicalEntityId");
  });

  it("keeps CSV supplier and PO normalization upstream of persistence and inventory truth", () => {
    const sources = [
      read("lib/providers/csv/supplier-normalization.ts"),
      read("lib/providers/csv/purchase-order-normalization.ts"),
    ];

    const forbidden = [
      "@supabase",
      "@/lib/supabase",
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "calculateValidIncomingPurchaseOrderLine",
      "calculateValidIncomingPurchaseOrders",
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const source of sources) {
      for (const dependency of forbidden) {
        expect(
          source.includes(dependency),
          `M3.6 CSV normalizer must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("does not manufacture canonical supplier or purchase-order ownership", () => {
    const source =
      read("lib/providers/csv/purchase-order-normalization.ts") +
      read("lib/providers/csv/supplier-normalization.ts");

    for (const forbidden of [
      "randomUUID",
      "organizationId:",
      "storeId:",
      "supplierId:",
      "purchaseOrderId:",
      "variantId:",
      "destinationLocationId:",
      "canonicalEntityId:",
    ]) {
      expect(source.includes(forbidden)).toBe(false);
    }
  });

  it("keeps M3.7 reconciliation planning free of persistence", () => {
    const sources = [
      read("lib/providers/binding-reconciliation.ts"),
      read("lib/providers/sync-run-idempotency.ts"),
    ];

    const forbidden = [
      "@supabase",
      "@/lib/supabase",
      ".from(",
      ".insert(",
      ".update(",
      ".upsert(",
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const source of sources) {
      for (const dependency of forbidden) {
        expect(
          source.includes(dependency),
          `M3.7 reconciliation helper must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("reuses the frozen provider binding replay classifier", () => {
    const source = read("lib/providers/binding-reconciliation.ts");

    expect(source).toContain("assessProviderBindingReplay");

    expect(source).toContain("normalizeProviderBindingIdentity");
  });

  it("does not include externalParentId in durable provider binding identity", () => {
    const source = read("lib/providers/binding-reconciliation.ts");

    expect(source).toContain("mutableMetadata");

    expect(source).not.toContain(
      "externalParentId: incoming.externalParentId,\n      canonicalEntityId",
    );
  });

  it("keeps M3.8 accounting pure and persistence-free", () => {
    const sources = [
      read("lib/providers/csv/accounting.ts"),
      read("lib/providers/csv/quarantine.ts"),
      read("lib/providers/csv/partial-failure.ts"),
    ];

    const forbidden = [
      "@supabase",
      "@/lib/supabase",
      ".from(",
      ".insert(",
      ".update(",
      ".upsert(",
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const source of sources) {
      for (const dependency of forbidden) {
        expect(
          source.includes(dependency),
          `M3.8 helper must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("keeps row number diagnostic rather than provider identity", () => {
    const source = read("lib/providers/csv/accounting.ts");

    expect(source).toContain("Import-local diagnostic row numbers only");

    expect(source).not.toContain("externalId: rowNumber");
  });

  it("does not let CSV accounting own worker retry policy", () => {
    const source = read("lib/providers/csv/partial-failure.ts");

    const forbidden = [
      "@/workers",
      "retry_wait",
      "attemptCount",
      "lease",
      "deadWork",
      "buildWorkerIdempotencyKey",
    ];

    for (const term of forbidden) {
      expect(source.includes(term)).toBe(false);
    }
  });

  it("derives M3.9 trusted CSV scope only from canonical integration state", () => {
    const source = read("lib/providers/csv/trusted-context.ts");

    expect(source).toContain('"integration_binding"');

    expect(source).toContain("integration.provider !==");

    expect(source).toContain("integration.status !==");

    expect(source).not.toContain("CsvRow");

    expect(source).not.toContain("readCsvMappedValue");
  });

  it("keeps M3.9A lifecycle and scope helpers persistence-free", () => {
    const sources = [
      read("lib/providers/csv/trusted-context.ts"),
      read("lib/providers/csv/sync-run-lifecycle.ts"),
    ];

    const forbidden = [
      "createSupabaseAdminClient",
      "@supabase",
      ".from(",
      ".insert(",
      ".update(",
      ".upsert(",
      ".rpc(",
      "react",
      "next/",
      "openai",
    ];

    for (const source of sources) {
      for (const dependency of forbidden) {
        expect(
          source.includes(dependency),
          `M3.9A helper must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("does not let organization-scoped CSV integration invent store scope", () => {
    const source = read("lib/providers/csv/trusted-context.ts");

    expect(source).toContain("requireCsvStoreScopedContext");

    expect(source).toContain("integration.storeId");

    expect(source).not.toContain("row.storeId");
  });
});
