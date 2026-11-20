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
    const dashboard = read(
      "components/overview/merchant-overview-dashboard.tsx",
    );
    const presentation = read(
      "lib/inventory-readiness/overview-presentation.ts",
    );
    expect(overview).toContain("buildMerchantOverviewPresentation");
    expect(overview).toContain('inventorySourceKind: "csv"');
    expect(overview).not.toContain("Imported inventory is available.");
    expect(overview).not.toContain("Live inventory is connected.");
    expect(overview).not.toContain("live SKU position(s)");
    expect(dashboard).not.toContain("Live inventory is connected.");
    expect(presentation).toContain('inventorySourceKind ?? "csv"');
    expect(presentation).toContain("inventoryEvidenceSourceLabel");
    expect(presentation).not.toContain("live connected integration");
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
    expect(workspace).toContain("not forecast confidence");
    expect(workspace).toContain("aria-pressed");
    expect(workspace).toContain("data-limited-history");
    expect(workspace).toContain('data-responsive-inventory-table="true"');
    expect(workspace).toContain('data-responsive-inventory-cards="true"');
    expect(workspace).toContain("overflow-x-auto");
    expect(workspace).toContain("sticky left-0");
    expect(workspace).toContain("SkuIntelligenceInspector");
  });

  it("preserves zero vs unknown vs stale cover labels without healthy-cover conflation", () => {
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );
    const presentation = read(
      "lib/inventory-intelligence/sku-attention-presentation.ts",
    );
    expect(presentation).toContain("No sales observed");
    expect(presentation).toContain("Unknown demand (≠ 0)");
    expect(presentation).toContain("Stale metrics");
    expect(workspace).toContain("No sales observed");
    expect(workspace).toContain("Unknown");
    expect(workspace).not.toContain("Known cover");
    expect(workspace).not.toContain("CheckCircle2");
    expect(workspace).toContain("Review low cover");
    expect(workspace).toContain("Review high cover");
    expect(workspace).toContain("Last recorded");
    expect(presentation).toContain("Last recorded out of stock");
  });

  it("keeps Inventory filter URL parity with Overview deep links", () => {
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );
    const page = read("app/(app)/app/[organizationId]/inventory/page.tsx");
    const attention = read("lib/inventory-intelligence/attention.ts");
    expect(workspace).toContain("window.history.pushState");
    expect(workspace).toContain("popstate");
    expect(workspace).toContain("inventoryFilterPath");
    expect(workspace).toContain("setFilterState(next)");
    expect(workspace).not.toContain("useSearchParams");
    expect(workspace).not.toContain("router.push");
    expect(attention).toContain("INVENTORY_EVIDENCE_ANCHOR");
    expect(attention).toContain("inventoryFilterHref");
    expect(attention).toContain("`#${INVENTORY_EVIDENCE_ANCHOR}`");
    expect(workspace).toContain('data-filter-group="stock"');
    expect(workspace).toContain('data-filter-group="evidence"');
    expect(workspace).toContain("Products to review");
    expect(workspace).toContain("SkuIntelligenceInspector");
    expect(workspace).toContain("data-sku-inspect");
    expect(workspace).toContain("data-inventory-historical-metrics-banner");
    expect(page).toContain("parseInventoryAttentionFilter");
    expect(page).toContain("INVENTORY_EVIDENCE_ANCHOR");
    expect(page).toContain("stockObservationsStale");
    expect(page).not.toContain("Suspense");
    expect(page).toContain(">Inventory<");
    expect(page).not.toContain(">Products to review<");
  });
});
