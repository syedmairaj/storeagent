import type {
  ForecastHorizonInput,
  ForecastHorizonReasonCode,
  ForecastHorizonResult,
} from "./types";

export const FORECAST_HORIZON_VERSION_V1 =
  "forecast-horizon-v1" as const;

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
 * forecast-horizon-v1
 *
 * Converts expected daily demand into explicit demand horizons.
 *
 * This function does not calculate reorder quantities,
 * safety stock, MOQ, or purchase recommendations.
 */
export function calculateForecastHorizons(
  input: ForecastHorizonInput,
): ForecastHorizonResult {
  const reasonCodes:
    ForecastHorizonReasonCode[] = [];

  if (input.dailyDemand === null) {
    reasonCodes.push(
      "DAILY_DEMAND_UNAVAILABLE",
    );
  } else {
    assertNonNegativeFinite(
      input.dailyDemand,
      "dailyDemand",
    );
  }

  if (input.leadTimeDays === null) {
    reasonCodes.push(
      "LEAD_TIME_UNAVAILABLE",
    );
  } else {
    assertNonNegativeFinite(
      input.leadTimeDays,
      "leadTimeDays",
    );
  }

  if (input.reviewPeriodDays === null) {
    reasonCodes.push(
      "REVIEW_PERIOD_UNAVAILABLE",
    );
  } else {
    assertNonNegativeFinite(
      input.reviewPeriodDays,
      "reviewPeriodDays",
    );
  }

  const leadTimeDemandUnits =
    input.dailyDemand !== null &&
    input.leadTimeDays !== null
      ? input.dailyDemand *
        input.leadTimeDays
      : null;

  const reviewPeriodDemandUnits =
    input.dailyDemand !== null &&
    input.reviewPeriodDays !== null
      ? input.dailyDemand *
        input.reviewPeriodDays
      : null;

  const replenishmentHorizonDays =
    input.leadTimeDays !== null &&
    input.reviewPeriodDays !== null
      ? input.leadTimeDays +
        input.reviewPeriodDays
      : null;

  const replenishmentDemandUnits =
    input.dailyDemand !== null &&
    replenishmentHorizonDays !== null
      ? input.dailyDemand *
        replenishmentHorizonDays
      : null;

  return {
    algorithmVersion:
      FORECAST_HORIZON_VERSION_V1,

    dailyDemand: input.dailyDemand,

    leadTimeDays: input.leadTimeDays,
    reviewPeriodDays:
      input.reviewPeriodDays,
    replenishmentHorizonDays,

    leadTimeDemandUnits,
    reviewPeriodDemandUnits,
    replenishmentDemandUnits,

    reasonCodes,
  };
}
