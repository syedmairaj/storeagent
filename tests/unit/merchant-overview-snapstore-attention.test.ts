import { describe, expect, it } from "vitest";

import {
  HIGH_COVER_REVIEW_DAYS,
  LOW_COVER_ATTENTION_DAYS,
  summarizeMerchantAttention,
} from "@/lib/inventory-intelligence/attention";
import { filterIntelligenceRows } from "@/lib/inventory-intelligence/prioritize";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";
import { buildMerchantOverviewPresentation } from "@/lib/inventory-readiness/overview-presentation";
import type { EvidencePresence } from "@/lib/inventory-readiness/types";
import { EMPTY_MERCHANT_PLANNING_INPUTS } from "@/lib/planning-inputs/types";

/**
 * Live snapstore/Main read-only grain facts observed 2026-11-19 (Chicago as-of
 * still 2026-11-18). Pending metric work = 0. No DB writes in this suite.
 */
const SNAPSTORE_LIVE_ROWS: Array<
  Partial<MerchantInventoryIntelligenceRow> & {
    grainKey: string;
    sku: string;
    coverStatus: MerchantInventoryIntelligenceRow["coverStatus"];
    availableQuantity: number | null;
    daysOfStock: number | null;
    eligibleDays30d: number | null;
  }
> = [
  {
    grainKey: "bag",
    sku: "SNAP-BAG-TOTE",
    coverStatus: "valid",
    availableQuantity: 0,
    daysOfStock: 0,
    eligibleDays30d: 4,
    salesVelocity30d: 0.75,
  },
  {
    grainKey: "b500",
    sku: "SNAP-BOTTLE-500",
    coverStatus: "valid",
    availableQuantity: 74,
    daysOfStock: 74,
    eligibleDays30d: 4,
    salesVelocity30d: 1,
  },
  {
    grainKey: "b750",
    sku: "SNAP-BOTTLE-750",
    coverStatus: "valid",
    availableQuantity: 15,
    daysOfStock: 60,
    eligibleDays30d: 4,
    salesVelocity30d: 0.25,
  },
  {
    grainKey: "cap",
    sku: "SNAP-CAP-NVY",
    coverStatus: "valid",
    availableQuantity: 56,
    daysOfStock: 112,
    eligibleDays30d: 4,
    salesVelocity30d: 0.5,
  },
  {
    grainKey: "desk",
    sku: "SNAP-DESK-MAT",
    coverStatus: "valid",
    availableQuantity: 12,
    daysOfStock: 24,
    eligibleDays30d: 4,
    salesVelocity30d: 0.5,
  },
  {
    grainKey: "hl",
    sku: "SNAP-HOODIE-GRY-L",
    coverStatus: "zero_demand",
    availableQuantity: 6,
    daysOfStock: null,
    eligibleDays30d: 3,
    salesVelocity30d: 0,
  },
  {
    grainKey: "hm",
    sku: "SNAP-HOODIE-GRY-M",
    coverStatus: "zero_demand",
    availableQuantity: 11,
    daysOfStock: null,
    eligibleDays30d: 3,
    salesVelocity30d: 0,
  },
  {
    grainKey: "j30",
    sku: "SNAP-JEANS-BLU-30",
    coverStatus: "zero_demand",
    availableQuantity: 27,
    daysOfStock: null,
    eligibleDays30d: 3,
    salesVelocity30d: 0,
  },
  {
    grainKey: "j32",
    sku: "SNAP-JEANS-BLU-32",
    coverStatus: "zero_demand",
    availableQuantity: 8,
    daysOfStock: null,
    eligibleDays30d: 3,
    salesVelocity30d: 0,
  },
  {
    grainKey: "j34",
    sku: "SNAP-JEANS-BLU-34",
    coverStatus: "valid",
    availableQuantity: 1,
    daysOfStock: 4,
    eligibleDays30d: 4,
    salesVelocity30d: 0.25,
  },
  {
    grainKey: "key",
    sku: "SNAP-KEYCHAIN",
    coverStatus: "valid",
    availableQuantity: 5,
    daysOfStock: 5,
    eligibleDays30d: 4,
    salesVelocity30d: 1,
  },
  {
    grainKey: "mug",
    sku: "SNAP-MUG-CERAMIC",
    coverStatus: "valid",
    availableQuantity: 30,
    daysOfStock: 120,
    eligibleDays30d: 4,
    salesVelocity30d: 0.25,
  },
  {
    grainKey: "nb",
    sku: "SNAP-NOTEBOOK-A5",
    coverStatus: "valid",
    availableQuantity: 35,
    daysOfStock: 46.666666666666664,
    eligibleDays30d: 4,
    salesVelocity30d: 0.75,
  },
  {
    grainKey: "s42",
    sku: "SNAP-SNEAKER-WHT-42",
    coverStatus: "valid",
    availableQuantity: 4,
    daysOfStock: 5.333333333333333,
    eligibleDays30d: 4,
    salesVelocity30d: 0.75,
  },
  {
    grainKey: "s43",
    sku: "SNAP-SNEAKER-WHT-43",
    coverStatus: "valid",
    availableQuantity: 0,
    daysOfStock: 0,
    eligibleDays30d: 4,
    salesVelocity30d: 1,
  },
  {
    grainKey: "socks",
    sku: "SNAP-SOCKS-3PK",
    coverStatus: "valid",
    availableQuantity: 90,
    daysOfStock: 180,
    eligibleDays30d: 4,
    salesVelocity30d: 0.5,
  },
  {
    grainKey: "tl",
    sku: "SNAP-TEE-BLK-L",
    coverStatus: "zero_demand",
    availableQuantity: 3,
    daysOfStock: null,
    eligibleDays30d: 3,
    salesVelocity30d: 0,
  },
  {
    grainKey: "tm",
    sku: "SNAP-TEE-BLK-M",
    coverStatus: "zero_demand",
    availableQuantity: 18,
    daysOfStock: null,
    eligibleDays30d: 3,
    salesVelocity30d: 0,
  },
  {
    grainKey: "ts",
    sku: "SNAP-TEE-BLK-S",
    coverStatus: "zero_demand",
    availableQuantity: 42,
    daysOfStock: null,
    eligibleDays30d: 3,
    salesVelocity30d: 0,
  },
  {
    grainKey: "tw",
    sku: "SNAP-TEE-WHT-M",
    coverStatus: "zero_demand",
    availableQuantity: 0,
    daysOfStock: null,
    eligibleDays30d: 3,
    salesVelocity30d: 0,
  },
];

function row(
  overrides: (typeof SNAPSTORE_LIVE_ROWS)[number],
): MerchantInventoryIntelligenceRow {
  return {
    snapshotId: "s",
    organizationId: "349e3ad3-c17b-4658-b3ae-a0ba00f226d0",
    storeId: "20cc792b-6fc3-43a7-ba11-1901b2e89384",
    locationId: "175f0dc6-01b0-4ce4-9c87-7cd24cf85d75",
    variantId: overrides.grainKey,
    productTitle: null,
    storeName: "snapstore",
    locationName: "Main",
    onHandQuantity: overrides.availableQuantity,
    observedAt: "2026-11-18T00:00:00.000Z",
    asOfMetricDate: "2026-11-18",
    metricDate: "2026-11-18",
    salesVelocity30dReasonCode: null,
    coverageRatio30d: null,
    daysOfStockReasonCode:
      overrides.coverStatus === "zero_demand" ? "zero_demand" : null,
    safetyStock: null,
    safetyStockReasonCode: null,
    reorderPoint: null,
    reorderPointReasonCode: null,
    targetStock: null,
    targetStockReasonCode: null,
    evidenceLabel: "x",
    salesVelocity30d: overrides.salesVelocity30d ?? null,
    ...overrides,
  };
}

function presence(partial: Partial<EvidencePresence>): EvidencePresence {
  return {
    inventorySnapshotCount: 60,
    distinctSkuCount: 20,
    distinctStoreCount: 1,
    distinctLocationCount: 1,
    knownAvailableSkuCount: 20,
    hasSalesHistory: true,
    hasSkuDailyMetrics: true,
    grainAlignedKnownDemandCount: 20,
    hasPendingMetricWork: false,
    hasCurrentDayInventoryObservation: true,
    hasCurrentDayMetrics: true,
    primaryAsOfMetricDate: "2026-11-18",
    inventoryPlaceFreshnessKind: "all_current",
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

describe("UX-INV-1a snapstore attention acceptance (read-only fixture)", () => {
  const rows = SNAPSTORE_LIVE_ROWS.map(row);

  it("matches live read-only attention counts and filter deep-links", () => {
    const attention = summarizeMerchantAttention(rows);
    expect(attention).toMatchObject({
      positionCount: 20,
      lastRecordedOutOfStockCount: 3,
      outOfStockCount: 3,
      coverSignalEvaluation: "evaluated",
      lowCoverCount: 5,
      highCoverReviewCount: 5,
      limitedHistoryCount: 20,
      unknownDemandCount: 0,
      staleOrPendingCount: 0,
      limitedOrUnknownEvidenceCount: 20,
      knownZeroDemandCount: 8,
      calculableCoverCount: 12,
    });
    expect(LOW_COVER_ATTENTION_DAYS).toBe(14);
    expect(HIGH_COVER_REVIEW_DAYS).toBe(60);

    expect(filterIntelligenceRows(rows, "out_of_stock")).toHaveLength(3);
    expect(filterIntelligenceRows(rows, "low_cover")).toHaveLength(5);
    expect(filterIntelligenceRows(rows, "high_cover_review")).toHaveLength(5);
    expect(filterIntelligenceRows(rows, "limited_history")).toHaveLength(20);
    expect(filterIntelligenceRows(rows, "limited_or_unknown")).toHaveLength(20);
    expect(filterIntelligenceRows(rows, "unknown_or_missing")).toHaveLength(0);
    expect(filterIntelligenceRows(rows, "zero_demand")).toHaveLength(8);
    expect(filterIntelligenceRows(rows, "pending_or_stale")).toHaveLength(0);
  });

  it("keeps Overview honest with planning 7/5/7 and commercial gated", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "349e3ad3-c17b-4658-b3ae-a0ba00f226d0",
      presence: presence({}),
    });
    expect(readiness.commercialActionsEligible).toBe(false);
    expect(readiness.presence.planning).toEqual({
      leadTimeDays: 7,
      safetyStockDays: 5,
      reviewPeriodDays: 7,
    });

    const presentation = buildMerchantOverviewPresentation({
      organizationId: readiness.organizationId,
      storeName: "snapstore",
      readiness,
      attention: summarizeMerchantAttention(rows),
    });

    expect(presentation.headline).toMatch(/3 positions are out of stock/i);
    expect(presentation.evidenceHonesty).toMatch(
      /Sales and planning inputs are present/i,
    );
    expect(presentation.evidenceHonesty).not.toMatch(
      /blocked until sales and planning/i,
    );
    expect(presentation.commercialFence).toMatch(/not a production REORDER/i);
    expect(presentation.planningLabel).toBe("Planning assumptions set");
    expect(presentation.dataHealthLabel).toBe("Limited sales history");
    expect(presentation.dataHealthDetail).toMatch(/All 20 position/i);
    expect(presentation.dataHealthNextAction).toMatch(/Review SKU evidence/i);
    expect(presentation.supportingSentence).toMatch(/limited sales history/i);
    expect(presentation.secondaryCta?.label).toMatch(/not live/i);
    expect(
      presentation.signals.find((s) => s.id === "limited_history")?.filter,
    ).toBe("limited_history");
    expect(
      presentation.signals.find((s) => s.id === "low_cover")?.evaluation,
    ).toBe("evaluated");
    expect(presentation.primaryCta.href).toContain("filter=out_of_stock");
    expect(presentation.primaryCta.href).toContain("#inventory-evidence");
    expect(EMPTY_MERCHANT_PLANNING_INPUTS.leadTimeDays).toBeNull();
  });
});
