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
    expect(actions).not.toContain("createSupabaseAdminClient");

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
    expect(editor).not.toContain("decideInventoryAction");
    expect(editor).not.toContain("m7-decision-demo");
  });

  it("keeps M5 recompute free of planning-input side effects in this slice", () => {
    const recompute = read("lib/persistence/recompute-sku-daily-metric.ts");
    expect(recompute).not.toContain("organization_planning_inputs");
    expect(recompute).not.toContain("loadMerchantPlanningInputs");
  });
});
