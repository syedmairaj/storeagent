import { readFileSync } from "node:fs";

import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20261012114000_m3_9_csv_typed_reconciliation_conflicts.sql",
  ),
  "utf8",
);

describe("M3.9D-F1 typed CSV reconciliation conflicts", () => {
  it("uses one stable StoreAgent SQLSTATE for expected reconciliation conflicts", () => {
    expect(migration.match(/errcode = 'SA001'/g)).toHaveLength(3);
  });

  it.each([
    [
      "csv_reconcile_product_variant",
      "CSV product variant canonical parent cannot be reassigned",
    ],
    [
      "csv_reconcile_order_item",
      "CSV order item canonical parent/variant cannot be reassigned",
    ],
    [
      "csv_reconcile_purchase_order_item",
      "CSV purchase order item canonical parent/variant cannot be reassigned",
    ],
  ])("types immutable relationship conflict in %s", (functionName, message) => {
    expect(migration).toContain(
      `create or replace function public.${functionName}(`,
    );

    expect(migration).toContain(message);
  });

  it("does not convert trusted-scope failures into reconciliation conflicts", () => {
    expect(migration).toContain(
      "binding canonical target is outside trusted scope",
    );

    const conflictSignals = migration.match(/errcode = 'SA001'/g) ?? [];

    expect(conflictSignals).toHaveLength(3);
  });
});
