import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20261012143000_m3_9_csv_history_conflicts.sql",
  ),
  "utf8",
);

describe("M3.9D-F3 CSV immutable history conflict protection", () => {
  it("defines persisted CSV inventory observation identity", () => {
    expect(migration).toContain("inventory_snapshots_csv_observation_unique");

    expect(migration).toContain("organization_id");

    expect(migration).toContain("store_id");

    expect(migration).toContain("variant_id");

    expect(migration).toContain("location_id");

    expect(migration).toContain("observed_at");

    expect(migration).toContain("where source = 'csv'");
  });

  it("fails closed instead of silently rewriting existing duplicate history", () => {
    expect(migration).toContain("duplicate immutable history already exists");

    expect(migration).not.toContain("delete from public.inventory_snapshots");

    expect(migration).not.toContain("update public.inventory_snapshots");
  });

  it("returns skipped for exact persisted replay", () => {
    expect(migration).toContain("'skipped'::text");

    expect(migration).toContain(
      "existing_on_hand is not distinct from p_on_hand_quantity",
    );

    expect(migration).toContain(
      "existing_available is not distinct from p_available_quantity",
    );

    expect(migration).toContain(
      "existing_committed is not distinct from p_committed_quantity",
    );

    expect(migration).toContain(
      "existing_incoming is not distinct from p_incoming_quantity",
    );
  });

  it("uses a stable SQLSTATE for contradictory persisted history", () => {
    expect(migration).toContain("errcode = 'SA002'");

    expect(migration).toContain("CSV inventory history conflict");
  });

  it("keeps the reconciliation operation atomic under competing inserts", () => {
    expect(migration).toContain("on conflict (");

    expect(migration).toContain("do nothing");

    expect(migration).toContain("returning id");
  });

  it("keeps the RPC service-role only", () => {
    expect(migration).toContain("from public, anon, authenticated");

    expect(migration).toContain("to service_role");
  });
});
