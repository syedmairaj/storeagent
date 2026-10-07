import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyPromotionObservation,
  summarizePromotionSeriesQuality,
} from "@/lib/forecasting/promotion-treatment";

describe("promotion-treatment-v1", () => {
  it("keeps normal observations usable for baseline demand", () => {
    expect(
      classifyPromotionObservation({
        date: "2026-10-01",
        unitsSold: 5,
        promotionState: "none",
        dataComplete: true,
      }),
    ).toEqual({
      date: "2026-10-01",
      unitsSold: 5,
      disposition: "baseline_usable",
      reasonCode: null,
    });
  });

  it("excludes known promotion days from ordinary baseline", () => {
    expect(
      classifyPromotionObservation({
        date: "2026-10-02",
        unitsSold: 25,
        promotionState: "promotion",
        dataComplete: true,
      }),
    ).toEqual({
      date: "2026-10-02",
      unitsSold: 25,
      disposition: "promotion_excluded",
      reasonCode: "PROMOTION_EXCLUDED",
    });
  });

  it("excludes zero-sales promotion days too", () => {
    expect(
      classifyPromotionObservation({
        date: "2026-10-03",
        unitsSold: 0,
        promotionState: "promotion",
        dataComplete: true,
      }).disposition,
    ).toBe("promotion_excluded");
  });

  it("fails closed when promotion state is unknown", () => {
    expect(
      classifyPromotionObservation({
        date: "2026-10-04",
        unitsSold: 3,
        promotionState: "unknown",
        dataComplete: true,
      }),
    ).toEqual({
      date: "2026-10-04",
      unitsSold: 3,
      disposition: "unusable",
      reasonCode: "PROMOTION_STATE_UNKNOWN",
    });
  });

  it("treats incomplete source data as unusable", () => {
    expect(
      classifyPromotionObservation({
        date: "2026-10-05",
        unitsSold: 4,
        promotionState: "none",
        dataComplete: false,
      }),
    ).toEqual({
      date: "2026-10-05",
      unitsSold: 4,
      disposition: "unusable",
      reasonCode: "PROMOTION_DATA_INCOMPLETE",
    });
  });

  it("rejects negative sales observations", () => {
    expect(() =>
      classifyPromotionObservation({
        date: "2026-10-06",
        unitsSold: -1,
        promotionState: "none",
        dataComplete: true,
      }),
    ).toThrow(
      "unitsSold must be a non-negative integer.",
    );
  });

  it("summarizes baseline promotion and unusable observations", () => {
    expect(
      summarizePromotionSeriesQuality([
        {
          date: "2026-10-01",
          unitsSold: 2,
          promotionState: "none",
          dataComplete: true,
        },
        {
          date: "2026-10-02",
          unitsSold: 10,
          promotionState: "promotion",
          dataComplete: true,
        },
        {
          date: "2026-10-03",
          unitsSold: 1,
          promotionState: "unknown",
          dataComplete: true,
        },
      ]),
    ).toEqual({
      baselineUsableDays: 1,
      promotionExcludedDays: 1,
      unusableDays: 1,
      totalDays: 3,
    });
  });
});
