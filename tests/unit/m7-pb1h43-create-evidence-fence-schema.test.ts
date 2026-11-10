import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20261110140000_pb1h43_create_evidence_fence_scaffold.sql";

const PERSIST_PATH =
  "supabase/migrations/20261031100000_m7_2b_inventory_action_persistence.sql";

const LIFECYCLE_PATH =
  "supabase/migrations/20261031130000_m7_3c_trusted_lifecycle_rpcs.sql";

const migration = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8");
const persist = readFileSync(join(process.cwd(), PERSIST_PATH), "utf8");
const lifecycle = readFileSync(join(process.cwd(), LIFECYCLE_PATH), "utf8");

describe("M7-PB1.h.4.3 create-evidence fence scaffold schema", () => {
  it("exposes dormant evaluate helper with frozen §1.2 lock order", () => {
    expect(migration).toContain(
      "create or replace function public.evaluate_pb1_create_evidence_fence(",
    );
    expect(migration).toContain("acquire_sku_daily_metric_grain_xact_lock(");
    expect(migration).toContain(
      "acquire_supplier_products_org_variant_xact_lock(",
    );

    const grainAt = migration.indexOf(
      "acquire_sku_daily_metric_grain_xact_lock(",
    );
    const supplierAt = migration.indexOf(
      "acquire_supplier_products_org_variant_xact_lock(",
    );
    const storesShareAt = migration.indexOf(
      "lock table public.stores in share mode;",
    );
    const ordersShareAt = migration.indexOf(
      "lock table public.orders in share mode;",
    );
    const itemsShareAt = migration.indexOf(
      "lock table public.order_items in share mode;",
    );
    const returnsShareAt = migration.indexOf(
      "lock table public.return_refunds in share mode;",
    );
    const snapShareAt = migration.indexOf(
      "lock table public.inventory_snapshots in share mode;",
    );
    const poShareAt = migration.indexOf(
      "lock table public.purchase_orders in share mode;",
    );
    const poiShareAt = migration.indexOf(
      "lock table public.purchase_order_items in share mode;",
    );
    const attShareAt = migration.indexOf(
      "lock table public.store_incoming_evidence_attestations in share mode;",
    );
    const metricForUpdateAt = migration.indexOf(
      "from public.sku_daily_metrics m",
    );
    const requestForUpdateAt = migration.indexOf(
      "from public.sku_daily_metric_recompute_requests r",
    );
    const supplierForUpdateAt = migration.indexOf(
      "from public.supplier_products sp",
    );

    expect(grainAt).toBeGreaterThan(0);
    expect(supplierAt).toBeGreaterThan(grainAt);
    expect(storesShareAt).toBeGreaterThan(supplierAt);
    expect(ordersShareAt).toBeGreaterThan(storesShareAt);
    expect(itemsShareAt).toBeGreaterThan(ordersShareAt);
    expect(returnsShareAt).toBeGreaterThan(itemsShareAt);
    expect(snapShareAt).toBeGreaterThan(returnsShareAt);
    expect(poShareAt).toBeGreaterThan(snapShareAt);
    expect(poiShareAt).toBeGreaterThan(poShareAt);
    expect(attShareAt).toBeGreaterThan(poiShareAt);
    expect(metricForUpdateAt).toBeGreaterThan(attShareAt);
    expect(requestForUpdateAt).toBeGreaterThan(metricForUpdateAt);
    expect(supplierForUpdateAt).toBeGreaterThan(requestForUpdateAt);
    expect(migration).toContain("for update");
  });

  it("reuses SA008 snapshot and bounded timeouts; never inserts actions", () => {
    expect(migration).toContain("sku_daily_metric_source_snapshot(");
    expect(migration).toContain("set_config('lock_timeout', '2s', true)");
    expect(migration).toContain("set_config('statement_timeout', '15s', true)");
    expect(migration).toContain("'disposition', 'PASS'");
    expect(migration).toContain("'disposition', 'REJECT'");
    expect(migration).toContain("'inventoryActionCreated', false");
    expect(migration).toContain("'productionCreateEligible', false");
    expect(migration).toContain("'merchantApprovable', false");
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.inventory_actions/i,
    );
    expect(migration).toContain("NO inventory_actions INSERT");
    expect(migration).toContain("metric_date - 89");
  });

  it("fail-closes supplier ambiguity/absence without org-default LT", () => {
    expect(migration).toContain("SUPPLIER_FACTS_AMBIGUOUS");
    expect(migration).toContain("SUPPLIER_FACTS_ABSENT");
    expect(migration).toContain("SUPPLIER_FACTS_STALE");
    expect(migration).toContain("SUPPLIER_MAPPING_NOT_FOUND");
    expect(migration).toContain("org/default LT forbidden");
    expect(migration).not.toContain("default_lead_time_days");
    expect(migration).not.toContain("organization_planning_inputs");
  });

  it("privilege-gates helper to service_role only", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain("to service_role;");
    expect(migration).not.toMatch(
      /grant execute[\s\S]*evaluate_pb1_create_evidence_fence[\s\S]*to (anon|authenticated)/i,
    );
  });

  it("does not unlock production create/approve or wire persist RPC", () => {
    expect(migration).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.persist_inventory_action/i,
    );
    expect(migration).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.inventory_action_is_merchant_approvable/i,
    );
    expect(migration).toMatch(/NEVER unlocks m5_sku_daily_metric_bound_v1/);
    expect(persist).toContain("PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE");
    expect(persist).not.toContain("evaluate_pb1_create_evidence_fence");
    expect(lifecycle).not.toContain("evaluate_pb1_create_evidence_fence");
  });
});

