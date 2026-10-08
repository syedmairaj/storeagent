import type {
  ConfidenceLevel,
  InventoryActionPriority,
  InventoryActionType,
  InventoryHealthState,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import type {
  DemandTrend,
  InventoryRiskLevel,
} from "@/lib/metrics/types";

/**
 * Canonical deterministic inputs already calculated by
 * metrics / forecasting layers.
 *
 * The decision engine must not recalculate their formulas.
 */
export interface InventoryDecisionInput {
  availableQuantity: UnitQuantity | null;

  validIncomingQuantity: UnitQuantity | null;
  incomingStateKnown: boolean;

  demandVelocity: number | null;
  daysOfStock: number | null;

  leadTimeDays: number | null;

  safetyStockUnits: number | null;
  reorderPointUnits: number | null;
  targetStockUnits: number | null;

  recommendedOrderQuantity: UnitQuantity | null;

  inventoryAgeDays: number | null;

  demandTrend: DemandTrend | null;

  stockoutRisk: InventoryRiskLevel | null;
  overstockRisk: InventoryRiskLevel | null;

  forecastExpectedDemandUnits: number | null;
  forecastConfidence: ConfidenceLevel;

  dataQualityScore: number | null;
}

export type InventoryDecisionReasonCode =
  // Conflict
  | "CONFLICTING_SIGNALS"

  // Replenishment evidence
  | "REORDER_QUANTITY_POSITIVE"
  | "STOCKOUT_RISK_HIGH"
  | "STOCKOUT_RISK_MEDIUM"
  | "BELOW_REORDER_POINT"

  // Excess-inventory evidence
  | "OVERSTOCK_RISK_HIGH"
  | "OVERSTOCK_RISK_MEDIUM"
  | "ABOVE_TARGET_STOCK"

  // Promotion evidence
  | "AGED_INVENTORY"
  | "FALLING_DEMAND"
  | "ZERO_DEMAND"

  // Uncertainty / missing deterministic evidence
  | "MATERIAL_UNCERTAINTY"
  | "INCOMING_STATE_UNKNOWN"
  | "INVENTORY_STATE_UNKNOWN"
  | "DEMAND_STATE_UNKNOWN"
  | "LEAD_TIME_UNKNOWN"
  | "TARGET_STOCK_UNKNOWN"
  | "REORDER_POINT_UNKNOWN"
  | "FORECAST_UNAVAILABLE"
  | "FORECAST_CONFIDENCE_LOW"
  | "DATA_QUALITY_MEDIUM"
  | "DATA_QUALITY_LOW"
  | "DECISION_CONFIDENCE_CAPPED_BY_FORECAST"

  // No-intervention state
  | "HEALTHY_NO_INTERVENTION";

export interface InventoryDecisionResult {
  algorithmVersion: "inventory-decision-v1";

  healthState: InventoryHealthState;

  /**
   * null only when healthState is HEALTHY.
   */
  actionType: InventoryActionType | null;

  /**
   * Compatible interventions that are valid but are not the
   * primary action for this evaluation.
   *
   * V1 currently uses this for REDUCE + PROMOTE.
   */
  compatibleSecondaryActionTypes:
    readonly InventoryActionType[];

  priority: InventoryActionPriority | null;

  recommendedQuantity: UnitQuantity | null;

  confidence: ConfidenceLevel;

  reasonCodes: readonly InventoryDecisionReasonCode[];
}

export interface ReorderRuleResult {
  algorithmVersion: "reorder-rule-v1";

  eligible: boolean;

  recommendedQuantity: UnitQuantity | null;

  reasonCodes: readonly InventoryDecisionReasonCode[];
}

export interface ReduceRuleResult {
  algorithmVersion: "reduce-rule-v1";

  eligible: boolean;

  reasonCodes: readonly InventoryDecisionReasonCode[];
}

export interface PromoteRuleResult {
  algorithmVersion: "promote-rule-v1";

  eligible: boolean;

  reasonCodes: readonly InventoryDecisionReasonCode[];
}

export interface WatchHealthyRuleInput {
  decisionInput: InventoryDecisionInput;

  reorderEligible: boolean;
  reduceEligible: boolean;
  promoteEligible: boolean;
}

export interface WatchHealthyRuleResult {
  algorithmVersion: "watch-healthy-rule-v1";

  healthState: "WATCH" | "HEALTHY" | null;

  reasonCodes: readonly InventoryDecisionReasonCode[];
}

export interface DecisionConflictInput {
  reorderEligible: boolean;
  reduceEligible: boolean;
  promoteEligible: boolean;
}

export interface DecisionConflictResult {
  algorithmVersion: "decision-conflict-v1";

  conflicting: boolean;

  conflictingActionTypes: readonly InventoryActionType[];

  reasonCodes: readonly InventoryDecisionReasonCode[];
}

export interface PrimaryActionSelectionInput {
  reorderEligible: boolean;
  reduceEligible: boolean;
  promoteEligible: boolean;
}

export interface PrimaryActionSelectionResult {
  algorithmVersion: "primary-action-v1";

  actionType: InventoryActionType | null;

  compatibleSecondaryActionTypes:
    readonly InventoryActionType[];
}

export interface DecisionPriorityInput {
  actionType: InventoryActionType;

  decisionInput: InventoryDecisionInput;

  /**
   * True when incompatible deterministic commercial
   * candidates were detected.
   *
   * A conflicting decision must surface as WATCH.
   */
  conflicting: boolean;
}

export interface DecisionPriorityResult {
  algorithmVersion: "decision-priority-v1";

  priority: InventoryActionPriority;
}

export interface DecisionConfidenceInput {
  healthState: InventoryHealthState;

  decisionInput: InventoryDecisionInput;

  conflicting: boolean;

  materialUncertainty: boolean;
}

export interface DecisionConfidenceResult {
  algorithmVersion: "decision-confidence-v1";

  confidence: ConfidenceLevel;

  reasonCodes: readonly InventoryDecisionReasonCode[];
}

export interface InventoryActionEvidenceInput {
  decisionInput: InventoryDecisionInput;

  /**
   * Aggregated deterministic reason codes produced by the
   * selected decision path.
   */
  reasonCodes: readonly InventoryDecisionReasonCode[];
}

export interface DecisionAlgorithmVersions {
  reorder: "reorder-rule-v1";
  reduce: "reduce-rule-v1";
  promote: "promote-rule-v1";
  watchHealthy: "watch-healthy-rule-v1";
  conflict: "decision-conflict-v1";
  primaryAction: "primary-action-v1";
  priority: "decision-priority-v1";
  confidence: "decision-confidence-v1";
}

export interface DecisionReproducibilityDescriptor {
  algorithmVersions: DecisionAlgorithmVersions;
  configurationVersion: string;
}

export interface DecisionReproducibilityResult {
  fingerprint: string;
  descriptor: DecisionReproducibilityDescriptor;
}
