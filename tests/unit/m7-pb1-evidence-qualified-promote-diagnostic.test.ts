import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluatePb1EvidenceQualifiedPromoteDiagnostic,
  M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1,
  type Pb1EvidenceQualifiedPromoteDiagnosticRequest,
} from "@/lib/decision-engine/pb1-evidence-qualified-promote-diagnostic";
import { M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1 } from "@/lib/decision-engine/metric-decision-binding";
import { resolveEligibleIncoming } from "@/lib/metrics/resolve-eligible-incoming";

const ORG = "7100e000-0000-4000-8000-000000000011";
const STORE = "7100e000-0000-4000-8000-000000000012";
const LOCATION = "7100e000-0000-4000-8000-000000000013";
const VARIANT = "7100e000-0000-4000-8000-000000000014";
const FOREIGN_ORG = "7100e000-0000-4000-8000-000000000091";
const FOREIGN_LOCATION = "7100e000-0000-4000-8000-000000000093";
const TZ = "America/New_York";
const METRIC_DATE = "2026-11-08";
const AS_OF = new Date("2026-11-08T17:00:00.000Z"); // 12:00 America/New_York
const UPDATED_AT = "2026-11-08T17:05:00.000Z";

function grain(overrides: Partial<{
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
}> = {}) {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    ...overrides,
  };
}

/**
 * Qualifying excess grain:
 * available 120 / target 70 ≈ 1.71 → overstock high when incoming known.
 * Demand pressure via falling trend; inventory age remains unknown.
 */
function qualifyingRequest(
  overrides: Partial<Pb1EvidenceQualifiedPromoteDiagnosticRequest> = {},
): Pb1EvidenceQualifiedPromoteDiagnosticRequest {
  return {
    diagnosticVersion:
      M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1,
    trustedScope: {
      organizationId: ORG,
      storeId: STORE,
      storeTimeZone: TZ,
    },
    grain: grain(),
    storeLocalAsOfDate: METRIC_DATE,
    hasPendingMetricWork: false,
    metricDate: METRIC_DATE,
    metricUpdatedAt: UPDATED_AT,
    pinnedTimeZone: TZ,
    availableQuantity: 120,
    salesVelocity30d: 2,
    daysOfStock: 60,
    safetyStock: 10,
    reorderPoint: 24,
    targetStock: 70,
    inventoryAgeDays: null,
    demandTrend: "falling",
    incoming: {
      kind: "purchase_order_lines",
      purchaseOrderLines: [],
      incomingEvidenceComplete: true,
    },
    asOfInstant: AS_OF,
    ...overrides,
  };
}

describe("M7-PB1.b evidence-qualified PROMOTE diagnostic", () => {
  it("produces canonical PROMOTE for known-zero incoming + excess + falling demand", () => {
    const resolved = resolveEligibleIncoming({
      metricDate: METRIC_DATE,
      timeZone: TZ,
      purchaseOrderLines: [],
      incomingEvidenceComplete: true,
      asOfInstant: AS_OF,
    });
    expect(resolved.incomingStateKnown).toBe(true);
    expect(resolved.eligibleIncomingQuantity).toBe(0);

    const result = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.diagnosticVersion).toBe(
      M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1,
    );
    expect(result.grain).toEqual(grain());
    expect(result.decisionInput.incomingStateKnown).toBe(true);
    expect(result.decisionInput.validIncomingQuantity).toBe(0);
    expect(result.decisionInput.overstockRisk).toBe("high");
    expect(result.decisionInput.inventoryAgeDays).toBeNull();
    expect(result.decisionInput.leadTimeDays).toBeNull();
    expect(result.decisionInput.recommendedOrderQuantity).toBeNull();
    expect(result.decisionInput.stockoutRisk).toBeNull();
    expect(result.decisionInput.forecastExpectedDemandUnits).toBeNull();

    expect(result.diagnosticDecision.actionType).toBe("PROMOTE");
    expect(result.diagnosticDecision.healthState).toBe("PROMOTE");
    expect(result.diagnosticDecision.recommendedQuantity).toBeNull();
    expect(result.diagnosticDecision.reasonCodes).toEqual(
      expect.arrayContaining([
        "ABOVE_TARGET_STOCK",
        "OVERSTOCK_RISK_HIGH",
        "FALLING_DEMAND",
      ]),
    );

    expect(result.provenance.productionApprovalEligible).toBe(false);
    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    expect(result.provenance.claimsMerchantFacing).toBe(false);
    expect(result.provenance.forecastEligibility).toBe("ineligible");
    expect(result.warnings).toContain("NOT_production_decision_create");
    expect(result.warnings).toContain("NOT_m7_3_approvable");
    expect(result.productionCreateBlockedUntil).toEqual(
      expect.arrayContaining([
        "TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED",
        "M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED",
      ]),
    );
  });

  it("also qualifies PROMOTE on known-zero demand pressure", () => {
    const result = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        salesVelocity30d: 0,
        demandTrend: "stable",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.diagnosticDecision.actionType).toBe("PROMOTE");
    expect(result.diagnosticDecision.reasonCodes).toContain("ZERO_DEMAND");
  });

  it("does not PROMOTE excess without demand pressure", () => {
    const result = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        demandTrend: "stable",
        salesVelocity30d: 3,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.overstockRisk).toBe("high");
    expect(result.diagnosticDecision.actionType).not.toBe("PROMOTE");
    expect(result.diagnosticDecision.actionType).not.toBe("REDUCE");
  });

  it("blocks derived overstock and PROMOTE when incoming is unknown", () => {
    const result = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        incoming: {
          kind: "purchase_order_lines",
          purchaseOrderLines: [],
          incomingEvidenceComplete: false,
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.incomingStateKnown).toBe(false);
    expect(result.decisionInput.validIncomingQuantity).toBeNull();
    expect(result.decisionInput.overstockRisk).toBeNull();
    expect(result.mappingNotes).toContain("RISK_NOT_DERIVED");
    expect(result.diagnosticDecision.actionType).not.toBe("PROMOTE");
    expect(result.diagnosticDecision.reasonCodes).toEqual(
      expect.arrayContaining([
        "MATERIAL_UNCERTAINTY",
        "INCOMING_STATE_UNKNOWN",
      ]),
    );
  });

  it("keeps known-zero distinct from known-positive incoming", () => {
    const zero = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest(),
    );
    const positive = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        incoming: {
          kind: "purchase_order_lines",
          purchaseOrderLines: [
            {
              orderedQuantity: 10,
              receivedQuantity: null,
              status: "confirmed",
            },
          ],
          incomingEvidenceComplete: false,
        },
      }),
    );

    expect(zero.ok).toBe(true);
    expect(positive.ok).toBe(true);
    if (!zero.ok || !positive.ok) {
      return;
    }

    expect(zero.decisionInput.validIncomingQuantity).toBe(0);
    expect(zero.diagnosticDecision.actionType).toBe("PROMOTE");

    expect(positive.decisionInput.incomingStateKnown).toBe(true);
    expect(positive.decisionInput.validIncomingQuantity).toBe(10);
    expect(positive.decisionInput.overstockRisk).toBe("high");
    // Positive incoming makes REDUCE eligible; REDUCE remains primary.
    expect(positive.diagnosticDecision.actionType).toBe("REDUCE");
    expect(positive.diagnosticDecision.compatibleSecondaryActionTypes).toContain(
      "PROMOTE",
    );
  });

  it("rejects missing target before inventing thresholds", () => {
    const result = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        targetStock: null,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.targetStockUnits).toBeNull();
    expect(result.decisionInput.overstockRisk).toBeNull();
    expect(result.diagnosticDecision.actionType).not.toBe("PROMOTE");
    expect(result.diagnosticDecision.reasonCodes).toContain(
      "TARGET_STOCK_UNKNOWN",
    );
  });

  it("rejects stale metrics under explicit staleness policy", () => {
    const result = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        metricUpdatedAt: "2026-11-01T00:00:00.000Z",
        stalenessPolicy: {
          maxAgeMs: 60_000,
          relativeTo: "2026-11-08T17:05:00.000Z",
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("METRIC_STALE");
      expect(result.provenance.productionApprovalEligible).toBe(false);
    }
  });

  it("rejects pending recompute and non-current metric dates", () => {
    const pending = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        hasPendingMetricWork: true,
      }),
    );
    expect(pending.ok).toBe(false);
    if (!pending.ok) {
      expect(pending.code).toBe("PENDING_RECOMPUTE");
    }

    const historical = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        storeLocalAsOfDate: "2026-11-09",
        metricDate: "2026-11-08",
      }),
    );
    expect(historical.ok).toBe(false);
    if (!historical.ok) {
      expect(historical.code).toBe("METRIC_DATE_NOT_CURRENT");
    }
  });

  it("never promotes org planning defaults into TrustedSupplierPlanningFacts", () => {
    const withSmuggled = evaluatePb1EvidenceQualifiedPromoteDiagnostic({
      ...qualifyingRequest(),
      supplierPlanning: {
        leadTimeDays: 7,
        sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
      },
    } as unknown as Pb1EvidenceQualifiedPromoteDiagnosticRequest);

    expect(withSmuggled.ok).toBe(false);
    if (!withSmuggled.ok) {
      expect(withSmuggled.code).toBe("SUPPLIER_FACTS_INVALID");
    }

    const clean = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest(),
    );
    expect(clean.ok).toBe(true);
    if (!clean.ok) {
      return;
    }
    expect(clean.decisionInput.leadTimeDays).toBeNull();
    expect(clean.mappingNotes).toContain("LEAD_TIME_ABSENT");
  });

  it("enforces exact tenant and location isolation", () => {
    const foreignTenant = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        trustedScope: {
          organizationId: FOREIGN_ORG,
          storeId: STORE,
          storeTimeZone: TZ,
        },
      }),
    );
    expect(foreignTenant.ok).toBe(false);
    if (!foreignTenant.ok) {
      expect(foreignTenant.code).toBe("FOREIGN_TENANT_REJECTED");
    }

    const grainMismatch = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        grain: grain({ locationId: FOREIGN_LOCATION }),
        // Metric identity is built from grain; mismatch via trustedScope store.
        trustedScope: {
          organizationId: ORG,
          storeId: "7100e000-0000-4000-8000-000000000099",
          storeTimeZone: TZ,
        },
      }),
    );
    expect(grainMismatch.ok).toBe(false);
    if (!grainMismatch.ok) {
      expect(grainMismatch.code).toBe("FOREIGN_STORE_REJECTED");
    }
  });

  it("accepts persisted known incoming projection without Actions demo evidence", () => {
    const result = evaluatePb1EvidenceQualifiedPromoteDiagnostic(
      qualifyingRequest({
        incoming: {
          kind: "persisted_eligible_incoming",
          eligibleIncomingQuantity: 0,
          eligibleIncomingReasonCode: null,
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.diagnosticDecision.actionType).toBe("PROMOTE");
    expect(result.provenance.evidenceScope).toBe(
      "m5_metric_bound_preparation_only",
    );
  });
});
