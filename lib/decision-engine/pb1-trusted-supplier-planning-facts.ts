/**
 * M7-PB1.f — resolve durable supplier_products lead time into
 * TrustedSupplierPlanningFacts (diagnostic preparation only).
 *
 * Authority: docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md §3.4
 * Provenance: stated supplier/SKU terms from supplier_products — NOT verified
 * delivery performance, NOT organization_planning_inputs, NOT supplier defaults.
 */

import {
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
  type TrustedSupplierPlanningFacts,
} from "./metric-decision-binding";

export const M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1 =
  "m7-pb1-trusted-supplier-planning-facts-resolver-v1" as const;

export type Pb1SupplierProductLeadTimeRow = {
  id: string;
  organizationId: string;
  supplierId: string;
  variantId: string;
  leadTimeDays: number | null;
  preferred: boolean;
  updatedAt: string;
};

export type Pb1TrustedSupplierPlanningFactsFailureCode =
  | "RESOLVER_ATTESTATION_INVALID"
  | "FOREIGN_TENANT_REJECTED"
  | "VARIANT_MISMATCH"
  | "SUPPLIER_MAPPING_NOT_FOUND"
  | "SUPPLIER_FACTS_ABSENT"
  | "SUPPLIER_FACTS_AMBIGUOUS"
  | "SUPPLIER_FACTS_INVALID"
  | "ORG_PLANNING_DEFAULTS_FORBIDDEN"
  | "SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN";

export type Pb1TrustedSupplierPlanningFactsRejection = {
  ok: false;
  resolverVersion: typeof M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1;
  code: Pb1TrustedSupplierPlanningFactsFailureCode;
  detail: string;
};

export type Pb1TrustedSupplierPlanningFactsSuccess = {
  ok: true;
  resolverVersion: typeof M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1;
  organizationId: string;
  variantId: string;
  supplierId: string;
  supplierProductId: string;
  supplierProductUpdatedAt: string;
  /**
   * Stated supplier/SKU contractual/import terms only.
   * Never independently verified order-to-receipt performance.
   */
  provenanceKind: "stated_supplier_product_terms";
  notVerifiedDeliveryPerformance: true;
  supplierPlanning: TrustedSupplierPlanningFacts;
};

export type Pb1TrustedSupplierPlanningFactsResult =
  | Pb1TrustedSupplierPlanningFactsRejection
  | Pb1TrustedSupplierPlanningFactsSuccess;

export type Pb1ResolveTrustedSupplierPlanningFactsRequest = {
  resolverVersion: typeof M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1;
  organizationId: string;
  variantId: string;
  /**
   * When supplied, require an exact org+variant+supplier mapping.
   * When omitted, require exactly one preferred mapping with valid LT.
   */
  supplierId?: string | null;
  /**
   * Candidate rows already scoped by the trusted caller to this org+variant
   * (or a broader org set). Resolver re-checks org/variant identity.
   */
  rows: readonly Pb1SupplierProductLeadTimeRow[];
  /**
   * Explicit ban surface: org planning defaults must never appear here.
   */
  organizationPlanningLeadTimeDays?: never;
  supplierDefaultLeadTimeDays?: never;
};

/**
 * Fail-closed read-time resolution of stated supplier_products lead time.
 * No caching; callers must re-load rows after any supplier-product mutation.
 */
export function resolvePb1TrustedSupplierPlanningFacts(
  request: Pb1ResolveTrustedSupplierPlanningFactsRequest,
): Pb1TrustedSupplierPlanningFactsResult {
  if (request === null || typeof request !== "object") {
    return reject(
      "RESOLVER_ATTESTATION_INVALID",
      "PB1.f supplier planning facts request is required.",
    );
  }

  if (
    request.resolverVersion !==
    M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1
  ) {
    return reject(
      "RESOLVER_ATTESTATION_INVALID",
      "resolverVersion must be m7-pb1-trusted-supplier-planning-facts-resolver-v1.",
    );
  }

  if (
    (request as { organizationPlanningLeadTimeDays?: unknown })
      .organizationPlanningLeadTimeDays !== undefined
  ) {
    return reject(
      "ORG_PLANNING_DEFAULTS_FORBIDDEN",
      "organization_planning_inputs must not populate TrustedSupplierPlanningFacts.",
    );
  }

  if (
    (request as { supplierDefaultLeadTimeDays?: unknown })
      .supplierDefaultLeadTimeDays !== undefined
  ) {
    return reject(
      "SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN",
      "suppliers.default_lead_time_days must not populate TrustedSupplierPlanningFacts.",
    );
  }

  const organizationId = trimRequired(request.organizationId);
  const variantId = trimRequired(request.variantId);
  if (!organizationId || !variantId) {
    return reject(
      "RESOLVER_ATTESTATION_INVALID",
      "organizationId and variantId are required.",
    );
  }

  if (!Array.isArray(request.rows)) {
    return reject(
      "RESOLVER_ATTESTATION_INVALID",
      "rows must be an array of supplier_products projections.",
    );
  }

  for (const row of request.rows) {
    if (row === null || typeof row !== "object") {
      return reject(
        "SUPPLIER_FACTS_INVALID",
        "supplier_products row projection is malformed.",
      );
    }
    if (row.organizationId !== organizationId) {
      return reject(
        "FOREIGN_TENANT_REJECTED",
        "supplier_products row organizationId does not match request scope.",
      );
    }
    if (row.variantId !== variantId) {
      return reject(
        "VARIANT_MISMATCH",
        "supplier_products row variantId does not match request variant.",
      );
    }
  }

  const explicitSupplierId =
    request.supplierId === undefined || request.supplierId === null
      ? null
      : trimRequired(request.supplierId);

  if (request.supplierId != null && !explicitSupplierId) {
    return reject(
      "SUPPLIER_MAPPING_NOT_FOUND",
      "supplierId must be non-blank when supplied.",
    );
  }

  if (explicitSupplierId) {
    const matches = request.rows.filter(
      (row) => row.supplierId === explicitSupplierId,
    );
    if (matches.length === 0) {
      return reject(
        "SUPPLIER_MAPPING_NOT_FOUND",
        "No supplier_products mapping for organizationId+variantId+supplierId.",
      );
    }
    if (matches.length > 1) {
      return reject(
        "SUPPLIER_FACTS_AMBIGUOUS",
        "Multiple supplier_products rows for the same organizationId+supplierId+variantId.",
      );
    }
    return factsFromRow(matches[0]!, organizationId, variantId);
  }

  const preferredWithLeadTime = request.rows.filter(
    (row) => row.preferred === true && row.leadTimeDays !== null,
  );

  if (preferredWithLeadTime.length === 0) {
    const preferredNullOnly = request.rows.some(
      (row) => row.preferred === true && row.leadTimeDays === null,
    );
    return reject(
      preferredNullOnly ? "SUPPLIER_FACTS_ABSENT" : "SUPPLIER_FACTS_ABSENT",
      preferredNullOnly
        ? "Preferred supplier_products mapping has unknown (null) lead_time_days."
        : "No preferred supplier_products mapping with known lead_time_days.",
    );
  }

  if (preferredWithLeadTime.length > 1) {
    return reject(
      "SUPPLIER_FACTS_AMBIGUOUS",
      "Multiple preferred supplier_products mappings with lead_time_days; supply supplierId.",
    );
  }

  return factsFromRow(preferredWithLeadTime[0]!, organizationId, variantId);
}

function factsFromRow(
  row: Pb1SupplierProductLeadTimeRow,
  organizationId: string,
  variantId: string,
): Pb1TrustedSupplierPlanningFactsResult {
  const leadTimeDays = row.leadTimeDays;

  if (leadTimeDays === null) {
    return reject(
      "SUPPLIER_FACTS_ABSENT",
      "supplier_products.lead_time_days is unknown (null).",
    );
  }

  if (
    typeof leadTimeDays !== "number" ||
    !Number.isFinite(leadTimeDays) ||
    leadTimeDays < 0
  ) {
    return reject(
      "SUPPLIER_FACTS_INVALID",
      "supplier_products.lead_time_days must be a non-negative finite number.",
    );
  }

  if (!trimRequired(row.id) || !trimRequired(row.supplierId)) {
    return reject(
      "SUPPLIER_FACTS_INVALID",
      "supplier_products id and supplierId are required.",
    );
  }

  if (
    typeof row.updatedAt !== "string" ||
    row.updatedAt.trim().length === 0
  ) {
    return reject(
      "SUPPLIER_FACTS_INVALID",
      "supplier_products.updated_at watermark is required.",
    );
  }

  return Object.freeze({
    ok: true as const,
    resolverVersion: M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
    organizationId,
    variantId,
    supplierId: row.supplierId,
    supplierProductId: row.id,
    supplierProductUpdatedAt: row.updatedAt,
    provenanceKind: "stated_supplier_product_terms" as const,
    notVerifiedDeliveryPerformance: true as const,
    supplierPlanning: Object.freeze({
      leadTimeDays,
      sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
    }),
  });
}

function reject(
  code: Pb1TrustedSupplierPlanningFactsFailureCode,
  detail: string,
): Pb1TrustedSupplierPlanningFactsRejection {
  return Object.freeze({
    ok: false as const,
    resolverVersion: M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
    code,
    detail,
  });
}

function trimRequired(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
