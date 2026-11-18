import { describe, expect, it } from "vitest";

import { resolveDemandFreshnessGuidance } from "@/lib/inventory-readiness/demand-freshness";

describe("resolveDemandFreshnessGuidance", () => {
  it("asks for inventory before sales when stock is missing", () => {
    const guidance = resolveDemandFreshnessGuidance({
      hasSalesHistory: false,
      knownAvailableSkuCount: 0,
      hasCurrentDayInventoryObservation: false,
      hasCurrentDayMetrics: false,
      hasPendingMetricWork: false,
      grainAlignedKnownDemandCount: 0,
      hasActivationScope: true,
      asOfMetricDate: "2026-11-18",
    });
    expect(guidance.kind).toBe("missing_inventory");
    expect(guidance.showActivateButton).toBe(false);
    expect(guidance.primaryNextStep).toMatch(/inventory CSV/i);
  });

  it("asks for sales when stock exists but sales history is missing", () => {
    const guidance = resolveDemandFreshnessGuidance({
      hasSalesHistory: false,
      knownAvailableSkuCount: 20,
      hasCurrentDayInventoryObservation: true,
      hasCurrentDayMetrics: false,
      hasPendingMetricWork: false,
      grainAlignedKnownDemandCount: 0,
      hasActivationScope: true,
      asOfMetricDate: "2026-11-18",
    });
    expect(guidance.kind).toBe("missing_sales");
    expect(guidance.showActivateButton).toBe(false);
    expect(guidance.primaryNextStep).toMatch(/Import sales history/i);
  });

  it("asks for current-day inventory when metrics are stale without today stock", () => {
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
    expect(guidance.kind).toBe("missing_current_day_stock");
    expect(guidance.showActivateButton).toBe(false);
    expect(guidance.headline).toMatch(/Upload updated stock/i);
    expect(guidance.ctaLabel).toBe("Upload updated stock");
    expect(guidance.ctaHref).toBe("inventory-import");
    expect(guidance.detail).toMatch(/store-local 2026-11-18/);
  });

  it("shows activate when current-day stock exists and metrics need refresh", () => {
    const guidance = resolveDemandFreshnessGuidance({
      hasSalesHistory: true,
      knownAvailableSkuCount: 20,
      hasCurrentDayInventoryObservation: true,
      hasCurrentDayMetrics: false,
      hasPendingMetricWork: true,
      grainAlignedKnownDemandCount: 0,
      hasActivationScope: true,
      asOfMetricDate: "2026-11-18",
    });
    expect(guidance.kind).toBe("activate_metrics");
    expect(guidance.showActivateButton).toBe(true);
    expect(guidance.primaryNextStep).toMatch(/Activate demand metrics/i);
  });

  it("does not use cover-ready alone — pending work still shows activate", () => {
    const guidance = resolveDemandFreshnessGuidance({
      hasSalesHistory: true,
      knownAvailableSkuCount: 20,
      hasCurrentDayInventoryObservation: true,
      hasCurrentDayMetrics: true,
      hasPendingMetricWork: true,
      // Aligned count may still be non-zero on the wire; pending must win.
      grainAlignedKnownDemandCount: 18,
      hasActivationScope: true,
      asOfMetricDate: "2026-11-18",
    });
    expect(guidance.kind).toBe("activate_metrics");
    expect(guidance.showActivateButton).toBe(true);
  });

  it("reports ready when current metrics are aligned and not pending", () => {
    const guidance = resolveDemandFreshnessGuidance({
      hasSalesHistory: true,
      knownAvailableSkuCount: 20,
      hasCurrentDayInventoryObservation: true,
      hasCurrentDayMetrics: true,
      hasPendingMetricWork: false,
      grainAlignedKnownDemandCount: 18,
      hasActivationScope: true,
      asOfMetricDate: "2026-11-18",
    });
    expect(guidance.kind).toBe("ready");
    expect(guidance.showActivateButton).toBe(false);
    expect(guidance.detail).toMatch(/18 position/);
  });

  it("hides activate when scope is missing even if metrics need refresh", () => {
    const guidance = resolveDemandFreshnessGuidance({
      hasSalesHistory: true,
      knownAvailableSkuCount: 20,
      hasCurrentDayInventoryObservation: true,
      hasCurrentDayMetrics: false,
      hasPendingMetricWork: false,
      grainAlignedKnownDemandCount: 0,
      hasActivationScope: false,
      asOfMetricDate: "2026-11-18",
    });
    expect(guidance.kind).toBe("activate_metrics");
    expect(guidance.showActivateButton).toBe(false);
    expect(guidance.primaryNextStep).toMatch(/will not guess/i);
  });

  it("calls out mixed place freshness when some locations are stale", () => {
    const guidance = resolveDemandFreshnessGuidance({
      hasSalesHistory: true,
      knownAvailableSkuCount: 20,
      hasCurrentDayInventoryObservation: false,
      hasCurrentDayMetrics: false,
      hasPendingMetricWork: false,
      grainAlignedKnownDemandCount: 0,
      hasActivationScope: true,
      asOfMetricDate: "2026-11-18",
      inventoryPlaceFreshnessKind: "mixed",
    });
    expect(guidance.kind).toBe("missing_current_day_stock");
    expect(guidance.detail).toMatch(/current while others are stale/i);
    expect(guidance.showActivateButton).toBe(false);
  });
});
