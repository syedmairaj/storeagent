import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateFixtureInventoryDecision,
  M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1,
  M7FixtureDecisionEvaluationError,
  type M7FixtureDecisionEvaluationRequest,
} from "@/lib/decision-engine/fixture-evaluation";

import type {
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

const GRAIN = {
  organizationId: "7100e000-0000-4000-8000-000000000001",
  storeId: "7100e000-0000-4000-8000-000000000002",
  locationId: "7100e000-0000-4000-8000-000000000003",
  variantId: "7100e000-0000-4000-8000-000000000004",
};

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

function request(
  overrides: Partial<M7FixtureDecisionEvaluationRequest> & {
    decisionInput?: InventoryDecisionInput;
  } = {},
): M7FixtureDecisionEvaluationRequest {
  const {
    decisionInput = baseInput(),
    forecastEligibility = "fixture_synthetic",
    ...rest
  } = overrides;

  return {
    grain: GRAIN,
    evidenceScope: "controlled_fixture_only",
    fixtureAttestation: M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1,
    forecastEligibility,
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    decisionInput,
    ...rest,
  };
}

describe("M7.1 fixture inventory decision evaluation", () => {
  it("returns HEALTHY for fixture_synthetic with caller-supplied forecast", () => {
    const result = evaluateFixtureInventoryDecision(request());

    expect(result.decision.healthState).toBe("HEALTHY");
    expect(result.decision.actionType).toBeNull();
    expect(result.decision.recommendedQuantity).toBeNull();
    expect(result.decision.reasonCodes).toContain(
      "HEALTHY_NO_INTERVENTION",
    );
    expect(result.audience).toBe("local_developer");
    expect(result.evidenceScope).toBe("controlled_fixture_only");
    expect(result.forecastEligibility).toBe("fixture_synthetic");
    expect(result.decisionInputUsed.forecastExpectedDemandUnits).toBe(28);
    expect(result.provenance.claimsMerchantFacing).toBe(false);
    expect(result.provenance.claimsProductionForecastApproval).toBe(
      false,
    );
    expect(result.provenance.claimsM7ProductionEligibility).toBe(false);
    expect(result.provenance.algorithmApproved).toBe(false);
    expect(result.warnings).toEqual([
      "controlled_fixture_only",
      "NOT_merchant_facing",
      "NOT_production_activation",
      "NOT_production_forecast",
    ]);
  });

  it("rejects fixture_synthetic with null forecast", () => {
    expect(() =>
      evaluateFixtureInventoryDecision(
        request({
          forecastEligibility: "fixture_synthetic",
          decisionInput: baseInput({
            forecastExpectedDemandUnits: null,
          }),
        }),
      ),
    ).toThrow(/fixture_synthetic.*forecastExpectedDemandUnits/);
  });

  it("returns WATCH for ineligible with null forecast", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        forecastEligibility: "ineligible",
        decisionInput: baseInput({
          availableQuantity: 50,
          recommendedOrderQuantity: 0,
          forecastExpectedDemandUnits: null,
          forecastConfidence: "low",
          leadTimeDays: 7,
          reorderPointUnits: 10,
          targetStockUnits: 20,
        }),
      }),
    );

    expect(result.decision.actionType).toBe("WATCH");
    expect(result.decision.recommendedQuantity).toBeNull();
    expect(result.decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "MATERIAL_UNCERTAINTY",
        "FORECAST_UNAVAILABLE",
      ]),
    );
    expect(result.decisionInputUsed.forecastExpectedDemandUnits).toBeNull();
  });

  it("rejects ineligible with numeric forecast", () => {
    expect(() =>
      evaluateFixtureInventoryDecision(
        request({
          forecastEligibility: "ineligible",
          decisionInput: baseInput({
            forecastExpectedDemandUnits: 12,
          }),
        }),
      ),
    ).toThrow(/forecastExpectedDemandUnits/);
  });

  it("derives null ROQ for unknown target/available and never REORDERs", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        deriveRecommendedOrderQuantity: true,
        decisionInput: baseInput({
          availableQuantity: null,
          targetStockUnits: null,
          recommendedOrderQuantity: 99,
          reorderPointUnits: 40,
          stockoutRisk: "high",
          daysOfStock: 2,
        }),
      }),
    );

    expect(result.decisionInputUsed.recommendedOrderQuantity).toBeNull();
    expect(result.decision.actionType).not.toBe("REORDER");
    expect(result.decision.recommendedQuantity).toBeNull();
  });

  it("rejects non-controlled evidenceScope", () => {
    expect(() =>
      evaluateFixtureInventoryDecision({
        ...request(),
        evidenceScope: "hosted_live" as "controlled_fixture_only",
      }),
    ).toThrow(/controlled_fixture_only/);
  });

  it("rejects missing or invalid fixtureAttestation", () => {
    expect(() =>
      evaluateFixtureInventoryDecision({
        ...request(),
        fixtureAttestation: undefined as unknown as typeof M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1,
      }),
    ).toThrow(/fixtureAttestation/);

    expect(() =>
      evaluateFixtureInventoryDecision({
        ...request(),
        fixtureAttestation:
          "forged-attestation" as typeof M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1,
      }),
    ).toThrow(/fixtureAttestation/);
  });

  it("rejects forged merchant/production trust claims", () => {
    expect(() =>
      evaluateFixtureInventoryDecision({
        ...request(),
        claimsMerchantFacing: true as false,
      }),
    ).toThrow(/merchant\/production/);

    expect(() =>
      evaluateFixtureInventoryDecision({
        ...request(),
        claimsProductionForecastApproval: true as false,
      }),
    ).toThrow(/merchant\/production/);

    expect(() =>
      evaluateFixtureInventoryDecision({
        ...request(),
        claimsM7ProductionEligibility: true as false,
      }),
    ).toThrow(/merchant\/production/);

    expect(() =>
      evaluateFixtureInventoryDecision({
        ...request(),
        algorithmApproved: true as false,
      }),
    ).toThrow(/merchant\/production/);
  });

  it("returns REORDER with provided recommended quantity", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        decisionInput: baseInput({
          availableQuantity: 10,
          daysOfStock: 2,
          reorderPointUnits: 40,
          targetStockUnits: 60,
          recommendedOrderQuantity: 50,
          stockoutRisk: "high",
        }),
      }),
    );

    expect(result.decision.actionType).toBe("REORDER");
    expect(result.decision.recommendedQuantity).toBe(50);
    expect(result.evidence.availableQuantity).toBe(10);
    expect(result.grain).toEqual(GRAIN);
  });

  it("derives ROQ via inventory-math and applies MOQ/pack constraints", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        deriveRecommendedOrderQuantity: true,
        supplierConstraints: {
          minimumOrderQuantity: 12,
          packSize: 6,
        },
        decisionInput: baseInput({
          availableQuantity: 10,
          validIncomingQuantity: 0,
          incomingStateKnown: true,
          targetStockUnits: 15,
          reorderPointUnits: 40,
          recommendedOrderQuantity: null,
          stockoutRisk: "high",
          daysOfStock: 2,
        }),
      }),
    );

    // raw need = ceil(15 - 10 - 0) = 5 → MOQ 12 → pack already multiple
    expect(result.decisionInputUsed.recommendedOrderQuantity).toBe(12);
    expect(result.decision.actionType).toBe("REORDER");
    expect(result.decision.recommendedQuantity).toBe(12);
  });

  it("returns REDUCE for trusted incoming excess exposure", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        decisionInput: baseInput({
          availableQuantity: 80,
          validIncomingQuantity: 40,
          incomingStateKnown: true,
          targetStockUnits: 70,
          overstockRisk: "high",
          recommendedOrderQuantity: 0,
        }),
      }),
    );

    expect(result.decision.actionType).toBe("REDUCE");
    expect(result.decision.recommendedQuantity).toBeNull();
  });

  it("returns PROMOTE for aged on-hand excess without incoming", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        decisionInput: baseInput({
          availableQuantity: 120,
          validIncomingQuantity: 0,
          incomingStateKnown: true,
          targetStockUnits: 40,
          overstockRisk: "high",
          inventoryAgeDays: 120,
          demandTrend: "falling",
          recommendedOrderQuantity: 0,
        }),
      }),
    );

    expect(result.decision.actionType).toBe("PROMOTE");
    expect(result.decision.reasonCodes).toEqual(
      expect.arrayContaining(["AGED_INVENTORY", "ABOVE_TARGET_STOCK"]),
    );
  });

  it("preserves known-zero available and incoming without treating as unknown", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        decisionInput: baseInput({
          availableQuantity: 0,
          validIncomingQuantity: 0,
          incomingStateKnown: true,
          demandVelocity: 0,
          daysOfStock: null,
          recommendedOrderQuantity: 0,
          leadTimeDays: 7,
          reorderPointUnits: 10,
          targetStockUnits: 20,
          forecastExpectedDemandUnits: 0,
          forecastConfidence: "medium",
        }),
      }),
    );

    expect(result.evidence.availableQuantity).toBe(0);
    expect(result.evidence.incomingQuantity).toBe(0);
    expect(result.decision.reasonCodes).not.toContain(
      "INVENTORY_STATE_UNKNOWN",
    );
    expect(result.decision.reasonCodes).not.toContain(
      "INCOMING_STATE_UNKNOWN",
    );
  });

  it("fails closed on REORDER+REDUCE conflict", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        decisionInput: baseInput({
          availableQuantity: 10,
          validIncomingQuantity: 100,
          incomingStateKnown: true,
          reorderPointUnits: 40,
          targetStockUnits: 30,
          recommendedOrderQuantity: 50,
          stockoutRisk: "high",
          overstockRisk: "high",
          daysOfStock: 1,
        }),
      }),
    );

    expect(result.decision.actionType).toBe("WATCH");
    expect(result.decision.reasonCodes).toContain("CONFLICTING_SIGNALS");
    expect(result.decision.recommendedQuantity).toBeNull();
  });

  it("fails closed on REORDER+PROMOTE conflict", () => {
    const result = evaluateFixtureInventoryDecision(
      request({
        decisionInput: baseInput({
          availableQuantity: 100,
          validIncomingQuantity: 0,
          incomingStateKnown: true,
          reorderPointUnits: 200,
          targetStockUnits: 40,
          recommendedOrderQuantity: 80,
          stockoutRisk: "high",
          overstockRisk: "high",
          inventoryAgeDays: 120,
          demandTrend: "falling",
          daysOfStock: 2,
        }),
      }),
    );

    expect(result.decision.actionType).toBe("WATCH");
    expect(result.decision.reasonCodes).toContain("CONFLICTING_SIGNALS");
  });

  it("rejects missing locationId", () => {
    expect(() =>
      evaluateFixtureInventoryDecision(
        request({
          grain: { ...GRAIN, locationId: "" },
        }),
      ),
    ).toThrow(M7FixtureDecisionEvaluationError);
  });

  it("rejects contradictory incoming evidence", () => {
    expect(() =>
      evaluateFixtureInventoryDecision(
        request({
          decisionInput: baseInput({
            incomingStateKnown: false,
            validIncomingQuantity: 5,
          }),
        }),
      ),
    ).toThrow(/incomingStateKnown=false/);
  });

  it("echoes grain isolation and is deterministic", () => {
    const input = request({
      decisionInput: baseInput({
        availableQuantity: 10,
        recommendedOrderQuantity: 20,
        reorderPointUnits: 40,
        targetStockUnits: 60,
        stockoutRisk: "medium",
        daysOfStock: 3,
      }),
    });

    const a = evaluateFixtureInventoryDecision(input);
    const b = evaluateFixtureInventoryDecision(input);

    expect(a.grain).toEqual(GRAIN);
    expect(a.reproducibilityFingerprint).toBe(b.reproducibilityFingerprint);
    expect(JSON.stringify(a.decision)).toBe(JSON.stringify(b.decision));
    expect(a.provenance.algorithmApproved).toBe(false);
    expect(a.provenance.claimsM7ProductionEligibility).toBe(false);
  });
});
