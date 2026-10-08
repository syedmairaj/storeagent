import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateReduceRule,
} from "@/lib/decision-engine/reduce-rule";

import type {
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

function baseInput(
  overrides: Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 80,
    validIncomingQuantity: 40,
    incomingStateKnown: true,

    demandVelocity: 3,
    daysOfStock: 40,

    leadTimeDays: 7,

    safetyStockUnits: 10,
    reorderPointUnits: 31,
    targetStockUnits: 70,

    recommendedOrderQuantity: 0,

    inventoryAgeDays: 20,

    demandTrend: "stable",

    stockoutRisk: "low",
    overstockRisk: "high",

    forecastExpectedDemandUnits: 30,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}

describe("reduce-rule-v1", () => {
  it("emits REDUCE eligibility for incoming excess inventory", () => {
    const result =
      evaluateReduceRule(
        baseInput(),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).toContain(
      "OVERSTOCK_RISK_HIGH",
    );

    expect(result.reasonCodes).toContain(
      "ABOVE_TARGET_STOCK",
    );
  });

  it("supports medium overstock risk when inventory position is above target", () => {
    const result =
      evaluateReduceRule(
        baseInput({
          overstockRisk: "medium",
        }),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).toContain(
      "OVERSTOCK_RISK_MEDIUM",
    );
  });

  it("does not REDUCE existing excess stock when no incoming supply exists", () => {
    const result =
      evaluateReduceRule(
        baseInput({
          validIncomingQuantity: null,
          incomingStateKnown: true,
        }),
      );

    expect(result.eligible).toBe(false);
  });

  it("does not REDUCE when known incoming quantity is zero", () => {
    expect(
      evaluateReduceRule(
        baseInput({
          validIncomingQuantity: 0,
        }),
      ).eligible,
    ).toBe(false);
  });

  it("fails closed when incoming state is unknown", () => {
    const result =
      evaluateReduceRule(
        baseInput({
          validIncomingQuantity: null,
          incomingStateKnown: false,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "INCOMING_STATE_UNKNOWN",
    );
  });

  it("fails closed when available inventory is unknown", () => {
    const result =
      evaluateReduceRule(
        baseInput({
          availableQuantity: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "INVENTORY_STATE_UNKNOWN",
    );
  });

  it("fails closed when target stock is unknown", () => {
    const result =
      evaluateReduceRule(
        baseInput({
          targetStockUnits: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "TARGET_STOCK_UNKNOWN",
    );
  });

  it("does not REDUCE when inventory position is not above target", () => {
    const result =
      evaluateReduceRule(
        baseInput({
          availableQuantity: 30,
          validIncomingQuantity: 20,
          targetStockUnits: 70,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).not.toContain(
      "ABOVE_TARGET_STOCK",
    );
  });

  it("does not REDUCE on low overstock risk alone", () => {
    const result =
      evaluateReduceRule(
        baseInput({
          overstockRisk: "low",
        }),
      );

    expect(result.eligible).toBe(false);
  });

  it("requires both excess position and medium-or-high overstock evidence", () => {
    const noPositionExcess =
      evaluateReduceRule(
        baseInput({
          availableQuantity: 30,
          validIncomingQuantity: 20,
          targetStockUnits: 70,
          overstockRisk: "high",
        }),
      );

    const lowRisk =
      evaluateReduceRule(
        baseInput({
          overstockRisk: "low",
        }),
      );

    expect(
      noPositionExcess.eligible,
    ).toBe(false);

    expect(lowRisk.eligible).toBe(false);
  });
});
