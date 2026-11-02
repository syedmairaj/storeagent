/**
 * Trusted next-step codes and copy for deterministic fallback briefs.
 * WATCH is restricted to investigate / dismiss / no_execution.
 */

import type {
  DecisionBriefActionType,
  DecisionBriefNextStepCode,
  DecisionBriefRejectionCode,
} from "@/lib/decision-brief/types";

const WATCH_ALLOWED_NEXT_STEPS =
  new Set<DecisionBriefNextStepCode>([
    "investigate_watch",
    "dismiss_watch",
    "no_execution",
  ]);

const PURCHASE_IMPLICATION_NEXT_STEPS =
  new Set<DecisionBriefNextStepCode>([
    "review_reorder",
    "edit_reorder_quantity",
  ]);

export function defaultNextStepCode(
  actionType: DecisionBriefActionType,
): DecisionBriefNextStepCode {
  switch (
    actionType
  ) {
    case "REORDER":
      return "review_reorder";
    case "REDUCE":
      return "reduce_incoming_exposure";
    case "PROMOTE":
      return "plan_promotion";
    case "WATCH":
      return "investigate_watch";
    default: {
      const _exhaustive: never =
        actionType;
      return _exhaustive;
    }
  }
}

export function defaultNextStepSummary(
  actionType: DecisionBriefActionType,
): string {
  switch (
    actionType
  ) {
    case "REORDER":
      return "Review the recommended reorder quantity before taking any further step.";
    case "REDUCE":
      return "Reduce additional incoming exposure for this SKU.";
    case "PROMOTE":
      return "Plan a promotion to clear aging or soft-demand stock.";
    case "WATCH":
      return "Investigate conflicting or incomplete signals before intervening.";
    default: {
      const _exhaustive: never =
        actionType;
      return _exhaustive;
    }
  }
}

export function actionTypeLabel(
  actionType: DecisionBriefActionType,
): string {
  switch (
    actionType
  ) {
    case "REORDER":
      return "Reorder";
    case "REDUCE":
      return "Reduce";
    case "PROMOTE":
      return "Promote";
    case "WATCH":
      return "Watch";
    default: {
      const _exhaustive: never =
        actionType;
      return _exhaustive;
    }
  }
}

export type NextStepPolicyResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
    };

/**
 * Fail-closed next-step policy. WATCH must never emit purchase-family codes.
 */
export function assessBriefNextStepPolicy(
  actionType: DecisionBriefActionType,
  nextStepCode: DecisionBriefNextStepCode,
): NextStepPolicyResult {
  if (
    actionType === "WATCH"
  ) {
    if (
      !WATCH_ALLOWED_NEXT_STEPS.has(
        nextStepCode,
      )
    ) {
      return {
        ok: false,
        reasons: [
          "AI_WATCH_PURCHASE_IMPLICATION",
        ],
        detail:
          "WATCH briefs may only use investigate_watch, dismiss_watch, or no_execution next-step codes.",
      };
    }

    if (
      PURCHASE_IMPLICATION_NEXT_STEPS.has(
        nextStepCode,
      )
    ) {
      return {
        ok: false,
        reasons: [
          "AI_WATCH_PURCHASE_IMPLICATION",
        ],
        detail:
          "WATCH briefs must not imply a purchase recommendation.",
      };
    }
  }

  if (
    actionType === "REORDER" &&
    (
      nextStepCode === "reduce_incoming_exposure" ||
      nextStepCode === "plan_promotion" ||
      nextStepCode === "investigate_watch" ||
      nextStepCode === "dismiss_watch"
    )
  ) {
    return {
      ok: false,
      reasons: [
        "GROUNDING_INCOMPLETE",
      ],
      detail:
        "REORDER next-step code is inconsistent with action type policy.",
    };
  }

  return {
    ok: true,
  };
}

export function isWatchPurchaseImplicationText(
  text: string,
): boolean {
  const normalized =
    text.toLowerCase();

  for (
    const needle of [
      "reorder recommended",
      "buy now",
      "place a purchase order",
      "order anyway",
      "purchase recommended",
      "supplier contacted",
      "po placed",
    ]
  ) {
    if (
      normalized.includes(needle)
    ) {
      return true;
    }
  }

  return false;
}
