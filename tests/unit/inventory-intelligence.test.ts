import { describe, expect, it } from "vitest";

import {
  classifyInventoryCoverStatus,
  coverEvidenceLabel,
} from "@/lib/inventory-intelligence/classify-cover";
import {
  filterIntelligenceRows,
  prioritizeIntelligenceRows,
} from "@/lib/inventory-intelligence/prioritize";
import {
  buildSkuEvidence,
  presentSkuAttention,
  resolveCoverAvailability,
  resolveStockCondition,
} from "@/lib/inventory-intelligence/sku-attention-presentation";
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

  it("prioritizes known OOS and low cover ahead of comfortable cover and zero demand", () => {
    const withOos = [
      ...sample,
      row({
        grainKey: "oos-zero",
        sku: "OOSZERO",
        coverStatus: "zero_demand",
        availableQuantity: 0,
        salesVelocity30d: 0,
      }),
    ];
    const ordered = prioritizeIntelligenceRows(withOos).map((item) => item.sku);
    expect(ordered[0]).toBe("OOSZERO");
    expect(ordered[1]).toBe("LOW");
    expect(ordered.at(-1)).toBe("ZERO");
  });

  it("filters stock-to-review (needs_attention) to OOS + low cover only", () => {
    const withOosZero = [
      ...sample,
      row({
        grainKey: "oos-zd",
        sku: "OOSZD",
        coverStatus: "zero_demand",
        availableQuantity: 0,
        salesVelocity30d: 0,
      }),
      row({
        grainKey: "stale-all",
        sku: "STALE",
        coverStatus: "stale",
        availableQuantity: 4,
        daysOfStock: null,
      }),
    ];
    const needs = filterIntelligenceRows(withOosZero, "needs_attention").map(
      (item) => item.sku,
    );
    expect(needs).toContain("LOW");
    expect(needs).toContain("OOSZD");
    expect(needs).not.toContain("UNK");
    expect(needs).not.toContain("STALE");
    expect(needs).not.toContain("OK");
    expect(needs).not.toContain("ZERO");
    expect(
      filterIntelligenceRows(withOosZero, "pending_or_stale").map((r) => r.sku),
    ).toContain("STALE");
  });

  it("filters out-of-stock, low cover, and high-cover review without inventing risk", () => {
    const rows = [
      ...sample,
      row({
        grainKey: "oos",
        sku: "OOS",
        coverStatus: "valid",
        availableQuantity: 0,
        daysOfStock: 0,
      }),
      row({
        grainKey: "high",
        sku: "HIGH",
        coverStatus: "valid",
        daysOfStock: 90,
      }),
      row({
        grainKey: "unk-stock",
        sku: "UNKSTOCK",
        coverStatus: "unknown_stock",
        availableQuantity: null,
      }),
    ];

    expect(
      filterIntelligenceRows(rows, "out_of_stock").map((item) => item.sku),
    ).toEqual(["OOS"]);
    expect(
      filterIntelligenceRows(rows, "low_cover").map((item) => item.sku),
    ).toEqual(["LOW", "OOS"]);
    expect(
      filterIntelligenceRows(rows, "high_cover_review").map((item) => item.sku),
    ).toEqual(["HIGH"]);
    expect(
      filterIntelligenceRows(
        [
          ...rows,
          row({
            grainKey: "limited-valid",
            sku: "LIM",
            coverStatus: "valid",
            daysOfStock: 20,
            eligibleDays30d: 3,
            salesVelocity30d: 1,
          }),
        ],
        "limited_or_unknown",
      ).map((item) => item.sku),
    ).toEqual(["UNK", "UNKSTOCK", "LIM"]);

    const withShort = [
      ...rows,
      row({
        grainKey: "short",
        sku: "SHORT",
        coverStatus: "short_history",
        daysOfStock: null,
        salesVelocity30d: null,
        eligibleDays30d: 0,
      }),
    ];
    expect(
      filterIntelligenceRows(withShort, "limited_history").map((item) => item.sku),
    ).toContain("SHORT");
    expect(
      filterIntelligenceRows(withShort, "unknown_or_missing").map(
        (item) => item.sku,
      ),
    ).not.toContain("SHORT");
  });
});

describe("SKU attention presentation (UX-INV-1b)", () => {
  it("keeps stock condition separate from calculable cover for known zero stock", () => {
    const oosValid = row({
      grainKey: "oos-valid",
      coverStatus: "valid",
      availableQuantity: 0,
      daysOfStock: 0,
      salesVelocity30d: 2,
    });

    expect(resolveStockCondition(oosValid, { stockObservationsStale: false })).toBe(
      "out_of_stock",
    );
    expect(resolveCoverAvailability(oosValid)).toBe("calculable");

    const fresh = presentSkuAttention(oosValid, {
      stockObservationsStale: false,
    });
    expect(fresh.stockConditionLabel).toBe("Out of stock");
    expect(fresh.coverAvailabilityLabel).toMatch(/Stock cover available · 0 days/);
    expect(fresh.stockTone).toBe("critical");
    expect(fresh.decisionEligibility).toBe("unauthorized");
    expect(fresh.stockConditionLabel.toLowerCase()).not.toContain("known cover");
    expect(fresh.stockTone).not.toBe("neutral");
  });

  it("labels stale zero stock as last recorded — never live OOS", () => {
    const staleOos = row({
      grainKey: "stale-oos",
      coverStatus: "stale",
      availableQuantity: 0,
      daysOfStock: null,
      observedAt: "2026-11-18T12:00:00.000Z",
    });
    const presentation = presentSkuAttention(staleOos, {
      stockObservationsStale: true,
    });
    expect(presentation.stockCondition).toBe("last_recorded_out_of_stock");
    expect(presentation.stockConditionLabel).toBe("Last recorded out of stock");
    expect(presentation.stockConditionDetail).toMatch(/Not live availability/i);
    expect(presentation.coverAvailability).toBe("unavailable");
  });

  it("marks valid low and high cover as review heuristics without overstock claims", () => {
    const low = presentSkuAttention(
      row({
        grainKey: "low",
        coverStatus: "valid",
        availableQuantity: 4,
        daysOfStock: 5,
        salesVelocity30d: 1,
      }),
      { stockObservationsStale: false },
    );
    expect(low.stockCondition).toBe("review_low_cover");
    expect(low.stockConditionLabel).toBe("Review low cover");
    expect(low.stockConditionDetail).toMatch(/not canonical ROP/i);
    expect(low.coverAvailability).toBe("calculable");

    const high = presentSkuAttention(
      row({
        grainKey: "high",
        coverStatus: "valid",
        availableQuantity: 40,
        daysOfStock: 90,
        salesVelocity30d: 0.5,
      }),
      { stockObservationsStale: false },
    );
    expect(high.stockCondition).toBe("review_high_cover");
    expect(high.stockConditionLabel).toBe("Review high cover");
    expect(high.stockConditionDetail).toMatch(/not overstock or cash claim/i);
    expect(high.stockConditionLabel.toLowerCase()).not.toMatch(
      /\boverstock\b|\bcash\b/,
    );
    expect(JSON.stringify(high).toLowerCase()).not.toMatch(/cash tied|savings|roi/);
  });

  it("keeps known-zero demand distinct from unknown and short history", () => {
    const zero = presentSkuAttention(
      row({
        grainKey: "zd",
        coverStatus: "zero_demand",
        availableQuantity: 8,
        salesVelocity30d: 0,
        eligibleDays30d: 4,
      }),
      { stockObservationsStale: false },
    );
    expect(zero.coverAvailabilityLabel).toMatch(/No sales observed/);
    expect(zero.showLimitedHistoryDisclosure).toBe(true);
    expect(zero.stockCondition).toBe("in_stock");

    const unknown = presentSkuAttention(
      row({
        grainKey: "unk",
        coverStatus: "unknown_demand",
        availableQuantity: 8,
        salesVelocity30d: null,
      }),
      { stockObservationsStale: false },
    );
    expect(unknown.coverAvailabilityLabel).toMatch(/Unknown demand/);
    expect(unknown.coverAvailabilityLabel).not.toMatch(/No sales observed/);

    const short = presentSkuAttention(
      row({
        grainKey: "short",
        coverStatus: "short_history",
        availableQuantity: 8,
        salesVelocity30d: null,
        eligibleDays30d: 0,
      }),
      { stockObservationsStale: false },
    );
    expect(short.coverAvailabilityLabel).toMatch(/Short history/);
    expect(short.showLimitedHistoryDisclosure).toBe(true);
  });

  it("does not classify stale historical zero velocity as current zero demand", () => {
    const staleZeroVelocity = row({
      grainKey: "stale-zero-v",
      coverStatus: "stale",
      availableQuantity: 8,
      salesVelocity30d: 0,
      salesVelocity30dReasonCode: "zero_demand",
      daysOfStock: null,
      daysOfStockReasonCode: "zero_demand",
      metricDate: "2026-11-18",
      asOfMetricDate: "2026-11-19",
      eligibleDays30d: 4,
    });

    expect(staleZeroVelocity.coverStatus).toBe("stale");
    expect(
      filterIntelligenceRows([staleZeroVelocity], "zero_demand"),
    ).toHaveLength(0);
    expect(
      filterIntelligenceRows([staleZeroVelocity], "pending_or_stale"),
    ).toHaveLength(1);

    const presentation = presentSkuAttention(staleZeroVelocity, {
      stockObservationsStale: true,
    });
    expect(presentation.coverAvailabilityLabel).toMatch(/Stale metrics/);
    expect(presentation.coverAvailabilityLabel).not.toMatch(/No sales observed/);
  });
});

describe("SKU-specific evidence (UX-INV-1b.1)", () => {
  it("builds per-SKU facts from trusted fields without repeating section stale boilerplate", () => {
    const evidence = buildSkuEvidence(
      row({
        grainKey: "BAG-TOTE",
        sku: "BAG-TOTE",
        productTitle: "Canvas tote",
        storeName: "snapstore",
        locationName: "Main",
        coverStatus: "stale",
        availableQuantity: 0,
        salesVelocity30d: 1.5,
        eligibleDays30d: 4,
        metricDate: "2026-11-18",
        asOfMetricDate: "2026-11-19",
        observedAt: "2026-11-18T12:00:00.000Z",
        safetyStock: 2,
        safetyStockReasonCode: null,
        reorderPoint: 5,
        reorderPointReasonCode: null,
        targetStock: 12,
        targetStockReasonCode: null,
      }),
      { stockObservationsStale: true },
    );

    expect(evidence.identityLine).toContain("BAG-TOTE");
    expect(evidence.identityLine).toContain("Canvas tote");
    expect(evidence.identityLine).toContain("snapstore / Main");
    expect(evidence.facts.find((f) => f.id === "available")?.value).toMatch(
      /Last recorded 0/,
    );
    expect(evidence.facts.find((f) => f.id === "velocity")?.label).toMatch(
      /Historical velocity/,
    );
    expect(evidence.facts.find((f) => f.id === "cover")?.value).toMatch(
      /Unavailable · Stale metrics/,
    );
    expect(evidence.facts.find((f) => f.id === "eligible_days")?.value).toBe(
      "4 of 30",
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.value).toMatch(
      /SS 2 · ROP 5 · Target 12/,
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.value).toMatch(
      /not a buy recommendation/i,
    );
    expect(evidence.nextStep).toMatch(/Upload updated stock/i);
    expect(evidence.lines.join(" ")).not.toMatch(/Section note/i);
    expect(evidence.lines.join(" ")).not.toMatch(/every position/i);
  });

  it("lists missing fields and keeps unknown stock distinct from zero", () => {
    const evidence = buildSkuEvidence(
      row({
        grainKey: "UNK",
        coverStatus: "unknown_stock",
        availableQuantity: null,
        salesVelocity30d: null,
        eligibleDays30d: null,
        metricDate: null,
        asOfMetricDate: null,
        safetyStock: null,
        safetyStockReasonCode: "safety_stock_unknown",
        reorderPoint: null,
        reorderPointReasonCode: "lead_time_unknown",
        targetStock: null,
        targetStockReasonCode: "target_stock_unknown",
      }),
      { stockObservationsStale: false },
    );

    expect(evidence.facts.find((f) => f.id === "available")?.value).toMatch(
      /Unknown — not treated as zero/,
    );
    expect(evidence.missingLabels).toEqual(
      expect.arrayContaining([
        "Available quantity",
        "Sales velocity",
        "Metric provenance",
        "Calculated SS / ROP / target",
      ]),
    );
    expect(evidence.nextStep).toMatch(/known available quantity/i);
  });

  it("states known-zero demand only for zero_demand cover status", () => {
    const zero = buildSkuEvidence(
      row({
        grainKey: "ZD",
        coverStatus: "zero_demand",
        availableQuantity: 6,
        salesVelocity30d: 0,
        eligibleDays30d: 3,
      }),
      { stockObservationsStale: false },
    );
    expect(zero.facts.find((f) => f.id === "velocity")?.value).toMatch(
      /no sales observed/i,
    );
    expect(zero.facts.find((f) => f.id === "cover")?.value).toMatch(
      /No sales observed/,
    );

    const stale = buildSkuEvidence(
      row({
        grainKey: "STALE",
        coverStatus: "stale",
        availableQuantity: 6,
        salesVelocity30d: 0,
        eligibleDays30d: 3,
        metricDate: "2026-11-18",
        asOfMetricDate: "2026-11-19",
      }),
      { stockObservationsStale: true },
    );
    expect(stale.facts.find((f) => f.id === "velocity")?.value).not.toMatch(
      /no sales observed/i,
    );
    expect(stale.facts.find((f) => f.id === "cover")?.value).toMatch(/Stale/);
  });

  it("omits thresholds when reason codes mark them unknown", () => {
    const evidence = buildSkuEvidence(
      row({
        grainKey: "T",
        coverStatus: "valid",
        daysOfStock: 20,
        salesVelocity30d: 1,
        eligibleDays30d: 10,
        safetyStock: 0,
        safetyStockReasonCode: "safety_stock_unknown",
        reorderPoint: 0,
        reorderPointReasonCode: "lead_time_unknown",
        targetStock: 0,
        targetStockReasonCode: "target_stock_unknown",
      }),
      { stockObservationsStale: false },
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")).toBeUndefined();
    expect(evidence.missingLabels).toContain("Calculated SS / ROP / target");
  });

  it("marks thresholds historical when cover is stale and keeps interpretation SKU-specific", () => {
    const evidence = buildSkuEvidence(
      row({
        grainKey: "BAG-TOTE",
        sku: "BAG-TOTE",
        productTitle: "Canvas tote",
        storeName: "snapstore",
        locationName: "Main",
        coverStatus: "stale",
        availableQuantity: 0,
        salesVelocity30d: 2,
        eligibleDays30d: 4,
        metricDate: "2026-11-18",
        asOfMetricDate: "2026-11-20",
        observedAt: "2026-11-18T12:00:00.000Z",
        safetyStock: 3,
        safetyStockReasonCode: null,
        reorderPoint: 7,
        reorderPointReasonCode: null,
        targetStock: 14,
        targetStockReasonCode: null,
      }),
      { stockObservationsStale: true },
    );

    expect(evidence.metricIsHistorical).toBe(true);
    expect(evidence.facts.find((f) => f.id === "thresholds")?.label).toMatch(
      /Historical calculated thresholds/,
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.value).toMatch(
      /metric 2026-11-18/,
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.value).toMatch(
      /historical while cover is not current/,
    );
    expect(evidence.interpretation).toContain("BAG-TOTE");
    expect(evidence.interpretation).toContain("snapstore / Main");
    expect(evidence.interpretation).toMatch(/last recorded at zero/i);
    expect(evidence.interpretation.toLowerCase()).not.toMatch(
      /confidence|profit|buy |purchase/,
    );
  });

  it("keeps fresh known-zero demand distinct from unknown stock in interpretation", () => {
    const zero = buildSkuEvidence(
      row({
        grainKey: "ZD",
        sku: "SOCKS",
        coverStatus: "zero_demand",
        availableQuantity: 9,
        salesVelocity30d: 0,
        eligibleDays30d: 8,
      }),
      { stockObservationsStale: false },
    );
    expect(zero.metricIsHistorical).toBe(false);
    expect(zero.interpretation).toMatch(/no sales observed/i);
    expect(zero.interpretation).toMatch(/distinct from unknown demand/i);

    const unknown = buildSkuEvidence(
      row({
        grainKey: "U",
        sku: "UNK-SKU",
        coverStatus: "unknown_stock",
        availableQuantity: null,
      }),
      { stockObservationsStale: false },
    );
    expect(unknown.interpretation).toMatch(/unknown available quantity/i);
    expect(unknown.interpretation).toMatch(/does not treat unknown as zero/i);
  });
});
