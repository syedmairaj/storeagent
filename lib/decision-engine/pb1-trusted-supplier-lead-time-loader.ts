import "server-only";

/**
 * M7-PB1.f — membership-scoped supplier_products lead-time loader (local only).
 *
 * Reads durable supplier_products rows under organization membership and
 * resolves TrustedSupplierPlanningFacts via the pure PB1.f resolver.
 * Never invents lead time from org planning defaults, supplier defaults,
 * PO latency, or constants. Diagnostic-only; no production create/approve.
 *
 * Authority: docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md §3.4
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  evaluatePb1EvidenceQualifiedReorderDiagnostic,
  M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
  type Pb1EvidenceQualifiedReorderDiagnosticRequest,
  type Pb1EvidenceQualifiedReorderDiagnosticResult,
} from "./pb1-evidence-qualified-reorder-diagnostic";

import {
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
  resolvePb1TrustedSupplierPlanningFacts,
  type Pb1SupplierProductLeadTimeRow,
  type Pb1TrustedSupplierPlanningFactsFailureCode,
  type Pb1TrustedSupplierPlanningFactsResult,
} from "./pb1-trusted-supplier-planning-facts";

import type { Pb1HardFalseProvenance } from "./metric-decision-binding";

export const M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1 =
  "m7-pb1-trusted-supplier-lead-time-loader-v1" as const;

export type Pb1TrustedSupplierLeadTimeLoaderFailureCode =
  | Pb1TrustedSupplierPlanningFactsFailureCode
  | "AUTHENTICATION_REQUIRED"
  | "TENANT_ACCESS_DENIED"
  | "LOADER_ATTESTATION_INVALID"
  | "SUPPLIER_PRODUCTS_READ_FAILED";

export interface Pb1TrustedSupplierLeadTimeLoadRequest {
  loaderVersion: typeof M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1;
  organizationId: string;
  variantId: string;
  supplierId?: string | null;
  organizationPlanningLeadTimeDays?: never;
  supplierDefaultLeadTimeDays?: never;
}

export interface Pb1TrustedSupplierLeadTimeLoaderRejection {
  ok: false;
  loaderVersion: typeof M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1;
  code: Pb1TrustedSupplierLeadTimeLoaderFailureCode;
  detail: string;
  provenance: Pb1HardFalseProvenance;
}

export type Pb1TrustedSupplierLeadTimeLoaderResult =
  | Pb1TrustedSupplierLeadTimeLoaderRejection
  | (Extract<Pb1TrustedSupplierPlanningFactsResult, { ok: true }> & {
      loaderVersion: typeof M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1;
    })
  | (Extract<Pb1TrustedSupplierPlanningFactsResult, { ok: false }> & {
      loaderVersion: typeof M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1;
      provenance: Pb1HardFalseProvenance;
    });

export type Pb1TrustedSupplierLeadTimeLoaderDeps = {
  getAuthenticatedUserId: () => Promise<string | null>;
  assertOrganizationMembership: (args: {
    organizationId: string;
    userId: string;
  }) => Promise<boolean>;
  loadSupplierProductRows: (args: {
    organizationId: string;
    variantId: string;
    supplierId?: string | null;
  }) => Promise<readonly Pb1SupplierProductLeadTimeRow[]>;
};

/**
 * Membership-scoped read of supplier_products → TrustedSupplierPlanningFacts.
 * Re-reads on every call (no cache across supplier-term changes).
 */
export async function loadPb1TrustedSupplierPlanningFacts(
  request: Pb1TrustedSupplierLeadTimeLoadRequest,
  deps?: Pb1TrustedSupplierLeadTimeLoaderDeps,
): Promise<Pb1TrustedSupplierLeadTimeLoaderResult> {
  if (request === null || typeof request !== "object") {
    return rejectLoader(
      "LOADER_ATTESTATION_INVALID",
      "PB1.f trusted supplier lead-time load request is required.",
    );
  }

  if (
    request.loaderVersion !==
    M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1
  ) {
    return rejectLoader(
      "LOADER_ATTESTATION_INVALID",
      "loaderVersion must be m7-pb1-trusted-supplier-lead-time-loader-v1.",
    );
  }

  if (
    (request as { organizationPlanningLeadTimeDays?: unknown })
      .organizationPlanningLeadTimeDays !== undefined
  ) {
    return rejectLoader(
      "ORG_PLANNING_DEFAULTS_FORBIDDEN",
      "organization_planning_inputs must not populate TrustedSupplierPlanningFacts.",
    );
  }

  if (
    (request as { supplierDefaultLeadTimeDays?: unknown })
      .supplierDefaultLeadTimeDays !== undefined
  ) {
    return rejectLoader(
      "SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN",
      "suppliers.default_lead_time_days must not populate TrustedSupplierPlanningFacts.",
    );
  }

  const organizationId = trimRequired(request.organizationId);
  const variantId = trimRequired(request.variantId);
  if (!organizationId || !variantId) {
    return rejectLoader(
      "LOADER_ATTESTATION_INVALID",
      "organizationId and variantId are required.",
    );
  }

  const resolvedDeps = deps ?? createDefaultLoaderDeps();

  const userId = await resolvedDeps.getAuthenticatedUserId();
  if (!userId) {
    return rejectLoader(
      "AUTHENTICATION_REQUIRED",
      "Authentication required for trusted supplier lead-time load.",
    );
  }

  const isMember = await resolvedDeps.assertOrganizationMembership({
    organizationId,
    userId,
  });
  if (!isMember) {
    return rejectLoader(
      "TENANT_ACCESS_DENIED",
      "Caller is not a member of the requested organization.",
    );
  }

  let rows: readonly Pb1SupplierProductLeadTimeRow[];
  try {
    rows = await resolvedDeps.loadSupplierProductRows({
      organizationId,
      variantId,
      supplierId: request.supplierId,
    });
  } catch (error) {
    return rejectLoader(
      "SUPPLIER_PRODUCTS_READ_FAILED",
      error instanceof Error
        ? error.message
        : "Unable to read supplier_products rows.",
    );
  }

  const resolved = resolvePb1TrustedSupplierPlanningFacts({
    resolverVersion:
      M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
    organizationId,
    variantId,
    supplierId: request.supplierId,
    rows,
  });

  if (!resolved.ok) {
    return Object.freeze({
      ...resolved,
      loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
      provenance: hardFalseProvenance(),
    });
  }

  return Object.freeze({
    ...resolved,
    loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
  });
}

/**
 * Convenience: resolved supplier facts + metric evidence → REORDER diagnostic.
 * Keeps production gates hard-false.
 */
export function evaluatePb1EvidenceQualifiedReorderFromSupplierFacts(
  input: {
    supplierFacts: Extract<
      Pb1TrustedSupplierPlanningFactsResult,
      { ok: true }
    >;
    diagnostic: Omit<
      Pb1EvidenceQualifiedReorderDiagnosticRequest,
      | "diagnosticVersion"
      | "supplierPlanning"
      | "supplierId"
      | "supplierProductId"
      | "supplierProductUpdatedAt"
    >;
  },
): Pb1EvidenceQualifiedReorderDiagnosticResult {
  return evaluatePb1EvidenceQualifiedReorderDiagnostic({
    ...input.diagnostic,
    diagnosticVersion:
      M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
    supplierPlanning: input.supplierFacts.supplierPlanning,
    supplierId: input.supplierFacts.supplierId,
    supplierProductId: input.supplierFacts.supplierProductId,
    supplierProductUpdatedAt: input.supplierFacts.supplierProductUpdatedAt,
  });
}

function createDefaultLoaderDeps(): Pb1TrustedSupplierLeadTimeLoaderDeps {
  return {
    getAuthenticatedUserId: async () => {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) {
        return null;
      }
      return user.id;
    },

    assertOrganizationMembership: async ({ organizationId, userId }) => {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw new Error(
          `Unable to verify organization membership: ${error.message}`,
        );
      }
      return data !== null;
    },

    loadSupplierProductRows: async ({
      organizationId,
      variantId,
      supplierId,
    }) => {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("supplier_products")
        .select(
          [
            "id",
            "organization_id",
            "supplier_id",
            "variant_id",
            "lead_time_days",
            "preferred",
            "updated_at",
          ].join(","),
        )
        .eq("organization_id", organizationId)
        .eq("variant_id", variantId);

      const trimmedSupplierId =
        typeof supplierId === "string" ? supplierId.trim() : "";
      if (trimmedSupplierId.length > 0) {
        query = query.eq("supplier_id", trimmedSupplierId);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(
          `Unable to load supplier_products rows: ${error.message}`,
        );
      }

      return (data ?? []).map((row) =>
        mapDbRowToSupplierProduct(row as unknown as Record<string, unknown>),
      );
    },
  };
}

function mapDbRowToSupplierProduct(
  row: Record<string, unknown>,
): Pb1SupplierProductLeadTimeRow {
  return {
    id: String(row.id ?? ""),
    organizationId: String(row.organization_id ?? ""),
    supplierId: String(row.supplier_id ?? ""),
    variantId: String(row.variant_id ?? ""),
    leadTimeDays:
      row.lead_time_days === null || row.lead_time_days === undefined
        ? null
        : Number(row.lead_time_days),
    preferred: row.preferred === true,
    updatedAt: String(row.updated_at ?? ""),
  };
}

function rejectLoader(
  code: Pb1TrustedSupplierLeadTimeLoaderFailureCode,
  detail: string,
): Pb1TrustedSupplierLeadTimeLoaderRejection {
  return Object.freeze({
    ok: false as const,
    loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
    code,
    detail,
    provenance: hardFalseProvenance(),
  });
}

function hardFalseProvenance(): Pb1HardFalseProvenance {
  return Object.freeze({
    audience: "internal_preparation",
    evidenceScope: "m5_metric_bound_preparation_only",
    forecastEligibility: "ineligible",
    isScoredMerchantDecision: false,
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    productionDecisionCreationEligible: false,
    productionApprovalEligible: false,
    notProductionActivation: true,
    engineBoundBriefEligible: false,
  });
}

function trimRequired(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
