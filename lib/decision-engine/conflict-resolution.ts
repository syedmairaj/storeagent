import type {
  DecisionConflictInput,
  DecisionConflictResult,
} from "./types";

import type {
  InventoryActionType,
} from "@/lib/commerce-domain/types";

export const DECISION_CONFLICT_VERSION_V1 =
  "decision-conflict-v1" as const;

/**
 * decision-conflict-v1
 *
 * Replenishment and excess-inventory interventions are
 * contradictory when they are simultaneously eligible.
 *
 * REDUCE + PROMOTE is not inherently contradictory:
 * both may describe the same excess-inventory situation.
 *
 * Primary-action selection belongs to the later precedence
 * layer, not to conflict detection.
 */
export function resolveDecisionConflict(
  input: DecisionConflictInput,
): DecisionConflictResult {
  const excessCandidateExists =
    input.reduceEligible ||
    input.promoteEligible;

  if (
    !input.reorderEligible ||
    !excessCandidateExists
  ) {
    return {
      algorithmVersion:
        DECISION_CONFLICT_VERSION_V1,
      conflicting: false,
      conflictingActionTypes: [],
      reasonCodes: [],
    };
  }

  const conflictingActionTypes:
    InventoryActionType[] = [
      "REORDER",
    ];

  if (input.reduceEligible) {
    conflictingActionTypes.push(
      "REDUCE",
    );
  }

  if (input.promoteEligible) {
    conflictingActionTypes.push(
      "PROMOTE",
    );
  }

  return {
    algorithmVersion:
      DECISION_CONFLICT_VERSION_V1,
    conflicting: true,
    conflictingActionTypes,
    reasonCodes: [
      "CONFLICTING_SIGNALS",
    ],
  };
}
