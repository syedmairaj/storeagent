import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateForecastBacktest,
} from "@/lib/forecasting/backtesting";

describe("forecast-backtest-v1", () => {
  it("calculates MAE WAPE and bias", () => {
    const result =
      calculateForecastBacktest([
        {
          actualDemand: 10,
          predictedDemand: 12,
        },
        {
          actualDemand: 20,
          predictedDemand: 18,
        },
        {
          actualDemand: 30,
          predictedDemand: 33,
        },
      ]);

    expect(result.observationCount).toBe(3);

    expect(result.mae).toBeCloseTo(
      7 / 3,
      10,
    );

    expect(result.wape).toBeCloseTo(
      7 / 60,
      10,
    );

    expect(result.biasRatio).toBeCloseTo(
      3 / 60,
      10,
    );
  });

  it("reports positive bias for over-forecasting", () => {
    const result =
      calculateForecastBacktest([
        {
          actualDemand: 10,
          predictedDemand: 15,
        },
        {
          actualDemand: 10,
          predictedDemand: 12,
        },
      ]);

    expect(result.biasRatio).toBeGreaterThan(0);
  });

  it("reports negative bias for under-forecasting", () => {
    const result =
      calculateForecastBacktest([
        {
          actualDemand: 10,
          predictedDemand: 8,
        },
        {
          actualDemand: 10,
          predictedDemand: 7,
        },
      ]);

    expect(result.biasRatio).toBeLessThan(0);
  });

  it("reports zero bias when signed errors cancel", () => {
    const result =
      calculateForecastBacktest([
        {
          actualDemand: 10,
          predictedDemand: 12,
        },
        {
          actualDemand: 10,
          predictedDemand: 8,
        },
      ]);

    expect(result.biasRatio).toBe(0);
  });

  it("keeps MAE valid when actual demand totals zero", () => {
    const result =
      calculateForecastBacktest([
        {
          actualDemand: 0,
          predictedDemand: 2,
        },
        {
          actualDemand: 0,
          predictedDemand: 0,
        },
      ]);

    expect(result.mae).toBe(1);
    expect(result.wape).toBeNull();
    expect(result.biasRatio).toBeNull();

    expect(result.reasonCodes).toContain(
      "ZERO_TOTAL_ACTUAL_DEMAND",
    );
  });

  it("returns unavailable metrics for empty backtest", () => {
    expect(
      calculateForecastBacktest([]),
    ).toEqual({
      algorithmVersion: "forecast-backtest-v1",
      observationCount: 0,
      mae: null,
      wape: null,
      biasRatio: null,
      totalActualDemand: 0,
      totalPredictedDemand: 0,
      totalAbsoluteError: 0,
      totalSignedError: 0,
      reasonCodes: ["NO_BACKTEST_POINTS"],
    });
  });

  it("rejects negative actual demand", () => {
    expect(() =>
      calculateForecastBacktest([
        {
          actualDemand: -1,
          predictedDemand: 2,
        },
      ]),
    ).toThrow(
      "actualDemand must be a non-negative finite number.",
    );
  });

  it("rejects negative predicted demand", () => {
    expect(() =>
      calculateForecastBacktest([
        {
          actualDemand: 2,
          predictedDemand: -1,
        },
      ]),
    ).toThrow(
      "predictedDemand must be a non-negative finite number.",
    );
  });
});
