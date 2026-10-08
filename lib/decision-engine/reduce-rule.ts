import type {
  InventoryDecisionInput,
  InventoryDecisionReasonCode,
  ReduceRuleResult,
} from "./types";

export const REDUCE_RULE_VERSION_V1 =
  "reduce-rule-v1" as const;

/**
 * reduce-rule-v1
 *
 * REDUCE protects against additional inventory exposure.
 *
 * It requires trusted incoming inventory plus deterministic
 * excess-inventory evidence.
 *
 * Existing excess stock with no incoming supply is not enough
 * for REDUCE; PROMOTE handles demand-generation intervention.
 */
export function evaluateReduceRule(
  input: InventoryDecisionInput,
): ReduceRuleResult {
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

  if (input.targetStockUnits === null) {
    reasonCodes.push(
      "TARGET_STOCK_UNKNOWN",
    );
  }

  if (
    input.availableQuantity === null ||
    !input.incomingStateKnown ||
    input.targetStockUnits === null
  ) {
    return {
      algorithmVersion:
        REDUCE_RULE_VERSION_V1,
      eligible: false,
      reasonCodes,
    };
  }

  const incomingQuantity =
    input.validIncomingQuantity ?? 0;

  if (incomingQuantity <= 0) {
    return {
      algorithmVersion:
        REDUCE_RULE_VERSION_V1,
      eligible: false,
      reasonCodes,
    };
  }

  const inventoryPosition =
    input.availableQuantity +
    incomingQuantity;

  const aboveTarget =
    inventoryPosition >
    input.targetStockUnits;

  if (aboveTarget) {
    reasonCodes.push(
      "ABOVE_TARGET_STOCK",
    );
  }

  if (input.overstockRisk === "high") {
    reasonCodes.push(
      "OVERSTOCK_RISK_HIGH",
    );
  } else if (
    input.overstockRisk === "medium"
  ) {
    reasonCodes.push(
      "OVERSTOCK_RISK_MEDIUM",
    );
  }

  const hasExcessEvidence =
    aboveTarget &&
    (
      input.overstockRisk === "high" ||
      input.overstockRisk === "medium"
    );

  return {
    algorithmVersion:
      REDUCE_RULE_VERSION_V1,
    eligible: hasExcessEvidence,
    reasonCodes,
  };
}
