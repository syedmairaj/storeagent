import type {
  InventoryDecisionReasonCode,
  WatchHealthyRuleInput,
  WatchHealthyRuleResult,
} from "./types";

export const WATCH_HEALTHY_RULE_VERSION_V1 =
  "watch-healthy-rule-v1" as const;

/**
 * watch-healthy-rule-v1
 *
 * This rule is a fallback classifier.
 *
 * It must be evaluated only after REORDER, REDUCE, and
 * PROMOTE candidates have been calculated.
 *
 * It does not resolve conflicts between commercial actions.
 */
export function evaluateWatchHealthyRule(
  input: WatchHealthyRuleInput,
): WatchHealthyRuleResult {
  const {
    decisionInput,
    reorderEligible,
    reduceEligible,
    promoteEligible,
  } = input;

  const hasCommercialCandidate =
    reorderEligible ||
    reduceEligible ||
    promoteEligible;

  if (hasCommercialCandidate) {
    return {
      algorithmVersion:
        WATCH_HEALTHY_RULE_VERSION_V1,
      healthState: null,
      reasonCodes: [],
    };
  }

  const reasonCodes:
    InventoryDecisionReasonCode[] = [];

  if (
    decisionInput.availableQuantity === null
  ) {
    reasonCodes.push(
      "INVENTORY_STATE_UNKNOWN",
    );
  }

  if (!decisionInput.incomingStateKnown) {
    reasonCodes.push(
      "INCOMING_STATE_UNKNOWN",
    );
  }

  if (decisionInput.demandVelocity === null) {
    reasonCodes.push(
      "DEMAND_STATE_UNKNOWN",
    );
  }

  if (decisionInput.leadTimeDays === null) {
    reasonCodes.push(
      "LEAD_TIME_UNKNOWN",
    );
  }

  if (
    decisionInput.reorderPointUnits === null
  ) {
    reasonCodes.push(
      "REORDER_POINT_UNKNOWN",
    );
  }

  if (
    decisionInput.targetStockUnits === null
  ) {
    reasonCodes.push(
      "TARGET_STOCK_UNKNOWN",
    );
  }

  if (
    decisionInput.forecastExpectedDemandUnits ===
    null
  ) {
    reasonCodes.push(
      "FORECAST_UNAVAILABLE",
    );
  }

  if (
    decisionInput.forecastConfidence === "low"
  ) {
    reasonCodes.push(
      "FORECAST_CONFIDENCE_LOW",
    );
  }

  if (reasonCodes.length > 0) {
    return {
      algorithmVersion:
        WATCH_HEALTHY_RULE_VERSION_V1,
      healthState: "WATCH",
      reasonCodes: [
        "MATERIAL_UNCERTAINTY",
        ...reasonCodes,
      ],
    };
  }

  return {
    algorithmVersion:
      WATCH_HEALTHY_RULE_VERSION_V1,
    healthState: "HEALTHY",
    reasonCodes: [
      "HEALTHY_NO_INTERVENTION",
    ],
  };
}
