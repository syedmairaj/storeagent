import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DEFAULT_FORECAST_LOOKBACK_DAYS_V1,
  forecastSkuDemand,
} from "@/lib/forecasting/orchestrate";

import {
  shiftForecastDate,
  type ForecastDailyFact,
  type ForecastGrain,
} from "@/lib/forecasting/series";

const GRAIN: ForecastGrain = {
  organizationId: "org-a",
  storeId: "store-a",
  locationId: "loc-a",
  variantId: "var-a",
};

const AS_OF = "2026-06-30";

function fact(
  date: string,
  unitsSold: number,
  overrides: Partial<ForecastDailyFact> = {},
): ForecastDailyFact {
  return {
    organizationId: GRAIN.organizationId,
    storeId: GRAIN.storeId,
    locationId: GRAIN.locationId,
    variantId: GRAIN.variantId,
    date,
    unitsSold,
    availability: "available",
    promotionState: "none",
    dataComplete: true,
    ...overrides,
  };
}

function denseFacts(
  asOf: string,
  lookbackDays: number,
  unitsForDate: (date: string, indexFromStart: number) => number,
  overridesForDate: (
    date: string,
    indexFromStart: number,
  ) => Partial<ForecastDailyFact> = () => ({}),
): ForecastDailyFact[] {
  const start = shiftForecastDate(asOf, -(lookbackDays - 1));
  const facts: ForecastDailyFact[] = [];

  for (let i = 0; i < lookbackDays; i += 1) {
    const date = shiftForecastDate(start, i);
    facts.push(
      fact(date, unitsForDate(date, i), overridesForDate(date, i)),
    );
  }

  return facts;
}

describe("M6 forecast orchestrator", () => {
  it("returns unavailable forecast for insufficient history", () => {
    const facts = denseFacts(AS_OF, 10, () => 2, (date, index) =>
      index < 4
        ? {}
        : {
            availability: "unknown",
            unitsSold: 0,
          },
    );

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 10,
      facts,
    });

    expect(result.dataSufficiency).toBe("insufficient");
    expect(result.dailyDemand).toBeNull();
    expect(result.mode).toBe("unavailable");
    expect(result.confidence).toBe("low");
    expect(result.reasonCodes).toContain("INSUFFICIENT_HISTORY");
    expect(result.horizons.dailyDemand).toBeNull();
    expect(result.horizons.leadTimeDemandUnits).toBeNull();
  });

  it("publishes limited-history known-zero demand", () => {
    const facts = denseFacts(AS_OF, 14, () => 0);

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 14,
      facts,
    });

    expect(result.dataSufficiency).toBe("limited");
    expect(result.mode).toBe("limited_history");
    expect(result.dailyDemand).toBe(0);
    expect(result.confidence).toBe("medium");
    expect(result.reasonCodes).toContain("LIMITED_HISTORY");
  });

  it("publishes a standard weighted baseline with sufficient history", () => {
    const facts = denseFacts(AS_OF, 90, () => 2);

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: DEFAULT_FORECAST_LOOKBACK_DAYS_V1,
      facts,
    });

    expect(result.dataSufficiency).toBe("sufficient");
    expect(result.mode).toBe("standard");
    expect(result.dailyDemand).toBeCloseTo(2, 10);
    expect(result.weightedDailyDemand).toBeCloseTo(2, 10);
    expect(result.activeWindows.length).toBe(4);
    expect(result.confidence).toBe("high");
  });

  it("excludes stockout-censored zero-sales days from usable demand", () => {
    const facts = denseFacts(AS_OF, 14, (_date, index) =>
      index >= 7 ? 4 : 0,
    (date, index) =>
      index < 7
        ? {
            availability: "unavailable",
            unitsSold: 0,
          }
        : {},
    );

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 14,
      facts,
    });

    expect(result.quality.censoredDays).toBe(7);
    expect(result.quality.baselineUsableDays).toBe(7);
    expect(result.dailyDemand).toBe(4);
    expect(
      result.activeWindows.some((window) => window.windowDays === 7),
    ).toBe(true);
  });

  it("treats missing availability as unusable, not zero demand", () => {
    const facts = denseFacts(AS_OF, 14, () => 0, () => ({
      availability: "unknown",
      unitsSold: 0,
    }));

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 14,
      facts,
    });

    expect(result.quality.unusableDays).toBe(14);
    expect(result.quality.baselineUsableDays).toBe(0);
    expect(result.dailyDemand).toBeNull();
    expect(result.reasonCodes).toContain("NO_USABLE_FORECAST_WINDOWS");
    expect(result.reasonCodes).toContain("BASELINE_UNAVAILABLE");
  });

  it("treats unknown promotion as unusable, distinct from no promotion", () => {
    const unknownPromo = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 14,
      facts: denseFacts(AS_OF, 14, () => 3, () => ({
        promotionState: "unknown",
      })),
    });

    const noPromo = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 14,
      facts: denseFacts(AS_OF, 14, () => 3, () => ({
        promotionState: "none",
      })),
    });

    expect(unknownPromo.dailyDemand).toBeNull();
    expect(unknownPromo.quality.unusableDays).toBe(14);
    expect(noPromo.dailyDemand).toBe(3);
    expect(noPromo.quality.baselineUsableDays).toBe(14);
  });

  it("excludes known promotion days from the baseline", () => {
    const facts = denseFacts(AS_OF, 14, (_date, index) =>
      index >= 10 ? 10 : 2,
    (_date, index) =>
      index >= 10
        ? {
            promotionState: "promotion",
            unitsSold: 10,
          }
        : {},
    );

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 14,
      facts,
    });

    expect(result.quality.promotionExcludedDays).toBe(4);
    expect(result.quality.baselineUsableDays).toBe(10);
    expect(result.dailyDemand).toBe(2);
  });

  it("degrades confidence under high stockout censoring", () => {
    const facts = denseFacts(AS_OF, 40, (_date, index) =>
      index >= 20 ? 5 : 0,
    (_date, index) =>
      index < 20
        ? {
            availability: "unavailable",
            unitsSold: 0,
          }
        : {},
    );

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 40,
      facts,
    });

    expect(result.quality.censoredDays).toBe(20);
    expect(result.dataSufficiency).toBe("limited");
    expect(result.dailyDemand).toBeCloseTo(5, 10);
    expect(result.confidence).toBe("low");
    expect(result.reasonCodes).toContain("HIGH_CENSORING_RATIO");
  });

  it("keeps daily demand when lead and review horizons are missing", () => {
    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 90,
      facts: denseFacts(AS_OF, 90, () => 3),
      leadTimeDays: null,
      reviewPeriodDays: null,
    });

    expect(result.dailyDemand).toBeCloseTo(3, 10);
    expect(result.horizons.dailyDemand).toBeCloseTo(3, 10);
    expect(result.horizons.leadTimeDemandUnits).toBeNull();
    expect(result.horizons.reviewPeriodDemandUnits).toBeNull();
    expect(result.horizons.replenishmentDemandUnits).toBeNull();
    expect(result.reasonCodes).toContain("LEAD_TIME_UNAVAILABLE");
    expect(result.reasonCodes).toContain("REVIEW_PERIOD_UNAVAILABLE");
  });

  it("computes independent lead-time demand when only lead time is known", () => {
    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 90,
      facts: denseFacts(AS_OF, 90, () => 2),
      leadTimeDays: 5,
      reviewPeriodDays: null,
    });

    expect(result.horizons.leadTimeDemandUnits).toBeCloseTo(10, 10);
    expect(result.horizons.reviewPeriodDemandUnits).toBeNull();
    expect(result.horizons.replenishmentDemandUnits).toBeNull();
  });

  it("ignores foreign tenant and location facts", () => {
    const own = denseFacts(AS_OF, 28, () => 1);
    const foreign: ForecastDailyFact[] = [
      fact(AS_OF, 100, {
        organizationId: "org-b",
      }),
      fact(AS_OF, 100, {
        locationId: "loc-b",
      }),
      fact(AS_OF, 100, {
        variantId: "var-b",
      }),
    ];

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 28,
      facts: [...own, ...foreign],
    });

    expect(result.dailyDemand).toBeCloseTo(1, 10);
    expect(result.quality.baselineUsableDays).toBe(28);
  });

  it("fails closed for missing calendar days instead of inventing zero demand", () => {
    const sparse = [
      fact(AS_OF, 5),
      fact(shiftForecastDate(AS_OF, -1), 5),
    ];

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 14,
      facts: sparse,
    });

    expect(result.quality.unusableDays).toBe(12);
    expect(result.quality.baselineUsableDays).toBe(2);
    expect(result.dailyDemand).toBeNull();
    expect(
      result.classifiedDays.filter(
        (day) => day.reasonCode === "MISSING_CALENDAR_DAY",
      ),
    ).toHaveLength(12);
  });

  it("requires location identity", () => {
    expect(() =>
      forecastSkuDemand({
        grain: {
          ...GRAIN,
          locationId: "",
        },
        forecastAsOf: AS_OF,
        lookbackDays: 7,
        facts: denseFacts(AS_OF, 7, () => 1),
      }),
    ).toThrow(/locationId/);
  });

  it("is deterministic and reproducible for identical inputs", () => {
    const facts = denseFacts(AS_OF, 40, (_date, index) =>
      index % 3 === 0 ? 4 : 1,
    );

    const input = {
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 40,
      facts,
      leadTimeDays: 3,
      reviewPeriodDays: 4,
    };

    const a = forecastSkuDemand(input);
    const b = forecastSkuDemand(input);

    expect(a).toEqual(b);
    expect(a.reproducibilityFingerprint).toBe(
      b.reproducibilityFingerprint,
    );
    expect(a.reproducibilityFingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("applies trend only when recent and prior windows are eligible", () => {
    // Rising demand in the latest 7 days vs prior 7.
    const facts = denseFacts(AS_OF, 28, (_date, index) =>
      index >= 21 ? 10 : 2,
    );

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 28,
      facts,
    });

    expect(result.trendApplied).toBe(true);
    expect(result.weightedDailyDemand).not.toBeNull();
    expect(result.trendAdjustedDailyDemand).toBeGreaterThan(
      result.weightedDailyDemand as number,
    );
    expect(result.dailyDemand).toBe(result.trendAdjustedDailyDemand);
  });

  it("skips trend when prior comparison window has no usable days", () => {
    const facts = denseFacts(AS_OF, 14, (_date, index) =>
      index >= 7 ? 3 : 0,
    (_date, index) =>
      index < 7
        ? {
            availability: "unavailable",
            unitsSold: 0,
          }
        : {},
    );

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 14,
      facts,
    });

    expect(result.trendApplied).toBe(false);
    expect(result.reasonCodes).toContain("TREND_COMPARISON_UNAVAILABLE");
    expect(result.dailyDemand).toBe(result.weightedDailyDemand);
  });

  it("rejects invalid Gregorian and malformed store-local dates", () => {
    const base = {
      grain: GRAIN,
      lookbackDays: 7,
      facts: denseFacts(AS_OF, 7, () => 1),
    };

    expect(() =>
      forecastSkuDemand({
        ...base,
        forecastAsOf: "2026-13-40",
      }),
    ).toThrow(/Gregorian|YYYY-MM-DD/);

    expect(() =>
      forecastSkuDemand({
        ...base,
        forecastAsOf: "2026-02-30",
      }),
    ).toThrow(/Gregorian|YYYY-MM-DD/);

    expect(() =>
      forecastSkuDemand({
        ...base,
        forecastAsOf: "2026-6-30",
      }),
    ).toThrow(/YYYY-MM-DD/);

    expect(() =>
      forecastSkuDemand({
        grain: GRAIN,
        forecastAsOf: AS_OF,
        lookbackDays: 7,
        facts: [
          ...denseFacts(AS_OF, 6, () => 1),
          fact("2026-02-30", 1),
        ],
      }),
    ).toThrow(/Gregorian|YYYY-MM-DD/);
  });

  it("allows a valid future forecastAsOf and excludes later facts", () => {
    const futureAsOf = "2099-01-15";
    const inWindow = denseFacts(futureAsOf, 14, () => 2);
    const afterAsOf = fact(shiftForecastDate(futureAsOf, 1), 99);

    const result = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: futureAsOf,
      lookbackDays: 14,
      facts: [...inWindow, afterAsOf],
    });

    expect(result.forecastAsOf).toBe(futureAsOf);
    expect(result.dailyDemand).toBeCloseTo(2, 10);
    expect(
      result.classifiedDays.some((day) => day.date > futureAsOf),
    ).toBe(false);
  });

  it("rejects duplicate same-grain dates inside the active window", () => {
    const facts = denseFacts(AS_OF, 14, () => 1);
    facts.push(fact(AS_OF, 9));

    expect(() =>
      forecastSkuDemand({
        grain: GRAIN,
        forecastAsOf: AS_OF,
        lookbackDays: 14,
        facts,
      }),
    ).toThrow(/Duplicate forecast fact/);
  });

  it("rejects invalid lookbackDays bounds and non-integers", () => {
    const facts = denseFacts(AS_OF, 7, () => 1);
    const base = {
      grain: GRAIN,
      forecastAsOf: AS_OF,
      facts,
    };

    for (const lookbackDays of [0, 366, 1.5, Number.NaN]) {
      expect(() =>
        forecastSkuDemand({
          ...base,
          lookbackDays,
        }),
      ).toThrow(/lookbackDays/);
    }

    expect(
      forecastSkuDemand({
        ...base,
        lookbackDays: 1,
      }).quality.totalDays,
    ).toBe(1);

    expect(
      forecastSkuDemand({
        grain: GRAIN,
        forecastAsOf: AS_OF,
        lookbackDays: 365,
        facts: denseFacts(AS_OF, 365, () => 1),
      }).quality.totalDays,
    ).toBe(365);
  });

  it("canonicalizes fingerprints to in-window same-grain evidence", () => {
    const relevant = denseFacts(AS_OF, 28, (_date, index) =>
      index % 2 === 0 ? 2 : 1,
    );

    const baseline = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 28,
      facts: relevant,
      leadTimeDays: 3,
      reviewPeriodDays: 4,
    });

    const reordered = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 28,
      facts: [...relevant].reverse(),
      leadTimeDays: 3,
      reviewPeriodDays: 4,
    });

    expect(reordered.reproducibilityFingerprint).toBe(
      baseline.reproducibilityFingerprint,
    );

    const withForeignAndOutOfWindow = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 28,
      facts: [
        ...relevant,
        fact(AS_OF, 100, { organizationId: "org-b" }),
        fact(AS_OF, 100, { locationId: "loc-b" }),
        fact(shiftForecastDate(AS_OF, 1), 50),
        fact(shiftForecastDate(AS_OF, -40), 50),
      ],
      leadTimeDays: 3,
      reviewPeriodDays: 4,
    });

    expect(withForeignAndOutOfWindow.reproducibilityFingerprint).toBe(
      baseline.reproducibilityFingerprint,
    );
    expect(withForeignAndOutOfWindow.dailyDemand).toBe(
      baseline.dailyDemand,
    );

    const changedEvidence = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 28,
      facts: denseFacts(AS_OF, 28, () => 7),
      leadTimeDays: 3,
      reviewPeriodDays: 4,
    });

    expect(changedEvidence.reproducibilityFingerprint).not.toBe(
      baseline.reproducibilityFingerprint,
    );

    const changedGrain = forecastSkuDemand({
      grain: {
        ...GRAIN,
        locationId: "loc-other",
      },
      forecastAsOf: AS_OF,
      lookbackDays: 28,
      facts: denseFacts(AS_OF, 28, (_date, index) =>
        index % 2 === 0 ? 2 : 1,
      ).map((row) => ({
        ...row,
        locationId: "loc-other",
      })),
      leadTimeDays: 3,
      reviewPeriodDays: 4,
    });

    expect(changedGrain.reproducibilityFingerprint).not.toBe(
      baseline.reproducibilityFingerprint,
    );

    const changedAsOf = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: shiftForecastDate(AS_OF, -1),
      lookbackDays: 28,
      facts: denseFacts(shiftForecastDate(AS_OF, -1), 28, (_date, index) =>
        index % 2 === 0 ? 2 : 1,
      ),
      leadTimeDays: 3,
      reviewPeriodDays: 4,
    });

    expect(changedAsOf.reproducibilityFingerprint).not.toBe(
      baseline.reproducibilityFingerprint,
    );

    const changedLookback = forecastSkuDemand({
      grain: GRAIN,
      forecastAsOf: AS_OF,
      lookbackDays: 21,
      facts: relevant,
      leadTimeDays: 3,
      reviewPeriodDays: 4,
    });

    expect(changedLookback.reproducibilityFingerprint).not.toBe(
      baseline.reproducibilityFingerprint,
    );
  });
});
