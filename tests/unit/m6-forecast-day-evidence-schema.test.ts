import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION =
  "supabase/migrations/20261030100000_m6_p2b2b1_forecast_day_evidence.sql";

function migration(): string {
  return fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");
}

function normalized(): string {
  return migration().replace(/\s+/g, " ").toLowerCase();
}

describe("M6 P2b.2b.1 forecast day evidence schema", () => {
  it("creates both evidence tables with deterministic evidence_id PK", () => {
    const sql = normalized();

    expect(sql).toContain(
      "create table public.forecast_day_promotion_evidence",
    );
    expect(sql).toContain(
      "create table public.forecast_day_coverage_evidence",
    );
    expect(sql).toContain("evidence_id text primary key");
  });

  it("enforces composite tenant FKs and in-tenant supersession", () => {
    const sql = normalized();

    expect(sql).toContain("forecast_day_promotion_evidence_store_ownership_fk");
    expect(sql).toContain(
      "forecast_day_promotion_evidence_location_ownership_fk",
    );
    expect(sql).toContain(
      "forecast_day_promotion_evidence_variant_ownership_fk",
    );
    expect(sql).toContain("forecast_day_promotion_evidence_supersedes_fk");
    expect(sql).toContain("forecast_day_coverage_evidence_supersedes_fk");
    expect(sql).toContain("unique ( organization_id, evidence_id )");
  });

  it("pairs closure_id structurally without treating it as trust proof", () => {
    const source = migration();

    expect(source).toMatch(/NOT trusted completion/i);
    expect(normalized()).toContain(
      "forecast_day_coverage_evidence_closure_pairing",
    );
    expect(normalized()).toContain("coverage = 'complete'");
    expect(normalized()).toContain("coverage = 'partial'");
  });

  it("revokes raw writes and enables member SELECT RLS", () => {
    const sql = normalized();

    expect(sql).toContain(
      "revoke all on table public.forecast_day_promotion_evidence from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "revoke all on table public.forecast_day_coverage_evidence from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant select on table public.forecast_day_promotion_evidence to authenticated",
    );
    expect(sql).toContain(
      "grant select on table public.forecast_day_promotion_evidence to service_role",
    );
    expect(sql).toContain(
      "create policy forecast_day_promotion_evidence_select_member",
    );
    expect(sql).toContain(
      "create policy forecast_day_coverage_evidence_select_member",
    );
    expect(sql).not.toContain("for insert");
    expect(sql).not.toContain("for update");
    expect(sql).not.toContain("for delete");
  });

  it("freezes evidence body and unique active assertions", () => {
    const sql = normalized();

    expect(sql).toContain("prevent_forecast_day_evidence_body_mutation");
    expect(sql).toContain(
      "forecast_day_promotion_evidence_active_unique",
    );
    expect(sql).toContain(
      "forecast_day_coverage_evidence_active_unique",
    );
    expect(sql).toContain("nulls not distinct");
    expect(sql).toContain(
      "forecast_day_promotion_evidence_idempotency_unique",
    );
    expect(sql).toContain(
      "forecast_day_coverage_evidence_idempotency_unique",
    );
  });

  it("does not infer evidence from discounts or sync_runs", () => {
    const sql = normalized();

    expect(sql).not.toContain("discount_amount");
    expect(sql).not.toContain("from public.sync_runs");
    expect(sql).not.toContain("on public.orders");
    expect(sql).not.toContain("on public.sync_runs");
  });
});
