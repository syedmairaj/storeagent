import {
  describe,
  expect,
  it,
} from "vitest";

import {
  bindMetricToDecisionInput,
  M7_PB1_METRIC_BINDING_ATTESTATION_V1,
  M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
  type Pb1MetricDecisionBindingRequest,
  type Pb1MetricDecisionBindingSuccess,
  type Pb1SkuDailyMetricProjection,
} from "@/lib/decision-engine/metric-decision-binding";
import {
  evaluatePb1OfflineDiagnosticDecision,
  evaluatePb1OfflineDiagnosticFromBindingRequest,
  M7_PB1_OFFLINE_DIAGNOSTIC_EVALUATION_VERSION_V1,
} from "@/lib/decision-engine/metric-decision-diagnostic";
import type { InventoryDecisionInput } from "@/lib/decision-engine/types";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";

const ORG = "7100e000-0000-4000-8000-000000000001";
const STORE = "7100e000-0000-4000-8000-000000000002";
const LOCATION = "7100e000-0000-4000-8000-000000000003";
const VARIANT = "7100e000-0000-4000-8000-000000000004";
const TZ = "America/New_York";
const METRIC_DATE = "2026-10-14";
const UPDATED_AT = "2026-10-15T12:00:00.000Z";

function grain() {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
  };
}

function metric(
  overrides: Partial<Pb1SkuDailyMetricProjection> = {},
): Pb1SkuDailyMetricProjection {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    metricDate: METRIC_DATE,
    algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
    updatedAt: UPDATED_AT,
    availableQuantity: 40,
    eligibleIncomingQuantity: null,
    eligibleIncomingReasonCode: "incoming_state_unknown",
    salesVelocity30d: 2.5,
    daysOfStock: 16,
    safetyStock: 8,
    reorderPoint: 25,
    targetStock: 50,
    inventoryAgeDays: null,
    demandTrend: "stable",
    ...overrides,
  };
}

function request(
  overrides: Partial<Pb1MetricDecisionBindingRequest> = {},
): Pb1MetricDecisionBindingRequest {
  return {
    bindingVersion: M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
    trustedScope: {
      organizationId: ORG,
      storeId: STORE,
      storeTimeZone: TZ,
    },
    grain: grain(),
    metric: metric(),
    pinnedTimeZone: TZ,
    bindingAttestation: M7_PB1_METRIC_BINDING_ATTESTATION_V1,
    forecastEligibility: "ineligible",
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    ...overrides,
  };
}

function bindSuccess(): Pb1MetricDecisionBindingSuccess {
  const result = bindMetricToDecisionInput(request());
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected PB1.a success");
  }
  return result;
}

describe("M7-PB1.b evaluatePb1OfflineDiagnosticDecision", () => {
  it("evaluates M5-like unknown incoming to WATCH with uncertainty codes", () => {
    const result = evaluatePb1OfflineDiagnosticDecision(bindSuccess());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.diagnosticEvaluationVersion).toBe(
      M7_PB1_OFFLINE_DIAGNOSTIC_EVALUATION_VERSION_V1,
    );
    expect(result.decisionAlgorithmVersion).toBe("inventory-decision-v1");
    expect(result.grain).toEqual(grain());
    expect(result.metricDate).toBe(METRIC_DATE);
    expect(result.pinnedTimeZone).toBe(TZ);
    expect(result.decisionInput.incomingStateKnown).toBe(false);
    expect(result.decisionInput.validIncomingQuantity).toBeNull();
    expect(result.decisionInput.forecastExpectedDemandUnits).toBeNull();
    expect(result.decisionInput.forecastConfidence).toBe("low");

    expect(result.diagnosticDecision.actionType).toBe("WATCH");
    expect(result.diagnosticDecision.healthState).toBe("WATCH");
    expect(result.diagnosticDecision.reasonCodes).toEqual(
      expect.arrayContaining([
        "MATERIAL_UNCERTAINTY",
        "INCOMING_STATE_UNKNOWN",
        "FORECAST_UNAVAILABLE",
      ]),
    );

    expect(result.diagnosticEvidence.incomingQuantity).toBeNull();
    expect(result.diagnosticEvidence.forecastExpectedDemandUnits).toBeNull();
    expect(result.diagnosticEvidence.reasonCodes).toEqual(
      result.diagnosticDecision.reasonCodes,
    );

    expect(result.mappingNotes).toContain("DIAGNOSTIC_DECISION_RUN");
    expect(result.mappingNotes).toContain("FORECAST_FORCED_INELIGIBLE");
    expect(result.mappingNotes).toContain("INCOMING_STATE_UNKNOWN_PASSTHROUGH");

    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    expect(result.provenance.productionApprovalEligible).toBe(false);
    expect(result.provenance.claimsMerchantFacing).toBe(false);
    expect(result.provenance.forecastEligibility).toBe("ineligible");
    expect(result.warnings).toContain("NOT_production_decision_create");
    expect(result.warnings).toContain("NOT_m7_3_approvable");
  });

  it("supports runDiagnosticDecision=true via binding-request entry point", () => {
    const result = evaluatePb1OfflineDiagnosticFromBindingRequest(
      request({ runDiagnosticDecision: true }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.diagnosticDecision.actionType).toBe("WATCH");
    expect(result.mappingNotes).toContain("DIAGNOSTIC_DECISION_RUN");
  });

  it("rejects missing runDiagnosticDecision on the request entry point", () => {
    const result = evaluatePb1OfflineDiagnosticFromBindingRequest(request());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BINDING_ATTESTATION_INVALID");
      expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    }
  });

  it("rejects caller-supplied decisionInput bypass on the request entry point", () => {
    const result = evaluatePb1OfflineDiagnosticFromBindingRequest({
      ...request({ runDiagnosticDecision: true }),
      decisionInput: {
        availableQuantity: 1,
        validIncomingQuantity: 0,
        incomingStateKnown: true,
        demandVelocity: 1,
        daysOfStock: 1,
        leadTimeDays: 1,
        safetyStockUnits: 1,
        reorderPointUnits: 1,
        targetStockUnits: 1,
        recommendedOrderQuantity: 1,
        inventoryAgeDays: 1,
        demandTrend: "rising",
        stockoutRisk: "high",
        overstockRisk: null,
        forecastExpectedDemandUnits: 99,
        forecastConfidence: "high",
        dataQualityScore: 1,
      },
    } as unknown as Pb1MetricDecisionBindingRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BINDING_ATTESTATION_INVALID");
    }
  });

  it("rejects arbitrary InventoryDecisionInput", () => {
    const forgedInput: InventoryDecisionInput = {
      availableQuantity: 1,
      validIncomingQuantity: 0,
      incomingStateKnown: true,
      demandVelocity: 5,
      daysOfStock: 2,
      leadTimeDays: 7,
      safetyStockUnits: 3,
      reorderPointUnits: 10,
      targetStockUnits: 20,
      recommendedOrderQuantity: 5,
      inventoryAgeDays: null,
      demandTrend: "rising",
      stockoutRisk: "high",
      overstockRisk: null,
      forecastExpectedDemandUnits: 40,
      forecastConfidence: "high",
      dataQualityScore: null,
    };

    const result = evaluatePb1OfflineDiagnosticDecision(forgedInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BINDING_ATTESTATION_INVALID");
      expect(result.detail).toMatch(/InventoryDecisionInput/i);
    }
  });

  it("rejects forged success-shaped objects that bypass PB1.a mint", () => {
    const real = bindSuccess();
    const forged = {
      ...real,
      grain: {
        ...real.grain,
        organizationId: "foreign-org",
      },
      decisionInput: {
        ...real.decisionInput,
        forecastExpectedDemandUnits: 100,
        forecastConfidence: "high" as const,
      },
    };

    const result = evaluatePb1OfflineDiagnosticDecision(forged);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BINDING_ATTESTATION_INVALID");
      expect(result.provenance.productionApprovalEligible).toBe(false);
    }
  });

  it("rejects missing, null, and PB1.a rejection inputs", () => {
    expect(evaluatePb1OfflineDiagnosticDecision(undefined).ok).toBe(false);
    expect(evaluatePb1OfflineDiagnosticDecision(null).ok).toBe(false);

    const rejected = bindMetricToDecisionInput(
      request({
        metric: metric({ algorithmVersion: "other" }),
      }),
    );
    expect(rejected.ok).toBe(false);
    const diagnostic = evaluatePb1OfflineDiagnosticDecision(rejected);
    expect(diagnostic.ok).toBe(false);
    if (!diagnostic.ok) {
      expect(diagnostic.code).toBe("BINDING_ATTESTATION_INVALID");
    }
  });

  it("propagates PB1.a foreign-scope rejections from the request entry point", () => {
    const foreignOrg = evaluatePb1OfflineDiagnosticFromBindingRequest(
      request({
        runDiagnosticDecision: true,
        trustedScope: {
          organizationId: "other-org",
          storeId: STORE,
          storeTimeZone: TZ,
        },
      }),
    );
    expect(foreignOrg.ok).toBe(false);
    if (!foreignOrg.ok) {
      expect(foreignOrg.code).toBe("FOREIGN_TENANT_REJECTED");
    }

    const foreignStore = evaluatePb1OfflineDiagnosticFromBindingRequest(
      request({
        runDiagnosticDecision: true,
        trustedScope: {
          organizationId: ORG,
          storeId: "other-store",
          storeTimeZone: TZ,
        },
      }),
    );
    expect(foreignStore.ok).toBe(false);
    if (!foreignStore.ok) {
      expect(foreignStore.code).toBe("FOREIGN_STORE_REJECTED");
    }
  });

  it("preserves uncertain forecast signals and does not invent demand", () => {
    const result = evaluatePb1OfflineDiagnosticDecision(bindSuccess());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.forecastExpectedDemandUnits).toBeNull();
    expect(result.diagnosticDecision.reasonCodes).toContain(
      "FORECAST_UNAVAILABLE",
    );
    expect(result.diagnosticEvidence.forecastExpectedDemandUnits).toBeNull();
  });

  it("is deterministic and freezes diagnostic outputs", () => {
    const binding = bindSuccess();
    const a = evaluatePb1OfflineDiagnosticDecision(binding);
    const b = evaluatePb1OfflineDiagnosticDecision(binding);

    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    if (!a.ok) {
      return;
    }

    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.diagnosticDecision)).toBe(true);
    expect(Object.isFrozen(a.diagnosticEvidence)).toBe(true);
    expect(Object.isFrozen(a.diagnosticDecision.reasonCodes)).toBe(true);
    expect(
      Object.isFrozen(a.diagnosticDecision.compatibleSecondaryActionTypes),
    ).toBe(true);
    expect(Object.isFrozen(a.diagnosticEvidence.reasonCodes)).toBe(true);
    expect(Object.isFrozen(a.decisionInput)).toBe(true);
    expect(Object.isFrozen(a.mappingNotes)).toBe(true);
    expect(Object.isFrozen(a.provenance)).toBe(true);
    expect(Object.isFrozen(a.grain)).toBe(true);
  });

  it("never forces REORDER, REDUCE, or PROMOTE on uncertain M5-like inputs", () => {
    const result = evaluatePb1OfflineDiagnosticDecision(bindSuccess());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(["WATCH", "HEALTHY"]).toContain(result.diagnosticDecision.healthState);
    expect(result.diagnosticDecision.actionType).not.toBe("REORDER");
    expect(result.diagnosticDecision.actionType).not.toBe("REDUCE");
    expect(result.diagnosticDecision.actionType).not.toBe("PROMOTE");
  });

  it("keeps production create gates blocked even when diagnostic runs", () => {
    const result = evaluatePb1OfflineDiagnosticFromBindingRequest(
      request({ runDiagnosticDecision: true }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.productionCreateBlockedUntil).toEqual(
      expect.arrayContaining([
        "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
        "TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED",
        "M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED",
      ]),
    );
    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    expect(result.provenance.productionApprovalEligible).toBe(false);
    expect(result.provenance.engineBoundBriefEligible).toBe(false);
  });

  it("fail-closes malformed binding requests without emitting diagnostic fields", () => {
    const result = evaluatePb1OfflineDiagnosticFromBindingRequest(
      request({
        runDiagnosticDecision: true,
        metric: metric({
          eligibleIncomingQuantity: null,
          eligibleIncomingReasonCode: null,
        }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("METRIC_ROW_INVARIANT_VIOLATION");
      expect(
        (result as { diagnosticDecision?: unknown }).diagnosticDecision,
      ).toBeUndefined();
    }
  });

  it("blocks post-mint mutation of decisionInput, grain, provenance, and nested diagnostic arrays", () => {
    const binding = bindSuccess();

    expect(() => {
      (
        binding.decisionInput as {
          forecastExpectedDemandUnits: number;
        }
      ).forecastExpectedDemandUnits = 99;
    }).toThrow(TypeError);
    expect(() => {
      (binding.grain as { organizationId: string }).organizationId =
        "foreign-org";
    }).toThrow(TypeError);
    expect(() => {
      (
        binding.provenance as {
          productionApprovalEligible: boolean;
        }
      ).productionApprovalEligible = true;
    }).toThrow(TypeError);
    expect(() => {
      (
        binding.provenance as {
          productionDecisionCreationEligible: boolean;
        }
      ).productionDecisionCreationEligible = true;
    }).toThrow(TypeError);
    expect(() => {
      (binding as { decisionInput: unknown }).decisionInput = {
        ...binding.decisionInput,
        forecastExpectedDemandUnits: 50,
      };
    }).toThrow(TypeError);

    const result = evaluatePb1OfflineDiagnosticDecision(binding);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.decisionInput.forecastExpectedDemandUnits).toBeNull();
    expect(result.grain.organizationId).toBe(ORG);
    expect(result.provenance.productionApprovalEligible).toBe(false);

    expect(Object.isFrozen(result.diagnosticDecision.reasonCodes)).toBe(true);
    expect(
      Object.isFrozen(result.diagnosticDecision.compatibleSecondaryActionTypes),
    ).toBe(true);
    expect(Object.isFrozen(result.diagnosticEvidence.reasonCodes)).toBe(true);

    expect(() => {
      (result.diagnosticDecision.reasonCodes as string[]).push(
        "HEALTHY_NO_INTERVENTION",
      );
    }).toThrow(TypeError);
    expect(() => {
      (result.diagnosticEvidence.reasonCodes as string[]).push("X");
    }).toThrow(TypeError);
  });

  it("rejects JSON-recreated and structuredClone copies of minted successes", () => {
    const binding = bindSuccess();

    const jsonClone = JSON.parse(JSON.stringify(binding));
    const jsonResult = evaluatePb1OfflineDiagnosticDecision(jsonClone);
    expect(jsonResult.ok).toBe(false);
    if (!jsonResult.ok) {
      expect(jsonResult.code).toBe("BINDING_ATTESTATION_INVALID");
    }

    const structured = structuredClone(binding);
    const structuredResult = evaluatePb1OfflineDiagnosticDecision(structured);
    expect(structuredResult.ok).toBe(false);
    if (!structuredResult.ok) {
      expect(structuredResult.code).toBe("BINDING_ATTESTATION_INVALID");
    }
  });

  it("ignores request mutation after binding and keeps reused successes production-ineligible", () => {
    const req = request();
    const binding = bindMetricToDecisionInput(req);
    expect(binding.ok).toBe(true);
    if (!binding.ok) {
      return;
    }

    req.metric.availableQuantity = 999;
    req.metric.eligibleIncomingQuantity = 50;
    req.metric.eligibleIncomingReasonCode = null;
    req.grain.organizationId = "mutated-org";
    req.trustedScope.organizationId = "mutated-org";
    (req as { claimsMerchantFacing: boolean }).claimsMerchantFacing = true;

    expect(binding.decisionInput.availableQuantity).toBe(40);
    expect(binding.decisionInput.incomingStateKnown).toBe(false);
    expect(binding.grain.organizationId).toBe(ORG);

    const first = evaluatePb1OfflineDiagnosticDecision(binding);
    const second = evaluatePb1OfflineDiagnosticDecision(binding);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.decisionInput.availableQuantity).toBe(40);
    expect(first.grain.organizationId).toBe(ORG);
    expect(first.provenance.productionDecisionCreationEligible).toBe(false);
    expect(first.provenance.productionApprovalEligible).toBe(false);
    expect(second.provenance.productionDecisionCreationEligible).toBe(false);
    expect(second.provenance.productionApprovalEligible).toBe(false);
    expect(second.provenance.claimsMerchantFacing).toBe(false);
    expect(first.reproducibilityFingerprint).toBe(
      second.reproducibilityFingerprint,
    );
  });
});
