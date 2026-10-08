import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildInventoryActionEvidence,
} from "@/lib/decision-engine/evidence-snapshot";

import type {
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

function decisionInput(
  overrides: Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 20,
    validIncomingQuantity: 10,
    incomingStateKnown: true,

    demandVelocity: 5,
    daysOfStock: 4,

    leadTimeDays: 7,

    safetyStockUnits: 10,
    reorderPointUnits: 45,
    targetStockUnits: 70,

    recommendedOrderQuantity: 40,

    inventoryAgeDays: 30,

    demandTrend: "stable",

    stockoutRisk: "high",
    overstockRisk: "low",

    forecastExpectedDemandUnits: 35,
    forecastConfidence: "high",

    dataQualityScore: 95,

    ...overrides,
  };
}

describe("inventory action evidence snapshot", () => {
  it("maps canonical deterministic evidence fields", () => {
    expect(
      buildInventoryActionEvidence({
        decisionInput: decisionInput(),
        reasonCodes: [
          "REORDER_QUANTITY_POSITIVE",
          "STOCKOUT_RISK_HIGH",
        ],
      }),
    ).toEqual({
      availableQuantity: 20,
      incomingQuantity: 10,
      demandVelocity: 5,
      daysOfStock: 4,
      leadTimeDays: 7,
      safetyStockUnits: 10,
      reorderPointUnits: 45,
      targetStockUnits: 70,
      inventoryAgeDays: 30,
      forecastExpectedDemandUnits: 35,
      dataQualityScore: 95,
      reasonCodes: [
        "REORDER_QUANTITY_POSITIVE",
        "STOCKOUT_RISK_HIGH",
      ],
    });
  });

  it("preserves known zero incoming inventory", () => {
    const result =
      buildInventoryActionEvidence({
        decisionInput: decisionInput({
          validIncomingQuantity: 0,
          incomingStateKnown: true,
        }),
        reasonCodes: [],
      });

    expect(
      result.incomingQuantity,
    ).toBe(0);
  });

  it("preserves known-zero incoming represented by null plus known state", () => {
    const result =
      buildInventoryActionEvidence({
        decisionInput: decisionInput({
          validIncomingQuantity: null,
          incomingStateKnown: true,
        }),
        reasonCodes: [],
      });

    expect(
      result.incomingQuantity,
    ).toBeNull();
  });

  it("does not invent incoming inventory when state is unknown", () => {
    const result =
      buildInventoryActionEvidence({
        decisionInput: decisionInput({
          validIncomingQuantity: 50,
          incomingStateKnown: false,
        }),
        reasonCodes: [
          "INCOMING_STATE_UNKNOWN",
        ],
      });

    expect(
      result.incomingQuantity,
    ).toBeNull();
  });

  it("preserves known zero demand", () => {
    const result =
      buildInventoryActionEvidence({
        decisionInput: decisionInput({
          demandVelocity: 0,
          forecastExpectedDemandUnits: 0,
        }),
        reasonCodes: [
          "ZERO_DEMAND",
        ],
      });

    expect(
      result.demandVelocity,
    ).toBe(0);

    expect(
      result.forecastExpectedDemandUnits,
    ).toBe(0);
  });

  it("preserves unknown evidence as null", () => {
    const result =
      buildInventoryActionEvidence({
        decisionInput: decisionInput({
          availableQuantity: null,
          demandVelocity: null,
          daysOfStock: null,
          leadTimeDays: null,
          safetyStockUnits: null,
          reorderPointUnits: null,
          targetStockUnits: null,
          inventoryAgeDays: null,
          forecastExpectedDemandUnits: null,
          dataQualityScore: null,
        }),
        reasonCodes: [
          "MATERIAL_UNCERTAINTY",
        ],
      });

    expect(result).toMatchObject({
      availableQuantity: null,
      demandVelocity: null,
      daysOfStock: null,
      leadTimeDays: null,
      safetyStockUnits: null,
      reorderPointUnits: null,
      targetStockUnits: null,
      inventoryAgeDays: null,
      forecastExpectedDemandUnits: null,
      dataQualityScore: null,
    });
  });

  it("copies reason codes instead of retaining the caller array reference", () => {
    const reasonCodes = [
      "REORDER_QUANTITY_POSITIVE",
    ] as const;

    const result =
      buildInventoryActionEvidence({
        decisionInput: decisionInput(),
        reasonCodes,
      });

    expect(result.reasonCodes).toEqual([
      "REORDER_QUANTITY_POSITIVE",
    ]);

    expect(
      result.reasonCodes,
    ).not.toBe(reasonCodes);
  });

  it("does not expose decision-only fields outside canonical evidence schema", () => {
    const result =
      buildInventoryActionEvidence({
        decisionInput: decisionInput(),
        reasonCodes: [],
      });

    expect(
      "forecastConfidence" in result,
    ).toBe(false);

    expect(
      "stockoutRisk" in result,
    ).toBe(false);

    expect(
      "overstockRisk" in result,
    ).toBe(false);

    expect(
      "recommendedOrderQuantity" in result,
    ).toBe(false);
  });
});
