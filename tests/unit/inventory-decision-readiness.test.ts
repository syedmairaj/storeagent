import { describe, expect, it } from "vitest";

import { countGrainAlignedKnownDemand } from "@/lib/inventory-readiness/align";
import { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";
import type { EvidencePresence } from "@/lib/inventory-readiness/types";
import { EMPTY_MERCHANT_PLANNING_INPUTS } from "@/lib/planning-inputs/types";

function presence(
  partial: Omit<EvidencePresence, "planning" | "trustedIncoming"> & {
    planning?: EvidencePresence["planning"];
    trustedIncoming?: EvidencePresence["trustedIncoming"];
  },
): EvidencePresence {
  return {
    ...partial,
    planning: partial.planning ?? { ...EMPTY_MERCHANT_PLANNING_INPUTS },
    trustedIncoming: partial.trustedIncoming ?? {
      hasPurchaseOrderItemRows: false,
      evidenceCompleteStoreCount: 0,
      knownIncomingGrainCount: 0,
      knownZeroGrainCount: 0,
      positiveIncomingGrainCount: 0,
    },
  };
}

describe("merchant decision readiness", () => {
  it("keeps commercial actions ineligible when only CSV inventory exists", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 4,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 2,
        hasSalesHistory: false,
        hasSkuDailyMetrics: false,
        grainAlignedKnownDemandCount: 0,
        hasPendingMetricWork: false,
      }),
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
      presence: presence({
        inventorySnapshotCount: 1,
        distinctSkuCount: 1,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 1,
        hasSalesHistory: false,
        hasSkuDailyMetrics: false,
        grainAlignedKnownDemandCount: 0,
        hasPendingMetricWork: false,
      }),
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
      presence: presence({
        inventorySnapshotCount: 10,
        distinctSkuCount: 5,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 5,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 0,
        hasPendingMetricWork: false,
      }),
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
      presence: presence({
        inventorySnapshotCount: 3,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 2,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 2,
        hasPendingMetricWork: false,
      }),
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

  it("treats explicit planning zero as available and keeps commercial gated", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 3,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 2,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 2,
        hasPendingMetricWork: false,
        planning: {
          leadTimeDays: 0,
          safetyStockDays: 0,
          reviewPeriodDays: 0,
        },
      }),
    });

    expect(
      readiness.inputs.find((item) => item.key === "lead_time")?.status,
    ).toBe("available");
    expect(
      readiness.inputs.find((item) => item.key === "lead_time")?.detail,
    ).toMatch(/known zero/i);
    expect(
      readiness.inputs.find((item) => item.key === "lead_time")?.detail,
    ).toMatch(/not a verified supplier or sku fact/i);
    expect(
      readiness.capabilities.find((item) => item.key === "reorder_thresholds")
        ?.ready,
    ).toBe(true);
    expect(
      readiness.capabilities.find((item) => item.key === "reorder_thresholds")
        ?.detail,
    ).toMatch(/not an executable M7 commercial action/i);
    expect(readiness.commercialActionsEligible).toBe(false);
  });

  it("keeps reorder thresholds closed when planning is only partial", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 3,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 2,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 2,
        hasPendingMetricWork: false,
        planning: {
          leadTimeDays: 7,
          safetyStockDays: null,
          reviewPeriodDays: 14,
        },
      }),
    });

    expect(
      readiness.inputs.find((item) => item.key === "lead_time")?.present,
    ).toBe(true);
    expect(
      readiness.inputs.find((item) => item.key === "safety_stock_days")
        ?.present,
    ).toBe(false);
    expect(
      readiness.capabilities.find((item) => item.key === "reorder_thresholds")
        ?.ready,
    ).toBe(false);
    expect(readiness.commercialActionsEligible).toBe(false);
  });

  it("blocks cover while metric source processing is still pending", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 3,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 2,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 2,
        hasPendingMetricWork: true,
      }),
    });

    expect(
      readiness.capabilities.find((item) => item.key === "cover_days")?.ready,
    ).toBe(false);
    expect(
      readiness.inputs.find((item) => item.key === "sku_daily_metrics")?.status,
    ).toBe("insufficient");
    expect(
      readiness.inputs.find((item) => item.key === "sku_daily_metrics")?.detail,
    ).toMatch(/still updating/i);
  });

  it("treats null-only inventory as insufficient stock evidence", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 2,
        distinctSkuCount: 2,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 0,
        hasSalesHistory: false,
        hasSkuDailyMetrics: false,
        grainAlignedKnownDemandCount: 0,
        hasPendingMetricWork: false,
      }),
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
      presence: presence({
        inventorySnapshotCount: 0,
        distinctSkuCount: 0,
        distinctStoreCount: 0,
        distinctLocationCount: 0,
        knownAvailableSkuCount: 0,
        hasSalesHistory: false,
        hasSkuDailyMetrics: false,
        grainAlignedKnownDemandCount: 0,
        hasPendingMetricWork: false,
      }),
    });

    expect(readiness.presence.knownAvailableSkuCount).toBe(0);
    expect(readiness.commercialActionsEligible).toBe(false);
    expect(readiness.nextSteps[0]).toMatch(/Import a CSV/i);
  });

  it("counts only store/location/variant-aligned current metrics with known velocity", () => {
    const asOfMetricDateByStoreId = new Map([["s1", "2026-11-08"]]);
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
          metric_date: "2026-11-08",
          sales_velocity_30d: 1.5,
        },
        // Stale metric_date — must not unlock cover.
        {
          store_id: "s1",
          location_id: "l1",
          variant_id: "v1",
          metric_date: "2026-11-01",
          sales_velocity_30d: 9,
        },
        // Wrong store — must not align.
        {
          store_id: "s-other",
          location_id: "l1",
          variant_id: "v2",
          metric_date: "2026-11-08",
          sales_velocity_30d: 2,
        },
        // Matching grain but unknown velocity — fail closed.
        {
          store_id: "s1",
          location_id: "l1",
          variant_id: "v2",
          metric_date: "2026-11-08",
          sales_velocity_30d: null,
        },
      ],
      asOfMetricDateByStoreId,
    });

    expect(aligned).toBe(1);
  });

  it("treats proven zero velocity as known demand and ignores missing as-of", () => {
    const aligned = countGrainAlignedKnownDemand({
      inventoryGrains: [
        {
          store_id: "s1",
          location_id: "l1",
          variant_id: "v1",
          available_quantity: 3,
        },
        {
          store_id: "s2",
          location_id: "l2",
          variant_id: "v2",
          available_quantity: 5,
        },
      ],
      metrics: [
        {
          store_id: "s1",
          location_id: "l1",
          variant_id: "v1",
          metric_date: "2026-11-08",
          sales_velocity_30d: 0,
        },
        {
          store_id: "s2",
          location_id: "l2",
          variant_id: "v2",
          metric_date: "2026-11-08",
          sales_velocity_30d: 1,
        },
      ],
      asOfMetricDateByStoreId: new Map([["s1", "2026-11-08"]]),
    });

    expect(aligned).toBe(1);
  });

  it("distinguishes missing, unknown, trusted zero, and positive incoming without unlocking commercial actions", () => {
    const missing = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 1,
        distinctSkuCount: 1,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 1,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 1,
        hasPendingMetricWork: false,
      }),
    });
    expect(
      missing.inputs.find((item) => item.key === "trusted_incoming")?.status,
    ).toBe("missing");
    expect(missing.commercialActionsEligible).toBe(false);

    const insufficient = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 1,
        distinctSkuCount: 1,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 1,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 1,
        hasPendingMetricWork: false,
        trustedIncoming: {
          hasPurchaseOrderItemRows: true,
          evidenceCompleteStoreCount: 0,
          knownIncomingGrainCount: 0,
          knownZeroGrainCount: 0,
          positiveIncomingGrainCount: 0,
        },
      }),
    });
    expect(
      insufficient.inputs.find((item) => item.key === "trusted_incoming")
        ?.status,
    ).toBe("insufficient");

    const known = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 1,
        distinctSkuCount: 1,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 1,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 1,
        hasPendingMetricWork: false,
        trustedIncoming: {
          hasPurchaseOrderItemRows: true,
          evidenceCompleteStoreCount: 1,
          knownIncomingGrainCount: 2,
          knownZeroGrainCount: 1,
          positiveIncomingGrainCount: 1,
        },
      }),
    });
    const incoming = known.inputs.find(
      (item) => item.key === "trusted_incoming",
    );
    expect(incoming?.status).toBe("available");
    expect(incoming?.detail).toMatch(/positive trusted incoming/i);
    expect(incoming?.detail).toMatch(/known-zero/i);
    expect(known.commercialActionsEligible).toBe(false);
  });
});
