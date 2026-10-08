import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveDecisionConflict,
} from "@/lib/decision-engine/conflict-resolution";

describe("decision-conflict-v1", () => {
  it("does not report conflict when no action is eligible", () => {
    expect(
      resolveDecisionConflict({
        reorderEligible: false,
        reduceEligible: false,
        promoteEligible: false,
      }),
    ).toEqual({
      algorithmVersion:
        "decision-conflict-v1",
      conflicting: false,
      conflictingActionTypes: [],
      reasonCodes: [],
    });
  });

  it("does not report conflict for REORDER alone", () => {
    expect(
      resolveDecisionConflict({
        reorderEligible: true,
        reduceEligible: false,
        promoteEligible: false,
      }).conflicting,
    ).toBe(false);
  });

  it("does not report conflict for REDUCE alone", () => {
    expect(
      resolveDecisionConflict({
        reorderEligible: false,
        reduceEligible: true,
        promoteEligible: false,
      }).conflicting,
    ).toBe(false);
  });

  it("does not report conflict for PROMOTE alone", () => {
    expect(
      resolveDecisionConflict({
        reorderEligible: false,
        reduceEligible: false,
        promoteEligible: true,
      }).conflicting,
    ).toBe(false);
  });

  it("treats REDUCE plus PROMOTE as compatible excess-family signals", () => {
    const result =
      resolveDecisionConflict({
        reorderEligible: false,
        reduceEligible: true,
        promoteEligible: true,
      });

    expect(result.conflicting).toBe(false);

    expect(
      result.conflictingActionTypes,
    ).toEqual([]);
  });

  it("fails closed when REORDER and REDUCE are both eligible", () => {
    const result =
      resolveDecisionConflict({
        reorderEligible: true,
        reduceEligible: true,
        promoteEligible: false,
      });

    expect(result.conflicting).toBe(true);

    expect(
      result.conflictingActionTypes,
    ).toEqual([
      "REORDER",
      "REDUCE",
    ]);

    expect(result.reasonCodes).toEqual([
      "CONFLICTING_SIGNALS",
    ]);
  });

  it("fails closed when REORDER and PROMOTE are both eligible", () => {
    const result =
      resolveDecisionConflict({
        reorderEligible: true,
        reduceEligible: false,
        promoteEligible: true,
      });

    expect(result.conflicting).toBe(true);

    expect(
      result.conflictingActionTypes,
    ).toEqual([
      "REORDER",
      "PROMOTE",
    ]);
  });

  it("reports all incompatible actions when all three candidates exist", () => {
    const result =
      resolveDecisionConflict({
        reorderEligible: true,
        reduceEligible: true,
        promoteEligible: true,
      });

    expect(result.conflicting).toBe(true);

    expect(
      result.conflictingActionTypes,
    ).toEqual([
      "REORDER",
      "REDUCE",
      "PROMOTE",
    ]);

    expect(result.reasonCodes).toContain(
      "CONFLICTING_SIGNALS",
    );
  });
});
