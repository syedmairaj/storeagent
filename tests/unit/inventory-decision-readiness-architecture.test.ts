import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("inventory decision readiness architecture", () => {
  it("loads readiness through the member-scoped server client", () => {
    const load = read("lib/inventory-readiness/load.ts");
    expect(load).toContain('import "server-only"');
    expect(load).toContain("createSupabaseServerClient");
    expect(load).toContain('from("inventory_snapshots")');
    expect(load).toContain("countGrainAlignedKnownDemand");
    expect(load).toContain("sales_velocity_30d");
    expect(load).not.toContain("createSupabaseAdminClient");
    expect(load).not.toContain("decideInventoryAction");

    const align = read("lib/inventory-readiness/align.ts");
    expect(align).toContain("sales_velocity_30d");
    expect(align).not.toContain("createSupabaseAdminClient");
  });

  it("never calls the decision engine or fabricates action payloads", () => {
    const assess = read("lib/inventory-readiness/assess.ts");
    // Mentions of REORDER/etc. as eligibility labels are OK; payloads are not.
    expect(assess).not.toMatch(/\bdecideInventoryAction\s*\(/);
    expect(assess).not.toContain('actionType: "REORDER"');
    expect(assess).not.toContain('actionType: "REDUCE"');
    expect(assess).not.toContain('actionType: "PROMOTE"');
    expect(assess).not.toContain('actionType: "WATCH"');
    expect(assess).toContain("commercialActionsEligible");
    expect(assess).toContain("hasLeadTime = false");
    expect(assess).toContain("hasForecast = false");
    expect(assess).toContain("grainAlignedKnownDemandCount");
    expect(assess).toContain("PROMOTE does not");
    expect(assess).toMatch(/canCommercial = false/);
  });

  it("wires readiness into inventory, overview, and Actions without contaminating demo modules", () => {
    expect(
      read("app/(app)/app/[organizationId]/inventory/page.tsx"),
    ).toContain("loadMerchantDecisionReadiness");
    expect(
      read("app/(app)/app/[organizationId]/page.tsx"),
    ).toContain("loadMerchantDecisionReadiness");
    expect(
      read("app/(app)/app/[organizationId]/actions/page.tsx"),
    ).toContain("loadMerchantDecisionReadiness");
    expect(
      read("app/(app)/app/[organizationId]/actions/page.tsx"),
    ).toContain("DecisionReadinessPanel");

    const demoWorkspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );
    expect(demoWorkspace).not.toContain("loadMerchantDecisionReadiness");
    expect(demoWorkspace).not.toContain("inventory_snapshots");

    const fixtures = read("lib/demo/m7-decision-demo-fixtures.ts");
    expect(fixtures).not.toContain("loadMerchantDecisionReadiness");
  });

  it("keeps the Actions synthetic banner distinct from live readiness", () => {
    const actionsPage = read(
      "app/(app)/app/[organizationId]/actions/page.tsx",
    );
    expect(actionsPage).toContain("DemoDataBanner");
    expect(actionsPage).toContain("DecisionReadinessPanel");
    expect(actionsPage.indexOf("DemoDataBanner")).toBeLessThan(
      actionsPage.indexOf("DecisionReadinessPanel"),
    );
  });
});
