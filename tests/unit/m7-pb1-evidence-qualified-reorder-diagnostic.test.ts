import { describe, expect, it } from "vitest";

import {
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
} from "@/lib/decision-engine/metric-decision-binding";
import {
  evaluatePb1EvidenceQualifiedReorderDiagnostic,
  M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
  type Pb1EvidenceQualifiedReorderDiagnosticRequest,
} from "@/lib/decision-engine/pb1-evidence-qualified-reorder-diagnostic";
import {
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
  resolvePb1TrustedSupplierPlanningFacts,
} from "@/lib/decision-engine/pb1-trusted-supplier-planning-facts";
import { calculateRecommendedOrderQuantity } from "@/lib/metrics/inventory-math";

const ORG = "7400e000-0000-4000-8000-000000000011";
const STORE = "7400e000-0000-4000-8000-000000000012";
const LOCATION = "7400e000-0000-4000-8000-000000000013";
const VARIANT = "7400e000-0000-4000-8000-000000000014";
const SUPPLIER = "7400e000-0000-4000-8000-000000000021";
const PRODUCT = "7400e000-0000-4000-8000-000000000031";
const FOREIGN_ORG = "7400e000-0000-4000-8000-000000000091";
const TZ = "America/New_York";
const METRIC_DATE = "2026-11-08";
const AS_OF = new Date("2026-11-08T17:00:00.000Z");
const UPDATED_AT = "2026-11-08T17:05:00.000Z";

function grain() {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
  };
}

function supplierFacts(leadTimeDays = 7) {
  const resolved = resolvePb1TrustedSupplierPlanningFacts({
    resolverVersion:
      M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
    organizationId: ORG,
    variantId: VARIANT,
    rows: [
      {
        id: PRODUCT,
        organizationId: ORG,
        supplierId: SUPPLIER,
        variantId: VARIANT,
        leadTimeDays,
        preferred: true,
        updatedAt: "2026-11-08T16:00:00.000Z",
      },
    ],
  });
  if (!resolved.ok) {
    throw new Error(resolved.detail);
  }
  return resolved;
}

/**
 * Below-ROP replenishment grain:
 * available 10 + incoming 0 < ROP 40; target 60 → ROQ 50.
 */
function qualifyingRequest(
  overrides: Partial<Pb1EvidenceQualifiedReorderDiagnosticRequest> = {},
): Pb1EvidenceQualifiedReorderDiagnosticRequest {
  const facts = supplierFacts(7);
  return {
    diagnosticVersion:
      M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
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
    availableQuantity: 10,
    salesVelocity30d: 5,
    daysOfStock: 2,
    safetyStock: 5,
    reorderPoint: 40,
    targetStock: 60,
    inventoryAgeDays: null,
    demandTrend: "stable",
    incoming: {
      kind: "purchase_order_lines",
      purchaseOrderLines: [],
      incomingEvidenceComplete: true,
    },
    supplierPlanning: facts.supplierPlanning,
    supplierId: facts.supplierId,
    supplierProductId: facts.supplierProductId,
    supplierProductUpdatedAt: facts.supplierProductUpdatedAt,
    asOfInstant: AS_OF,
    ...overrides,
  };
}

describe("M7-PB1.f evidence-qualified REORDER diagnostic", () => {
  it("produces canonical REORDER with supplier_products LT and derived ROQ", () => {
    const expectedRoq = calculateRecommendedOrderQuantity({
      targetStockUnits: 60,
      availableQuantity: 10,
      validIncomingQuantity: 0,
      incomingStateKnown: true,
    });
    expect(expectedRoq.value).toBe(50);

    const result = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.diagnosticVersion).toBe(
      M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
    );
    expect(result.decisionInput.leadTimeDays).toBe(7);
    expect(result.decisionInput.incomingStateKnown).toBe(true);
    expect(result.decisionInput.validIncomingQuantity).toBe(0);
    expect(result.decisionInput.recommendedOrderQuantity).toBe(50);
    expect(result.mappingNotes).toContain(
      "LEAD_TIME_FROM_TRUSTED_SUPPLIER_FACTS",
    );
    expect(result.mappingNotes).toContain("ROQ_DERIVED");
    expect(result.diagnosticDecision.actionType).toBe("REORDER");
    expect(result.diagnosticDecision.recommendedQuantity).toBe(50);
    expect(result.diagnosticDecision.reasonCodes).toEqual(
      expect.arrayContaining([
        "REORDER_QUANTITY_POSITIVE",
        "BELOW_REORDER_POINT",
      ]),
    );

    expect(result.leadTimeProvenance).toMatchObject({
      kind: "stated_supplier_product_terms",
      sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
      notVerifiedDeliveryPerformance: true,
      m5ThresholdLeadTimeSource: "organization_planning_inputs_may_differ",
    });
    expect(result.reorderDiagnosticNotes).toEqual(
      expect.arrayContaining([
        "STATED_SUPPLIER_PRODUCT_LEAD_TIME_NOT_VERIFIED_PERFORMANCE",
        "M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS",
        "NOT_production_decision_create",
        "NOT_m7_3_approvable",
      ]),
    );

    expect(result.provenance.productionApprovalEligible).toBe(false);
    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    expect(result.provenance.claimsMerchantFacing).toBe(false);
    expect(result.provenance.forecastEligibility).toBe("ineligible");
  });

  it("accepts known-zero supplier lead time for REORDER diagnostic", () => {
    const facts = supplierFacts(0);
    const result = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({
        supplierPlanning: facts.supplierPlanning,
        supplierId: facts.supplierId,
        supplierProductId: facts.supplierProductId,
        supplierProductUpdatedAt: facts.supplierProductUpdatedAt,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.leadTimeDays).toBe(0);
    expect(result.diagnosticDecision.actionType).toBe("REORDER");
  });

  it("fails closed when incoming is unknown", () => {
    const result = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({
        incoming: {
          kind: "purchase_order_lines",
          purchaseOrderLines: [],
          incomingEvidenceComplete: false,
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("INCOMING_EVIDENCE_UNQUALIFIED");
    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
  });

  it("fails closed when ROQ cannot be positive", () => {
    const result = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({
        availableQuantity: 60,
        reorderPoint: 40,
        targetStock: 60,
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("REORDER_EVIDENCE_INCOMPLETE");
  });

  it("fails closed on missing available / demand / ROP / target", () => {
    const missingAvailable = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({ availableQuantity: null }),
    );
    expect(missingAvailable.ok).toBe(false);
    if (!missingAvailable.ok) {
      expect(missingAvailable.code).toBe("REORDER_EVIDENCE_INCOMPLETE");
    }

    const missingDemand = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({ salesVelocity30d: null }),
    );
    expect(missingDemand.ok).toBe(false);
  });

  it("rejects pending and non-current metric evidence", () => {
    const pending = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({ hasPendingMetricWork: true }),
    );
    expect(pending.ok).toBe(false);
    if (!pending.ok) {
      expect(pending.code).toBe("PENDING_RECOMPUTE");
    }

    const staleDate = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({ metricDate: "2026-11-07" }),
    );
    expect(staleDate.ok).toBe(false);
    if (!staleDate.ok) {
      expect(staleDate.code).toBe("METRIC_DATE_NOT_CURRENT");
    }
  });

  it("rejects foreign tenant scope vs metric grain", () => {
    const result = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({
        trustedScope: {
          organizationId: FOREIGN_ORG,
          storeId: STORE,
          storeTimeZone: TZ,
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("FOREIGN_TENANT_REJECTED");
  });

  it("rejects org planning defaults and supplier default surfaces", () => {
    const orgDefaults = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      // @ts-expect-error intentional forbidden surface
      qualifyingRequest({ organizationPlanningLeadTimeDays: 11 }),
    );
    expect(orgDefaults.ok).toBe(false);
    if (!orgDefaults.ok) {
      expect(orgDefaults.code).toBe("ORG_PLANNING_DEFAULTS_FORBIDDEN");
    }

    const supplierDefault = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      // @ts-expect-error intentional forbidden surface
      qualifyingRequest({ supplierDefaultLeadTimeDays: 14 }),
    );
    expect(supplierDefault.ok).toBe(false);
    if (!supplierDefault.ok) {
      expect(supplierDefault.code).toBe(
        "SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN",
      );
    }
  });

  it("rejects invalid supplier attestation and keeps production gates hard-false", () => {
    const result = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({
        supplierPlanning: {
          leadTimeDays: 7,
          // @ts-expect-error intentional bad attestation
          sourceAttestation: "not-trusted",
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("SUPPLIER_FACTS_INVALID");
    expect(result.provenance.productionApprovalEligible).toBe(false);
    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    expect(result.provenance.claimsMerchantFacing).toBe(false);
  });

  it("rejects metric staleness policy violations", () => {
    const result = evaluatePb1EvidenceQualifiedReorderDiagnostic(
      qualifyingRequest({
        stalenessPolicy: {
          maxAgeMs: 1_000,
          relativeTo: "2026-11-08T18:00:00.000Z",
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("METRIC_STALE");
  });
});
