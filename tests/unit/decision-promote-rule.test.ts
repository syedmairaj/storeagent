import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluatePromoteRule,
  PROMOTE_AGED_INVENTORY_DAYS_V1,
} from "@/lib/decision-engine/promote-rule";

import type {
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

function baseInput(
  overrides: Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 120,
    validIncomingQuantity: 0,
    incomingStateKnown: true,

    demandVelocity: 2,
    daysOfStock: 60,

    leadTimeDays: 7,

    safetyStockUnits: 10,
    reorderPointUnits: 24,
    targetStockUnits: 70,

    recommendedOrderQuantity: 0,

    inventoryAgeDays: 120,

    demandTrend: "falling",

    stockoutRisk: "low",
    overstockRisk: "high",

    forecastExpectedDemandUnits: 20,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}

describe("promote-rule-v1", () => {
  it("emits PROMOTE eligibility for excess aged inventory", () => {
    const result =
      evaluatePromoteRule(
        baseInput(),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).toContain(
      "ABOVE_TARGET_STOCK",
    );

    expect(result.reasonCodes).toContain(
      "OVERSTOCK_RISK_HIGH",
    );

    expect(result.reasonCodes).toContain(
      "AGED_INVENTORY",
    );
  });

  it("allows falling demand to support PROMOTE", () => {
    const result =
      evaluatePromoteRule(
        baseInput({
          inventoryAgeDays: 30,
          demandTrend: "falling",
        }),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).toContain(
      "FALLING_DEMAND",
    );
  });

  it("allows known zero demand to support PROMOTE", () => {
    const result =
      evaluatePromoteRule(
        baseInput({
          demandVelocity: 0,
          demandTrend: "stable",
          inventoryAgeDays: 30,
        }),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).toContain(
      "ZERO_DEMAND",
    );
  });

  it("does not PROMOTE excess stock without demand pressure", () => {
    const result =
      evaluatePromoteRule(
        baseInput({
          demandVelocity: 3,
          demandTrend: "stable",
          inventoryAgeDays: 30,
        }),
      );

    expect(result.eligible).toBe(false);
  });

  it("does not PROMOTE when inventory is not above target", () => {
    const result =
      evaluatePromoteRule(
        baseInput({
          availableQuantity: 60,
          targetStockUnits: 70,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).not.toContain(
      "ABOVE_TARGET_STOCK",
    );
  });

  it("does not PROMOTE on low overstock risk", () => {
    expect(
      evaluatePromoteRule(
        baseInput({
          overstockRisk: "low",
        }),
      ).eligible,
    ).toBe(false);
  });

  it("supports medium overstock risk with excess and demand pressure", () => {
    const result =
      evaluatePromoteRule(
        baseInput({
          overstockRisk: "medium",
        }),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).toContain(
      "OVERSTOCK_RISK_MEDIUM",
    );
  });

  it("fails closed when available inventory is unknown", () => {
    const result =
      evaluatePromoteRule(
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
      evaluatePromoteRule(
        baseInput({
          targetStockUnits: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "TARGET_STOCK_UNKNOWN",
    );
  });

  it("fails closed when demand is unknown", () => {
    const result =
      evaluatePromoteRule(
        baseInput({
          demandVelocity: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "DEMAND_STATE_UNKNOWN",
    );
  });

  it("does not PROMOTE when no stock is on hand", () => {
    expect(
      evaluatePromoteRule(
        baseInput({
          availableQuantity: 0,
        }),
      ).eligible,
    ).toBe(false);
  });

  it("treats the frozen age threshold as inclusive", () => {
    const result =
      evaluatePromoteRule(
        baseInput({
          inventoryAgeDays:
            PROMOTE_AGED_INVENTORY_DAYS_V1,
          demandTrend: "stable",
          demandVelocity: 2,
        }),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).toContain(
      "AGED_INVENTORY",
    );
  });
});
