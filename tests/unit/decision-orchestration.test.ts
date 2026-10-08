import {
  describe,
  expect,
  it,
} from "vitest";

import {
  decideInventoryAction,
} from "@/lib/decision-engine/decide";

import type {
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

function baseInput(
  overrides: Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 50,
    validIncomingQuantity: 0,
    incomingStateKnown: true,

    demandVelocity: 4,
    daysOfStock: 12.5,

    leadTimeDays: 7,

    safetyStockUnits: 10,
    reorderPointUnits: 38,
    targetStockUnits: 70,

    recommendedOrderQuantity: 0,

    inventoryAgeDays: 20,

    demandTrend: "stable",

    stockoutRisk: "low",
    overstockRisk: "low",

    forecastExpectedDemandUnits: 28,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}

describe("inventory-decision-v1", () => {
  it("returns HEALTHY when no intervention or material uncertainty exists", () => {
    const result =
      decideInventoryAction(
        baseInput(),
      );

    expect(result.healthState).toBe(
      "HEALTHY",
    );

    expect(result.actionType).toBeNull();
    expect(result.priority).toBeNull();

    expect(result.reasonCodes).toContain(
      "HEALTHY_NO_INTERVENTION",
    );
  });

  it("returns REORDER with the deterministic recommended quantity", () => {
    const result =
      decideInventoryAction(
        baseInput({
          availableQuantity: 10,
          daysOfStock: 2,
          reorderPointUnits: 40,
          targetStockUnits: 60,
          recommendedOrderQuantity: 50,
          stockoutRisk: "high",
        }),
      );

    expect(result.healthState).toBe(
      "REORDER",
    );

    expect(result.actionType).toBe(
      "REORDER",
    );

    expect(
      result.recommendedQuantity,
    ).toBe(50);

    expect(result.reasonCodes).toContain(
      "REORDER_QUANTITY_POSITIVE",
    );
  });

  it("returns REDUCE when incoming inventory creates trusted excess exposure", () => {
    const result =
      decideInventoryAction(
        baseInput({
          availableQuantity: 80,
          validIncomingQuantity: 40,
          targetStockUnits: 70,
          overstockRisk: "high",
        }),
      );

    expect(result.healthState).toBe(
      "REDUCE",
    );

    expect(result.actionType).toBe(
      "REDUCE",
    );

    expect(
      result.recommendedQuantity,
    ).toBeNull();
  });

  it("returns PROMOTE for existing excess inventory with demand pressure", () => {
    const result =
      decideInventoryAction(
        baseInput({
          availableQuantity: 120,
          targetStockUnits: 70,
          overstockRisk: "high",
          inventoryAgeDays: 120,
          demandTrend: "falling",
        }),
      );

    expect(result.healthState).toBe(
      "PROMOTE",
    );

    expect(result.actionType).toBe(
      "PROMOTE",
    );
  });

  it("surfaces REDUCE first while preserving compatible PROMOTE", () => {
    const result =
      decideInventoryAction(
        baseInput({
          availableQuantity: 120,
          validIncomingQuantity: 30,
          targetStockUnits: 70,
          overstockRisk: "high",
          inventoryAgeDays: 120,
          demandTrend: "falling",
        }),
      );

    expect(result.actionType).toBe(
      "REDUCE",
    );

    expect(
      result.compatibleSecondaryActionTypes,
    ).toEqual([
      "PROMOTE",
    ]);
  });

  it("fails closed to WATCH for REORDER plus REDUCE conflict", () => {
    const result =
      decideInventoryAction(
        baseInput({
          availableQuantity: 10,
          validIncomingQuantity: 100,
          reorderPointUnits: 40,
          targetStockUnits: 60,
          recommendedOrderQuantity: 50,
          stockoutRisk: "high",
          overstockRisk: "high",
        }),
      );

    expect(result.healthState).toBe(
      "WATCH",
    );

    expect(result.actionType).toBe(
      "WATCH",
    );

    expect(result.priority).toBe(
      "high",
    );

    expect(result.confidence).toBe(
      "low",
    );

    expect(result.reasonCodes).toContain(
      "CONFLICTING_SIGNALS",
    );
  });

  it("returns WATCH for material uncertainty", () => {
    const result =
      decideInventoryAction(
        baseInput({
          availableQuantity: null,
          forecastExpectedDemandUnits: null,
        }),
      );

    expect(result.healthState).toBe(
      "WATCH",
    );

    expect(result.actionType).toBe(
      "WATCH",
    );

    expect(result.priority).toBe(
      "medium",
    );

    expect(result.confidence).toBe(
      "low",
    );

    expect(result.reasonCodes).toContain(
      "MATERIAL_UNCERTAINTY",
    );
  });

  it("never persists a quantity for non-REORDER actions", () => {
    const promote =
      decideInventoryAction(
        baseInput({
          availableQuantity: 120,
          targetStockUnits: 70,
          overstockRisk: "high",
          inventoryAgeDays: 120,
        }),
      );

    expect(
      promote.recommendedQuantity,
    ).toBeNull();
  });

  it("does not turn known zero demand into unknown demand", () => {
    const result =
      decideInventoryAction(
        baseInput({
          availableQuantity: 120,
          demandVelocity: 0,
          forecastExpectedDemandUnits: 0,
          targetStockUnits: 70,
          overstockRisk: "high",
        }),
      );

    expect(result.actionType).toBe(
      "PROMOTE",
    );

    expect(result.reasonCodes).toContain(
      "ZERO_DEMAND",
    );

    expect(result.reasonCodes).not.toContain(
      "DEMAND_STATE_UNKNOWN",
    );
  });

  it("caps action confidence through deterministic data quality", () => {
    const result =
      decideInventoryAction(
        baseInput({
          availableQuantity: 10,
          recommendedOrderQuantity: 50,
          reorderPointUnits: 40,
          stockoutRisk: "high",
          dataQualityScore: 70,
        }),
      );

    expect(result.confidence).toBe(
      "medium",
    );

    expect(result.reasonCodes).toContain(
      "DATA_QUALITY_MEDIUM",
    );
  });
});
