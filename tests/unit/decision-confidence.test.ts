import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateDecisionConfidence,
  DATA_QUALITY_HIGH_MIN_V1,
  DATA_QUALITY_MEDIUM_MIN_V1,
} from "@/lib/decision-engine/confidence";

import type {
  InventoryDecisionInput,
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

describe("decision-confidence-v1", () => {
  it("preserves high confidence when forecast and data quality support it", () => {
    expect(
      calculateDecisionConfidence({
        healthState: "REORDER",
        decisionInput: decisionInput(),
        conflicting: false,
        materialUncertainty: false,
      }).confidence,
    ).toBe("high");
  });

  it("never raises medium forecast confidence to high", () => {
    expect(
      calculateDecisionConfidence({
        healthState: "REDUCE",
        decisionInput: decisionInput({
          forecastConfidence: "medium",
          dataQualityScore: 100,
        }),
        conflicting: false,
        materialUncertainty: false,
      }).confidence,
    ).toBe("medium");
  });

  it("never raises low forecast confidence", () => {
    expect(
      calculateDecisionConfidence({
        healthState: "PROMOTE",
        decisionInput: decisionInput({
          forecastConfidence: "low",
          dataQualityScore: 100,
        }),
        conflicting: false,
        materialUncertainty: false,
      }).confidence,
    ).toBe("low");
  });

  it("caps high forecast confidence at medium for medium data quality", () => {
    const result =
      calculateDecisionConfidence({
        healthState: "REORDER",
        decisionInput: decisionInput({
          dataQualityScore: 70,
        }),
        conflicting: false,
        materialUncertainty: false,
      });

    expect(result.confidence).toBe(
      "medium",
    );

    expect(result.reasonCodes).toContain(
      "DATA_QUALITY_MEDIUM",
    );
  });

  it("forces low confidence for low data quality", () => {
    const result =
      calculateDecisionConfidence({
        healthState: "REDUCE",
        decisionInput: decisionInput({
          dataQualityScore: 40,
        }),
        conflicting: false,
        materialUncertainty: false,
      });

    expect(result.confidence).toBe("low");

    expect(result.reasonCodes).toContain(
      "DATA_QUALITY_LOW",
    );
  });

  it("does not invent a data-quality penalty when score is unavailable", () => {
    const result =
      calculateDecisionConfidence({
        healthState: "HEALTHY",
        decisionInput: decisionInput({
          dataQualityScore: null,
        }),
        conflicting: false,
        materialUncertainty: false,
      });

    expect(result.confidence).toBe("high");

    expect(result.reasonCodes).not.toContain(
      "DATA_QUALITY_LOW",
    );
  });

  it("forces low confidence for conflicting commercial signals", () => {
    const result =
      calculateDecisionConfidence({
        healthState: "WATCH",
        decisionInput: decisionInput(),
        conflicting: true,
        materialUncertainty: false,
      });

    expect(result.confidence).toBe("low");

    expect(result.reasonCodes).toContain(
      "CONFLICTING_SIGNALS",
    );
  });

  it("forces low confidence for material uncertainty", () => {
    const result =
      calculateDecisionConfidence({
        healthState: "WATCH",
        decisionInput: decisionInput(),
        conflicting: false,
        materialUncertainty: true,
      });

    expect(result.confidence).toBe("low");

    expect(result.reasonCodes).toContain(
      "MATERIAL_UNCERTAINTY",
    );
  });

  it("treats the medium data-quality threshold as medium-or-better", () => {
    expect(
      calculateDecisionConfidence({
        healthState: "REORDER",
        decisionInput: decisionInput({
          dataQualityScore:
            DATA_QUALITY_MEDIUM_MIN_V1,
        }),
        conflicting: false,
        materialUncertainty: false,
      }).confidence,
    ).toBe("medium");
  });

  it("treats the high data-quality threshold as high-quality evidence", () => {
    expect(
      calculateDecisionConfidence({
        healthState: "REORDER",
        decisionInput: decisionInput({
          dataQualityScore:
            DATA_QUALITY_HIGH_MIN_V1,
        }),
        conflicting: false,
        materialUncertainty: false,
      }).confidence,
    ).toBe("high");
  });

  it("rejects invalid data-quality scores", () => {
    expect(() =>
      calculateDecisionConfidence({
        healthState: "REORDER",
        decisionInput: decisionInput({
          dataQualityScore: 101,
        }),
        conflicting: false,
        materialUncertainty: false,
      }),
    ).toThrow(
      "dataQualityScore must be between 0 and 100.",
    );
  });
});
