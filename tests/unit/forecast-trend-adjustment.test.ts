import {
  describe,
  expect,
  it,
} from "vitest";

import {
  applyTrendAdjustment,
} from "@/lib/forecasting/trend-adjustment";

describe("trend-adjustment-v1", () => {
  it("does not adjust demand inside the stable band", () => {
    expect(
      applyTrendAdjustment({
        baselineDailyDemand: 10,
        recentDailyDemand: 10.5,
        priorDailyDemand: 10,
      }),
    ).toEqual({
      algorithmVersion: "trend-adjustment-v1",
      baselineDailyDemand: 10,
      adjustedDailyDemand: 10,
      rawTrendRatio: 0.05,
      appliedAdjustmentRatio: 0,
      capped: false,
    });
  });

  it("applies a moderate upward trend", () => {
    const result = applyTrendAdjustment({
      baselineDailyDemand: 10,
      recentDailyDemand: 11.5,
      priorDailyDemand: 10,
    });

    expect(result.adjustedDailyDemand).toBeCloseTo(
      11.5,
      10,
    );

    expect(
      result.appliedAdjustmentRatio,
    ).toBeCloseTo(0.15, 10);

    expect(result.capped).toBe(false);
  });

  it("caps extreme upward trend at twenty percent", () => {
    const result = applyTrendAdjustment({
      baselineDailyDemand: 10,
      recentDailyDemand: 30,
      priorDailyDemand: 10,
    });

    expect(result.adjustedDailyDemand).toBe(12);
    expect(result.appliedAdjustmentRatio).toBe(0.2);
    expect(result.capped).toBe(true);
  });

  it("applies a moderate downward trend", () => {
    const result = applyTrendAdjustment({
      baselineDailyDemand: 10,
      recentDailyDemand: 8.5,
      priorDailyDemand: 10,
    });

    expect(result.adjustedDailyDemand).toBeCloseTo(
      8.5,
      10,
    );

    expect(
      result.appliedAdjustmentRatio,
    ).toBeCloseTo(-0.15, 10);

    expect(result.capped).toBe(false);
  });

  it("caps extreme downward trend at twenty percent", () => {
    const result = applyTrendAdjustment({
      baselineDailyDemand: 10,
      recentDailyDemand: 1,
      priorDailyDemand: 10,
    });

    expect(result.adjustedDailyDemand).toBe(8);
    expect(result.appliedAdjustmentRatio).toBe(-0.2);
    expect(result.capped).toBe(true);
  });

  it("treats zero-to-zero comparison as no trend", () => {
    expect(
      applyTrendAdjustment({
        baselineDailyDemand: 4,
        recentDailyDemand: 0,
        priorDailyDemand: 0,
      }),
    ).toEqual({
      algorithmVersion: "trend-adjustment-v1",
      baselineDailyDemand: 4,
      adjustedDailyDemand: 4,
      rawTrendRatio: 0,
      appliedAdjustmentRatio: 0,
      capped: false,
    });
  });

  it("caps demand emerging from zero rather than applying infinite growth", () => {
    expect(
      applyTrendAdjustment({
        baselineDailyDemand: 10,
        recentDailyDemand: 3,
        priorDailyDemand: 0,
      }),
    ).toEqual({
      algorithmVersion: "trend-adjustment-v1",
      baselineDailyDemand: 10,
      adjustedDailyDemand: 12,
      rawTrendRatio: null,
      appliedAdjustmentRatio: 0.2,
      capped: true,
    });
  });

  it("rejects negative forecast inputs", () => {
    expect(() =>
      applyTrendAdjustment({
        baselineDailyDemand: -1,
        recentDailyDemand: 10,
        priorDailyDemand: 10,
      }),
    ).toThrow(
      "baselineDailyDemand must be a non-negative finite number.",
    );
  });
});
