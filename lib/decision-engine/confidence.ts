import type {
  ConfidenceLevel,
} from "@/lib/commerce-domain/types";

import type {
  DecisionConfidenceInput,
  DecisionConfidenceResult,
  InventoryDecisionReasonCode,
} from "./types";

export const DECISION_CONFIDENCE_VERSION_V1 =
  "decision-confidence-v1" as const;

export const DATA_QUALITY_HIGH_MIN_V1 = 80;
export const DATA_QUALITY_MEDIUM_MIN_V1 = 60;

function confidenceRank(
  confidence: ConfidenceLevel,
): number {
  switch (confidence) {
    case "low":
      return 0;

    case "medium":
      return 1;

    case "high":
      return 2;
  }
}

function lowerConfidence(
  current: ConfidenceLevel,
  cap: ConfidenceLevel,
): ConfidenceLevel {
  return confidenceRank(current) <=
    confidenceRank(cap)
    ? current
    : cap;
}

function assertDataQualityScore(
  value: number,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new Error(
      "dataQualityScore must be between 0 and 100.",
    );
  }
}

/**
 * decision-confidence-v1
 *
 * Decision confidence starts from deterministic forecast
 * confidence and may only stay the same or decrease.
 *
 * The decision layer never raises confidence.
 */
export function calculateDecisionConfidence(
  input: DecisionConfidenceInput,
): DecisionConfidenceResult {
  const reasonCodes:
    InventoryDecisionReasonCode[] = [];

  let confidence =
    input.decisionInput.forecastConfidence;

  if (input.conflicting) {
    confidence = "low";

    reasonCodes.push(
      "CONFLICTING_SIGNALS",
    );
  }

  if (input.materialUncertainty) {
    confidence = "low";

    reasonCodes.push(
      "MATERIAL_UNCERTAINTY",
    );
  }

  const dataQualityScore =
    input.decisionInput.dataQualityScore;

  if (dataQualityScore !== null) {
    assertDataQualityScore(
      dataQualityScore,
    );

    if (
      dataQualityScore <
      DATA_QUALITY_MEDIUM_MIN_V1
    ) {
      confidence = "low";

      reasonCodes.push(
        "DATA_QUALITY_LOW",
      );
    } else if (
      dataQualityScore <
      DATA_QUALITY_HIGH_MIN_V1
    ) {
      confidence = lowerConfidence(
        confidence,
        "medium",
      );

      reasonCodes.push(
        "DATA_QUALITY_MEDIUM",
      );
    }
  }

  /*
   * Explicit architectural guard:
   * decision confidence may never exceed the forecast
   * confidence that entered this layer.
   */
  const forecastConfidence =
    input.decisionInput.forecastConfidence;

  const cappedConfidence =
    lowerConfidence(
      confidence,
      forecastConfidence,
    );

  if (cappedConfidence !== confidence) {
    reasonCodes.push(
      "DECISION_CONFIDENCE_CAPPED_BY_FORECAST",
    );
  }

  confidence = cappedConfidence;

  return {
    algorithmVersion:
      DECISION_CONFIDENCE_VERSION_V1,
    confidence,
    reasonCodes,
  };
}
