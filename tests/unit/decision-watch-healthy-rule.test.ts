import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateWatchHealthyRule,
} from "@/lib/decision-engine/watch-healthy-rule";

import type {
  InventoryDecisionInput,
  WatchHealthyRuleInput,
} from "@/lib/decision-engine/types";

function decisionInput(
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

function ruleInput(
  overrides: Partial<WatchHealthyRuleInput> = {},
): WatchHealthyRuleInput {
  return {
    decisionInput: decisionInput(),
    reorderEligible: false,
    reduceEligible: false,
    promoteEligible: false,
    ...overrides,
  };
}

describe("watch-healthy-rule-v1", () => {
  it("returns HEALTHY when no intervention is supported and core evidence is trusted", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput(),
      );

    expect(result.healthState).toBe(
      "HEALTHY",
    );

    expect(result.reasonCodes).toEqual([
      "HEALTHY_NO_INTERVENTION",
    ]);
  });

  it("returns no fallback state when REORDER is already eligible", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          reorderEligible: true,
        }),
      );

    expect(result.healthState).toBeNull();
    expect(result.reasonCodes).toEqual([]);
  });

  it("returns no fallback state when REDUCE is already eligible", () => {
    expect(
      evaluateWatchHealthyRule(
        ruleInput({
          reduceEligible: true,
        }),
      ).healthState,
    ).toBeNull();
  });

  it("returns no fallback state when PROMOTE is already eligible", () => {
    expect(
      evaluateWatchHealthyRule(
        ruleInput({
          promoteEligible: true,
        }),
      ).healthState,
    ).toBeNull();
  });

  it("returns WATCH when inventory state is unknown", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            availableQuantity: null,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "WATCH",
    );

    expect(result.reasonCodes).toContain(
      "MATERIAL_UNCERTAINTY",
    );

    expect(result.reasonCodes).toContain(
      "INVENTORY_STATE_UNKNOWN",
    );
  });

  it("returns WATCH when incoming inventory state is unknown", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            incomingStateKnown: false,
            validIncomingQuantity: null,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "WATCH",
    );

    expect(result.reasonCodes).toContain(
      "INCOMING_STATE_UNKNOWN",
    );
  });

  it("returns WATCH when demand state is unknown", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            demandVelocity: null,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "WATCH",
    );

    expect(result.reasonCodes).toContain(
      "DEMAND_STATE_UNKNOWN",
    );
  });

  it("returns WATCH when replenishment configuration is materially incomplete", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            leadTimeDays: null,
            reorderPointUnits: null,
            targetStockUnits: null,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "WATCH",
    );

    expect(result.reasonCodes).toContain(
      "LEAD_TIME_UNKNOWN",
    );

    expect(result.reasonCodes).toContain(
      "REORDER_POINT_UNKNOWN",
    );

    expect(result.reasonCodes).toContain(
      "TARGET_STOCK_UNKNOWN",
    );
  });

  it("returns WATCH when forecast is unavailable", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            forecastExpectedDemandUnits: null,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "WATCH",
    );

    expect(result.reasonCodes).toContain(
      "FORECAST_UNAVAILABLE",
    );
  });

  it("returns WATCH when forecast confidence is low", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            forecastConfidence: "low",
          }),
        }),
      );

    expect(result.healthState).toBe(
      "WATCH",
    );

    expect(result.reasonCodes).toContain(
      "FORECAST_CONFIDENCE_LOW",
    );
  });

  it("does not treat known zero demand as unknown", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            demandVelocity: 0,
            forecastExpectedDemandUnits: 0,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "HEALTHY",
    );

    expect(result.reasonCodes).not.toContain(
      "DEMAND_STATE_UNKNOWN",
    );
  });

  it("does not require optional inventory age to return HEALTHY", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            inventoryAgeDays: null,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "HEALTHY",
    );
  });

  it("does not require optional demand trend to return HEALTHY", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            demandTrend: null,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "HEALTHY",
    );
  });

  it("does not require data-quality score merely to return HEALTHY", () => {
    const result =
      evaluateWatchHealthyRule(
        ruleInput({
          decisionInput: decisionInput({
            dataQualityScore: null,
          }),
        }),
      );

    expect(result.healthState).toBe(
      "HEALTHY",
    );
  });
});
