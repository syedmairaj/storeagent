import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getInventoryDecisionReasonDefinition,
  INVENTORY_DECISION_REASON_DEFINITIONS,
} from "@/lib/decision-engine/reason-codes";

describe("inventory decision reason codes", () => {
  it("contains unique stable codes", () => {
    const codes = Object.keys(
      INVENTORY_DECISION_REASON_DEFINITIONS,
    );

    expect(
      new Set(codes).size,
    ).toBe(codes.length);
  });

  it("keeps every definition keyed by its own code", () => {
    for (const [key, definition] of Object.entries(
      INVENTORY_DECISION_REASON_DEFINITIONS,
    )) {
      expect(definition.code).toBe(key);
    }
  });

  it("classifies conflicting signals separately", () => {
    expect(
      getInventoryDecisionReasonDefinition(
        "CONFLICTING_SIGNALS",
      ).kind,
    ).toBe("conflict");
  });

  it("classifies reorder evidence as replenishment", () => {
    expect(
      getInventoryDecisionReasonDefinition(
        "REORDER_QUANTITY_POSITIVE",
      ).kind,
    ).toBe("replenishment");

    expect(
      getInventoryDecisionReasonDefinition(
        "BELOW_REORDER_POINT",
      ).kind,
    ).toBe("replenishment");
  });

  it("classifies excess evidence separately from promotion evidence", () => {
    expect(
      getInventoryDecisionReasonDefinition(
        "OVERSTOCK_RISK_HIGH",
      ).kind,
    ).toBe("excess");

    expect(
      getInventoryDecisionReasonDefinition(
        "AGED_INVENTORY",
      ).kind,
    ).toBe("promotion");
  });

  it("preserves known zero demand as a real promotion signal", () => {
    const definition =
      getInventoryDecisionReasonDefinition(
        "ZERO_DEMAND",
      );

    expect(definition.kind).toBe(
      "promotion",
    );

    expect(definition.meaning).toContain(
      "known to be zero",
    );
  });

  it("keeps missing evidence in the uncertainty family", () => {
    const codes = [
      "INCOMING_STATE_UNKNOWN",
      "INVENTORY_STATE_UNKNOWN",
      "DEMAND_STATE_UNKNOWN",
      "LEAD_TIME_UNKNOWN",
      "TARGET_STOCK_UNKNOWN",
      "REORDER_POINT_UNKNOWN",
      "FORECAST_UNAVAILABLE",
      "FORECAST_CONFIDENCE_LOW",
      "DATA_QUALITY_MEDIUM",
      "DATA_QUALITY_LOW",
      "DECISION_CONFIDENCE_CAPPED_BY_FORECAST",
    ] as const;

    for (const code of codes) {
      expect(
        getInventoryDecisionReasonDefinition(
          code,
        ).kind,
      ).toBe("uncertainty");
    }
  });

  it("has an explicit no-intervention reason for HEALTHY", () => {
    expect(
      getInventoryDecisionReasonDefinition(
        "HEALTHY_NO_INTERVENTION",
      ).kind,
    ).toBe("healthy");
  });
});
