import type {
  ReorderRuleResult,
  InventoryDecisionInput,
  InventoryDecisionReasonCode,
} from "./types";

export const REORDER_RULE_VERSION_V1 =
  "reorder-rule-v1" as const;

/**
 * reorder-rule-v1
 *
 * This rule consumes already-calculated deterministic values.
 * It must not recalculate inventory formulas.
 */
export function evaluateReorderRule(
  input: InventoryDecisionInput,
): ReorderRuleResult {
  const reasonCodes:
    InventoryDecisionReasonCode[] = [];

  if (input.availableQuantity === null) {
    reasonCodes.push(
      "INVENTORY_STATE_UNKNOWN",
    );
  }

  if (!input.incomingStateKnown) {
    reasonCodes.push(
      "INCOMING_STATE_UNKNOWN",
    );
  }

  if (input.demandVelocity === null) {
    reasonCodes.push(
      "DEMAND_STATE_UNKNOWN",
    );
  }

  if (input.leadTimeDays === null) {
    reasonCodes.push(
      "LEAD_TIME_UNKNOWN",
    );
  }

  if (input.reorderPointUnits === null) {
    reasonCodes.push(
      "REORDER_POINT_UNKNOWN",
    );
  }

  if (input.targetStockUnits === null) {
    reasonCodes.push(
      "TARGET_STOCK_UNKNOWN",
    );
  }

  if (
    input.availableQuantity === null ||
    !input.incomingStateKnown ||
    input.demandVelocity === null ||
    input.leadTimeDays === null ||
    input.reorderPointUnits === null ||
    input.targetStockUnits === null
  ) {
    return {
      algorithmVersion:
        REORDER_RULE_VERSION_V1,
      eligible: false,
      recommendedQuantity: null,
      reasonCodes,
    };
  }

  if (
    input.recommendedOrderQuantity === null ||
    input.recommendedOrderQuantity <= 0
  ) {
    return {
      algorithmVersion:
        REORDER_RULE_VERSION_V1,
      eligible: false,
      recommendedQuantity: null,
      reasonCodes,
    };
  }

  reasonCodes.push(
    "REORDER_QUANTITY_POSITIVE",
  );

  if (input.stockoutRisk === "high") {
    reasonCodes.push(
      "STOCKOUT_RISK_HIGH",
    );
  } else if (
    input.stockoutRisk === "medium"
  ) {
    reasonCodes.push(
      "STOCKOUT_RISK_MEDIUM",
    );
  }

  const incomingQuantity =
    input.validIncomingQuantity ?? 0;

  const inventoryPosition =
    input.availableQuantity +
    incomingQuantity;

  if (
    inventoryPosition <
    input.reorderPointUnits
  ) {
    reasonCodes.push(
      "BELOW_REORDER_POINT",
    );
  }

  return {
    algorithmVersion:
      REORDER_RULE_VERSION_V1,
    eligible: true,
    recommendedQuantity:
      input.recommendedOrderQuantity,
    reasonCodes,
  };
}
