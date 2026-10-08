import type {
  InventoryDecisionInput,
  InventoryDecisionReasonCode,
  PromoteRuleResult,
} from "./types";

export const PROMOTE_RULE_VERSION_V1 =
  "promote-rule-v1" as const;

export const PROMOTE_AGED_INVENTORY_DAYS_V1 =
  90;

/**
 * promote-rule-v1
 *
 * PROMOTE addresses excess inventory already on hand
 * when demand-generation attention is warranted.
 *
 * It does not manage incoming purchase-order exposure.
 */
export function evaluatePromoteRule(
  input: InventoryDecisionInput,
): PromoteRuleResult {
  const reasonCodes:
    InventoryDecisionReasonCode[] = [];

  if (input.availableQuantity === null) {
    reasonCodes.push(
      "INVENTORY_STATE_UNKNOWN",
    );
  }

  if (input.targetStockUnits === null) {
    reasonCodes.push(
      "TARGET_STOCK_UNKNOWN",
    );
  }

  if (input.demandVelocity === null) {
    reasonCodes.push(
      "DEMAND_STATE_UNKNOWN",
    );
  }

  if (
    input.availableQuantity === null ||
    input.targetStockUnits === null ||
    input.demandVelocity === null
  ) {
    return {
      algorithmVersion:
        PROMOTE_RULE_VERSION_V1,
      eligible: false,
      reasonCodes,
    };
  }

  if (input.availableQuantity <= 0) {
    return {
      algorithmVersion:
        PROMOTE_RULE_VERSION_V1,
      eligible: false,
      reasonCodes,
    };
  }

  const aboveTarget =
    input.availableQuantity >
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

  const agedInventory =
    input.inventoryAgeDays !== null &&
    input.inventoryAgeDays >=
      PROMOTE_AGED_INVENTORY_DAYS_V1;

  if (agedInventory) {
    reasonCodes.push(
      "AGED_INVENTORY",
    );
  }

  const fallingDemand =
    input.demandTrend === "falling";

  if (fallingDemand) {
    reasonCodes.push(
      "FALLING_DEMAND",
    );
  }

  const zeroDemand =
    input.demandVelocity === 0;

  if (zeroDemand) {
    reasonCodes.push(
      "ZERO_DEMAND",
    );
  }

  const excessEvidence =
    aboveTarget &&
    (
      input.overstockRisk === "high" ||
      input.overstockRisk === "medium"
    );

  const demandPressure =
    agedInventory ||
    fallingDemand ||
    zeroDemand;

  return {
    algorithmVersion:
      PROMOTE_RULE_VERSION_V1,
    eligible:
      excessEvidence &&
      demandPressure,
    reasonCodes,
  };
}
