import type {
  ColdStartForecastInput,
  ColdStartForecastResult,
} from "./types";

export const COLD_START_VERSION_V1 =
  "cold-start-v1" as const;

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
 * cold-start-v1
 *
 * Insufficient history:
 *   do not publish a numeric forecast.
 *
 * Limited history:
 *   own-SKU baseline may be exposed explicitly as
 *   limited-history forecast.
 *
 * Sufficient history:
 *   normal forecast path.
 *
 * V1 performs no category, peer-SKU, AI, or synthetic
 * fallback demand estimation.
 */
export function resolveColdStartForecast(
  input: ColdStartForecastInput,
): ColdStartForecastResult {
  if (input.baselineDailyDemand !== null) {
    assertNonNegativeFinite(
      input.baselineDailyDemand,
      "baselineDailyDemand",
    );
  }

  if (
    input.dataSufficiency === "insufficient"
  ) {
    return {
      algorithmVersion:
        COLD_START_VERSION_V1,
      mode: "unavailable",
      dailyDemand: null,
      dataSufficiency: "insufficient",
      reasonCode: "INSUFFICIENT_HISTORY",
    };
  }

  if (input.baselineDailyDemand === null) {
    return {
      algorithmVersion:
        COLD_START_VERSION_V1,
      mode: "unavailable",
      dailyDemand: null,
      dataSufficiency:
        input.dataSufficiency,
      reasonCode: "BASELINE_UNAVAILABLE",
    };
  }

  if (input.dataSufficiency === "limited") {
    return {
      algorithmVersion:
        COLD_START_VERSION_V1,
      mode: "limited_history",
      dailyDemand:
        input.baselineDailyDemand,
      dataSufficiency: "limited",
      reasonCode: null,
    };
  }

  return {
    algorithmVersion:
      COLD_START_VERSION_V1,
    mode: "standard",
    dailyDemand:
      input.baselineDailyDemand,
    dataSufficiency: "sufficient",
    reasonCode: null,
  };
}
