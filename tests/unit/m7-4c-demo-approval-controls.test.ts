import {
  describe,
  expect,
  it,
} from "vitest";

import {
  demoActionShowsRecommendedQuantity,
  getM7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  canInteractWithDemoApprovals,
  DEMO_NO_SAVE_MESSAGE,
  DEMO_VIEW_ONLY_MESSAGE,
  demoDismissControlLabel,
  demoPrimaryControlLabel,
  validateDemoReorderEditQuantity,
} from "@/lib/demo/m7-decision-demo-controls";

describe("M7.4c demonstration approval controls", () => {
  it("exposes decide-role interactivity only for owner/admin/operator", () => {
    expect(canInteractWithDemoApprovals("owner")).toBe(true);
    expect(canInteractWithDemoApprovals("admin")).toBe(true);
    expect(canInteractWithDemoApprovals("operator")).toBe(true);
    expect(canInteractWithDemoApprovals("analyst")).toBe(false);
  });

  it("validates REORDER edit quantity as positive integer differing from recommendation", () => {
    expect(
      validateDemoReorderEditQuantity("24", 24),
    ).toEqual({
      ok: false,
      reason: "unchanged_from_recommendation",
    });

    expect(
      validateDemoReorderEditQuantity("0", 24),
    ).toEqual({
      ok: false,
      reason: "not_positive_integer",
    });

    expect(
      validateDemoReorderEditQuantity("-3", 24),
    ).toEqual({
      ok: false,
      reason: "not_positive_integer",
    });

    expect(
      validateDemoReorderEditQuantity("12.5", 24),
    ).toEqual({
      ok: false,
      reason: "not_positive_integer",
    });

    expect(
      validateDemoReorderEditQuantity("30", 24),
    ).toEqual({
      ok: true,
      quantity: 30,
    });
  });

  it("preserves original REORDER recommended quantity on fixtures", () => {
    const root = getM7DecisionDemoFixtureRoot();
    const reorder = root.actions.find(
      (action) => action.actionType === "REORDER",
    );

    expect(reorder).toBeDefined();
    expect(reorder?.recommendedQuantity).toBeGreaterThan(0);
    expect(
      demoActionShowsRecommendedQuantity(reorder!),
    ).toBe(true);
  });

  it("does not expose quantity editing for non-REORDER fixture actions", () => {
    const root = getM7DecisionDemoFixtureRoot();

    for (const action of root.actions) {
      if (action.actionType === "REORDER") {
        continue;
      }

      expect(
        demoActionShowsRecommendedQuantity(action),
      ).toBe(false);
      expect(action.recommendedQuantity).toBeNull();
    }
  });

  it("uses acknowledge/review language for WATCH, not buying language", () => {
    expect(
      demoPrimaryControlLabel("WATCH"),
    ).toBe("Acknowledge review");
    expect(
      demoDismissControlLabel("WATCH"),
    ).toBe("Dismiss watch");
    expect(
      demoPrimaryControlLabel("REORDER"),
    ).toBe("Approve recommendation");

    for (const label of [
      demoPrimaryControlLabel("WATCH"),
      demoDismissControlLabel("WATCH"),
    ]) {
      expect(label.toLowerCase()).not.toContain("buy");
      expect(label.toLowerCase()).not.toContain("purchase");
      expect(label.toLowerCase()).not.toContain("order");
    }
  });

  it("keeps canonical no-save and view-only copy", () => {
    expect(DEMO_NO_SAVE_MESSAGE).toBe(
      "Demonstration only — no action was saved.",
    );
    expect(DEMO_VIEW_ONLY_MESSAGE).toBe(
      "View only — demonstration",
    );
  });
});
