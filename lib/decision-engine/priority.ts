import type {
  DecisionPriorityInput,
  DecisionPriorityResult,
} from "./types";

export const DECISION_PRIORITY_VERSION_V1 =
  "decision-priority-v1" as const;

/**
 * decision-priority-v1
 *
 * Priority answers urgency only.
 *
 * It must not select the commercial action itself.
 */
export function calculateDecisionPriority(
  input: DecisionPriorityInput,
): DecisionPriorityResult {
  const {
    actionType,
    decisionInput,
    conflicting,
  } = input;

  if (actionType === "WATCH") {
    return {
      algorithmVersion:
        DECISION_PRIORITY_VERSION_V1,
      priority:
        conflicting
          ? "high"
          : "medium",
    };
  }

  if (conflicting) {
    throw new Error(
      "Conflicting commercial candidates must surface as WATCH.",
    );
  }

  if (actionType === "REORDER") {
    if (
      decisionInput.stockoutRisk === "high" &&
      decisionInput.daysOfStock !== null &&
      decisionInput.leadTimeDays !== null &&
      decisionInput.daysOfStock <=
        decisionInput.leadTimeDays
    ) {
      return {
        algorithmVersion:
          DECISION_PRIORITY_VERSION_V1,
        priority: "critical",
      };
    }

    if (
      decisionInput.stockoutRisk === "high"
    ) {
      return {
        algorithmVersion:
          DECISION_PRIORITY_VERSION_V1,
        priority: "high",
      };
    }

    if (
      decisionInput.stockoutRisk === "medium"
    ) {
      return {
        algorithmVersion:
          DECISION_PRIORITY_VERSION_V1,
        priority: "medium",
      };
    }

    return {
      algorithmVersion:
        DECISION_PRIORITY_VERSION_V1,
      priority: "low",
    };
  }

  if (actionType === "REDUCE") {
    if (
      decisionInput.overstockRisk === "high"
    ) {
      return {
        algorithmVersion:
          DECISION_PRIORITY_VERSION_V1,
        priority: "high",
      };
    }

    if (
      decisionInput.overstockRisk === "medium"
    ) {
      return {
        algorithmVersion:
          DECISION_PRIORITY_VERSION_V1,
        priority: "medium",
      };
    }

    return {
      algorithmVersion:
        DECISION_PRIORITY_VERSION_V1,
      priority: "low",
    };
  }

  if (actionType === "PROMOTE") {
    const zeroDemand =
      decisionInput.demandVelocity === 0;

    const agedInventory =
      decisionInput.inventoryAgeDays !== null &&
      decisionInput.inventoryAgeDays >= 90;

    if (
      decisionInput.overstockRisk === "high" &&
      (
        zeroDemand ||
        agedInventory
      )
    ) {
      return {
        algorithmVersion:
          DECISION_PRIORITY_VERSION_V1,
        priority: "high",
      };
    }

    if (
      decisionInput.overstockRisk === "high" ||
      decisionInput.overstockRisk === "medium"
    ) {
      return {
        algorithmVersion:
          DECISION_PRIORITY_VERSION_V1,
        priority: "medium",
      };
    }

    return {
      algorithmVersion:
        DECISION_PRIORITY_VERSION_V1,
      priority: "low",
    };
  }

  return {
    algorithmVersion:
      DECISION_PRIORITY_VERSION_V1,
    priority: "low",
  };
}
