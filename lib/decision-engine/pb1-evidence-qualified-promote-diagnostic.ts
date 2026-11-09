/**
 * M7-PB1.b — evidence-qualified PROMOTE diagnostic (local preparation only).
 *
 * Reuses PB1.a binding + PB1.b offline diagnostic evaluation. Does not fork
 * promote-rule / decideInventoryAction math. Never persists, approves,
 * unlocks commercial UI, or invents supplier lead-time from org defaults.
 *
 * Authority: docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md §12.2 / §13
 * Audit: PROMOTE-first local diagnostic; production create/approve remain NO-GO.
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
  type M7DecisionGrain,
  type Pb1HardFalseProvenance,
  type Pb1MetricDecisionBindingRejection,
  type Pb1SkuDailyMetricProjection,
  type Pb1TrustedTenantScope,
} from "./metric-decision-binding";

export const M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1 =
  "m7-pb1-evidence-qualified-promote-diagnostic-v1" as const;

export type Pb1PromoteIncomingEvidenceInput =
  | {
      /**
       * Destination-scoped current-day PO lines already resolved for this grain.
       * Empty set becomes known-zero only when incomingEvidenceComplete=true.
       */
      kind: "purchase_order_lines";
      purchaseOrderLines: readonly IncomingPurchaseOrderLineInput[];
      incomingEvidenceComplete: boolean;
    }
  | {
      /**
       * Pre-resolved M5 eligible incoming already persisted/projected.
       * Caller remains responsible for never inventing known-zero.
       */
      kind: "persisted_eligible_incoming";
      eligibleIncomingQuantity: number | null;
      eligibleIncomingReasonCode: string | null;
    };

export interface Pb1EvidenceQualifiedPromoteDiagnosticRequest {
  diagnosticVersion: typeof M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1;

  trustedScope: Pb1TrustedTenantScope;
  grain: M7DecisionGrain;

  /** Store-local current as-of date; must equal metricDate. */
  storeLocalAsOfDate: string;

  /** Pending source-event / recompute work fails closed. */
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
  /**
   * Inventory age is unavailable on the M5 persist path today.
   * Leave null unless a separately trusted age projection is supplied.
   */
  inventoryAgeDays: number | null;
  demandTrend: Pb1SkuDailyMetricProjection["demandTrend"];

  incoming: Pb1PromoteIncomingEvidenceInput;

  /**
   * Org planning defaults may already have shaped M5 target/ROP/safety values
   * above. They must never appear here as TrustedSupplierPlanningFacts.
   */
  supplierPlanning?: never;

  stalenessPolicy?: {
    maxAgeMs: number;
    relativeTo: string;
  } | null;

  asOfInstant?: Date;
}

export type Pb1PromoteEvidenceFailureCode =
  | Pb1MetricDecisionBindingRejection["code"]
  | "PENDING_RECOMPUTE"
  | "METRIC_DATE_NOT_CURRENT"
  | "INCOMING_EVIDENCE_UNQUALIFIED";

export interface Pb1PromoteEvidenceRejection {
  ok: false;
  diagnosticVersion: typeof M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1;
  code: Pb1PromoteEvidenceFailureCode;
  detail: string;
  provenance: Pb1HardFalseProvenance;
}

export type Pb1EvidenceQualifiedPromoteDiagnosticResult =
  | Pb1PromoteEvidenceRejection
  | (Extract<Pb1OfflineDiagnosticDecisionResult, { ok: true }> & {
      diagnosticVersion: typeof M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1;
    })
  | (Extract<Pb1OfflineDiagnosticDecisionResult, { ok: false }> & {
      diagnosticVersion: typeof M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1;
    });

/**
 * Build one tenant-scoped current-day M5-shaped metric and run PB1.b diagnostic
 * with deriveOverstockRisk=true (ROQ/stockout derive remain off).
 */
export function evaluatePb1EvidenceQualifiedPromoteDiagnostic(
  request: Pb1EvidenceQualifiedPromoteDiagnosticRequest,
): Pb1EvidenceQualifiedPromoteDiagnosticResult {
  if (request === null || typeof request !== "object") {
    return rejectEvidence(
      "BINDING_ATTESTATION_INVALID",
      "PB1 evidence-qualified PROMOTE diagnostic request is required.",
    );
  }

  if (
    request.diagnosticVersion !==
    M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1
  ) {
    return rejectEvidence(
      "BINDING_ATTESTATION_INVALID",
      "diagnosticVersion must be m7-pb1-evidence-qualified-promote-diagnostic-v1.",
    );
  }

  // Defensive: reject any attempt to smuggle org planning into supplier facts.
  if (
    (request as { supplierPlanning?: unknown }).supplierPlanning !== undefined
  ) {
    return rejectEvidence(
      "SUPPLIER_FACTS_INVALID",
      "Org planning defaults must not populate TrustedSupplierPlanningFacts.",
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

  const incoming = resolveIncomingForDiagnostic(request);
  if (!incoming.ok) {
    return incoming;
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
    // Explicitly omit supplierPlanning — org defaults stay out of PB1 lead time.
    deriveRecommendedOrderQuantity: false,
    deriveStockoutRisk: false,
    deriveOverstockRisk: true,
    runDiagnosticDecision: true,
    stalenessPolicy: request.stalenessPolicy ?? null,
  });

  if (!diagnostic.ok) {
    return Object.freeze({
      ...diagnostic,
      diagnosticVersion:
        M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1,
    });
  }

  return Object.freeze({
    ...diagnostic,
    diagnosticVersion: M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1,
  });
}

function resolveIncomingForDiagnostic(
  request: Pb1EvidenceQualifiedPromoteDiagnosticRequest,
):
  | {
      ok: true;
      eligibleIncomingQuantity: number | null;
      eligibleIncomingReasonCode: string | null;
    }
  | Pb1PromoteEvidenceRejection {
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
  code: Pb1PromoteEvidenceFailureCode,
  detail: string,
): Pb1PromoteEvidenceRejection {
  return Object.freeze({
    ok: false as const,
    diagnosticVersion: M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1,
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
