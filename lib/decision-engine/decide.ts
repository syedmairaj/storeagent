import {
  calculateDecisionConfidence,
} from "./confidence";

import {
  resolveDecisionConflict,
} from "./conflict-resolution";

import {
  selectPrimaryAction,
} from "./primary-action";

import {
  calculateDecisionPriority,
} from "./priority";

import {
  evaluatePromoteRule,
} from "./promote-rule";

import {
  evaluateReduceRule,
} from "./reduce-rule";

import {
  evaluateReorderRule,
} from "./reorder-rule";

import {
  evaluateWatchHealthyRule,
} from "./watch-healthy-rule";

import type {
  InventoryDecisionInput,
  InventoryDecisionReasonCode,
  InventoryDecisionResult,
} from "./types";

export const INVENTORY_DECISION_VERSION_V1 =
  "inventory-decision-v1" as const;

function uniqueReasonCodes(
  codes: readonly InventoryDecisionReasonCode[],
): InventoryDecisionReasonCode[] {
  return [...new Set(codes)];
}

/**
 * inventory-decision-v1
 *
 * Orchestrates already-defined deterministic decision rules.
 *
 * This function does not calculate inventory metrics,
 * forecasts, supplier constraints, or AI output.
 */
export function decideInventoryAction(
  input: InventoryDecisionInput,
): InventoryDecisionResult {
  const reorder =
    evaluateReorderRule(input);

  const reduce =
    evaluateReduceRule(input);

  const promote =
    evaluatePromoteRule(input);

  const conflict =
    resolveDecisionConflict({
      reorderEligible: reorder.eligible,
      reduceEligible: reduce.eligible,
      promoteEligible: promote.eligible,
    });

  if (conflict.conflicting) {
    const confidence =
      calculateDecisionConfidence({
        healthState: "WATCH",
        decisionInput: input,
        conflicting: true,
        materialUncertainty: false,
      });

    const priority =
      calculateDecisionPriority({
        actionType: "WATCH",
        decisionInput: input,
        conflicting: true,
      });

    return {
      algorithmVersion:
        INVENTORY_DECISION_VERSION_V1,
      healthState: "WATCH",
      actionType: "WATCH",
      compatibleSecondaryActionTypes: [],
      priority: priority.priority,
      recommendedQuantity: null,
      confidence: confidence.confidence,
      reasonCodes: uniqueReasonCodes([
        ...conflict.reasonCodes,
        ...confidence.reasonCodes,
      ]),
    };
  }

  const primary =
    selectPrimaryAction({
      reorderEligible: reorder.eligible,
      reduceEligible: reduce.eligible,
      promoteEligible: promote.eligible,
    });

  if (primary.actionType !== null) {
    const selectedReasonCodes =
      primary.actionType === "REORDER"
        ? reorder.reasonCodes
        : primary.actionType === "REDUCE"
          ? reduce.reasonCodes
          : promote.reasonCodes;

    const confidence =
      calculateDecisionConfidence({
        healthState: primary.actionType,
        decisionInput: input,
        conflicting: false,
        materialUncertainty: false,
      });

    const priority =
      calculateDecisionPriority({
        actionType: primary.actionType,
        decisionInput: input,
        conflicting: false,
      });

    return {
      algorithmVersion:
        INVENTORY_DECISION_VERSION_V1,
      healthState: primary.actionType,
      actionType: primary.actionType,
      compatibleSecondaryActionTypes:
        primary.compatibleSecondaryActionTypes,
      priority: priority.priority,
      recommendedQuantity:
        primary.actionType === "REORDER"
          ? reorder.recommendedQuantity
          : null,
      confidence: confidence.confidence,
      reasonCodes: uniqueReasonCodes([
        ...selectedReasonCodes,
        ...confidence.reasonCodes,
      ]),
    };
  }

  const fallback =
    evaluateWatchHealthyRule({
      decisionInput: input,
      reorderEligible: reorder.eligible,
      reduceEligible: reduce.eligible,
      promoteEligible: promote.eligible,
    });

  if (fallback.healthState === null) {
    throw new Error(
      "Decision orchestration reached an invalid fallback state.",
    );
  }

  const materialUncertainty =
    fallback.healthState === "WATCH";

  const confidence =
    calculateDecisionConfidence({
      healthState: fallback.healthState,
      decisionInput: input,
      conflicting: false,
      materialUncertainty,
    });

  if (fallback.healthState === "HEALTHY") {
    return {
      algorithmVersion:
        INVENTORY_DECISION_VERSION_V1,
      healthState: "HEALTHY",
      actionType: null,
      compatibleSecondaryActionTypes: [],
      priority: null,
      recommendedQuantity: null,
      confidence: confidence.confidence,
      reasonCodes: uniqueReasonCodes([
        ...fallback.reasonCodes,
        ...confidence.reasonCodes,
      ]),
    };
  }

  const priority =
    calculateDecisionPriority({
      actionType: "WATCH",
      decisionInput: input,
      conflicting: false,
    });

  return {
    algorithmVersion:
      INVENTORY_DECISION_VERSION_V1,
    healthState: "WATCH",
    actionType: "WATCH",
    compatibleSecondaryActionTypes: [],
    priority: priority.priority,
    recommendedQuantity: null,
    confidence: confidence.confidence,
    reasonCodes: uniqueReasonCodes([
      ...fallback.reasonCodes,
      ...confidence.reasonCodes,
    ]),
  };
}
