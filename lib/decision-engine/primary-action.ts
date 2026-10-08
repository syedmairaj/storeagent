import type {
  InventoryActionType,
} from "@/lib/commerce-domain/types";

import type {
  PrimaryActionSelectionInput,
  PrimaryActionSelectionResult,
} from "./types";

export const PRIMARY_ACTION_VERSION_V1 =
  "primary-action-v1" as const;

/**
 * primary-action-v1
 *
 * This function selects among compatible commercial
 * candidates only.
 *
 * REORDER combined with REDUCE/PROMOTE is a conflict and
 * must be handled before this function is called.
 */
export function selectPrimaryAction(
  input: PrimaryActionSelectionInput,
): PrimaryActionSelectionResult {
  const {
    reorderEligible,
    reduceEligible,
    promoteEligible,
  } = input;

  const hasExcessCandidate =
    reduceEligible ||
    promoteEligible;

  if (
    reorderEligible &&
    hasExcessCandidate
  ) {
    throw new Error(
      "Conflicting action candidates must be resolved before primary-action selection.",
    );
  }

  if (reorderEligible) {
    return {
      algorithmVersion:
        PRIMARY_ACTION_VERSION_V1,
      actionType: "REORDER",
      compatibleSecondaryActionTypes: [],
    };
  }

  if (
    reduceEligible &&
    promoteEligible
  ) {
    return {
      algorithmVersion:
        PRIMARY_ACTION_VERSION_V1,
      actionType: "REDUCE",
      compatibleSecondaryActionTypes: [
        "PROMOTE",
      ],
    };
  }

  if (reduceEligible) {
    return {
      algorithmVersion:
        PRIMARY_ACTION_VERSION_V1,
      actionType: "REDUCE",
      compatibleSecondaryActionTypes: [],
    };
  }

  if (promoteEligible) {
    return {
      algorithmVersion:
        PRIMARY_ACTION_VERSION_V1,
      actionType: "PROMOTE",
      compatibleSecondaryActionTypes: [],
    };
  }

  const noSecondaryActions:
    InventoryActionType[] = [];

  return {
    algorithmVersion:
      PRIMARY_ACTION_VERSION_V1,
    actionType: null,
    compatibleSecondaryActionTypes:
      noSecondaryActions,
  };
}
