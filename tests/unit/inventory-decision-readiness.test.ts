import { describe, expect, it } from "vitest";

import { countGrainAlignedKnownDemand } from "@/lib/inventory-readiness/align";
import { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";


describe("merchant decision readiness", () => {
  it("keeps commercial actions ineligible when only CSV inventory exists", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: {
        inventorySnapshotCount: 4,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 2,
        hasSalesHistory: false,
        hasSkuDailyMetrics: false,
        grainAlignedKnownDemandCount: 0,
      },
    });

    expect(readiness.commercialActionsEligible).toBe(false);
    expect(
      readiness.capabilities.find((item) => item.key === "stock_positions")
        ?.ready,
    ).toBe(true);
    expect(
      readiness.capabilities.find((item) => item.key === "cover_days")?.ready,
    ).toBe(false);
    expect(
      readiness.capabilities.find((item) => item.key === "commercial_actions")
        ?.ready,
    ).toBe(false);
    expect(readiness.summary).toContain("commercial recommendations stay blocked");
    expect(readiness.nextSteps.some((step) => /sales|demand|metrics/i.test(step))).toBe(
      true,
    );
  });

  it("does not treat missing sales as zero demand eligibility for cover", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: {
        inventorySnapshotCount: 1,
        distinctSkuCount: 1,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 1,
        hasSalesHistory: false,
        hasSkuDailyMetrics: false,
        grainAlignedKnownDemandCount: 0,
      },
    });

    const sales = readiness.inputs.find((item) => item.key === "sales_history");
    expect(sales?.status).toBe("missing");
    expect(sales?.present).toBe(false);
    expect(sales?.detail.toLowerCase()).toContain("unknown");
    expect(sales?.detail.toLowerCase()).toContain("not zero");
  });

  it("does not mark cover ready from org-wide sales or metric existence alone", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: {
        inventorySnapshotCount: 10,
        distinctSkuCount: 5,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 5,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 0,
      },
    });

    expect(readiness.commercialActionsEligible).toBe(false);
    expect(
      readiness.capabilities.find((item) => item.key === "cover_days")?.ready,
    ).toBe(false);
    expect(
      readiness.capabilities.find((item) => item.key === "reorder_thresholds")
        ?.ready,
    ).toBe(false);
    expect(
      readiness.inputs.find((item) => item.key === "sales_history")?.status,
    ).toBe("insufficient");
    expect(
      readiness.inputs.find((item) => item.key === "sku_daily_metrics")?.status,
    ).toBe("insufficient");
  });

  it("marks cover ready only with grain-aligned known demand velocity", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: {
        inventorySnapshotCount: 3,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 2,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 2,
      },
    });

    expect(
      readiness.capabilities.find((item) => item.key === "cover_days")?.ready,
    ).toBe(true);
    expect(readiness.commercialActionsEligible).toBe(false);
    expect(
      readiness.capabilities.find((item) => item.key === "commercial_actions")
        ?.detail,
    ).toMatch(/PROMOTE needs demand/i);
    expect(
      readiness.capabilities.find((item) => item.key === "commercial_actions")
        ?.detail,
    ).toMatch(/REORDER\/REDUCE need trusted incoming/i);
  });

  it("treats null-only inventory as insufficient stock evidence", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: {
        inventorySnapshotCount: 2,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 0,
        hasSalesHistory: false,
        hasSkuDailyMetrics: false,
        grainAlignedKnownDemandCount: 0,
      },
    });

    expect(
      readiness.inputs.find((item) => item.key === "inventory_snapshots")
        ?.status,
    ).toBe("insufficient");
    expect(
      readiness.capabilities.find((item) => item.key === "stock_positions")
        ?.ready,
    ).toBe(false);
  });

  it("stays empty when no inventory evidence exists", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: {
        inventorySnapshotCount: 0,
        distinctSkuCount: 0,
        distinctStoreCount: 0,
        distinctLocationCount: 0,
        knownAvailableSkuCount: 0,
        hasSalesHistory: false,
        hasSkuDailyMetrics: false,
        grainAlignedKnownDemandCount: 0,
      },
    });

    expect(readiness.presence.knownAvailableSkuCount).toBe(0);
    expect(readiness.commercialActionsEligible).toBe(false);
    expect(readiness.nextSteps[0]).toMatch(/Import a CSV/i);
  });

  it("counts only store/location/variant-aligned metrics with known velocity", () => {
    const aligned = countGrainAlignedKnownDemand({
      inventoryGrains: [
        {
          store_id: "s1",
          location_id: "l1",
          variant_id: "v1",
          available_quantity: 4,
        },
        {
          store_id: "s1",
          location_id: "l1",
          variant_id: "v2",
          available_quantity: 8,
        },
      ],
      metrics: [
        {
          store_id: "s1",
          location_id: "l1",
          variant_id: "v1",
          metric_date: "2026-11-01",
          sales_velocity_30d: 1.5,
        },
        // Wrong store — must not align.
        {
          store_id: "s-other",
          location_id: "l1",
          variant_id: "v2",
          metric_date: "2026-11-01",
          sales_velocity_30d: 2,
        },
        // Matching grain but unknown velocity — fail closed.
        {
          store_id: "s1",
          location_id: "l1",
          variant_id: "v2",
          metric_date: "2026-11-01",
          sales_velocity_30d: null,
        },
      ],
    });

    expect(aligned).toBe(1);
  });
});
