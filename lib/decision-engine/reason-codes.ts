import type {
  InventoryDecisionReasonCode,
} from "./types";

export type InventoryDecisionReasonKind =
  | "conflict"
  | "replenishment"
  | "excess"
  | "promotion"
  | "uncertainty"
  | "healthy";

export interface InventoryDecisionReasonDefinition {
  code: InventoryDecisionReasonCode;
  kind: InventoryDecisionReasonKind;

  /**
   * Stable deterministic meaning for audit/debugging.
   *
   * Merchant-facing prose may later be generated separately.
   */
  meaning: string;
}

export const INVENTORY_DECISION_REASON_DEFINITIONS = {
  CONFLICTING_SIGNALS: {
    code: "CONFLICTING_SIGNALS",
    kind: "conflict",
    meaning:
      "Deterministic evidence supports incompatible commercial interventions.",
  },

  REORDER_QUANTITY_POSITIVE: {
    code: "REORDER_QUANTITY_POSITIVE",
    kind: "replenishment",
    meaning:
      "The deterministic recommended order quantity is greater than zero.",
  },

  STOCKOUT_RISK_HIGH: {
    code: "STOCKOUT_RISK_HIGH",
    kind: "replenishment",
    meaning:
      "The deterministic stockout-risk calculation is high.",
  },

  STOCKOUT_RISK_MEDIUM: {
    code: "STOCKOUT_RISK_MEDIUM",
    kind: "replenishment",
    meaning:
      "The deterministic stockout-risk calculation is medium.",
  },

  BELOW_REORDER_POINT: {
    code: "BELOW_REORDER_POINT",
    kind: "replenishment",
    meaning:
      "Trusted inventory position is below the deterministic reorder point.",
  },

  OVERSTOCK_RISK_HIGH: {
    code: "OVERSTOCK_RISK_HIGH",
    kind: "excess",
    meaning:
      "The deterministic overstock-risk calculation is high.",
  },

  OVERSTOCK_RISK_MEDIUM: {
    code: "OVERSTOCK_RISK_MEDIUM",
    kind: "excess",
    meaning:
      "The deterministic overstock-risk calculation is medium.",
  },

  ABOVE_TARGET_STOCK: {
    code: "ABOVE_TARGET_STOCK",
    kind: "excess",
    meaning:
      "Trusted inventory position is materially above deterministic target stock.",
  },

  AGED_INVENTORY: {
    code: "AGED_INVENTORY",
    kind: "promotion",
    meaning:
      "Trusted inventory age supports demand-generation attention.",
  },

  FALLING_DEMAND: {
    code: "FALLING_DEMAND",
    kind: "promotion",
    meaning:
      "Deterministic demand trend is falling.",
  },

  ZERO_DEMAND: {
    code: "ZERO_DEMAND",
    kind: "promotion",
    meaning:
      "Demand is known to be zero rather than unknown.",
  },

  MATERIAL_UNCERTAINTY: {
    code: "MATERIAL_UNCERTAINTY",
    kind: "uncertainty",
    meaning:
      "Material uncertainty prevents a safer commercial intervention.",
  },

  INCOMING_STATE_UNKNOWN: {
    code: "INCOMING_STATE_UNKNOWN",
    kind: "uncertainty",
    meaning:
      "Incoming inventory state is not trustworthy enough for the decision.",
  },

  INVENTORY_STATE_UNKNOWN: {
    code: "INVENTORY_STATE_UNKNOWN",
    kind: "uncertainty",
    meaning:
      "Available inventory is unknown.",
  },

  DEMAND_STATE_UNKNOWN: {
    code: "DEMAND_STATE_UNKNOWN",
    kind: "uncertainty",
    meaning:
      "Demand state is unknown.",
  },

  LEAD_TIME_UNKNOWN: {
    code: "LEAD_TIME_UNKNOWN",
    kind: "uncertainty",
    meaning:
      "Supplier lead time is unknown.",
  },

  TARGET_STOCK_UNKNOWN: {
    code: "TARGET_STOCK_UNKNOWN",
    kind: "uncertainty",
    meaning:
      "Deterministic target stock is unavailable.",
  },

  REORDER_POINT_UNKNOWN: {
    code: "REORDER_POINT_UNKNOWN",
    kind: "uncertainty",
    meaning:
      "Deterministic reorder point is unavailable.",
  },

  FORECAST_UNAVAILABLE: {
    code: "FORECAST_UNAVAILABLE",
    kind: "uncertainty",
    meaning:
      "A trusted deterministic forecast is unavailable.",
  },

  FORECAST_CONFIDENCE_LOW: {
    code: "FORECAST_CONFIDENCE_LOW",
    kind: "uncertainty",
    meaning:
      "The deterministic forecast confidence is low.",
  },

  DATA_QUALITY_MEDIUM: {
    code: "DATA_QUALITY_MEDIUM",
    kind: "uncertainty",
    meaning:
      "Data quality caps decision confidence at medium.",
  },

  DATA_QUALITY_LOW: {
    code: "DATA_QUALITY_LOW",
    kind: "uncertainty",
    meaning:
      "Data quality caps decision confidence at low.",
  },

  DECISION_CONFIDENCE_CAPPED_BY_FORECAST: {
    code: "DECISION_CONFIDENCE_CAPPED_BY_FORECAST",
    kind: "uncertainty",
    meaning:
      "Decision confidence cannot exceed deterministic forecast confidence.",
  },

  HEALTHY_NO_INTERVENTION: {
    code: "HEALTHY_NO_INTERVENTION",
    kind: "healthy",
    meaning:
      "Trusted evidence does not support a merchant intervention.",
  },
} as const satisfies Record<
  InventoryDecisionReasonCode,
  InventoryDecisionReasonDefinition
>;

export function getInventoryDecisionReasonDefinition(
  code: InventoryDecisionReasonCode,
): InventoryDecisionReasonDefinition {
  return INVENTORY_DECISION_REASON_DEFINITIONS[
    code
  ];
}
