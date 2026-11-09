/**
 * M7-PB1.h.2 — pure supplier mapping fence (LOCAL read-model only).
 *
 * Validates observed supplier_products identity, preferred cardinality,
 * lead-time rules, and updated_at watermark consistency. Reuses PB1.f
 * resolvePb1TrustedSupplierPlanningFacts — does not invent org defaults,
 * supplier defaults, or PO delivery performance.
 *
 * Does NOT prove phantom preferred INSERT/UPDATE races (§2.3 remains
 * PROPOSED / UNENFORCED). transactionSafety is always "unproven".
 *
 * Authority: docs/M7_PB1_H1_PRODUCTION_EVIDENCE_FENCING_CONTRACT.md §2 / §4
 */

import {
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
  resolvePb1TrustedSupplierPlanningFacts,
  type Pb1SupplierProductLeadTimeRow,
  type Pb1TrustedSupplierPlanningFactsFailureCode,
} from "./pb1-trusted-supplier-planning-facts";

import type { TrustedSupplierPlanningFacts } from "./metric-decision-binding";

export const M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1 =
  "m7-pb1-supplier-concurrency-fence-v1" as const;

export type Pb1SupplierConcurrencyFenceFailureCode =
  | Pb1TrustedSupplierPlanningFactsFailureCode
  | "FENCE_ATTESTATION_INVALID"
  | "SUPPLIER_FACTS_STALE"
  | "SUPPLIER_PRODUCT_ID_MISMATCH"
  | "BOUND_SUPPLIER_EVIDENCE_INVALID";

export type Pb1SupplierBoundFacts = {
  organizationId: string;
  variantId: string;
  supplierId: string;
  supplierProductId: string;
  supplierProductUpdatedAt: string;
  /**
   * Stated lead_time_days previously bound. Known zero (0) is distinct
   * from null/absent — null≠0.
   */
  leadTimeDays: number;
};

export type Pb1SupplierConcurrencyFenceRequest = {
  fenceVersion: typeof M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1;
  organizationId: string;
  variantId: string;
  /**
   * Explicit selection when supplied; otherwise implicit preferred path.
   */
  supplierId?: string | null;
  /**
   * Observed supplier_products projections for this org+variant (caller-scoped).
   */
  rows: readonly Pb1SupplierProductLeadTimeRow[];
  /**
   * Optional prior-bound supplier facts. When present, current resolution
   * must match exact org+supplier+variant+supplierProductId+updated_at+LT.
   */
  bound?: Pb1SupplierBoundFacts | null;
  organizationPlanningLeadTimeDays?: never;
  supplierDefaultLeadTimeDays?: never;
};

export type Pb1SupplierConcurrencyFenceRejection = {
  ok: false;
  fenceVersion: typeof M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1;
  code: Pb1SupplierConcurrencyFenceFailureCode;
  detail: string;
  selectionMode: "explicit" | "implicit_preferred" | "unknown";
  observedEvidenceValidity: "invalid";
  /**
   * Pure helpers never prove shared org+variant writer serialization.
   */
  transactionSafety: "unproven";
  productionCreateEligible: false;
  commercialActionsEligible: false;
  notVerifiedDeliveryPerformance: true;
};

export type Pb1SupplierConcurrencyFenceSuccess = {
  ok: true;
  fenceVersion: typeof M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1;
  selectionMode: "explicit" | "implicit_preferred";
  organizationId: string;
  variantId: string;
  supplierId: string;
  supplierProductId: string;
  supplierProductUpdatedAt: string;
  leadTimeDays: number;
  provenanceKind: "stated_supplier_product_terms";
  notVerifiedDeliveryPerformance: true;
  supplierPlanning: TrustedSupplierPlanningFacts;
  observedEvidenceValidity: "valid";
  transactionSafety: "unproven";
  productionCreateEligible: false;
  commercialActionsEligible: false;
  notes: readonly [
    "LOCAL_READ_MODEL_SUPPLIER_FENCE_ONLY",
    "NOT_phantom_preferred_race_proof",
    "NOT_create_transaction_serialization_proof",
    "STATED_SUPPLIER_PRODUCT_LEAD_TIME_NOT_VERIFIED_PERFORMANCE",
    "NOT_production_decision_create",
  ];
};

export type Pb1SupplierConcurrencyFenceResult =
  | Pb1SupplierConcurrencyFenceRejection
  | Pb1SupplierConcurrencyFenceSuccess;

/**
 * Pure supplier fence over observed supplier_products rows + optional bound watermark.
 */
export function evaluatePb1SupplierConcurrencyFence(
  request: Pb1SupplierConcurrencyFenceRequest,
): Pb1SupplierConcurrencyFenceResult {
  if (request === null || typeof request !== "object") {
    return reject(
      "FENCE_ATTESTATION_INVALID",
      "PB1.h.2 supplier concurrency fence request is required.",
      "unknown",
    );
  }

  if (request.fenceVersion !== M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1) {
    return reject(
      "FENCE_ATTESTATION_INVALID",
      "fenceVersion must be m7-pb1-supplier-concurrency-fence-v1.",
      "unknown",
    );
  }

  if (
    (request as { organizationPlanningLeadTimeDays?: unknown })
      .organizationPlanningLeadTimeDays !== undefined
  ) {
    return reject(
      "ORG_PLANNING_DEFAULTS_FORBIDDEN",
      "organization_planning_inputs must not populate supplier fence facts.",
      selectionModeOf(request.supplierId),
    );
  }

  if (
    (request as { supplierDefaultLeadTimeDays?: unknown })
      .supplierDefaultLeadTimeDays !== undefined
  ) {
    return reject(
      "SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN",
      "suppliers.default_lead_time_days must not populate supplier fence facts.",
      selectionModeOf(request.supplierId),
    );
  }

  const selectionMode = selectionModeOf(request.supplierId);
  const bound = request.bound ?? null;

  if (bound !== null) {
    const boundCheck = validateBound(bound, request.organizationId, request.variantId);
    if (!boundCheck.ok) {
      return reject(boundCheck.code, boundCheck.detail, selectionMode);
    }
  }

  const resolved = resolvePb1TrustedSupplierPlanningFacts({
    resolverVersion: M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
    organizationId: request.organizationId,
    variantId: request.variantId,
    supplierId: request.supplierId,
    rows: request.rows,
  });

  if (!resolved.ok) {
    if (bound !== null) {
      if (
        resolved.code === "SUPPLIER_MAPPING_NOT_FOUND" ||
        (resolved.code === "SUPPLIER_FACTS_ABSENT" &&
          request.rows.length === 0)
      ) {
        return reject(
          "SUPPLIER_MAPPING_NOT_FOUND",
          "Bound supplier mapping is absent or deleted on re-observation.",
          selectionMode,
        );
      }
      if (resolved.code === "SUPPLIER_FACTS_ABSENT") {
        return reject(
          "SUPPLIER_FACTS_STALE",
          "Bound supplier facts are no longer valid (cleared LT or preferred; null≠0).",
          selectionMode,
        );
      }
    }
    return reject(resolved.code, resolved.detail, selectionMode);
  }

  if (bound !== null) {
    if (resolved.supplierId !== bound.supplierId) {
      return reject(
        "SUPPLIER_FACTS_STALE",
        "Resolved supplierId diverges from bound supplier facts.",
        selectionMode,
      );
    }
    if (resolved.supplierProductId !== bound.supplierProductId) {
      return reject(
        "SUPPLIER_PRODUCT_ID_MISMATCH",
        "Resolved supplierProductId diverges from bound supplier_products.id.",
        selectionMode,
      );
    }
    if (resolved.supplierProductUpdatedAt !== bound.supplierProductUpdatedAt) {
      return reject(
        "SUPPLIER_FACTS_STALE",
        "supplier_products.updated_at watermark diverges from bound revision.",
        selectionMode,
      );
    }
    if (resolved.supplierPlanning.leadTimeDays !== bound.leadTimeDays) {
      return reject(
        "SUPPLIER_FACTS_STALE",
        "supplier_products.lead_time_days diverges from bound lead time (null≠0).",
        selectionMode,
      );
    }
  }

  return Object.freeze({
    ok: true as const,
    fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
    selectionMode,
    organizationId: resolved.organizationId,
    variantId: resolved.variantId,
    supplierId: resolved.supplierId,
    supplierProductId: resolved.supplierProductId,
    supplierProductUpdatedAt: resolved.supplierProductUpdatedAt,
    leadTimeDays: resolved.supplierPlanning.leadTimeDays,
    provenanceKind: "stated_supplier_product_terms" as const,
    notVerifiedDeliveryPerformance: true as const,
    supplierPlanning: resolved.supplierPlanning,
    observedEvidenceValidity: "valid" as const,
    transactionSafety: "unproven" as const,
    productionCreateEligible: false as const,
    commercialActionsEligible: false as const,
    notes: Object.freeze([
      "LOCAL_READ_MODEL_SUPPLIER_FENCE_ONLY",
      "NOT_phantom_preferred_race_proof",
      "NOT_create_transaction_serialization_proof",
      "STATED_SUPPLIER_PRODUCT_LEAD_TIME_NOT_VERIFIED_PERFORMANCE",
      "NOT_production_decision_create",
    ] as const),
  });
}

function validateBound(
  bound: Pb1SupplierBoundFacts,
  organizationId: string,
  variantId: string,
):
  | { ok: true }
  | {
      ok: false;
      code: Pb1SupplierConcurrencyFenceFailureCode;
      detail: string;
    } {
  if (bound === null || typeof bound !== "object") {
    return {
      ok: false,
      code: "BOUND_SUPPLIER_EVIDENCE_INVALID",
      detail: "bound supplier evidence is malformed.",
    };
  }

  if (
    !trimRequired(bound.organizationId) ||
    !trimRequired(bound.variantId) ||
    !trimRequired(bound.supplierId) ||
    !trimRequired(bound.supplierProductId) ||
    !trimRequired(bound.supplierProductUpdatedAt)
  ) {
    return {
      ok: false,
      code: "BOUND_SUPPLIER_EVIDENCE_INVALID",
      detail: "bound supplier identity and updated_at watermark are required.",
    };
  }

  if (bound.organizationId !== organizationId) {
    return {
      ok: false,
      code: "FOREIGN_TENANT_REJECTED",
      detail: "bound.organizationId does not match fence organizationId.",
    };
  }

  if (bound.variantId !== variantId) {
    return {
      ok: false,
      code: "VARIANT_MISMATCH",
      detail: "bound.variantId does not match fence variantId.",
    };
  }

  if (
    typeof bound.leadTimeDays !== "number" ||
    !Number.isFinite(bound.leadTimeDays) ||
    bound.leadTimeDays < 0
  ) {
    return {
      ok: false,
      code: "BOUND_SUPPLIER_EVIDENCE_INVALID",
      detail:
        "bound.leadTimeDays must be a non-negative finite number (null≠0).",
    };
  }

  return { ok: true };
}

function selectionModeOf(
  supplierId: string | null | undefined,
): "explicit" | "implicit_preferred" {
  if (supplierId === undefined || supplierId === null) {
    return "implicit_preferred";
  }
  return "explicit";
}

function reject(
  code: Pb1SupplierConcurrencyFenceFailureCode,
  detail: string,
  selectionMode: "explicit" | "implicit_preferred" | "unknown",
): Pb1SupplierConcurrencyFenceRejection {
  return Object.freeze({
    ok: false as const,
    fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
    code,
    detail,
    selectionMode,
    observedEvidenceValidity: "invalid" as const,
    transactionSafety: "unproven" as const,
    productionCreateEligible: false as const,
    commercialActionsEligible: false as const,
    notVerifiedDeliveryPerformance: true as const,
  });
}

function trimRequired(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
