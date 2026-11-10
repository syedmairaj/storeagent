import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20261110120000_pb1h41_supplier_products_org_variant_serialization.sql";

const migration = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8");

describe("M7-PB1.h.4.1 supplier org+variant serialization schema", () => {
  it("reserves namespace 71010401 with org:variant hashtext key", () => {
    expect(migration).toContain("71010401");
    expect(migration).toContain(
      "create or replace function public.supplier_products_org_variant_xact_lock_key(",
    );
    expect(migration).toContain("pg_catalog.hashtext(");
    expect(migration).toContain(
      "p_organization_id::text || ':' || p_variant_id::text",
    );
    // Namespace collision guard: only mention foreign namespaces as exclusions.
    expect(migration).toMatch(/must not reuse M5 5606003/);
    expect(migration).toMatch(/5606004/);
    expect(migration).toMatch(/Does NOT:[\s\S]*71010402 \(reserved h\.4\.2\)/);
    expect(migration.match(/pg_advisory_xact_lock\(\s*71010401/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it("exposes blocking acquire for selection/writer prelock", () => {
    expect(migration).toContain(
      "create or replace function public.acquire_supplier_products_org_variant_xact_lock(",
    );
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(migration).toContain(
      "not wired to production M7 create/approve",
    );
  });

  it("uses try-acquire in BEFORE ROW trigger to avoid row→advisory deadlock", () => {
    expect(migration).toContain(
      "create or replace function public.try_acquire_supplier_products_org_variant_xact_lock(",
    );
    expect(migration).toContain("pg_catalog.pg_try_advisory_xact_lock(");
    expect(migration).toContain(
      "create or replace function public.supplier_products_enforce_org_variant_xact_lock()",
    );
    expect(migration).toContain(
      "create trigger supplier_products_serialize_org_variant_xact_lock",
    );
    expect(migration).toContain(
      "before insert or update or delete on public.supplier_products",
    );
    expect(migration).toContain("errcode = '55P03'");
  });

  it("prelocks inside csv_reconcile before FOR UPDATE and keeps dispositions", () => {
    const acquireBeforeForUpdate =
      migration.indexOf(
        "perform public.acquire_supplier_products_org_variant_xact_lock(",
      ) < migration.indexOf("for update;", migration.indexOf("csv_reconcile_supplier_product"));

    expect(acquireBeforeForUpdate).toBe(true);
    expect(migration).toContain("'imported'::text");
    expect(migration).toContain("'updated'::text");
    expect(migration).toContain("'skipped'::text");
  });

  it("keeps helpers service_role-only and search_path empty", () => {
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain("to service_role;");
    expect(migration).not.toContain("grant execute\non function public.acquire_supplier_products_org_variant_xact_lock(uuid, uuid)\nto authenticated");
  });

  it("does not unlock production create/approve or grain enqueue", () => {
    expect(migration).not.toContain("inventory_action_is_merchant_approvable");
    expect(migration).not.toContain("persist_inventory_action_recommendation");
    expect(migration).not.toContain("m5_sku_daily_metric_bound_v1");
    expect(migration).not.toContain(
      "enqueue_sku_daily_metric_planning_invalidation",
    );
  });
});
