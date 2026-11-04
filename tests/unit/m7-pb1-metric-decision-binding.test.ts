import {
  describe,
  expect,
  it,
} from "vitest";

import {
  bindMetricToDecisionInput,
  buildMetricSourceWatermark,
  M7_PB1_METRIC_BINDING_ATTESTATION_V1,
  M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
  type Pb1MetricDecisionBindingRequest,
  type Pb1SkuDailyMetricProjection,
} from "@/lib/decision-engine/metric-decision-binding";
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

describe("M7-PB1.a bindMetricToDecisionInput", () => {
  it("maps incoming-unknown M5 shape with forecast ineligible and hard-false provenance", () => {
    const result = bindMetricToDecisionInput(request());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.decisionInput.availableQuantity).toBe(40);
    expect(result.decisionInput.demandVelocity).toBe(2.5);
    expect(result.decisionInput.daysOfStock).toBe(16);
    expect(result.decisionInput.safetyStockUnits).toBe(8);
    expect(result.decisionInput.reorderPointUnits).toBe(25);
    expect(result.decisionInput.targetStockUnits).toBe(50);
    expect(result.decisionInput.incomingStateKnown).toBe(false);
    expect(result.decisionInput.validIncomingQuantity).toBeNull();
    expect(result.decisionInput.forecastExpectedDemandUnits).toBeNull();
    expect(result.decisionInput.forecastConfidence).toBe("low");
    expect(result.decisionInput.leadTimeDays).toBeNull();
    expect(result.decisionInput.recommendedOrderQuantity).toBeNull();
    expect(result.decisionInput.stockoutRisk).toBeNull();
    expect(result.decisionInput.overstockRisk).toBeNull();
    expect(result.decisionInput.dataQualityScore).toBeNull();
    expect(result.mappingNotes).toContain("FORECAST_FORCED_INELIGIBLE");
    expect(result.mappingNotes).toContain("INCOMING_STATE_UNKNOWN_PASSTHROUGH");
    expect(result.mappingNotes).toContain("INVENTORY_AGE_UNKNOWN_PASSTHROUGH");
    expect(result.mappingNotes).toContain("LEAD_TIME_ABSENT");
    expect(result.mappingNotes).toContain("DATA_QUALITY_SCORE_ABSENT");
    expect(result.mappingNotes).toContain("ROQ_NOT_DERIVED");
    expect(result.mappingNotes).toContain("RISK_NOT_DERIVED");
    expect(result.provenance.claimsMerchantFacing).toBe(false);
    expect(result.provenance.claimsProductionForecastApproval).toBe(false);
    expect(result.provenance.claimsM7ProductionEligibility).toBe(false);
    expect(result.provenance.algorithmApproved).toBe(false);
    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    expect(result.provenance.productionApprovalEligible).toBe(false);
    expect(result.provenance.engineBoundBriefEligible).toBe(false);
    expect(result.provenance.forecastEligibility).toBe("ineligible");
    expect(result.warnings).toEqual([
      "m5_metric_bound_preparation_only",
      "NOT_merchant_facing",
      "NOT_production_activation",
      "NOT_production_forecast",
      "NOT_production_decision_create",
      "NOT_m7_3_approvable",
      "NOT_engine_bound_brief",
    ]);
    expect(result.metricSourceWatermark).toBe(
      buildMetricSourceWatermark({
        metricDate: METRIC_DATE,
        algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
        updatedAt: UPDATED_AT,
      }),
    );
    expect(result.grain).toEqual(grain());
  });

  it("maps demand_trend=unknown to null", () => {
    const result = bindMetricToDecisionInput(
      request({
        metric: metric({ demandTrend: "unknown" }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.demandTrend).toBeNull();
    expect(result.mappingNotes).toContain("DEMAND_TREND_UNKNOWN_TO_NULL");
  });

  it("rejects foreign org and store", () => {
    const foreignOrg = bindMetricToDecisionInput(
      request({
        trustedScope: {
          organizationId: "7100e000-0000-4000-8000-000000000099",
          storeId: STORE,
          storeTimeZone: TZ,
        },
      }),
    );
    expect(foreignOrg.ok).toBe(false);
    if (foreignOrg.ok) {
      return;
    }
    expect(foreignOrg.code).toBe("FOREIGN_TENANT_REJECTED");
    expect(foreignOrg.provenance.productionApprovalEligible).toBe(false);

    const foreignStore = bindMetricToDecisionInput(
      request({
        trustedScope: {
          organizationId: ORG,
          storeId: "7100e000-0000-4000-8000-000000000098",
          storeTimeZone: TZ,
        },
      }),
    );
    expect(foreignStore.ok).toBe(false);
    if (foreignStore.ok) {
      return;
    }
    expect(foreignStore.code).toBe("FOREIGN_STORE_REJECTED");
  });

  it("rejects grain mismatch", () => {
    const result = bindMetricToDecisionInput(
      request({
        grain: {
          ...grain(),
          locationId: "7100e000-0000-4000-8000-000000000077",
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("GRAIN_MISMATCH");
  });

  it("rejects unsupported metric algorithm", () => {
    const result = bindMetricToDecisionInput(
      request({
        metric: metric({ algorithmVersion: "other-algorithm-v0" }),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("UNSUPPORTED_METRIC_ALGORITHM");
  });

  it("rejects invalid and mismatched timezones", () => {
    const invalid = bindMetricToDecisionInput(
      request({ pinnedTimeZone: "Not/A_Zone" }),
    );
    expect(invalid.ok).toBe(false);
    if (invalid.ok) {
      return;
    }
    expect(invalid.code).toBe("TIMEZONE_INVALID");

    const mismatch = bindMetricToDecisionInput(
      request({ pinnedTimeZone: "Europe/London" }),
    );
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) {
      return;
    }
    expect(mismatch.code).toBe("TIMEZONE_MISMATCH");
  });

  it("rejects incoming nullability/reason coupling violations", () => {
    const bothPresent = bindMetricToDecisionInput(
      request({
        metric: metric({
          eligibleIncomingQuantity: 5,
          eligibleIncomingReasonCode: "incoming_state_unknown",
        }),
      }),
    );
    expect(bothPresent.ok).toBe(false);
    if (bothPresent.ok) {
      return;
    }
    expect(bothPresent.code).toBe("METRIC_ROW_INVARIANT_VIOLATION");

    const bothAbsent = bindMetricToDecisionInput(
      request({
        metric: metric({
          eligibleIncomingQuantity: null,
          eligibleIncomingReasonCode: null,
        }),
      }),
    );
    expect(bothAbsent.ok).toBe(false);
    if (bothAbsent.ok) {
      return;
    }
    expect(bothAbsent.code).toBe("METRIC_ROW_INVARIANT_VIOLATION");
  });

  it("rejects numeric invalid, nonfinite, and negative values", () => {
    const negative = bindMetricToDecisionInput(
      request({
        metric: metric({ availableQuantity: -1 }),
      }),
    );
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.code).toBe("NUMERIC_INVALID");
    }

    const nonInteger = bindMetricToDecisionInput(
      request({
        metric: metric({ safetyStock: 1.5 }),
      }),
    );
    expect(nonInteger.ok).toBe(false);
    if (!nonInteger.ok) {
      expect(nonInteger.code).toBe("NUMERIC_INVALID");
    }

    const nanVelocity = bindMetricToDecisionInput(
      request({
        metric: metric({ salesVelocity30d: Number.NaN }),
      }),
    );
    expect(nanVelocity.ok).toBe(false);
    if (!nanVelocity.ok) {
      expect(nanVelocity.code).toBe("NUMERIC_INVALID");
    }

    const infiniteDays = bindMetricToDecisionInput(
      request({
        metric: metric({ daysOfStock: Number.POSITIVE_INFINITY }),
      }),
    );
    expect(infiniteDays.ok).toBe(false);
    if (!infiniteDays.ok) {
      expect(infiniteDays.code).toBe("NUMERIC_INVALID");
    }
  });

  it("rejects stale metrics when policy is supplied; maps when absent", () => {
    const stale = bindMetricToDecisionInput(
      request({
        stalenessPolicy: {
          maxAgeMs: 60_000,
          relativeTo: "2026-10-15T14:00:00.000Z",
        },
      }),
    );
    expect(stale.ok).toBe(false);
    if (stale.ok) {
      return;
    }
    expect(stale.code).toBe("METRIC_STALE");

    const fresh = bindMetricToDecisionInput(
      request({
        stalenessPolicy: {
          maxAgeMs: 3_600_000,
          relativeTo: "2026-10-15T12:30:00.000Z",
        },
      }),
    );
    expect(fresh.ok).toBe(true);

    const noPolicy = bindMetricToDecisionInput(request());
    expect(noPolicy.ok).toBe(true);
  });

  it("maps supplier lead time when valid; rejects invalid; null when absent", () => {
    const absent = bindMetricToDecisionInput(request());
    expect(absent.ok).toBe(true);
    if (absent.ok) {
      expect(absent.decisionInput.leadTimeDays).toBeNull();
      expect(absent.mappingNotes).toContain("LEAD_TIME_ABSENT");
    }

    const present = bindMetricToDecisionInput(
      request({
        supplierPlanning: {
          leadTimeDays: 7,
          sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
        },
      }),
    );
    expect(present.ok).toBe(true);
    if (present.ok) {
      expect(present.decisionInput.leadTimeDays).toBe(7);
      expect(present.mappingNotes).toContain(
        "LEAD_TIME_FROM_TRUSTED_SUPPLIER_FACTS",
      );
    }

    const invalid = bindMetricToDecisionInput(
      request({
        supplierPlanning: {
          leadTimeDays: -3,
          sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
        },
      }),
    );
    expect(invalid.ok).toBe(false);
    if (invalid.ok) {
      return;
    }
    expect(invalid.code).toBe("SUPPLIER_FACTS_INVALID");
  });

  it("keeps ROQ and risks null when derive flags default off", () => {
    const result = bindMetricToDecisionInput(
      request({
        metric: metric({
          eligibleIncomingQuantity: 0,
          eligibleIncomingReasonCode: null,
          availableQuantity: 10,
          targetStock: 40,
        }),
        supplierPlanning: {
          leadTimeDays: 5,
          sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.incomingStateKnown).toBe(true);
    expect(result.decisionInput.recommendedOrderQuantity).toBeNull();
    expect(result.decisionInput.stockoutRisk).toBeNull();
    expect(result.decisionInput.overstockRisk).toBeNull();
    expect(result.mappingNotes).toContain("ROQ_NOT_DERIVED");
    expect(result.mappingNotes).toContain("RISK_NOT_DERIVED");
  });

  it("leaves ROQ null when derive is on but incoming is unknown", () => {
    const result = bindMetricToDecisionInput(
      request({
        deriveRecommendedOrderQuantity: true,
        metric: metric({
          availableQuantity: 10,
          targetStock: 40,
          eligibleIncomingQuantity: null,
          eligibleIncomingReasonCode: "incoming_state_unknown",
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.recommendedOrderQuantity).toBeNull();
    expect(result.mappingNotes).toContain("ROQ_NOT_DERIVED");
  });

  it("derives ROQ when inputs are complete", () => {
    const result = bindMetricToDecisionInput(
      request({
        deriveRecommendedOrderQuantity: true,
        metric: metric({
          availableQuantity: 10,
          targetStock: 40,
          eligibleIncomingQuantity: 0,
          eligibleIncomingReasonCode: null,
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.recommendedOrderQuantity).toBe(30);
    expect(result.mappingNotes).toContain("ROQ_DERIVED");
  });

  it("rejects production trust claims and non-ineligible forecast", () => {
    const trust = bindMetricToDecisionInput(
      request({
        claimsMerchantFacing: true as unknown as false,
      }),
    );
    expect(trust.ok).toBe(false);
    if (trust.ok) {
      return;
    }
    expect(trust.code).toBe("PRODUCTION_TRUST_CLAIM_REJECTED");

    const forecast = bindMetricToDecisionInput(
      request({
        forecastEligibility: "fixture_synthetic" as unknown as "ineligible",
      }),
    );
    expect(forecast.ok).toBe(false);
    if (forecast.ok) {
      return;
    }
    expect(forecast.code).toBe("FORECAST_ELIGIBILITY_INVALID");
  });

  it("never places non-null forecastExpectedDemandUnits on the success path", () => {
    const result = bindMetricToDecisionInput(request());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.forecastExpectedDemandUnits).toBeNull();
  });

  it("is deterministic for the same request", () => {
    const a = bindMetricToDecisionInput(request());
    const b = bindMetricToDecisionInput(request());
    expect(a).toEqual(b);
  });

  it("maps known incoming when quantity present and reason null", () => {
    const result = bindMetricToDecisionInput(
      request({
        metric: metric({
          eligibleIncomingQuantity: 12,
          eligibleIncomingReasonCode: null,
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.incomingStateKnown).toBe(true);
    expect(result.decisionInput.validIncomingQuantity).toBe(12);
    expect(result.mappingNotes).not.toContain(
      "INCOMING_STATE_UNKNOWN_PASSTHROUGH",
    );
  });

  it("rejects invalid metric date and blank identity adversarial inputs", () => {
    const badDate = bindMetricToDecisionInput(
      request({
        metric: metric({ metricDate: "2026-02-31" }),
      }),
    );
    expect(badDate.ok).toBe(false);
    if (!badDate.ok) {
      expect(badDate.code).toBe("METRIC_ROW_INVARIANT_VIOLATION");
    }

    const blankPinned = bindMetricToDecisionInput(
      request({ pinnedTimeZone: "   " }),
    );
    expect(blankPinned.ok).toBe(false);
    if (!blankPinned.ok) {
      expect(blankPinned.code).toBe("TIMEZONE_INVALID");
    }

    const blankVariant = bindMetricToDecisionInput(
      request({
        grain: { ...grain(), variantId: "  " },
      }),
    );
    expect(blankVariant.ok).toBe(false);
    if (!blankVariant.ok) {
      expect(blankVariant.code).toBe("GRAIN_MISMATCH");
    }
  });

  it("rejects cross-grain aggregation and multi-row adversarial inputs", () => {
    const crossGrain = bindMetricToDecisionInput(
      {
        ...request(),
        metrics: [metric(), metric()],
      } as unknown as Pb1MetricDecisionBindingRequest,
    );
    expect(crossGrain.ok).toBe(false);
    if (!crossGrain.ok) {
      expect(crossGrain.code).toBe("CROSS_GRAIN_AGGREGATION_FORBIDDEN");
    }

    const multiRow = bindMetricToDecisionInput(
      {
        ...request(),
        metric: [metric(), metric()],
      } as unknown as Pb1MetricDecisionBindingRequest,
    );
    expect(multiRow.ok).toBe(false);
    if (!multiRow.ok) {
      expect(multiRow.code).toBe("MULTI_ROW_INPUT");
    }
  });

  it("rejects bad supplier attestation and does not invent lead time", () => {
    const badAttestation = bindMetricToDecisionInput(
      request({
        supplierPlanning: {
          leadTimeDays: 4,
          sourceAttestation: "other" as typeof M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
        },
      }),
    );
    expect(badAttestation.ok).toBe(false);
    if (!badAttestation.ok) {
      expect(badAttestation.code).toBe("SUPPLIER_FACTS_INVALID");
    }
  });

  it("derives overstock risk via frozen math when complete; stockout stays null without safetyStockDays", () => {
    const result = bindMetricToDecisionInput(
      request({
        deriveStockoutRisk: true,
        deriveOverstockRisk: true,
        supplierPlanning: {
          leadTimeDays: 7,
          sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
        },
        metric: metric({
          availableQuantity: 100,
          targetStock: 40,
          eligibleIncomingQuantity: 0,
          eligibleIncomingReasonCode: null,
          daysOfStock: 5,
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.stockoutRisk).toBeNull();
    expect(result.decisionInput.overstockRisk).toBe("high");
    expect(result.mappingNotes).toContain("RISK_DERIVED_PARTIAL_OR_FULL");
  });

  it("freezes success and rejection outputs", () => {
    const success = bindMetricToDecisionInput(request());
    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(Object.isFrozen(success)).toBe(true);
      expect(Object.isFrozen(success.decisionInput)).toBe(true);
      expect(Object.isFrozen(success.provenance)).toBe(true);
      expect(Object.isFrozen(success.mappingNotes)).toBe(true);
      expect(Object.isFrozen(success.warnings)).toBe(true);
    }

    const rejection = bindMetricToDecisionInput(
      request({
        metric: metric({ algorithmVersion: "nope" }),
      }),
    );
    expect(rejection.ok).toBe(false);
    if (!rejection.ok) {
      expect(Object.isFrozen(rejection)).toBe(true);
      expect(Object.isFrozen(rejection.provenance)).toBe(true);
    }
  });

  it("trims whitespace identity duplicates to the same grain", () => {
    const result = bindMetricToDecisionInput(
      request({
        trustedScope: {
          organizationId: ` ${ORG} `,
          storeId: ` ${STORE} `,
          storeTimeZone: TZ,
        },
        grain: {
          organizationId: ` ${ORG} `,
          storeId: ` ${STORE} `,
          locationId: ` ${LOCATION} `,
          variantId: ` ${VARIANT} `,
        },
        metric: metric({
          organizationId: ` ${ORG} `,
          storeId: ` ${STORE} `,
          locationId: ` ${LOCATION} `,
          variantId: ` ${VARIANT} `,
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.grain).toEqual(grain());
  });
});
