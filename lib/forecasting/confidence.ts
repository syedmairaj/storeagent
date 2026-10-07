import type {
  ConfidenceLevel,
} from "@/lib/commerce-domain/types";

import type {
  ForecastConfidenceInput,
  ForecastConfidenceReasonCode,
  ForecastConfidenceResult,
} from "./types";

export const FORECAST_CONFIDENCE_VERSION_V1 =
  "forecast-confidence-v1" as const;

export const CONFIDENCE_UNUSABLE_MODERATE_RATIO_V1 = 0.10;
export const CONFIDENCE_UNUSABLE_HIGH_RATIO_V1 = 0.25;

export const CONFIDENCE_CENSORING_MODERATE_RATIO_V1 = 0.20;
export const CONFIDENCE_CENSORING_HIGH_RATIO_V1 = 0.40;

export const CONFIDENCE_PROMOTION_MODERATE_RATIO_V1 = 0.20;
export const CONFIDENCE_PROMOTION_HIGH_RATIO_V1 = 0.40;

function assertCount(
  value: number,
  field: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative integer.`,
    );
  }
}

function degradeOneLevel(
  confidence: ConfidenceLevel,
): ConfidenceLevel {
  switch (confidence) {
    case "high":
      return "medium";

    case "medium":
      return "low";

    case "low":
      return "low";
  }
}

function ratio(
  count: number,
  total: number,
): number {
  if (total === 0) {
    return 0;
  }

  return count / total;
}

/**
 * forecast-confidence-v1
 *
 * Confidence starts from data sufficiency and can only
 * stay the same or degrade as data quality worsens.
 */
export function calculateForecastConfidence(
  input: ForecastConfidenceInput,
): ForecastConfidenceResult {
  assertCount(input.totalDays, "totalDays");
  assertCount(input.censoredDays, "censoredDays");
  assertCount(
    input.promotionExcludedDays,
    "promotionExcludedDays",
  );
  assertCount(input.unusableDays, "unusableDays");

  if (input.censoredDays > input.totalDays) {
    throw new Error(
      "censoredDays cannot exceed totalDays.",
    );
  }

  if (
    input.promotionExcludedDays >
    input.totalDays
  ) {
    throw new Error(
      "promotionExcludedDays cannot exceed totalDays.",
    );
  }

  if (input.unusableDays > input.totalDays) {
    throw new Error(
      "unusableDays cannot exceed totalDays.",
    );
  }

  const censoredRatio = ratio(
    input.censoredDays,
    input.totalDays,
  );

  const promotionExcludedRatio = ratio(
    input.promotionExcludedDays,
    input.totalDays,
  );

  const unusableRatio = ratio(
    input.unusableDays,
    input.totalDays,
  );

  const reasonCodes:
    ForecastConfidenceReasonCode[] = [];

  let confidence: ConfidenceLevel;

  switch (input.dataSufficiency) {
    case "sufficient":
      confidence = "high";
      break;

    case "limited":
      confidence = "medium";
      reasonCodes.push("LIMITED_HISTORY");
      break;

    case "insufficient":
      confidence = "low";
      reasonCodes.push("INSUFFICIENT_HISTORY");
      break;
  }

  if (!input.baselineAvailable) {
    confidence = "low";
    reasonCodes.push("BASELINE_UNAVAILABLE");
  }

  const severeQualityIssue =
    unusableRatio >=
      CONFIDENCE_UNUSABLE_HIGH_RATIO_V1 ||
    censoredRatio >=
      CONFIDENCE_CENSORING_HIGH_RATIO_V1 ||
    promotionExcludedRatio >=
      CONFIDENCE_PROMOTION_HIGH_RATIO_V1;

  if (severeQualityIssue) {
    confidence = "low";

    if (
      unusableRatio >=
      CONFIDENCE_UNUSABLE_HIGH_RATIO_V1
    ) {
      reasonCodes.push("HIGH_UNUSABLE_RATIO");
    }

    if (
      censoredRatio >=
      CONFIDENCE_CENSORING_HIGH_RATIO_V1
    ) {
      reasonCodes.push("HIGH_CENSORING_RATIO");
    }

    if (
      promotionExcludedRatio >=
      CONFIDENCE_PROMOTION_HIGH_RATIO_V1
    ) {
      reasonCodes.push("HIGH_PROMOTION_RATIO");
    }

    return {
      algorithmVersion:
        FORECAST_CONFIDENCE_VERSION_V1,
      confidence,
      unusableRatio,
      censoredRatio,
      promotionExcludedRatio,
      reasonCodes,
    };
  }

  const moderateReasons:
    ForecastConfidenceReasonCode[] = [];

  if (
    unusableRatio >=
    CONFIDENCE_UNUSABLE_MODERATE_RATIO_V1
  ) {
    moderateReasons.push(
      "MODERATE_UNUSABLE_RATIO",
    );
  }

  if (
    censoredRatio >=
    CONFIDENCE_CENSORING_MODERATE_RATIO_V1
  ) {
    moderateReasons.push(
      "MODERATE_CENSORING_RATIO",
    );
  }

  if (
    promotionExcludedRatio >=
    CONFIDENCE_PROMOTION_MODERATE_RATIO_V1
  ) {
    moderateReasons.push(
      "MODERATE_PROMOTION_RATIO",
    );
  }

  if (moderateReasons.length > 0) {
    confidence = degradeOneLevel(confidence);
    reasonCodes.push(...moderateReasons);
  }

  return {
    algorithmVersion:
      FORECAST_CONFIDENCE_VERSION_V1,
    confidence,
    unusableRatio,
    censoredRatio,
    promotionExcludedRatio,
    reasonCodes,
  };
}
