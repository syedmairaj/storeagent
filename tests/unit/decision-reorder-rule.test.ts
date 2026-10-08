import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateReorderRule,
} from "@/lib/decision-engine/reorder-rule";

import type {
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

function baseInput(
  overrides: Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 10,
    validIncomingQuantity: 0,
    incomingStateKnown: true,

    demandVelocity: 5,
    daysOfStock: 2,

    leadTimeDays: 7,

    safetyStockUnits: 5,
    reorderPointUnits: 40,
    targetStockUnits: 60,

    recommendedOrderQuantity: 50,

    inventoryAgeDays: 10,

    demandTrend: "stable",

    stockoutRisk: "high",
    overstockRisk: "low",

    forecastExpectedDemandUnits: 35,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}

describe("reorder-rule-v1", () => {
  it("emits eligible reorder with positive deterministic quantity", () => {
    const result =
      evaluateReorderRule(
        baseInput(),
      );

    expect(result.eligible).toBe(true);

    expect(
      result.recommendedQuantity,
    ).toBe(50);

    expect(result.reasonCodes).toContain(
      "REORDER_QUANTITY_POSITIVE",
    );

    expect(result.reasonCodes).toContain(
      "STOCKOUT_RISK_HIGH",
    );

    expect(result.reasonCodes).toContain(
      "BELOW_REORDER_POINT",
    );
  });

  it("preserves medium stockout risk as evidence", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          stockoutRisk: "medium",
        }),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).toContain(
      "STOCKOUT_RISK_MEDIUM",
    );
  });

  it("does not reorder when deterministic quantity is zero", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          recommendedOrderQuantity: 0,
        }),
      );

    expect(result.eligible).toBe(false);
    expect(
      result.recommendedQuantity,
    ).toBeNull();

    expect(
      result.reasonCodes,
    ).not.toContain(
      "REORDER_QUANTITY_POSITIVE",
    );
  });

  it("does not reorder when deterministic quantity is unavailable", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          recommendedOrderQuantity: null,
        }),
      );

    expect(result.eligible).toBe(false);
  });

  it("fails closed when incoming inventory state is unknown", () => {
    const result =
      evaluateReorderRule(
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
      evaluateReorderRule(
        baseInput({
          availableQuantity: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "INVENTORY_STATE_UNKNOWN",
    );
  });

  it("fails closed when demand is unknown", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          demandVelocity: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "DEMAND_STATE_UNKNOWN",
    );
  });

  it("fails closed when lead time is unknown", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          leadTimeDays: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "LEAD_TIME_UNKNOWN",
    );
  });

  it("fails closed when reorder point is unknown", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          reorderPointUnits: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "REORDER_POINT_UNKNOWN",
    );
  });

  it("fails closed when target stock is unknown", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          targetStockUnits: null,
        }),
      );

    expect(result.eligible).toBe(false);

    expect(result.reasonCodes).toContain(
      "TARGET_STOCK_UNKNOWN",
    );
  });

  it("uses known zero incoming inventory rather than treating it as unknown", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          validIncomingQuantity: null,
          incomingStateKnown: true,
        }),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).not.toContain(
      "INCOMING_STATE_UNKNOWN",
    );
  });

  it("does not claim below reorder point when inventory position is above it", () => {
    const result =
      evaluateReorderRule(
        baseInput({
          availableQuantity: 30,
          validIncomingQuantity: 20,
          reorderPointUnits: 40,
        }),
      );

    expect(result.eligible).toBe(true);

    expect(result.reasonCodes).not.toContain(
      "BELOW_REORDER_POINT",
    );
  });
});
