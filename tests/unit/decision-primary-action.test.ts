import {
  describe,
  expect,
  it,
} from "vitest";

import {
  selectPrimaryAction,
} from "@/lib/decision-engine/primary-action";

describe("primary-action-v1", () => {
  it("returns null when no commercial candidate exists", () => {
    expect(
      selectPrimaryAction({
        reorderEligible: false,
        reduceEligible: false,
        promoteEligible: false,
      }),
    ).toEqual({
      algorithmVersion:
        "primary-action-v1",
      actionType: null,
      compatibleSecondaryActionTypes: [],
    });
  });

  it("selects REORDER when REORDER is the only candidate", () => {
    expect(
      selectPrimaryAction({
        reorderEligible: true,
        reduceEligible: false,
        promoteEligible: false,
      }).actionType,
    ).toBe("REORDER");
  });

  it("selects REDUCE when REDUCE is the only candidate", () => {
    expect(
      selectPrimaryAction({
        reorderEligible: false,
        reduceEligible: true,
        promoteEligible: false,
      }).actionType,
    ).toBe("REDUCE");
  });

  it("selects PROMOTE when PROMOTE is the only candidate", () => {
    expect(
      selectPrimaryAction({
        reorderEligible: false,
        reduceEligible: false,
        promoteEligible: true,
      }).actionType,
    ).toBe("PROMOTE");
  });

  it("selects REDUCE first and preserves PROMOTE as compatible secondary action", () => {
    expect(
      selectPrimaryAction({
        reorderEligible: false,
        reduceEligible: true,
        promoteEligible: true,
      }),
    ).toEqual({
      algorithmVersion:
        "primary-action-v1",
      actionType: "REDUCE",
      compatibleSecondaryActionTypes: [
        "PROMOTE",
      ],
    });
  });

  it("refuses to resolve REORDER plus REDUCE by precedence", () => {
    expect(() =>
      selectPrimaryAction({
        reorderEligible: true,
        reduceEligible: true,
        promoteEligible: false,
      }),
    ).toThrow(
      "Conflicting action candidates must be resolved before primary-action selection.",
    );
  });

  it("refuses to resolve REORDER plus PROMOTE by precedence", () => {
    expect(() =>
      selectPrimaryAction({
        reorderEligible: true,
        reduceEligible: false,
        promoteEligible: true,
      }),
    ).toThrow(
      "Conflicting action candidates must be resolved before primary-action selection.",
    );
  });
});
