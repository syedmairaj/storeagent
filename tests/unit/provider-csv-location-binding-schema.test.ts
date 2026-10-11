import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20261011195000_m3_9_csv_location_binding.sql",
  "utf8",
);

describe("M3.9 CSV location binding schema", () => {
  it("creates one dedicated service-role location binding RPC", () => {
    expect(migration).toContain(
      "create or replace function public.csv_bind_location(",
    );

    expect(migration).toContain("security definer");

    expect(migration).toContain("public.assert_csv_reconciliation_scope");
  });

  it("binds only CSV location resources", () => {
    expect(migration).toContain("'csv'");

    expect(migration).toContain("'location'");

    expect(migration).not.toContain("insert into public.locations");
  });

  it("fails closed on rebinding", () => {
    expect(migration).toContain("already bound to another canonical location");
  });

  it("denies browser roles and grants only service_role", () => {
    expect(migration).toContain("from public, anon, authenticated");

    expect(migration).toContain("to service_role");
  });
});
