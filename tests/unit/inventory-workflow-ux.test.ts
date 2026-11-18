import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveDemandFreshnessGuidance } from "@/lib/inventory-readiness/demand-freshness";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("merchant inventory workflow UX", () => {
  it("uses CSV-accurate overview wording instead of live-connected claims", () => {
    const overview = read("app/(app)/app/[organizationId]/page.tsx");
    expect(overview).toContain("Imported inventory is available.");
    expect(overview).toContain("imported SKU position(s) from CSV");
    expect(overview).not.toContain("Live inventory is connected.");
    expect(overview).not.toContain("live SKU position(s)");
  });

  it("keeps Inventory → Import → Sales → Planning → Actions navigation surfaces", () => {
    const shell = read("components/app-shell/app-shell.tsx");
    expect(shell).toContain("OverviewNavLink");
    expect(shell).toContain("InventoryNavLink");
    expect(shell).toContain("ActionsNavLink");

    const inventoryPage = read(
      "app/(app)/app/[organizationId]/inventory/page.tsx",
    );
    expect(inventoryPage).toContain("DecisionReadinessPanel");
    expect(inventoryPage).toContain("PlanningInputsEditor");
    expect(inventoryPage).toContain("InventoryIntelligenceWorkspace");
    expect(inventoryPage).toContain("resolveMerchantActivationScope");
    expect(inventoryPage).toContain("inventoryEvidenceSourceLabel");
    expect(inventoryPage).toContain("inventorySourceKind");
    expect(inventoryPage).toContain("lastObservationLabel");
    expect(inventoryPage).not.toContain("intelligence.rows[0]");

    expect(
      fs.existsSync(
        path.join(ROOT, "app/(app)/app/[organizationId]/inventory/import/page.tsx"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          ROOT,
          "app/(app)/app/[organizationId]/inventory/sales-import/page.tsx",
        ),
      ),
    ).toBe(true);
  });

  it("exposes one primary CTA path for stale CSV stock via upload wording", () => {
    const guidance = resolveDemandFreshnessGuidance({
      hasSalesHistory: true,
      knownAvailableSkuCount: 20,
      hasCurrentDayInventoryObservation: false,
      hasCurrentDayMetrics: false,
      hasPendingMetricWork: false,
      grainAlignedKnownDemandCount: 0,
      hasActivationScope: true,
      asOfMetricDate: "2026-11-18",
    });
    expect(guidance.ctaLabel).toBe("Upload updated stock");
    expect(guidance.ctaHref).toBe("inventory-import");
    expect(guidance.showActivateButton).toBe(false);

    const panel = read(
      "components/inventory-readiness/decision-readiness-panel.tsx",
    );
    expect(panel).toContain("data-primary-inventory-cta");
    expect(panel).toContain("freshness.ctaLabel");
    expect(panel).toContain("Show detailed evidence");
    expect(panel).toContain("aria-expanded");
    expect(panel).toContain("data-inventory-meta");
    expect(panel).toContain("data-inventory-source-kind");
    expect(panel).toContain("data-planning-configuration");
    expect(panel).toContain("planning: readiness.presence.planning");
    expect(panel).toContain("inventoryEvidenceSourceLabel");
    expect(panel).toContain("activationScopeBlockMessage");
    expect(panel).not.toContain("Refresh inventory");
    expect(panel).not.toContain("live connected integration");

    const freshnessSource = read("lib/inventory-readiness/demand-freshness.ts");
    expect(freshnessSource).toContain("Upload updated stock");
    expect(freshnessSource).toContain("classifyMerchantPlanningConfiguration");
    expect(freshnessSource).not.toContain(
      "Configure planning inputs before reorder thresholds unlock.",
    );
  });

  it("keeps readiness summaries free of live-connector claims for CSV orgs", () => {
    const assess = read("lib/inventory-readiness/assess.ts");
    expect(assess).toContain("Imported inventory");
    expect(assess).not.toMatch(/Live inventory and grain-aligned/);
    expect(assess).not.toMatch(/Live inventory, grain-aligned/);
  });

  it("surfaces limited-history velocity without claiming forecast confidence", () => {
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );
    expect(workspace).toContain("Limited history");
    expect(workspace).toContain("eligible days");
    expect(workspace).toContain("Not forecast confidence");
    expect(workspace).toContain("aria-pressed");
    expect(workspace).toContain("lg:table-cell");
    expect(workspace).toContain("data-limited-history");
    expect(workspace).toContain('data-responsive-inventory-table="true"');
    expect(workspace).toContain('data-mobile-evidence="true"');
    expect(workspace).toContain("overflow-x-auto");
  });

  it("preserves zero vs unknown vs stale cover labels", () => {
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );
    expect(workspace).toContain("Unavailable (zero demand)");
    expect(workspace).toContain("Unavailable (stale)");
    expect(workspace).toContain("Unavailable (unknown ≠ 0)");
    expect(workspace).toContain("Unknown");
  });
});
