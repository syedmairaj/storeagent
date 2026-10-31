/**
 * M7.4c demonstration-only approval control helpers.
 * Local UI teaching aids — never persistence or lifecycle RPCs.
 */

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import type {
  DemoActionType,
} from "@/lib/demo/m7-decision-demo-fixtures";

export const DEMO_NO_SAVE_MESSAGE =
  "Demonstration only — no action was saved." as const;

export const DEMO_VIEW_ONLY_MESSAGE =
  "View only — demonstration" as const;

const DECIDE_ROLES =
  new Set<OrganizationMemberRole>([
    "owner",
    "admin",
    "operator",
  ]);

export function isDemoDecideRole(
  role: OrganizationMemberRole,
): boolean {
  return DECIDE_ROLES.has(role);
}

export function canInteractWithDemoApprovals(
  role: OrganizationMemberRole,
): boolean {
  return isDemoDecideRole(role);
}

export type DemoQuantityValidation =
  | {
      ok: true;
      quantity: number;
    }
  | {
      ok: false;
      reason:
        | "not_positive_integer"
        | "unchanged_from_recommendation";
    };

/**
 * REORDER edit prototype: positive integer, and must differ from the
 * fixture recommendation to teach accept-with-edit semantics (still local).
 */
export function validateDemoReorderEditQuantity(
  raw: string,
  recommendedQuantity: number,
): DemoQuantityValidation {
  const trimmed =
    raw.trim();

  if (
    !/^\d+$/.test(trimmed)
  ) {
    return {
      ok: false,
      reason: "not_positive_integer",
    };
  }

  const quantity =
    Number(trimmed);

  if (
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return {
      ok: false,
      reason: "not_positive_integer",
    };
  }

  if (
    quantity === recommendedQuantity
  ) {
    return {
      ok: false,
      reason: "unchanged_from_recommendation",
    };
  }

  return {
    ok: true,
    quantity,
  };
}

export type DemoQuantityValidationReason =
  | "not_positive_integer"
  | "unchanged_from_recommendation";

export function demoQuantityValidationMessage(
  reason: DemoQuantityValidationReason,
): string {
  switch (
    reason
  ) {
    case "not_positive_integer":
      return "Enter a positive whole number.";
    case "unchanged_from_recommendation":
      return "Change the quantity to practice an edit. Nothing will be saved.";
    default:
      return "Invalid quantity.";
  }
}

export function demoPrimaryControlLabel(
  actionType: DemoActionType,
): string {
  if (
    actionType === "WATCH"
  ) {
    return "Acknowledge review";
  }

  return "Approve recommendation";
}

export function demoDismissControlLabel(
  actionType: DemoActionType,
): string {
  if (
    actionType === "WATCH"
  ) {
    return "Dismiss watch";
  }

  return "Dismiss";
}

export function demoPrimaryControlDescription(
  actionType: DemoActionType,
): string {
  if (
    actionType === "WATCH"
  ) {
    return "Demonstration acknowledge only. No inventory action is saved.";
  }

  return "Demonstration approve only. No inventory action is saved.";
}
