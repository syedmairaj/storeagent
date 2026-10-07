import type {
  ActionEvent,
  InventoryAction,
  InventoryActionStatus,
} from "./types";

const TERMINAL_ACTION_STATUSES: ReadonlySet<InventoryActionStatus> = new Set([
  "dismissed",
  "completed",
  "expired",
  "superseded",
]);

export function isTerminalActionStatus(
  status: InventoryActionStatus,
): boolean {
  return TERMINAL_ACTION_STATUSES.has(status);
}

export function canTransitionActionStatus(
  from: InventoryActionStatus,
  to: InventoryActionStatus,
): boolean {
  if (from === to) {
    return true;
  }

  if (isTerminalActionStatus(from)) {
    return false;
  }

  const allowed: Record<
    InventoryActionStatus,
    readonly InventoryActionStatus[]
  > = {
    new: [
      "accepted",
      "accepted_with_edit",
      "dismissed",
      "expired",
      "superseded",
    ],
    accepted: ["completed", "superseded"],
    accepted_with_edit: ["completed", "superseded"],
    dismissed: [],
    completed: [],
    expired: [],
    superseded: [],
  };

  return allowed[from].includes(to);
}

export function supersedeAction(
  action: Pick<InventoryAction, "id" | "status" | "supersededByActionId">,
  newActionId: string,
): Pick<InventoryAction, "id" | "status" | "supersededByActionId"> {
  if (!canTransitionActionStatus(action.status, "superseded")) {
    throw new Error(
      `Action ${action.id} cannot transition from ${action.status} to superseded.`,
    );
  }

  if (action.id === newActionId) {
    throw new Error("An action cannot supersede itself.");
  }

  return {
    ...action,
    status: "superseded",
    supersededByActionId: newActionId,
  };
}

export function actionEventPreservesOriginalRecommendation(
  action: Pick<InventoryAction, "recommendedQuantity">,
  event: Pick<ActionEvent, "eventType" | "editedQuantity">,
): boolean {
  if (event.eventType !== "accepted_with_edit") {
    return event.editedQuantity === null;
  }

  return (
    event.editedQuantity !== null &&
    event.editedQuantity !== action.recommendedQuantity
  );
}
