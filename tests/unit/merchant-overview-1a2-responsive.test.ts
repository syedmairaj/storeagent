import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { summarizeMerchantAttention } from "@/lib/inventory-intelligence/attention";
import { filterIntelligenceRows } from "@/lib/inventory-intelligence/prioritize";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";
import { buildMerchantOverviewPresentation } from "@/lib/inventory-readiness/overview-presentation";
import type { EvidencePresence } from "@/lib/inventory-readiness/types";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

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
    daysOfStock: null,
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

/** Chicago Nov 19 stale: 20 positions, 3 last-recorded OOS, all 3–4/30 eligible days. */
function snapstoreStaleLimitedRows(): MerchantInventoryIntelligenceRow[] {
  const skus = Array.from({ length: 20 }, (_, i) => `SKU-${i + 1}`);
  return skus.map((sku, index) =>
    row({
      grainKey: sku,
      sku,
      coverStatus: "stale",
      availableQuantity: index < 3 ? 0 : 10 + index,
      eligibleDays30d: index % 2 === 0 ? 3 : 4,
      salesVelocity30d: null,
      daysOfStock: null,
    }),
  );
}

describe("UX-INV-1a.2 stale + limited history + layout contracts", () => {
  it("does not suppress limited-history counts when cover is stale", () => {
    const rows = snapstoreStaleLimitedRows();
    const attention = summarizeMerchantAttention(rows);

    expect(attention.positionCount).toBe(20);
    expect(attention.lastRecordedOutOfStockCount).toBe(3);
    expect(attention.staleOrPendingCount).toBe(20);
    expect(attention.coverSignalEvaluation).toBe("unavailable");
    expect(attention.lowCoverCount).toBe(0);
    expect(attention.highCoverReviewCount).toBe(0);
    expect(attention.limitedHistoryCount).toBe(20);
    expect(attention.unknownDemandCount).toBe(0);
    expect(filterIntelligenceRows(rows, "limited_history")).toHaveLength(20);
    expect(filterIntelligenceRows(rows, "out_of_stock")).toHaveLength(3);
    expect(filterIntelligenceRows(rows, "pending_or_stale")).toHaveLength(20);
  });

  it("keeps unknown demand separate from simultaneous stale + sparse history", () => {
    const rows = [
      ...snapstoreStaleLimitedRows().slice(0, 18),
      row({
        grainKey: "unk",
        coverStatus: "unknown_demand",
        availableQuantity: 4,
        eligibleDays30d: null,
        salesVelocity30d: null,
      }),
      row({
        grainKey: "zero-fresh",
        coverStatus: "zero_demand",
        availableQuantity: 2,
        salesVelocity30d: 0,
        eligibleDays30d: 3,
        asOfMetricDate: "2026-11-18",
        metricDate: "2026-11-18",
      }),
    ];
    const attention = summarizeMerchantAttention(rows);
    expect(attention.staleOrPendingCount).toBe(18);
    expect(attention.limitedHistoryCount).toBe(19);
    expect(attention.unknownDemandCount).toBe(1);
    expect(attention.knownZeroDemandCount).toBe(1);
    expect(
      filterIntelligenceRows(rows, "unknown_or_missing").map((r) => r.sku),
    ).toEqual(["unk"]);
  });

  it("shortens stale Overview headline and puts last-recorded OOS in supporting copy", () => {
    const attention = summarizeMerchantAttention(snapstoreStaleLimitedRows());
    const presentation = buildMerchantOverviewPresentation({
      organizationId: "349e3ad3-c17b-4658-b3ae-a0ba00f226d0",
      storeName: "snapstore",
      readiness: assessMerchantDecisionReadiness({
        organizationId: "349e3ad3-c17b-4658-b3ae-a0ba00f226d0",
        presence: presence(),
      }),
      attention,
      lastObservationLabel: "Nov 18, 2026",
    });

    expect(presentation.headline).toBe("Your stock update is due.");
    expect(presentation.supportingSentence).toMatch(
      /3 positions were last recorded out of stock on Nov 18, 2026/i,
    );
    expect(presentation.primaryCta.label).toMatch(/Upload updated stock/i);
    expect(presentation.signals.map((s) => s.id).slice(0, 3)).toEqual([
      "out_of_stock",
      "limited_history",
      "stale_or_pending",
    ]);
    expect(presentation.signals.at(-2)?.id).toBe("low_cover");
    expect(presentation.signals.at(-1)?.id).toBe("high_cover_review");
    expect(presentation.signals.find((s) => s.id === "low_cover")?.displayValue).toBe(
      "—",
    );
    expect(
      presentation.signals.find((s) => s.id === "limited_history")?.count,
    ).toBe(20);
  });

  it("keeps fresh evaluated cover distinct from unavailable zero", () => {
    const fresh = summarizeMerchantAttention([
      row({
        grainKey: "ok",
        coverStatus: "valid",
        availableQuantity: 20,
        daysOfStock: 40,
        eligibleDays30d: 20,
        asOfMetricDate: "2026-11-18",
        metricDate: "2026-11-18",
      }),
    ]);
    expect(fresh.coverSignalEvaluation).toBe("evaluated");
    expect(fresh.lowCoverCount).toBe(0);
    expect(fresh.highCoverReviewCount).toBe(0);
    expect(fresh.limitedHistoryCount).toBe(0);

    const stale = summarizeMerchantAttention([
      row({
        grainKey: "stale",
        coverStatus: "stale",
        availableQuantity: 20,
        daysOfStock: null,
        eligibleDays30d: 20,
      }),
    ]);
    expect(stale.coverSignalEvaluation).toBe("unavailable");
    expect(stale.lowCoverCount).toBe(0);
    expect(stale.limitedHistoryCount).toBe(0);
  });

  it("locks mobile/desktop Overview layout contracts without overflow-hidden header", () => {
    const dashboard = read(
      "components/overview/merchant-overview-dashboard.tsx",
    );
    expect(dashboard).toContain('data-overview-layout="responsive"');
    expect(dashboard).toContain('data-overview-desktop-columns="xl"');
    expect(dashboard).toContain("xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.7fr)]");
    expect(dashboard).toContain("xl:grid-cols-3");
    expect(dashboard).toContain("sm:grid-cols-2");
    expect(dashboard).toContain("text-[1.65rem]");
    expect(dashboard).toContain("w-full min-w-0");
    expect(dashboard).toContain("prefers-reduced-motion");
    expect(dashboard).toContain('data-overview-signal-priority={');
    expect(dashboard).not.toMatch(/header[^>]*overflow-hidden/);
    expect(dashboard).toContain("focus-visible:outline");
    expect(dashboard).toContain("min-h-11");
  });
});
