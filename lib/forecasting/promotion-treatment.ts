import type {
  PromotionObservationInput,
  PromotionObservationResult,
  PromotionSeriesQualitySummary,
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
 * promotion-treatment-v1
 *
 * Normal observations participate in baseline forecasting.
 *
 * Known promotional observations are excluded from the ordinary
 * baseline because they may represent temporary uplift.
 *
 * Unknown promotion state fails closed.
 */
export function classifyPromotionObservation(
  input: PromotionObservationInput,
): PromotionObservationResult {
  assertNonNegativeInteger(
    input.unitsSold,
    "unitsSold",
  );

  if (!input.dataComplete) {
    return {
      date: input.date,
      unitsSold: input.unitsSold,
      disposition: "unusable",
      reasonCode: "PROMOTION_DATA_INCOMPLETE",
    };
  }

  if (input.promotionState === "unknown") {
    return {
      date: input.date,
      unitsSold: input.unitsSold,
      disposition: "unusable",
      reasonCode: "PROMOTION_STATE_UNKNOWN",
    };
  }

  if (input.promotionState === "promotion") {
    return {
      date: input.date,
      unitsSold: input.unitsSold,
      disposition: "promotion_excluded",
      reasonCode: "PROMOTION_EXCLUDED",
    };
  }

  return {
    date: input.date,
    unitsSold: input.unitsSold,
    disposition: "baseline_usable",
    reasonCode: null,
  };
}

export function summarizePromotionSeriesQuality(
  observations: readonly PromotionObservationInput[],
): PromotionSeriesQualitySummary {
  let baselineUsableDays = 0;
  let promotionExcludedDays = 0;
  let unusableDays = 0;

  for (const observation of observations) {
    const result =
      classifyPromotionObservation(observation);

    switch (result.disposition) {
      case "baseline_usable":
        baselineUsableDays += 1;
        break;

      case "promotion_excluded":
        promotionExcludedDays += 1;
        break;

      case "unusable":
        unusableDays += 1;
        break;
    }
  }

  return {
    baselineUsableDays,
    promotionExcludedDays,
    unusableDays,
    totalDays: observations.length,
  };
}
