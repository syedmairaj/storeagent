import { describe, expect, it } from "vitest";

import {
  classifyInventoryCoverStatus,
  coverEvidenceLabel,
} from "@/lib/inventory-intelligence/classify-cover";
import {
  filterIntelligenceRows,
  prioritizeIntelligenceRows,
} from "@/lib/inventory-intelligence/prioritize";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";

function row(
  overrides: Partial<MerchantInventoryIntelligenceRow> & {
    grainKey: string;
    coverStatus: MerchantInventoryIntelligenceRow["coverStatus"];
  },
): MerchantInventoryIntelligenceRow {
  return {
    snapshotId: "s",
    organizationId: "o",
    storeId: "st",
    locationId: "l",
    variantId: "v",
    sku: overrides.sku ?? overrides.grainKey,
    productTitle: null,
    storeName: "Store",
    locationName: "Main",
    availableQuantity: 10,
    onHandQuantity: 10,
    observedAt: "2026-11-08T00:00:00.000Z",
    asOfMetricDate: "2026-11-08",
    metricDate: "2026-11-08",
    salesVelocity30d: null,
    salesVelocity30dReasonCode: null,
    eligibleDays30d: null,
    coverageRatio30d: null,
    daysOfStock: null,
    daysOfStockReasonCode: null,
    evidenceLabel: "x",
    ...overrides,
  };
}

describe("classifyInventoryCoverStatus", () => {
  it("fails closed for pending freshness before other signals", () => {
    expect(
      classifyInventoryCoverStatus({
        availableQuantity: 4,
        hasPendingMetricWork: true,
        asOfMetricDate: "2026-11-08",
        metricDate: "2026-11-08",
        salesVelocity30d: 1,
        salesVelocity30dReasonCode: null,
        eligibleDays30d: 10,
        daysOfStock: 4,
        daysOfStockReasonCode: null,
      }),
    ).toBe("pending_freshness");
  });

  it("distinguishes zero demand from unknown and short history", () => {
    expect(
      classifyInventoryCoverStatus({
        availableQuantity: 4,
        hasPendingMetricWork: false,
        asOfMetricDate: "2026-11-08",
        metricDate: "2026-11-08",
        salesVelocity30d: 0,
        salesVelocity30dReasonCode: null,
        eligibleDays30d: 5,
        daysOfStock: null,
        daysOfStockReasonCode: "zero_demand",
      }),
    ).toBe("zero_demand");

    expect(
      classifyInventoryCoverStatus({
        availableQuantity: 4,
        hasPendingMetricWork: false,
        asOfMetricDate: "2026-11-08",
        metricDate: "2026-11-08",
        salesVelocity30d: null,
        salesVelocity30dReasonCode: "no_eligible_days",
        eligibleDays30d: 0,
        daysOfStock: null,
        daysOfStockReasonCode: "demand_unknown",
      }),
    ).toBe("short_history");

    expect(
      classifyInventoryCoverStatus({
        availableQuantity: 4,
        hasPendingMetricWork: false,
        asOfMetricDate: "2026-11-08",
        metricDate: "2026-11-08",
        salesVelocity30d: null,
        salesVelocity30dReasonCode: "demand_unknown",
        eligibleDays30d: 3,
        daysOfStock: null,
        daysOfStockReasonCode: "demand_unknown",
      }),
    ).toBe("unknown_demand");
  });

  it("marks stale when metric_date is behind store-local as-of", () => {
    expect(
      classifyInventoryCoverStatus({
        availableQuantity: 4,
        hasPendingMetricWork: false,
        asOfMetricDate: "2026-11-08",
        metricDate: "2026-11-01",
        salesVelocity30d: 2,
        salesVelocity30dReasonCode: null,
        eligibleDays30d: 8,
        daysOfStock: 2,
        daysOfStockReasonCode: null,
      }),
    ).toBe("stale");
  });

  it("accepts valid persisted cover without recomputing", () => {
    expect(
      classifyInventoryCoverStatus({
        availableQuantity: 12,
        hasPendingMetricWork: false,
        asOfMetricDate: "2026-11-08",
        metricDate: "2026-11-08",
        salesVelocity30d: 1.5,
        salesVelocity30dReasonCode: null,
        eligibleDays30d: 2,
        daysOfStock: 8,
        daysOfStockReasonCode: null,
      }),
    ).toBe("valid");
  });
});

describe("coverEvidenceLabel", () => {
  it("mentions eligible days for valid cover and never invents confidence", () => {
    const label = coverEvidenceLabel({
      status: "valid",
      daysOfStock: 8,
      salesVelocity30d: 1.5,
      eligibleDays30d: 2,
      metricDate: "2026-11-08",
      asOfMetricDate: "2026-11-08",
    });
    expect(label).toContain("8 days of stock");
    expect(label).toContain("Limited history: 2 of 30 days");
    expect(label.toLowerCase()).not.toContain("forecast");
    expect(label.toLowerCase()).not.toContain("confidence");
    expect(label.toLowerCase()).not.toContain("proven");
  });

  it("does not overclaim long-term zero demand from sparse eligible days", () => {
    const label = coverEvidenceLabel({
      status: "zero_demand",
      daysOfStock: null,
      salesVelocity30d: 0,
      eligibleDays30d: 1,
      metricDate: "2026-11-08",
      asOfMetricDate: "2026-11-08",
    });
    expect(label).toContain("No sales observed");
    expect(label).toContain("Limited history: 1 of 30 days");
    expect(label).toContain("Stock cover unavailable");
    expect(label.toLowerCase()).not.toContain("proven");
  });
});

describe("prioritize and filter intelligence rows", () => {
  const sample = [
    row({
      grainKey: "zero",
      sku: "ZERO",
      coverStatus: "zero_demand",
      salesVelocity30d: 0,
    }),
    row({
      grainKey: "low",
      sku: "LOW",
      coverStatus: "valid",
      daysOfStock: 3,
      salesVelocity30d: 2,
    }),
    row({
      grainKey: "ok",
      sku: "OK",
      coverStatus: "valid",
      daysOfStock: 40,
      salesVelocity30d: 1,
    }),
    row({
      grainKey: "unk",
      sku: "UNK",
      coverStatus: "unknown_demand",
    }),
  ];

  it("prioritizes low cover ahead of comfortable cover and zero demand", () => {
    const ordered = prioritizeIntelligenceRows(sample).map((item) => item.sku);
    expect(ordered[0]).toBe("LOW");
    expect(ordered.at(-1)).toBe("ZERO");
  });

  it("filters needs attention to low cover and incomplete evidence", () => {
    const needs = filterIntelligenceRows(sample, "needs_attention").map(
      (item) => item.sku,
    );
    expect(needs).toContain("LOW");
    expect(needs).toContain("UNK");
    expect(needs).not.toContain("OK");
    expect(needs).not.toContain("ZERO");
  });
});
