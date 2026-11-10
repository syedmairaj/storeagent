import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20261110130000_pb1h42_metric_grain_enqueue_serialization.sql";

const migration = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8");

describe("M7-PB1.h.4.2 metric-grain enqueue serialization schema", () => {
  it("reserves namespace 71010402 with canonical grain_key hashtext", () => {
    expect(migration).toContain("71010402");
    expect(migration).toContain(
      "create or replace function public.sku_daily_metric_grain_key(",
    );
    expect(migration).toContain(
      "create or replace function public.sku_daily_metric_grain_xact_lock_key(",
    );
    expect(migration).toContain("pg_catalog.hashtext(");
    expect(migration).toContain("|| ':' || p_store_id::text");
    expect(migration).toContain("|| ':' || p_location_id::text");
    expect(migration).toContain("|| ':' || p_variant_id::text");
    expect(migration).toContain("|| ':' || p_metric_date::text");
    expect(migration).toContain("|| ':' || p_algorithm_version");
    expect(migration).toMatch(/must not reuse supplier 71010401/);
    expect(migration).toMatch(/5606003/);
    expect(migration).toMatch(/5606004/);
    expect(
      migration.match(/pg_advisory_xact_lock\(\s*71010402/g)?.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("exposes blocking acquire as test-only reader / writer prelock", () => {
    expect(migration).toContain(
      "create or replace function public.acquire_sku_daily_metric_grain_xact_lock(",
    );
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(migration).toContain(
      "not wired to production create/approve",
    );
    expect(migration).toContain(
      "Test-only reader protocol for future M7 create fencing",
    );
  });

  it("uses try-acquire in BEFORE INSERT trigger to avoid row→advisory deadlock", () => {
    expect(migration).toContain(
      "create or replace function public.try_acquire_sku_daily_metric_grain_xact_lock(",
    );
    expect(migration).toContain("pg_catalog.pg_try_advisory_xact_lock(");
    expect(migration).toContain(
      "create or replace function public.sku_daily_metric_recompute_requests_enforce_grain_xact_lock()",
    );
    expect(migration).toContain(
      "create trigger sku_daily_metric_recompute_requests_serialize_grain_xact_lock",
    );
    expect(migration).toContain(
      "before insert on public.sku_daily_metric_recompute_requests",
    );
    expect(migration).not.toMatch(
      /before insert or update or delete on public\.sku_daily_metric_recompute_requests/,
    );
    expect(migration).toContain("errcode = '55P03'");
  });

  it("prelocks inside all four §3.4 enqueue writers before UPSERT", () => {
    for (const name of [
      "consume_sku_daily_metric_source_events",
      "enqueue_sku_daily_metric_daily_rollover",
      "enqueue_sku_daily_metric_planning_invalidation",
      "enqueue_sku_daily_metric_store_incoming_invalidation",
    ]) {
      expect(migration).toContain(`create or replace function public.${name}(`);
    }
    const acquireCount = (
      migration.match(
        /perform public\.acquire_sku_daily_metric_grain_xact_lock\(/g,
      ) ?? []
    ).length;
    expect(acquireCount).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("order by");
    expect(migration).toContain(
      "acquire grain advisories in deterministic order before request UPSERT",
    );
  });

  it("keeps helpers service_role-only and reaffirms request SELECT-only grants", () => {
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain("to service_role;");
    expect(migration).toContain(
      "on table public.sku_daily_metric_recompute_requests",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role;");
    expect(migration).toContain(
      "grant select\non table public.sku_daily_metric_recompute_requests\nto service_role;",
    );
    expect(migration).not.toContain(
      "grant insert\non table public.sku_daily_metric_recompute_requests",
    );
  });

  it("does not unlock production create/approve or change formulas", () => {
    expect(migration).not.toContain("inventory_action_is_merchant_approvable");
    expect(migration).not.toContain("persist_inventory_action_recommendation");
    expect(migration).not.toContain("m5_sku_daily_metric_bound_v1");
    expect(migration).toMatch(/Does NOT:[\s\S]*create-TX scaffold \(reserved h\.4\.3\)/);
  });
});
