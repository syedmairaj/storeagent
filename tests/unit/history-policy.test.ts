import { describe, expect, it } from "vitest";

import {
  actionEventPreservesOriginalRecommendation,
  canTransitionActionStatus,
  isTerminalActionStatus,
  supersedeAction,
} from "@/lib/commerce-domain/history-policy";

describe("StoreAgent history policy", () => {
  it("allows valid new-action transitions", () => {
    expect(canTransitionActionStatus("new", "accepted")).toBe(true);
    expect(canTransitionActionStatus("new", "accepted_with_edit")).toBe(true);
    expect(canTransitionActionStatus("new", "dismissed")).toBe(true);
    expect(canTransitionActionStatus("new", "expired")).toBe(true);
    expect(canTransitionActionStatus("new", "superseded")).toBe(true);
  });

  it("allows accepted actions to complete", () => {
    expect(canTransitionActionStatus("accepted", "completed")).toBe(true);
    expect(
      canTransitionActionStatus("accepted_with_edit", "completed"),
    ).toBe(true);
  });

  it("prevents terminal history from reopening", () => {
    expect(isTerminalActionStatus("completed")).toBe(true);
    expect(canTransitionActionStatus("completed", "new")).toBe(false);
    expect(canTransitionActionStatus("dismissed", "accepted")).toBe(false);
    expect(canTransitionActionStatus("expired", "accepted")).toBe(false);
  });

  it("supersedes without replacing original identity", () => {
    const result = supersedeAction(
      {
        id: "action-old",
        status: "new",
        supersededByActionId: null,
      },
      "action-new",
    );

    expect(result.id).toBe("action-old");
    expect(result.status).toBe("superseded");
    expect(result.supersededByActionId).toBe("action-new");
  });

  it("rejects self-supersession", () => {
    expect(() =>
      supersedeAction(
        {
          id: "action-1",
          status: "new",
          supersededByActionId: null,
        },
        "action-1",
      ),
    ).toThrow("An action cannot supersede itself.");
  });

  it("keeps merchant-edited quantity separate from original recommendation", () => {
    const action = {
      recommendedQuantity: 40,
    };

    expect(
      actionEventPreservesOriginalRecommendation(action, {
        eventType: "accepted_with_edit",
        editedQuantity: 25,
      }),
    ).toBe(true);

    expect(action.recommendedQuantity).toBe(40);
  });

  it("rejects invalid edited-quantity events", () => {
    const action = {
      recommendedQuantity: 40,
    };

    expect(
      actionEventPreservesOriginalRecommendation(action, {
        eventType: "accepted_with_edit",
        editedQuantity: null,
      }),
    ).toBe(false);

    expect(
      actionEventPreservesOriginalRecommendation(action, {
        eventType: "accepted_with_edit",
        editedQuantity: 40,
      }),
    ).toBe(false);
  });

  it("does not allow edited quantity on ordinary acceptance", () => {
    expect(
      actionEventPreservesOriginalRecommendation(
        {
          recommendedQuantity: 40,
        },
        {
          eventType: "accepted",
          editedQuantity: 25,
        },
      ),
    ).toBe(false);
  });
});
