import type {
  ForecastBacktestPoint,
  ForecastBacktestResult,
} from "./types";

export const FORECAST_BACKTEST_VERSION_V1 =
  "forecast-backtest-v1" as const;

function assertNonNegativeFinite(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative finite number.`,
    );
  }
}

/**
 * forecast-backtest-v1
 *
 * MAE:
 * mean(abs(predicted - actual))
 *
 * WAPE:
 * sum(abs(predicted - actual)) / sum(actual)
 *
 * Bias ratio:
 * sum(predicted - actual) / sum(actual)
 *
 * Positive bias means systematic over-forecasting.
 * Negative bias means systematic under-forecasting.
 *
 * WAPE and normalized bias are undefined when total actual
 * demand is zero.
 */
export function calculateForecastBacktest(
  points: readonly ForecastBacktestPoint[],
): ForecastBacktestResult {
  if (points.length === 0) {
    return {
      algorithmVersion:
        FORECAST_BACKTEST_VERSION_V1,
      observationCount: 0,
      mae: null,
      wape: null,
      biasRatio: null,
      totalActualDemand: 0,
      totalPredictedDemand: 0,
      totalAbsoluteError: 0,
      totalSignedError: 0,
      reasonCodes: ["NO_BACKTEST_POINTS"],
    };
  }

  let totalActualDemand = 0;
  let totalPredictedDemand = 0;
  let totalAbsoluteError = 0;
  let totalSignedError = 0;

  for (const point of points) {
    assertNonNegativeFinite(
      point.actualDemand,
      "actualDemand",
    );

    assertNonNegativeFinite(
      point.predictedDemand,
      "predictedDemand",
    );

    const signedError =
      point.predictedDemand -
      point.actualDemand;

    totalActualDemand += point.actualDemand;
    totalPredictedDemand +=
      point.predictedDemand;
    totalAbsoluteError +=
      Math.abs(signedError);
    totalSignedError += signedError;
  }

  const mae =
    totalAbsoluteError /
    points.length;

  if (totalActualDemand === 0) {
    return {
      algorithmVersion:
        FORECAST_BACKTEST_VERSION_V1,
      observationCount: points.length,
      mae,
      wape: null,
      biasRatio: null,
      totalActualDemand,
      totalPredictedDemand,
      totalAbsoluteError,
      totalSignedError,
      reasonCodes: [
        "ZERO_TOTAL_ACTUAL_DEMAND",
      ],
    };
  }

  return {
    algorithmVersion:
      FORECAST_BACKTEST_VERSION_V1,
    observationCount: points.length,
    mae,
    wape:
      totalAbsoluteError /
      totalActualDemand,
    biasRatio:
      totalSignedError /
      totalActualDemand,
    totalActualDemand,
    totalPredictedDemand,
    totalAbsoluteError,
    totalSignedError,
    reasonCodes: [],
  };
}
