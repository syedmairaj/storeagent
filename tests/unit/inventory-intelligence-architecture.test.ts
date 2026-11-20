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
    expect(load).toContain("safety_stock");
    expect(load).toContain("reorder_point");
    expect(load).toContain("target_stock");
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
    expect(workspace).toContain("No reorder recommendations here");
    expect(workspace).not.toContain("decideInventoryAction");
    expect(workspace).not.toContain("ActionsDemoWorkspace");
  });

  it("separates stock condition, cover availability, and decision eligibility (UX-INV-1b)", () => {
    const presentation = read(
      "lib/inventory-intelligence/sku-attention-presentation.ts",
    );
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );
    const page = read("app/(app)/app/[organizationId]/inventory/page.tsx");

    expect(presentation).toContain("StockConditionKind");
    expect(presentation).toContain("CoverAvailabilityKind");
    expect(presentation).toContain("DecisionEligibilityKind");
    expect(presentation).toContain('decisionEligibility: "unauthorized"');
    expect(presentation).toContain("last_recorded_out_of_stock");
    expect(presentation).toContain("Review low cover");
    expect(presentation).toContain("Review high cover");
    expect(presentation).toContain("not canonical ROP");
    expect(presentation).toContain("not overstock or cash claim");
    expect(presentation).not.toContain("calculateDaysOfStock");
    expect(presentation).not.toContain("decideInventoryAction");

    expect(workspace).toContain("presentSkuAttention");
    expect(workspace).toContain("data-stock-condition");
    expect(workspace).toContain("data-cover-availability");
    expect(workspace).toContain('data-decision-eligibility="unauthorized"');
    expect(workspace).toContain("window.history.pushState");
    expect(workspace).toContain("popstate");
    expect(workspace).not.toContain("useSearchParams");
    expect(workspace).not.toContain("router.push");
    expect(workspace).toContain("data-filter-count");
    expect(workspace).toContain('data-filter-group="stock"');
    expect(workspace).toContain('data-filter-group="evidence"');
    expect(workspace).toContain("Products to review");
    expect(workspace).toContain("SKU evidence");
    expect(workspace).toContain("Last recorded OOS");
    expect(workspace).toContain("Limited sales history");
    expect(workspace).toContain("Demand unavailable");
    expect(workspace).toContain("Stock cover available");
    expect(workspace).toContain("SkuIntelligenceInspector");
    expect(workspace).toContain("data-sku-inspect");
    expect(workspace).toContain("aria-haspopup");
    expect(workspace).toContain("suppressHistoricalChip");
    expect(workspace).toContain("data-inventory-historical-metrics-banner");
    expect(workspace).not.toContain("Section note:");
    expect(workspace).not.toContain("<details");
    expect(workspace).toContain('data-responsive-inventory-cards="true"');
    expect(workspace).toContain('data-responsive-inventory-table="true"');
    expect(workspace).toContain("min-h-11");
    expect(workspace).not.toContain("CheckCircle2");
    expect(workspace).not.toContain("Known cover");
    expect(workspace).not.toContain("text-emerald-700");
    expect(presentation).toContain("buildSkuEvidence");
    expect(presentation).toContain("interpretation");
    expect(presentation).toContain("row.availableQuantity+row.observedAt");

    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    expect(inspector).toContain('@base-ui/react/dialog');
    expect(inspector).toContain("Dialog.Root");
    expect(inspector).toContain("Dialog.Title");
    expect(inspector).toContain("Dialog.Close");
    expect(inspector).toContain('data-sku-inspector="true"');
    expect(inspector).toContain("returnFocusRef");
    expect(inspector).toContain("aria-label=\"Close product inspector\"");
    expect(inspector).toContain('data-inspector-section="stock"');
    expect(inspector).toContain('data-inspector-section="next"');
    expect(inspector).toContain('data-inspector-section="facts"');
    expect(inspector).not.toContain('data-inspector-section="interpretation"');
    expect(inspector).not.toContain("decideInventoryAction");

    const prioritize = read("lib/inventory-intelligence/prioritize.ts");
    expect(prioritize).toContain("isKnownOutOfStock(row) || isLowCoverAttention(row)");
    expect(prioritize).not.toContain('row.coverStatus === "stale"');

    expect(page).toContain("stockObservationsStale");
    expect(page).toContain("hasCurrentDayInventoryObservation");
    expect(page).toContain("inventoryEvidenceSourceLabel");
    expect(page).toContain("asOfLabel");
    expect(page).not.toContain("Suspense");
    expect(page).not.toContain("Loading SKU attention");
  });
});
