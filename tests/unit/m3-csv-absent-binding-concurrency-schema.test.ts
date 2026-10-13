import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261013090000_m3_9_csv_absent_binding_concurrency.sql",
  ),
  "utf8",
);

describe("M3.9D-F4B CSV absent-binding concurrency schema", () => {
  it("owns one transaction-scoped lock helper", () => {
    expect(migration).toContain(
      "create or replace function public.csv_lock_reconciliation_identity(",
    );

    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(");

    expect(migration).toContain("pg_catalog.hashtextextended(");
  });

  it("serializes all seven ProviderBinding-owned CSV resource lanes", () => {
    const calls =
      migration.match(/perform public\.csv_lock_reconciliation_identity\(/g) ??
      [];

    expect(calls).toHaveLength(7);

    for (const resourceType of [
      "product",
      "product_variant",
      "order",
      "order_item",
      "supplier",
      "purchase_order",
      "purchase_order_item",
    ]) {
      expect(migration).toContain(`    '${resourceType}',`);
    }
  });

  it("preserves D-F1 immutable relationship conflicts", () => {
    expect(migration.match(/errcode = 'SA001'/g) ?? []).toHaveLength(3);

    expect(migration).toContain(
      "CSV product variant canonical parent cannot be reassigned",
    );

    expect(migration).toContain(
      "CSV order item canonical parent/variant cannot be reassigned",
    );

    expect(migration).toContain(
      "CSV purchase order item canonical parent/variant cannot be reassigned",
    );
  });

  it("does not move location, history, or supplier-product ownership into D-F4B", () => {
    expect(migration).not.toContain(
      "create or replace function public.csv_bind_location(",
    );

    expect(migration).not.toContain(
      "create or replace function public.csv_append_inventory_snapshot(",
    );

    expect(migration).not.toContain(
      "create or replace function public.csv_reconcile_supplier_product(",
    );
  });

  it("keeps the helper service-role only", () => {
    expect(migration).toContain("from public, anon, authenticated;");

    expect(migration).toContain("to service_role;");
  });
});
