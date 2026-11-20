import { describe, expect, it } from "vitest";

import {
  summarizeMerchantAttention,
} from "@/lib/inventory-intelligence/attention";
import { filterIntelligenceRows } from "@/lib/inventory-intelligence/prioritize";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";
import { buildMerchantOverviewPresentation } from "@/lib/inventory-readiness/overview-presentation";
import type { EvidencePresence } from "@/lib/inventory-readiness/types";
import { EMPTY_MERCHANT_PLANNING_INPUTS } from "@/lib/planning-inputs/types";

function row(
  overrides: Partial<MerchantInventoryIntelligenceRow> & {
    grainKey: string;
    coverStatus: MerchantInventoryIntelligenceRow["coverStatus"];
  },
): MerchantInventoryIntelligenceRow {
  return {
    snapshotId: "s",
    organizationId: "349e3ad3-c17b-4658-b3ae-a0ba00f226d0",
    storeId: "20cc792b-6fc3-43a7-ba11-1901b2e89384",
    locationId: "175f0dc6-01b0-4ce4-9c87-7cd24cf85d75",
    variantId: overrides.grainKey,
    sku: overrides.sku ?? overrides.grainKey,
    productTitle: null,
    storeName: "snapstore",
    locationName: "Main",
    availableQuantity: 10,
    onHandQuantity: 10,
    observedAt: "2026-11-18T12:00:00.000Z",
    asOfMetricDate: "2026-11-19",
    metricDate: "2026-11-18",
    salesVelocity30d: 1,
    salesVelocity30dReasonCode: null,
    eligibleDays30d: 4,
    coverageRatio30d: 1,
    daysOfStock: 10,
    daysOfStockReasonCode: null,
    safetyStock: null,
    safetyStockReasonCode: null,
    reorderPoint: null,
    reorderPointReasonCode: null,
    targetStock: null,
    targetStockReasonCode: null,
    evidenceLabel: "x",
    ...overrides,
  };
}

function presence(partial: Partial<EvidencePresence> = {}): EvidencePresence {
  return {
    inventorySnapshotCount: 60,
    distinctSkuCount: 20,
    distinctStoreCount: 1,
    distinctLocationCount: 1,
    knownAvailableSkuCount: 20,
    hasSalesHistory: true,
    hasSkuDailyMetrics: true,
    grainAlignedKnownDemandCount: 0,
    hasPendingMetricWork: false,
    hasCurrentDayInventoryObservation: false,
    hasCurrentDayMetrics: false,
    primaryAsOfMetricDate: "2026-11-19",
    inventoryPlaceFreshnessKind: "all_stale",
    planning: {
      leadTimeDays: 7,
      safetyStockDays: 5,
      reviewPeriodDays: 7,
    },
    trustedIncoming: {
      hasPurchaseOrderItemRows: false,
      evidenceCompleteStoreCount: 0,
      knownIncomingGrainCount: 0,
      knownZeroGrainCount: 0,
      positiveIncomingGrainCount: 0,
    },
    ...partial,
  };
}

describe("UX-INV-1a.1 stale vs fresh attention clarity", () => {
  it("marks low/high cover unavailable when no calculable cover (stale)", () => {
    const rows = [
      row({
        grainKey: "oos",
        coverStatus: "stale",
        availableQuantity: 0,
        daysOfStock: null,
        salesVelocity30d: null,
      }),
      row({
        grainKey: "other",
        coverStatus: "stale",
        availableQuantity: 12,
        daysOfStock: null,
        salesVelocity30d: null,
      }),
      row({
        grainKey: "unk",
        coverStatus: "unknown_demand",
        availableQuantity: 5,
        daysOfStock: null,
        salesVelocity30d: null,
        eligibleDays30d: null,
      }),
      row({
        grainKey: "lim",
        coverStatus: "zero_demand",
        availableQuantity: 3,
        daysOfStock: null,
        salesVelocity30d: 0,
        eligibleDays30d: 3,
      }),
    ];

    const attention = summarizeMerchantAttention(rows);
    expect(attention.lastRecordedOutOfStockCount).toBe(1);
    expect(attention.outOfStockCount).toBe(1);
    expect(attention.lastObservationDate).toBe("2026-11-18");
    expect(attention.coverSignalEvaluation).toBe("unavailable");
    expect(attention.calculableCoverCount).toBe(0);
    expect(attention.lowCoverCount).toBe(0);
    expect(attention.highCoverReviewCount).toBe(0);
    expect(attention.staleOrPendingCount).toBe(2);
    expect(attention.unknownDemandCount).toBe(1);
    // Stale rows with eligibleDays30d=4 (row helper default) count as limited history.
    expect(attention.limitedHistoryCount).toBe(3);
    expect(attention.knownZeroDemandCount).toBe(1);

    const readiness = assessMerchantDecisionReadiness({
      organizationId: "349e3ad3-c17b-4658-b3ae-a0ba00f226d0",
      presence: presence(),
    });
    const presentation = buildMerchantOverviewPresentation({
      organizationId: readiness.organizationId,
      storeName: "snapstore",
      readiness,
      attention,
      lastObservationLabel: "Nov 18, 2026",
    });

    expect(presentation.stockIsStale).toBe(true);
    expect(presentation.headline).toBe("Your stock update is due.");
    expect(presentation.supportingSentence).toMatch(/last recorded out of stock/i);
    expect(presentation.supportingSentence).toMatch(/Nov 18/i);
    expect(presentation.supportingSentence).toMatch(/unavailable/i);
    expect(presentation.evidenceHonesty).toMatch(/historical velocity is not current cover/i);
    expect(presentation.evidenceHonesty).not.toMatch(
      /demand is not yet grain-aligned\. Unknown/,
    );
    expect(
      readiness.inputs.find((i) => i.key === "sales_history")?.detail,
    ).toMatch(/historical metrics are not current cover/i);
    expect(presentation.dataHealthLabel).toMatch(/stale/i);
    expect(presentation.dataHealthNextAction).toMatch(/Upload updated stock/i);
    expect(presentation.primaryCta.label).toMatch(/Upload updated stock/i);
    expect(readiness.commercialActionsEligible).toBe(false);

    const low = presentation.signals.find((s) => s.id === "low_cover");
    const high = presentation.signals.find((s) => s.id === "high_cover_review");
    const oos = presentation.signals.find((s) => s.id === "out_of_stock");
    expect(low?.evaluation).toBe("unavailable");
    expect(low?.displayValue).toBe("—");
    expect(low?.count).toBeNull();
    expect(low?.hrefEnabled).toBe(false);
    expect(high?.evaluation).toBe("unavailable");
    expect(high?.displayValue).toBe("—");
    expect(oos?.label).toMatch(/Last recorded/i);
    expect(oos?.displayValue).toBe("1");
    expect(oos?.description).toMatch(/Not live availability/i);

    expect(
      presentation.signals.find((s) => s.id === "limited_history")?.count,
    ).toBe(3);
    expect(
      presentation.signals.find((s) => s.id === "unknown_demand")?.count,
    ).toBe(1);
    expect(
      presentation.signals.find((s) => s.id === "stale_or_pending")?.count,
    ).toBe(2);
    expect(presentation.signals.some((s) => s.id === "limited_or_unknown" as never)).toBe(
      false,
    );
  });

  it("keeps evaluated low/high cover when cover is calculable (fresh)", () => {
    const rows = [
      row({
        grainKey: "oos",
        coverStatus: "valid",
        availableQuantity: 0,
        daysOfStock: 0,
        asOfMetricDate: "2026-11-18",
        metricDate: "2026-11-18",
        observedAt: "2026-11-18T12:00:00.000Z",
      }),
      row({
        grainKey: "low",
        coverStatus: "valid",
        availableQuantity: 4,
        daysOfStock: 5,
        asOfMetricDate: "2026-11-18",
        metricDate: "2026-11-18",
      }),
      row({
        grainKey: "high",
        coverStatus: "valid",
        availableQuantity: 90,
        daysOfStock: 90,
        asOfMetricDate: "2026-11-18",
        metricDate: "2026-11-18",
      }),
      row({
        grainKey: "zero",
        coverStatus: "zero_demand",
        availableQuantity: 8,
        daysOfStock: null,
        salesVelocity30d: 0,
        eligibleDays30d: 3,
        asOfMetricDate: "2026-11-18",
        metricDate: "2026-11-18",
      }),
    ];

    const attention = summarizeMerchantAttention(rows);
    expect(attention.coverSignalEvaluation).toBe("evaluated");
    expect(attention.lastRecordedOutOfStockCount).toBe(1);
    expect(attention.lowCoverCount).toBe(2);
    expect(attention.highCoverReviewCount).toBe(1);
    expect(attention.limitedHistoryCount).toBe(4);
    expect(attention.staleOrPendingCount).toBe(0);

    const readiness = assessMerchantDecisionReadiness({
      organizationId: "349e3ad3-c17b-4658-b3ae-a0ba00f226d0",
      presence: presence({
        hasCurrentDayInventoryObservation: true,
        hasCurrentDayMetrics: true,
        grainAlignedKnownDemandCount: 3,
        inventoryPlaceFreshnessKind: "all_current",
        primaryAsOfMetricDate: "2026-11-18",
      }),
    });

    const presentation = buildMerchantOverviewPresentation({
      organizationId: readiness.organizationId,
      storeName: "snapstore",
      readiness,
      attention,
      lastObservationLabel: "Nov 18, 2026",
    });

    expect(presentation.stockIsStale).toBe(false);
    expect(presentation.headline).toMatch(/out of stock/i);
    expect(
      presentation.signals.find((s) => s.id === "low_cover")?.displayValue,
    ).toBe("2");
    expect(
      presentation.signals.find((s) => s.id === "high_cover_review")
        ?.evaluation,
    ).toBe("evaluated");
    expect(
      presentation.signals.find((s) => s.id === "out_of_stock")?.label,
    ).toBe("Out of stock");

    expect(filterIntelligenceRows(rows, "limited_history")).toHaveLength(4);
    expect(filterIntelligenceRows(rows, "out_of_stock")).toHaveLength(1);
    expect(filterIntelligenceRows(rows, "low_cover")).toHaveLength(2);
    expect(EMPTY_MERCHANT_PLANNING_INPUTS.leadTimeDays).toBeNull();
  });

  it("does not treat unknown stock as out of stock or known-zero demand", () => {
    const attention = summarizeMerchantAttention([
      row({
        grainKey: "unk-stock",
        coverStatus: "unknown_stock",
        availableQuantity: null,
        daysOfStock: null,
        salesVelocity30d: null,
        eligibleDays30d: null,
      }),
    ]);
    expect(attention.lastRecordedOutOfStockCount).toBe(0);
    expect(attention.unknownDemandCount).toBe(1);
    expect(attention.knownZeroDemandCount).toBe(0);
    expect(attention.coverSignalEvaluation).toBe("unavailable");
  });

  it("does not classify known positive/zero demand as unknown solely due to sparse history", () => {
    const rows = [
      row({
        grainKey: "known-positive-sparse",
        coverStatus: "valid",
        availableQuantity: 12,
        daysOfStock: 20,
        salesVelocity30d: 0.6,
        eligibleDays30d: 3,
      }),
      row({
        grainKey: "known-zero-sparse",
        coverStatus: "zero_demand",
        availableQuantity: 8,
        daysOfStock: null,
        salesVelocity30d: 0,
        eligibleDays30d: 2,
      }),
      row({
        grainKey: "no-eligible-days",
        coverStatus: "short_history",
        availableQuantity: 5,
        daysOfStock: null,
        salesVelocity30d: null,
        eligibleDays30d: 0,
      }),
      row({
        grainKey: "true-unknown",
        coverStatus: "unknown_demand",
        availableQuantity: 4,
        daysOfStock: null,
        salesVelocity30d: null,
        eligibleDays30d: 4,
      }),
    ];

    const attention = summarizeMerchantAttention(rows);
    expect(attention.limitedHistoryCount).toBe(3);
    expect(attention.unknownDemandCount).toBe(1);
    expect(attention.knownZeroDemandCount).toBe(1);
    expect(attention.calculableCoverCount).toBe(1);

    expect(filterIntelligenceRows(rows, "limited_history").map((r) => r.sku)).toEqual(
      ["known-positive-sparse", "known-zero-sparse", "no-eligible-days"],
    );
    expect(
      filterIntelligenceRows(rows, "unknown_or_missing").map((r) => r.sku),
    ).toEqual(["true-unknown"]);
    expect(filterIntelligenceRows(rows, "zero_demand").map((r) => r.sku)).toEqual([
      "known-zero-sparse",
    ]);
  });

  it("maps Overview attention signals to Inventory filters with parity", () => {
    const staleRows = [
      row({
        grainKey: "oos-stale",
        coverStatus: "stale",
        availableQuantity: 0,
        daysOfStock: null,
        salesVelocity30d: null,
        observedAt: "2026-11-18T12:00:00.000Z",
        eligibleDays30d: 4,
      }),
      row({
        grainKey: "lim-stale",
        coverStatus: "zero_demand",
        availableQuantity: 6,
        daysOfStock: null,
        salesVelocity30d: 0,
        eligibleDays30d: 4,
      }),
      row({
        grainKey: "unk",
        coverStatus: "unknown_demand",
        availableQuantity: 2,
        daysOfStock: null,
        salesVelocity30d: null,
        eligibleDays30d: null,
      }),
      row({
        grainKey: "pending",
        coverStatus: "stale",
        availableQuantity: 3,
        daysOfStock: null,
        salesVelocity30d: null,
      }),
    ];
    const staleAttention = summarizeMerchantAttention(staleRows);
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "349e3ad3-c17b-4658-b3ae-a0ba00f226d0",
      presence: presence(),
    });
    const stalePresentation = buildMerchantOverviewPresentation({
      organizationId: readiness.organizationId,
      storeName: "snapstore",
      readiness,
      attention: staleAttention,
      lastObservationLabel: "Nov 18, 2026",
    });

    const staleById = Object.fromEntries(
      stalePresentation.signals.map((s) => [s.id, s]),
    );
    expect(staleById.out_of_stock.filter).toBe("out_of_stock");
    expect(staleById.out_of_stock.count).toBe(
      filterIntelligenceRows(staleRows, "out_of_stock").length,
    );
    expect(staleById.limited_history.filter).toBe("limited_history");
    expect(staleById.limited_history.count).toBe(
      filterIntelligenceRows(staleRows, "limited_history").length,
    );
    expect(staleById.unknown_demand.filter).toBe("unknown_or_missing");
    expect(staleById.unknown_demand.count).toBe(
      filterIntelligenceRows(staleRows, "unknown_or_missing").length,
    );
    expect(staleById.stale_or_pending.filter).toBe("pending_or_stale");
    expect(staleById.stale_or_pending.count).toBe(
      filterIntelligenceRows(staleRows, "pending_or_stale").length,
    );
    expect(staleById.low_cover.evaluation).toBe("unavailable");
    expect(staleById.high_cover_review.evaluation).toBe("unavailable");
    expect(staleById.low_cover.hrefEnabled).toBe(false);

    const freshRows = [
      row({
        grainKey: "oos",
        coverStatus: "valid",
        availableQuantity: 0,
        daysOfStock: 0,
        eligibleDays30d: 4,
        asOfMetricDate: "2026-11-18",
        metricDate: "2026-11-18",
      }),
      row({
        grainKey: "lim",
        coverStatus: "valid",
        availableQuantity: 6,
        daysOfStock: 18,
        eligibleDays30d: 4,
        asOfMetricDate: "2026-11-18",
        metricDate: "2026-11-18",
      }),
    ];
    const freshPresentation = buildMerchantOverviewPresentation({
      organizationId: readiness.organizationId,
      storeName: "snapstore",
      readiness: assessMerchantDecisionReadiness({
        organizationId: readiness.organizationId,
        presence: presence({
          hasCurrentDayInventoryObservation: true,
          hasCurrentDayMetrics: true,
          grainAlignedKnownDemandCount: 2,
          inventoryPlaceFreshnessKind: "all_current",
          primaryAsOfMetricDate: "2026-11-18",
        }),
      }),
      attention: summarizeMerchantAttention(freshRows),
      lastObservationLabel: "Nov 18, 2026",
    });
    const freshById = Object.fromEntries(
      freshPresentation.signals.map((s) => [s.id, s]),
    );
    expect(freshById.limited_history.count).toBe(
      filterIntelligenceRows(freshRows, "limited_history").length,
    );
    expect(freshById.out_of_stock.count).toBe(
      filterIntelligenceRows(freshRows, "out_of_stock").length,
    );
    expect(freshById.low_cover.evaluation).toBe("evaluated");
    expect(freshById.low_cover.filter).toBe("low_cover");
  });
});
