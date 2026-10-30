import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateForecastBacktestHarness,
  FORECAST_BACKTEST_MIN_ORIGINS_V1,
  resolveFactAtKnowledgeCutoff,
  type BacktestPointInTimeFact,
} from "@/lib/forecasting/backtest-harness";

import {
  shiftForecastDate,
  type ForecastGrain,
} from "@/lib/forecasting/series";

const GRAIN: ForecastGrain = {
  organizationId: "6100e000-0000-4000-8000-000000000001",
  storeId: "6100e000-0000-4000-8000-000000000002",
  locationId: "6100e000-0000-4000-8000-000000000003",
  variantId: "6100e000-0000-4000-8000-000000000005",
};

const START = "2026-01-01";

function fact(
  date: string,
  overrides: Partial<BacktestPointInTimeFact> = {},
): BacktestPointInTimeFact {
  return {
    organizationId: GRAIN.organizationId,
    storeId: GRAIN.storeId,
    locationId: GRAIN.locationId,
    variantId: GRAIN.variantId,
    date,
    unitsSold: 2,
    availability: "available",
    promotionState: "none",
    dataComplete: true,
    knownAsOf: date,
    ...overrides,
  };
}

function denseFacts(
  dayCount: number,
  unitsForDay: (date: string, index: number) => number = () => 2,
): BacktestPointInTimeFact[] {
  const facts: BacktestPointInTimeFact[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const date = shiftForecastDate(START, i);
    facts.push(
      fact(date, {
        unitsSold: unitsForDay(date, i),
      }),
    );
  }
  return facts;
}

describe("M6 P4a forecast backtest harness", () => {
  it("scores rolling one-day origins with identical dates across baselines", () => {
    // 40 calendar days → origins with lookback 7 need warmup; use days 10..33.
    const facts = denseFacts(40);
    const result = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1),
      lookbackDays: 7,
      facts,
    });

    expect(result.disposition).toBe("preliminary");
    expect(result.originCount).toBe(FORECAST_BACKTEST_MIN_ORIGINS_V1);
    expect(result.claimsProductionApproval).toBe(false);
    expect(result.claimsM7NumericEligibility).toBe(false);
    expect(result.harnessHorizonDays).toBe(1);
    expect(result.models).toHaveLength(3);

    const scored = result.scoredDates;
    expect(scored).toHaveLength(FORECAST_BACKTEST_MIN_ORIGINS_V1);
    for (const model of result.models) {
      expect(model.backtest.observationCount).toBe(scored.length);
    }

    const candidate = result.models.find((m) => m.model === "candidate");
    const naive = result.models.find((m) => m.model === "naive_lag1");
    const zero = result.models.find((m) => m.model === "zero");
    expect(candidate?.backtest.mae).not.toBeNull();
    expect(naive?.backtest.observationCount).toBe(candidate?.backtest.observationCount);
    expect(zero?.backtest.observationCount).toBe(candidate?.backtest.observationCount);
  });

  it("enforces cutoff: later corrections do not leak into earlier origin training", () => {
    const facts = denseFacts(20, () => 1);
    const target = shiftForecastDate(START, 12);
    // Late correction raises demand on an earlier day after a later knownAsOf.
    facts.push(
      fact(shiftForecastDate(START, 5), {
        unitsSold: 99,
        knownAsOf: shiftForecastDate(START, 15),
      }),
    );

    const atOrigin12 = resolveFactAtKnowledgeCutoff(
      facts,
      GRAIN,
      shiftForecastDate(START, 5),
      target,
    );
    expect(atOrigin12?.unitsSold).toBe(1);

    const afterCorrection = resolveFactAtKnowledgeCutoff(
      facts,
      GRAIN,
      shiftForecastDate(START, 5),
      shiftForecastDate(START, 15),
    );
    expect(afterCorrection?.unitsSold).toBe(99);

    const result = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: target,
      originEnd: target,
      lookbackDays: 7,
      facts,
    });
    // Single origin may be eligible; prediction must not have trained on 99.
    if (result.originCount === 1) {
      expect(result.origins[0]?.candidatePredictedDemand).not.toBe(99);
    }
  });

  it("rejects knownAsOf before fact date as invalid history leakage", () => {
    const facts = denseFacts(12);
    facts.push(
      fact(shiftForecastDate(START, 5), {
        unitsSold: 3,
        knownAsOf: shiftForecastDate(START, 4),
      }),
    );

    const result = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: shiftForecastDate(START, 8),
      originEnd: shiftForecastDate(START, 10),
      lookbackDays: 7,
      facts,
    });

    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("KNOWN_AS_OF_BEFORE_FACT_DATE");
    expect(result.originCount).toBe(0);
  });

  it("does not score missing, partial, censored, or promotion days as zero", () => {
    const facts = denseFacts(18, () => 2);
    const scoreOrigin = shiftForecastDate(START, 10);
    const scoreDate = shiftForecastDate(scoreOrigin, 1);

    // Replace score day with incomplete / censored / promotion variants across cases.
    const incomplete = facts.map((row) =>
      row.date === scoreDate
        ? fact(scoreDate, { dataComplete: false, unitsSold: 0 })
        : row,
    );
    const incompleteResult = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: scoreOrigin,
      originEnd: scoreOrigin,
      lookbackDays: 7,
      facts: incomplete,
    });
    expect(incompleteResult.originCount).toBe(0);
    expect(incompleteResult.reasonCodes).toContain("NO_ELIGIBLE_ORIGINS");

    const censored = facts.map((row) =>
      row.date === scoreDate
        ? fact(scoreDate, {
            unitsSold: 0,
            availability: "unavailable",
            dataComplete: true,
          })
        : row,
    );
    const censoredResult = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: scoreOrigin,
      originEnd: scoreOrigin,
      lookbackDays: 7,
      facts: censored,
    });
    expect(censoredResult.originCount).toBe(0);

    const promoted = facts.map((row) =>
      row.date === scoreDate
        ? fact(scoreDate, {
            promotionState: "promotion",
            unitsSold: 8,
          })
        : row,
    );
    const promotedResult = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: scoreOrigin,
      originEnd: scoreOrigin,
      lookbackDays: 7,
      facts: promoted,
    });
    expect(promotedResult.originCount).toBe(0);
    expect(promotedResult.reasonCodes).toEqual(
      expect.arrayContaining([
        "NO_ELIGIBLE_ORIGINS",
        "PROMOTION_EXCLUDED_FROM_PRIMARY_SCORE",
      ]),
    );
  });

  it("accepts known complete zero demand as a valid actual", () => {
    const facts = denseFacts(20, (_date, index) => (index === 11 ? 0 : 2));
    const origin = shiftForecastDate(START, 10);
    const result = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: origin,
      originEnd: origin,
      lookbackDays: 7,
      facts,
    });

    expect(result.originCount).toBe(1);
    expect(result.origins[0]?.actualDemand).toBe(0);
    expect(result.origins[0]?.scoreDate).toBe(shiftForecastDate(origin, 1));
  });

  it("returns null MASE when naive scale is zero on intermittent zero-heavy series", () => {
    const facts = denseFacts(30, () => 0);
    const result = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 24),
      lookbackDays: 7,
      facts,
    });

    expect(result.demandClass).toBe("intermittent");
    expect(result.originCount).toBeGreaterThanOrEqual(14);
    const candidate = result.models.find((m) => m.model === "candidate");
    // Perfect zero actuals + zero-capable forecast → MASE denominator 0.
    expect(candidate?.mase).toBeNull();
    expect(candidate?.maseReasonCode).toBe("MASE_DENOMINATOR_ZERO");
    expect(result.reasonCodes).toContain("MASE_DENOMINATOR_ZERO");
    expect(candidate?.backtest.wape).toBeNull();
    expect(candidate?.backtest.reasonCodes).toContain("ZERO_TOTAL_ACTUAL_DEMAND");
  });

  it("applies the diagnostic minimum-origin gate without claiming approval", () => {
    const facts = denseFacts(20);
    const result = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      facts,
    });

    expect(result.originCount).toBe(3);
    expect(result.disposition).toBe("INSUFFICIENT_BACKTEST_POINTS");
    expect(result.reasonCodes).toContain("INSUFFICIENT_BACKTEST_POINTS");
    expect(result.claimsProductionApproval).toBe(false);
    expect(result.segments[0]?.demandClass).toBe(result.demandClass);
  });

  it("preserves segmented output and deterministic fingerprints", () => {
    const facts = denseFacts(35, (_d, i) => (i % 3 === 0 ? 0 : 2));
    const input = {
      grain: GRAIN,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 10 + 15),
      lookbackDays: 7,
      facts,
    } as const;

    const a = evaluateForecastBacktestHarness(input);
    const b = evaluateForecastBacktestHarness(input);

    expect(a.reproducibilityFingerprint).toBe(b.reproducibilityFingerprint);
    expect(a.segments).toHaveLength(1);
    expect(a.segments[0]?.originCount).toBe(a.originCount);
    expect(a.segments[0]?.scoredDates).toEqual(a.scoredDates);
    expect(["smooth", "intermittent"]).toContain(a.demandClass);
  });

  it("keeps future order-like facts out of training when knownAsOf is after origin", () => {
    const facts = denseFacts(16, () => 1);
    // A "future" sale recorded against an in-window date but only knowable later.
    const hiddenDate = shiftForecastDate(START, 8);
    const origin = shiftForecastDate(START, 10);
    facts.push(
      fact(hiddenDate, {
        unitsSold: 50,
        knownAsOf: shiftForecastDate(START, 14),
      }),
    );

    const trainView = resolveFactAtKnowledgeCutoff(
      facts,
      GRAIN,
      hiddenDate,
      origin,
    );
    expect(trainView?.unitsSold).toBe(1);

    const result = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: origin,
      originEnd: origin,
      lookbackDays: 7,
      facts,
    });
    expect(result.disposition === "INVALID_HISTORY").toBe(false);
  });
});
