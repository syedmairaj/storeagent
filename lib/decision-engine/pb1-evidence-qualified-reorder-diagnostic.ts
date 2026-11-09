/**
 * M7-PB1.f — evidence-qualified REORDER diagnostic (local preparation only).
 *
 * Reuses PB1.a binding + PB1.b offline diagnostic evaluation with
 * TrustedSupplierPlanningFacts from durable supplier_products stated terms.
 * Does not fork reorder-rule / decideInventoryAction / ROQ math.
 * Never persists, approves, unlocks commercial UI, or uses org planning
 * defaults / supplier defaults / PO latency as PB1 lead time.
 *
 * Authority: docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md §3.4 / §13
 */

import { resolveEligibleIncoming } from "@/lib/metrics/resolve-eligible-incoming";
import type { IncomingPurchaseOrderLineInput } from "@/lib/metrics/types";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";

import {
  evaluatePb1OfflineDiagnosticFromBindingRequest,
  type Pb1OfflineDiagnosticDecisionResult,
} from "./metric-decision-diagnostic";

import {
  M7_PB1_METRIC_BINDING_ATTESTATION_V1,
  M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
  type M7DecisionGrain,
  type Pb1HardFalseProvenance,
  type Pb1MetricDecisionBindingRejection,
  type Pb1SkuDailyMetricProjection,
  type Pb1TrustedTenantScope,
  type TrustedSupplierPlanningFacts,
} from "./metric-decision-binding";

export const M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1 =
  "m7-pb1-evidence-qualified-reorder-diagnostic-v1" as const;

export type Pb1ReorderIncomingEvidenceInput =
  | {
      kind: "purchase_order_lines";
      purchaseOrderLines: readonly IncomingPurchaseOrderLineInput[];
      incomingEvidenceComplete: boolean;
    }
  | {
      kind: "persisted_eligible_incoming";
      eligibleIncomingQuantity: number | null;
      eligibleIncomingReasonCode: string | null;
    };

export type Pb1ReorderLeadTimeProvenance = {
  kind: "stated_supplier_product_terms";
  sourceAttestation: typeof M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1;
  supplierId: string;
  supplierProductId: string;
  supplierProductUpdatedAt: string;
  notVerifiedDeliveryPerformance: true;
  /**
   * M5 ROP/target/safety may already reflect organization_planning_inputs.
   * PB1 decision leadTimeDays is independently bound from supplier_products.
   * This slice does not recalculate frozen M5 thresholds.
   */
  m5ThresholdLeadTimeSource: "organization_planning_inputs_may_differ";
  dualSourceLeadTimeNote: "M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS";
};

export interface Pb1EvidenceQualifiedReorderDiagnosticRequest {
  diagnosticVersion: typeof M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1;

  trustedScope: Pb1TrustedTenantScope;
  grain: M7DecisionGrain;

  storeLocalAsOfDate: string;
  hasPendingMetricWork: boolean;

  metricDate: string;
  metricUpdatedAt: string;
  pinnedTimeZone: string;

  availableQuantity: number | null;
  salesVelocity30d: number | null;
  daysOfStock: number | null;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  inventoryAgeDays: number | null;
  demandTrend: Pb1SkuDailyMetricProjection["demandTrend"];

  incoming: Pb1ReorderIncomingEvidenceInput;

  /**
   * Must be resolved from durable supplier_products via PB1.f resolver.
   * Org planning defaults / supplier defaults are forbidden here.
   */
  supplierPlanning: TrustedSupplierPlanningFacts;
  supplierId: string;
  supplierProductId: string;
  supplierProductUpdatedAt: string;

  organizationPlanningLeadTimeDays?: never;
  supplierDefaultLeadTimeDays?: never;

  stalenessPolicy?: {
    maxAgeMs: number;
    relativeTo: string;
  } | null;

  asOfInstant?: Date;
}

export type Pb1ReorderEvidenceFailureCode =
  | Pb1MetricDecisionBindingRejection["code"]
  | "PENDING_RECOMPUTE"
  | "METRIC_DATE_NOT_CURRENT"
  | "INCOMING_EVIDENCE_UNQUALIFIED"
  | "REORDER_EVIDENCE_INCOMPLETE"
  | "ORG_PLANNING_DEFAULTS_FORBIDDEN"
  | "SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN";

export interface Pb1ReorderEvidenceRejection {
  ok: false;
  diagnosticVersion: typeof M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1;
  code: Pb1ReorderEvidenceFailureCode;
  detail: string;
  provenance: Pb1HardFalseProvenance;
}

export type Pb1EvidenceQualifiedReorderDiagnosticSuccess =
  Extract<Pb1OfflineDiagnosticDecisionResult, { ok: true }> & {
    diagnosticVersion: typeof M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1;
    leadTimeProvenance: Pb1ReorderLeadTimeProvenance;
    reorderDiagnosticNotes: readonly [
      "STATED_SUPPLIER_PRODUCT_LEAD_TIME_NOT_VERIFIED_PERFORMANCE",
      "M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS",
      "NOT_production_decision_create",
      "NOT_m7_3_approvable",
    ];
  };

export type Pb1EvidenceQualifiedReorderDiagnosticResult =
  | Pb1ReorderEvidenceRejection
  | Pb1EvidenceQualifiedReorderDiagnosticSuccess
  | (Extract<Pb1OfflineDiagnosticDecisionResult, { ok: false }> & {
      diagnosticVersion: typeof M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1;
    });

/**
 * Build one tenant-scoped current-day M5-shaped metric, bind stated
 * supplier_products lead time, derive ROQ via frozen inventory-math, and run
 * diagnostic decideInventoryAction. Production gates stay hard-false.
 */
export function evaluatePb1EvidenceQualifiedReorderDiagnostic(
  request: Pb1EvidenceQualifiedReorderDiagnosticRequest,
): Pb1EvidenceQualifiedReorderDiagnosticResult {
  if (request === null || typeof request !== "object") {
    return rejectEvidence(
      "BINDING_ATTESTATION_INVALID",
      "PB1 evidence-qualified REORDER diagnostic request is required.",
    );
  }

  if (
    request.diagnosticVersion !==
    M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1
  ) {
    return rejectEvidence(
      "BINDING_ATTESTATION_INVALID",
      "diagnosticVersion must be m7-pb1-evidence-qualified-reorder-diagnostic-v1.",
    );
  }

  if (
    (request as { organizationPlanningLeadTimeDays?: unknown })
      .organizationPlanningLeadTimeDays !== undefined
  ) {
    return rejectEvidence(
      "ORG_PLANNING_DEFAULTS_FORBIDDEN",
      "organization_planning_inputs must not populate TrustedSupplierPlanningFacts.",
    );
  }

  if (
    (request as { supplierDefaultLeadTimeDays?: unknown })
      .supplierDefaultLeadTimeDays !== undefined
  ) {
    return rejectEvidence(
      "SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN",
      "suppliers.default_lead_time_days must not populate TrustedSupplierPlanningFacts.",
    );
  }

  if (request.hasPendingMetricWork !== false) {
    return rejectEvidence(
      "PENDING_RECOMPUTE",
      "Pending metric recompute/source work rejects diagnostic evidence.",
    );
  }

  if (
    typeof request.storeLocalAsOfDate !== "string" ||
    request.storeLocalAsOfDate.trim().length === 0 ||
    request.storeLocalAsOfDate !== request.metricDate
  ) {
    return rejectEvidence(
      "METRIC_DATE_NOT_CURRENT",
      "metricDate must equal store-local current as-of date.",
    );
  }

  const supplierPlanning = validateSupplierPlanning(request.supplierPlanning);
  if (!supplierPlanning.ok) {
    return supplierPlanning;
  }

  if (
    typeof request.supplierId !== "string" ||
    request.supplierId.trim().length === 0 ||
    typeof request.supplierProductId !== "string" ||
    request.supplierProductId.trim().length === 0 ||
    typeof request.supplierProductUpdatedAt !== "string" ||
    request.supplierProductUpdatedAt.trim().length === 0
  ) {
    return rejectEvidence(
      "SUPPLIER_FACTS_INVALID",
      "supplierId, supplierProductId, and supplierProductUpdatedAt are required provenance.",
    );
  }

  const incoming = resolveIncomingForDiagnostic(request);
  if (!incoming.ok) {
    return incoming;
  }

  if (
    incoming.eligibleIncomingQuantity === null ||
    incoming.eligibleIncomingReasonCode !== null
  ) {
    return rejectEvidence(
      "INCOMING_EVIDENCE_UNQUALIFIED",
      "REORDER diagnostic requires known incoming state (null≠0).",
    );
  }

  if (
    request.availableQuantity === null ||
    request.salesVelocity30d === null ||
    request.reorderPoint === null ||
    request.targetStock === null
  ) {
    return rejectEvidence(
      "REORDER_EVIDENCE_INCOMPLETE",
      "REORDER diagnostic requires known available, demand velocity, ROP, and target.",
    );
  }

  const metric: Pb1SkuDailyMetricProjection = {
    organizationId: request.grain.organizationId,
    storeId: request.grain.storeId,
    locationId: request.grain.locationId,
    variantId: request.grain.variantId,
    metricDate: request.metricDate,
    algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
    updatedAt: request.metricUpdatedAt,
    availableQuantity: request.availableQuantity,
    eligibleIncomingQuantity: incoming.eligibleIncomingQuantity,
    eligibleIncomingReasonCode: incoming.eligibleIncomingReasonCode,
    salesVelocity30d: request.salesVelocity30d,
    daysOfStock: request.daysOfStock,
    safetyStock: request.safetyStock,
    reorderPoint: request.reorderPoint,
    targetStock: request.targetStock,
    inventoryAgeDays: request.inventoryAgeDays,
    demandTrend: request.demandTrend,
  };

  const diagnostic = evaluatePb1OfflineDiagnosticFromBindingRequest({
    bindingVersion: M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
    trustedScope: request.trustedScope,
    grain: request.grain,
    metric,
    pinnedTimeZone: request.pinnedTimeZone,
    bindingAttestation: M7_PB1_METRIC_BINDING_ATTESTATION_V1,
    forecastEligibility: "ineligible",
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    supplierPlanning: supplierPlanning.value,
    deriveRecommendedOrderQuantity: true,
    deriveStockoutRisk: false,
    deriveOverstockRisk: false,
    runDiagnosticDecision: true,
    stalenessPolicy: request.stalenessPolicy ?? null,
  });

  if (!diagnostic.ok) {
    return Object.freeze({
      ...diagnostic,
      diagnosticVersion:
        M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
    });
  }

  if (
    diagnostic.decisionInput.recommendedOrderQuantity === null ||
    diagnostic.decisionInput.recommendedOrderQuantity <= 0
  ) {
    return rejectEvidence(
      "REORDER_EVIDENCE_INCOMPLETE",
      "Canonical ROQ must be known and > 0 for evidence-qualified REORDER diagnostic.",
    );
  }

  const leadTimeProvenance: Pb1ReorderLeadTimeProvenance = Object.freeze({
    kind: "stated_supplier_product_terms",
    sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
    supplierId: request.supplierId.trim(),
    supplierProductId: request.supplierProductId.trim(),
    supplierProductUpdatedAt: request.supplierProductUpdatedAt.trim(),
    notVerifiedDeliveryPerformance: true,
    m5ThresholdLeadTimeSource: "organization_planning_inputs_may_differ",
    dualSourceLeadTimeNote:
      "M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS",
  });

  return Object.freeze({
    ...diagnostic,
    diagnosticVersion: M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
    leadTimeProvenance,
    reorderDiagnosticNotes: Object.freeze([
      "STATED_SUPPLIER_PRODUCT_LEAD_TIME_NOT_VERIFIED_PERFORMANCE",
      "M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS",
      "NOT_production_decision_create",
      "NOT_m7_3_approvable",
    ] as const),
  });
}

function validateSupplierPlanning(
  facts: TrustedSupplierPlanningFacts,
):
  | { ok: true; value: TrustedSupplierPlanningFacts }
  | Pb1ReorderEvidenceRejection {
  if (facts === null || typeof facts !== "object") {
    return rejectEvidence(
      "SUPPLIER_FACTS_INVALID",
      "supplierPlanning is required for REORDER diagnostic.",
    );
  }

  if (
    facts.sourceAttestation !== M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1
  ) {
    return rejectEvidence(
      "SUPPLIER_FACTS_INVALID",
      "supplierPlanning.sourceAttestation must be pb1_trusted_supplier_planning_v1.",
    );
  }

  if (
    typeof facts.leadTimeDays !== "number" ||
    !Number.isFinite(facts.leadTimeDays) ||
    facts.leadTimeDays < 0
  ) {
    return rejectEvidence(
      "SUPPLIER_FACTS_INVALID",
      "supplierPlanning.leadTimeDays must be a non-negative finite number.",
    );
  }

  return {
    ok: true,
    value: {
      leadTimeDays: facts.leadTimeDays,
      sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
    },
  };
}

function resolveIncomingForDiagnostic(
  request: Pb1EvidenceQualifiedReorderDiagnosticRequest,
):
  | {
      ok: true;
      eligibleIncomingQuantity: number | null;
      eligibleIncomingReasonCode: string | null;
    }
  | Pb1ReorderEvidenceRejection {
  const incoming = request.incoming;

  if (incoming.kind === "persisted_eligible_incoming") {
    return {
      ok: true,
      eligibleIncomingQuantity: incoming.eligibleIncomingQuantity,
      eligibleIncomingReasonCode: incoming.eligibleIncomingReasonCode,
    };
  }

  if (incoming.kind !== "purchase_order_lines") {
    return rejectEvidence(
      "INCOMING_EVIDENCE_UNQUALIFIED",
      "Incoming evidence kind is unsupported.",
    );
  }

  if (!Array.isArray(incoming.purchaseOrderLines)) {
    return rejectEvidence(
      "INCOMING_EVIDENCE_UNQUALIFIED",
      "purchaseOrderLines must be an array.",
    );
  }

  if (typeof incoming.incomingEvidenceComplete !== "boolean") {
    return rejectEvidence(
      "INCOMING_EVIDENCE_UNQUALIFIED",
      "incomingEvidenceComplete must be an explicit boolean.",
    );
  }

  const resolved = resolveEligibleIncoming({
    metricDate: request.metricDate,
    timeZone: request.pinnedTimeZone,
    purchaseOrderLines: incoming.purchaseOrderLines,
    incomingEvidenceComplete: incoming.incomingEvidenceComplete,
    asOfInstant: request.asOfInstant,
  });

  return {
    ok: true,
    eligibleIncomingQuantity: resolved.eligibleIncomingQuantity,
    eligibleIncomingReasonCode:
      resolved.eligibleIncomingReasonCode === null
        ? null
        : resolved.eligibleIncomingReasonCode.toLowerCase(),
  };
}

function rejectEvidence(
  code: Pb1ReorderEvidenceFailureCode,
  detail: string,
): Pb1ReorderEvidenceRejection {
  return Object.freeze({
    ok: false as const,
    diagnosticVersion: M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
    code,
    detail,
    provenance: Object.freeze({
      audience: "internal_preparation" as const,
      evidenceScope: "m5_metric_bound_preparation_only" as const,
      forecastEligibility: "ineligible" as const,
      isScoredMerchantDecision: false as const,
      claimsMerchantFacing: false as const,
      claimsProductionForecastApproval: false as const,
      claimsM7ProductionEligibility: false as const,
      algorithmApproved: false as const,
      productionDecisionCreationEligible: false as const,
      productionApprovalEligible: false as const,
      notProductionActivation: true as const,
      engineBoundBriefEligible: false as const,
    }),
  });
}
