import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("merchant planning inputs architecture", () => {
  it("persists org-default days through a trusted owner/admin RPC", () => {
    const migration = read(
      "supabase/migrations/20261108160000_merchant_planning_inputs_v1.sql",
    );
    expect(migration).toContain("organization_planning_inputs");
    expect(migration).toContain(
      "upsert_current_user_organization_planning_inputs",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("'owner', 'admin'");
    expect(migration).toContain("lead_time_days");
    expect(migration).toContain("safety_stock_days");
    expect(migration).toContain("review_period_days");
    expect(migration).toContain("organization_planning_inputs_select_member");
    expect(migration).toContain("grant select");
    expect(migration).toMatch(/revoke insert, update, delete/i);
    expect(migration).toMatch(
      /revoke all[\s\S]*from public, anon, service_role/i,
    );
    expect(migration).toMatch(/Not verified supplier/i);
  });

  it("writes only through the server action + RPC boundary", () => {
    const actions = read("lib/planning-inputs/actions.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("organization.manage");
    expect(actions).toContain(
      "upsert_current_user_organization_planning_inputs",
    );
    expect(actions).toContain("parseMerchantPlanningInputs");
    expect(actions).toContain("refreshMetricsAfterPlanningChange");
    expect(actions).toContain("reportPlanningMetricsRefresh");
    expect(actions).toContain("metricsRefresh");
    expect(actions).not.toContain("createSupabaseAdminClient");
    expect(actions).not.toContain("decideInventoryAction");
    expect(actions).not.toContain("TrustedSupplierPlanningFacts");
    expect(actions).not.toContain("commercialActionsEligible");

    const load = read("lib/planning-inputs/load.ts");
    expect(load).toContain('import "server-only"');
    expect(load).toContain("createSupabaseServerClient");
    expect(load).toContain('from("organization_planning_inputs")');
    expect(load).toContain("EMPTY_MERCHANT_PLANNING_INPUTS");
  });

  it("wires the Inventory editor without activating commercial actions", () => {
    const page = read("app/(app)/app/[organizationId]/inventory/page.tsx");
    expect(page).toContain("PlanningInputsEditor");
    expect(page).toContain("loadMerchantPlanningInputs");
    expect(page).toContain("organization.manage");

    const editor = read("components/inventory/planning-inputs-editor.tsx");
    expect(editor).toContain("saveMerchantPlanningInputsAction");
    expect(editor).toContain("Clear to unknown");
    expect(editor).toContain("Merchant assumptions");
    expect(editor).toMatch(/not verified supplier or SKU facts/i);
    expect(editor).toMatch(/Commercial actions stay\s+disabled/);
    expect(editor).toContain("metricsRefresh.note");
    expect(editor).not.toContain("decideInventoryAction");
    expect(editor).not.toContain("m7-decision-demo");
  });

  it("binds organization planning defaults into trusted M5 recompute", () => {
    const binding = read(
      "supabase/migrations/20261108170000_planning_evidence_binding_v1.sql",
    );
    expect(binding).toContain(
      "sku_daily_metric_organization_planning_settings",
    );
    expect(binding).toContain(
      "enqueue_sku_daily_metric_planning_invalidation",
    );
    expect(binding).toContain("dirty_generation");
    expect(binding).toContain("claimed");
    expect(binding).toContain("running");
    expect(binding).toMatch(/to service_role/);
    expect(binding).toMatch(
      /revoke all[\s\S]*from public, anon, authenticated/i,
    );
    expect(binding).toContain(
      "enqueue_sku_daily_metric_planning_invalidation",
    );
    expect(binding).toMatch(/Not attested supplier|organization-default/i);

    const recompute = read("lib/persistence/recompute-sku-daily-metric.ts");
    expect(recompute).toContain(
      "sku_daily_metric_organization_planning_settings",
    );
    expect(recompute).toContain("toInventoryPlanningSettings");
    expect(recompute).toContain("planning,");
    expect(recompute).not.toContain("loadMerchantPlanningInputs");
    expect(recompute).not.toContain("TrustedSupplierPlanningFacts");
    expect(recompute).not.toContain("pb1_trusted_supplier_planning_v1");
    expect(recompute).not.toContain("commercialActionsEligible");
    expect(recompute).not.toContain("decideInventoryAction");

    const persisted = read("lib/metrics/sku-daily-metric-record.ts");
    expect(persisted).toContain("EligibleIncomingEvidence");
    expect(persisted).toContain("INCOMING_STATE_UNKNOWN");
    expect(recompute).toContain("resolveEligibleIncoming");
    expect(recompute).not.toContain("decideInventoryAction");

    const refresh = read(
      "lib/planning-inputs/refresh-metrics-after-planning-change.ts",
    );
    expect(refresh).toContain("runAuthorizedOrgMetricRecompute");
    expect(refresh).not.toContain("ENABLE_METRIC");
  });

  it("keeps readiness commercial gate hard-false", () => {
    const assess = read("lib/inventory-readiness/assess.ts");
    expect(assess).toMatch(/const canCommercial = false/);
  });
});
