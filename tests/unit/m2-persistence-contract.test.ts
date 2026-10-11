import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("M2 canonical persistence contract", () => {
  const contract = read("docs/M2_CANONICAL_PERSISTENCE.md");

  it("defines the canonical M2 persistence tables", () => {
    const tables = [
      "products",
      "product_variants",
      "inventory_snapshots",
      "orders",
      "order_items",
      "return_refunds",
      "suppliers",
      "supplier_products",
      "purchase_orders",
      "purchase_order_items",
      "integrations",
      "provider_bindings",
      "sync_runs",
    ];

    for (const table of tables) {
      expect(contract).toContain(`- \`${table}\``);
    }
  });

  it("preserves organization as the primary tenant boundary", () => {
    expect(contract).toContain(
      "Organization remains the primary tenant boundary.",
    );
  });

  it("preserves unknown versus zero semantics", () => {
    expect(contract).toContain("NULL means unknown");
    expect(contract).toContain("zero means known zero");
    expect(contract).toContain("NULL commercial value must not become zero");
  });

  it("keeps provider identity separate from canonical identity", () => {
    expect(contract).toContain(
      "canonical entity id and external id are separate concepts",
    );

    expect(contract).toContain(
      "provider identifiers never replace canonical UUID identity",
    );
  });

  it("freezes the provider-binding identity key", () => {
    for (const column of [
      "organization_id",
      "integration_id",
      "provider",
      "resource_type",
      "external_id",
    ]) {
      expect(contract).toContain(`- \`${column}\``);
    }
  });

  it("requires case-preserving provider external ids", () => {
    expect(contract).toContain("external id is case-preserving");
  });

  it("does not use provider identifiers for authorization", () => {
    expect(contract).toContain(
      "Provider identifiers never establish tenant ownership.",
    );
  });

  it("defines immutable inventory history", () => {
    expect(contract).toContain("snapshots are immutable history");
    expect(contract).toContain("a newer observation creates another row");
  });

  it("requires relational ownership enforcement", () => {
    const normalizedContract = contract.replace(/\s+/g, " ");

    expect(normalizedContract).toContain(
      "Composite ownership foreign keys are preferred",
    );

    expect(normalizedContract).toContain(
      "cross-tenant or cross-store relationships impossible",
    );
  });

  it("classifies M2 tables for RLS", () => {
    expect(contract).toContain("## RLS classification");
    expect(contract).toContain("### Tenant current state");
    expect(contract).toContain("### Tenant immutable/history");
  });
});
