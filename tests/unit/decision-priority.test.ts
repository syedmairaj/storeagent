import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateDecisionPriority,
} from "@/lib/decision-engine/priority";

import type {
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

function decisionInput(
  overrides: Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 20,
    validIncomingQuantity: 0,
    incomingStateKnown: true,

    demandVelocity: 5,
    daysOfStock: 4,

    leadTimeDays: 7,

    safetyStockUnits: 10,
    reorderPointUnits: 45,
    targetStockUnits: 70,

    recommendedOrderQuantity: 50,

    inventoryAgeDays: 30,

    demandTrend: "stable",

    stockoutRisk: "high",
    overstockRisk: "low",

    forecastExpectedDemandUnits: 35,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}

describe("decision-priority-v1", () => {
  it("makes REORDER critical when high stockout risk is inside lead time", () => {
    expect(
      calculateDecisionPriority({
        actionType: "REORDER",
        decisionInput: decisionInput({
          stockoutRisk: "high",
          daysOfStock: 4,
          leadTimeDays: 7,
        }),
        conflicting: false,
      }).priority,
    ).toBe("critical");
  });

  it("makes high-risk REORDER high when stock coverage exceeds lead time", () => {
    expect(
      calculateDecisionPriority({
        actionType: "REORDER",
        decisionInput: decisionInput({
          stockoutRisk: "high",
          daysOfStock: 10,
          leadTimeDays: 7,
        }),
        conflicting: false,
      }).priority,
    ).toBe("high");
  });

  it("maps medium stockout risk to medium REORDER priority", () => {
    expect(
      calculateDecisionPriority({
        actionType: "REORDER",
        decisionInput: decisionInput({
          stockoutRisk: "medium",
        }),
        conflicting: false,
      }).priority,
    ).toBe("medium");
  });

  it("maps high overstock risk to high REDUCE priority", () => {
    expect(
      calculateDecisionPriority({
        actionType: "REDUCE",
        decisionInput: decisionInput({
          overstockRisk: "high",
        }),
        conflicting: false,
      }).priority,
    ).toBe("high");
  });

  it("maps medium overstock risk to medium REDUCE priority", () => {
    expect(
      calculateDecisionPriority({
        actionType: "REDUCE",
        decisionInput: decisionInput({
          overstockRisk: "medium",
        }),
        conflicting: false,
      }).priority,
    ).toBe("medium");
  });

  it("makes high-risk aged PROMOTE high priority", () => {
    expect(
      calculateDecisionPriority({
        actionType: "PROMOTE",
        decisionInput: decisionInput({
          overstockRisk: "high",
          inventoryAgeDays: 120,
        }),
        conflicting: false,
      }).priority,
    ).toBe("high");
  });

  it("makes known-zero-demand high-risk PROMOTE high priority", () => {
    expect(
      calculateDecisionPriority({
        actionType: "PROMOTE",
        decisionInput: decisionInput({
          overstockRisk: "high",
          inventoryAgeDays: 20,
          demandVelocity: 0,
        }),
        conflicting: false,
      }).priority,
    ).toBe("high");
  });

  it("maps ordinary medium-risk PROMOTE to medium priority", () => {
    expect(
      calculateDecisionPriority({
        actionType: "PROMOTE",
        decisionInput: decisionInput({
          overstockRisk: "medium",
          inventoryAgeDays: 120,
        }),
        conflicting: false,
      }).priority,
    ).toBe("medium");
  });

  it("makes conflicting WATCH high priority", () => {
    expect(
      calculateDecisionPriority({
        actionType: "WATCH",
        decisionInput: decisionInput(),
        conflicting: true,
      }).priority,
    ).toBe("high");
  });

  it("makes uncertainty WATCH medium priority", () => {
    expect(
      calculateDecisionPriority({
        actionType: "WATCH",
        decisionInput: decisionInput(),
        conflicting: false,
      }).priority,
    ).toBe("medium");
  });

  it("refuses a conflicting non-WATCH action", () => {
    expect(() =>
      calculateDecisionPriority({
        actionType: "REORDER",
        decisionInput: decisionInput(),
        conflicting: true,
      }),
    ).toThrow(
      "Conflicting commercial candidates must surface as WATCH.",
    );
  });
});
