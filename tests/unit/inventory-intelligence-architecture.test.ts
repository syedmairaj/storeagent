import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("inventory intelligence architecture", () => {
  it("reads persisted M5 cover fields and never recomputes formulas", () => {
    const load = read("lib/inventory-intelligence/load.ts");
    expect(load).toContain('import "server-only"');
    expect(load).toContain("createSupabaseServerClient");
    expect(load).toContain("organization_members");
    expect(load).toContain("days_of_stock");
    expect(load).toContain("sales_velocity_30d");
    expect(load).toContain("eligible_days_30d");
    expect(load).toContain("classifyInventoryCoverStatus");
    expect(load).toContain(
      "grainKey(row.store_id, row.location_id, row.variant_id)",
    );
    expect(load).not.toContain("calculateDaysOfStock");
    expect(load).not.toContain("calculateSalesVelocity");
    expect(load).not.toContain("decideInventoryAction");
  });

  it("wires the merchant inventory page to the intelligence workspace", () => {
    const page = read("app/(app)/app/[organizationId]/inventory/page.tsx");
    expect(page).toContain("loadMerchantInventoryIntelligence");
    expect(page).toContain("InventoryIntelligenceWorkspace");
    expect(page).toContain("DecisionReadinessPanel");
    expect(page).not.toContain("decideInventoryAction");
    expect(page).not.toContain('actionType: "REORDER"');
  });

  it("keeps Actions demo separate from inventory intelligence", () => {
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );
    expect(workspace).toContain("No reorder recommendations");
    expect(workspace).not.toContain("decideInventoryAction");
    expect(workspace).not.toContain("ActionsDemoWorkspace");
  });
});
