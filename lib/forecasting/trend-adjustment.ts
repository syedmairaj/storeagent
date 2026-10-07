import type {
  TrendAdjustmentInput,
  TrendAdjustmentResult,
} from "./types";

export const TREND_ADJUSTMENT_VERSION_V1 =
  "trend-adjustment-v1" as const;

export const TREND_STABLE_BAND_RATIO_V1 = 0.10;
export const TREND_MAX_ADJUSTMENT_RATIO_V1 = 0.20;

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

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * trend-adjustment-v1
 *
 * Applies bounded deterministic trend to an existing
 * weighted-demand baseline.
 *
 * Stable +/-10% movement produces no adjustment.
 * Adjustment is capped to +/-20%.
 */
export function applyTrendAdjustment(
  input: TrendAdjustmentInput,
): TrendAdjustmentResult {
  assertNonNegativeFinite(
    input.baselineDailyDemand,
    "baselineDailyDemand",
  );

  assertNonNegativeFinite(
    input.recentDailyDemand,
    "recentDailyDemand",
  );

  assertNonNegativeFinite(
    input.priorDailyDemand,
    "priorDailyDemand",
  );

  if (
    input.priorDailyDemand === 0 &&
    input.recentDailyDemand === 0
  ) {
    return {
      algorithmVersion:
        TREND_ADJUSTMENT_VERSION_V1,
      baselineDailyDemand:
        input.baselineDailyDemand,
      adjustedDailyDemand:
        input.baselineDailyDemand,
      rawTrendRatio: 0,
      appliedAdjustmentRatio: 0,
      capped: false,
    };
  }

  if (input.priorDailyDemand === 0) {
    const adjustment =
      TREND_MAX_ADJUSTMENT_RATIO_V1;

    return {
      algorithmVersion:
        TREND_ADJUSTMENT_VERSION_V1,
      baselineDailyDemand:
        input.baselineDailyDemand,
      adjustedDailyDemand:
        input.baselineDailyDemand *
        (1 + adjustment),
      rawTrendRatio: null,
      appliedAdjustmentRatio: adjustment,
      capped: true,
    };
  }

  const rawTrendRatio =
    (input.recentDailyDemand -
      input.priorDailyDemand) /
    input.priorDailyDemand;

  if (
    Math.abs(rawTrendRatio) <=
    TREND_STABLE_BAND_RATIO_V1
  ) {
    return {
      algorithmVersion:
        TREND_ADJUSTMENT_VERSION_V1,
      baselineDailyDemand:
        input.baselineDailyDemand,
      adjustedDailyDemand:
        input.baselineDailyDemand,
      rawTrendRatio,
      appliedAdjustmentRatio: 0,
      capped: false,
    };
  }

  const appliedAdjustmentRatio = clamp(
    rawTrendRatio,
    -TREND_MAX_ADJUSTMENT_RATIO_V1,
    TREND_MAX_ADJUSTMENT_RATIO_V1,
  );

  return {
    algorithmVersion:
      TREND_ADJUSTMENT_VERSION_V1,
    baselineDailyDemand:
      input.baselineDailyDemand,
    adjustedDailyDemand:
      Math.max(
        0,
        input.baselineDailyDemand *
          (1 + appliedAdjustmentRatio),
      ),
    rawTrendRatio,
    appliedAdjustmentRatio,
    capped:
      appliedAdjustmentRatio !== rawTrendRatio,
  };
}
