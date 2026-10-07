import type {
  DailyDemandObservationInput,
  DailyDemandObservationResult,
  DemandSeriesQualitySummary,
} from "./types";

function assertNonNegativeInteger(
  value: number,
  field: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative integer.`,
    );
  }
}

/**
 * stockout-censoring-v1
 *
 * Positive sales are considered usable observations.
 *
 * Zero-sales observations are censored when inventory
 * was definitely unavailable.
 *
 * Unknown availability or incomplete source data is
 * treated as unusable rather than zero demand.
 */
export function classifyDemandObservation(
  input: DailyDemandObservationInput,
): DailyDemandObservationResult {
  assertNonNegativeInteger(
    input.unitsSold,
    "unitsSold",
  );

  if (!input.dataComplete) {
    return {
      date: input.date,
      unitsSold: input.unitsSold,
      disposition: "unusable",
      reasonCode: "DATA_INCOMPLETE",
    };
  }

  if (input.unitsSold > 0) {
    return {
      date: input.date,
      unitsSold: input.unitsSold,
      disposition: "usable",
      reasonCode: null,
    };
  }

  if (input.availability === "unavailable") {
    return {
      date: input.date,
      unitsSold: 0,
      disposition: "stockout_censored",
      reasonCode: "STOCKOUT_CENSORED",
    };
  }

  if (input.availability === "unknown") {
    return {
      date: input.date,
      unitsSold: 0,
      disposition: "unusable",
      reasonCode: "AVAILABILITY_UNKNOWN",
    };
  }

  return {
    date: input.date,
    unitsSold: 0,
    disposition: "usable",
    reasonCode: null,
  };
}

export function summarizeDemandSeriesQuality(
  observations: readonly DailyDemandObservationInput[],
): DemandSeriesQualitySummary {
  let usableDays = 0;
  let censoredDays = 0;
  let unusableDays = 0;

  for (const observation of observations) {
    const result =
      classifyDemandObservation(observation);

    switch (result.disposition) {
      case "usable":
        usableDays += 1;
        break;

      case "stockout_censored":
        censoredDays += 1;
        break;

      case "unusable":
        unusableDays += 1;
        break;
    }
  }

  return {
    usableDays,
    censoredDays,
    unusableDays,
    totalDays: observations.length,
  };
}
