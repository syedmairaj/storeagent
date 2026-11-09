import "server-only";

/**
 * M7-PB1.c — trusted persisted-metric PROMOTE diagnostic loader (local only).
 *
 * Reads ONE membership-scoped current-day sku_daily_metrics row and feeds the
 * existing PB1.b evidence-qualified PROMOTE diagnostic. Never invents age,
 * trend, incoming, forecast, or supplier lead time from org defaults.
 *
 * Authority: docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md §13 PB1.c
 * Audit: diagnostic preparation only; production create/approve remain NO-GO.
 */

import {
  countPendingMetricWorkForOrganization,
  hasPendingMetricWork,
  type PendingMetricWork,
  type PendingMetricWorkClient,
} from "@/lib/metrics-activation/pending-work";
import { storeLocalAsOfDate } from "@/lib/metrics-activation/store-local-as-of";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  evaluatePb1EvidenceQualifiedPromoteDiagnostic,
  M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1,
  type Pb1EvidenceQualifiedPromoteDiagnosticResult,
  type Pb1PromoteEvidenceFailureCode,
} from "./pb1-evidence-qualified-promote-diagnostic";

import {
  type M7DecisionGrain,
  type Pb1HardFalseProvenance,
  type Pb1SkuDailyMetricProjection,
  type Pb1TrustedTenantScope,
} from "./metric-decision-binding";

export const M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1 =
  "m7-pb1-trusted-persisted-metric-promote-loader-v1" as const;

export type Pb1TrustedPersistedMetricPromoteLoaderFailureCode =
  | Pb1PromoteEvidenceFailureCode
  | "AUTHENTICATION_REQUIRED"
  | "TENANT_ACCESS_DENIED"
  | "STORE_NOT_FOUND"
  | "STORE_TIMEZONE_INVALID"
  | "METRIC_ROW_NOT_FOUND"
  | "UNSUPPORTED_METRIC_ALGORITHM"
  | "LOADER_ATTESTATION_INVALID"
  | "DEMAND_TREND_INVALID"
  | "PENDING_WORK_INSPECTION_FAILED";

export interface Pb1TrustedPersistedSkuDailyMetricRow {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string;
  algorithmVersion: string;
  updatedAt: string;
  availableQuantity: number | null;
  eligibleIncomingQuantity: number | null;
  eligibleIncomingReasonCode: string | null;
  salesVelocity30d: number | null;
  daysOfStock: number | null;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  /**
   * M5 persist path always writes null. Loader never invents a non-null age.
   */
  inventoryAgeDays: number | null;
  demandTrend: Pb1SkuDailyMetricProjection["demandTrend"];
}

export interface Pb1TrustedPersistedMetricPromoteLoadRequest {
  loaderVersion: typeof M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  /**
   * Org planning defaults must never appear as TrustedSupplierPlanningFacts.
   */
  supplierPlanning?: never;
  stalenessPolicy?: {
    maxAgeMs: number;
    relativeTo: string;
  } | null;
}

export interface Pb1TrustedPersistedMetricPromoteLoadedRequest {
  loaderVersion: typeof M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1;
  trustedScope: Pb1TrustedTenantScope;
  grain: M7DecisionGrain;
  row: Pb1TrustedPersistedSkuDailyMetricRow;
  hasPendingMetricWork: boolean;
  /**
   * Optional override for tests; production uses Date.now via storeLocalAsOfDate.
   */
  asOfInstant?: Date;
  supplierPlanning?: never;
  stalenessPolicy?: {
    maxAgeMs: number;
    relativeTo: string;
  } | null;
}

export interface Pb1TrustedPersistedMetricPromoteLoaderRejection {
  ok: false;
  loaderVersion: typeof M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1;
  code: Pb1TrustedPersistedMetricPromoteLoaderFailureCode;
  detail: string;
  provenance: Pb1HardFalseProvenance;
}

export type Pb1TrustedPersistedMetricPromoteLoaderResult =
  | Pb1TrustedPersistedMetricPromoteLoaderRejection
  | (Extract<Pb1EvidenceQualifiedPromoteDiagnosticResult, { ok: true }> & {
      loaderVersion: typeof M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1;
    })
  | (Extract<Pb1EvidenceQualifiedPromoteDiagnosticResult, { ok: false }> & {
      loaderVersion: typeof M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1;
    });

export type Pb1TrustedPersistedMetricPromoteLoaderDeps = {
  getAuthenticatedUserId: () => Promise<string | null>;
  assertOrganizationMembership: (args: {
    organizationId: string;
    userId: string;
  }) => Promise<boolean>;
  loadStoreTimeZone: (args: {
    organizationId: string;
    storeId: string;
  }) => Promise<string | null>;
  loadSkuDailyMetricRow: (args: {
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
    metricDate: string;
  }) => Promise<Pb1TrustedPersistedSkuDailyMetricRow | null>;
  countPendingMetricWork: (
    organizationId: string,
  ) => Promise<PendingMetricWork>;
  now?: () => Date;
};

const DEMAND_TRENDS = new Set([
  "rising",
  "stable",
  "falling",
  "unknown",
] as const);

/**
 * Pure path: map one already-authorized persisted row into PB1.b PROMOTE
 * diagnostic. Used by unit tests with injected row projections.
 */
export function evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
  request: Pb1TrustedPersistedMetricPromoteLoadedRequest,
): Pb1TrustedPersistedMetricPromoteLoaderResult {
  if (request === null || typeof request !== "object") {
    return rejectLoader(
      "LOADER_ATTESTATION_INVALID",
      "PB1.c trusted persisted-metric loader request is required.",
    );
  }

  if (
    request.loaderVersion !==
    M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1
  ) {
    return rejectLoader(
      "LOADER_ATTESTATION_INVALID",
      "loaderVersion must be m7-pb1-trusted-persisted-metric-promote-loader-v1.",
    );
  }

  if (
    (request as { supplierPlanning?: unknown }).supplierPlanning !== undefined
  ) {
    return rejectLoader(
      "SUPPLIER_FACTS_INVALID",
      "Org planning defaults must not populate TrustedSupplierPlanningFacts.",
    );
  }

  const grain = request.grain;
  const scope = request.trustedScope;
  const row = request.row;

  if (
    grain === null ||
    typeof grain !== "object" ||
    scope === null ||
    typeof scope !== "object" ||
    row === null ||
    typeof row !== "object"
  ) {
    return rejectLoader(
      "LOADER_ATTESTATION_INVALID",
      "trustedScope, grain, and row are required.",
    );
  }

  if (
    grain.organizationId !== row.organizationId ||
    grain.storeId !== row.storeId ||
    grain.locationId !== row.locationId ||
    grain.variantId !== row.variantId
  ) {
    return rejectLoader(
      "GRAIN_MISMATCH",
      "Requested grain does not match persisted metric row identity.",
    );
  }

  if (
    scope.organizationId !== row.organizationId ||
    scope.storeId !== row.storeId
  ) {
    return rejectLoader(
      "FOREIGN_TENANT_REJECTED",
      "trustedScope does not match persisted metric tenant/store.",
    );
  }

  if (row.algorithmVersion !== SKU_DAILY_METRIC_ALGORITHM_VERSION) {
    return rejectLoader(
      "UNSUPPORTED_METRIC_ALGORITHM",
      `algorithmVersion must be ${SKU_DAILY_METRIC_ALGORITHM_VERSION}.`,
    );
  }

  if (
    typeof row.demandTrend !== "string" ||
    !DEMAND_TRENDS.has(
      row.demandTrend as Pb1SkuDailyMetricProjection["demandTrend"],
    )
  ) {
    return rejectLoader(
      "DEMAND_TREND_INVALID",
      "demandTrend must be rising, stable, falling, or unknown.",
    );
  }

  let storeLocalAsOf: string;
  try {
    storeLocalAsOf = storeLocalAsOfDate(
      scope.storeTimeZone,
      request.asOfInstant ?? new Date(),
    );
  } catch {
    return rejectLoader(
      "STORE_TIMEZONE_INVALID",
      "trustedScope.storeTimeZone must be a recognized IANA timezone.",
    );
  }

  // M5 persist path never supplies inventory age. Never invent a non-null age.
  const inventoryAgeDays = null;

  const diagnostic = evaluatePb1EvidenceQualifiedPromoteDiagnostic({
    diagnosticVersion:
      M7_PB1_EVIDENCE_QUALIFIED_PROMOTE_DIAGNOSTIC_VERSION_V1,
    trustedScope: {
      organizationId: scope.organizationId,
      storeId: scope.storeId,
      storeTimeZone: scope.storeTimeZone,
    },
    grain: {
      organizationId: grain.organizationId,
      storeId: grain.storeId,
      locationId: grain.locationId,
      variantId: grain.variantId,
    },
    storeLocalAsOfDate: storeLocalAsOf,
    hasPendingMetricWork: request.hasPendingMetricWork,
    metricDate: row.metricDate,
    metricUpdatedAt: row.updatedAt,
    pinnedTimeZone: scope.storeTimeZone,
    availableQuantity: row.availableQuantity,
    salesVelocity30d: row.salesVelocity30d,
    daysOfStock: row.daysOfStock,
    safetyStock: row.safetyStock,
    reorderPoint: row.reorderPoint,
    targetStock: row.targetStock,
    inventoryAgeDays,
    demandTrend: row.demandTrend,
    incoming: {
      kind: "persisted_eligible_incoming",
      eligibleIncomingQuantity: row.eligibleIncomingQuantity,
      eligibleIncomingReasonCode: row.eligibleIncomingReasonCode,
    },
    asOfInstant: request.asOfInstant,
    stalenessPolicy: request.stalenessPolicy ?? null,
  });

  return Object.freeze({
    ...diagnostic,
    loaderVersion: M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
  });
}

/**
 * I/O path: membership → store TZ → one metric row → pending work → PB1.b.
 * Callers may inject deps for unit tests; default uses member SELECT + admin
 * pending-work inspection after membership is proven.
 */
export async function loadPb1TrustedPersistedMetricPromoteDiagnostic(
  request: Pb1TrustedPersistedMetricPromoteLoadRequest,
  deps?: Pb1TrustedPersistedMetricPromoteLoaderDeps,
): Promise<Pb1TrustedPersistedMetricPromoteLoaderResult> {
  if (request === null || typeof request !== "object") {
    return rejectLoader(
      "LOADER_ATTESTATION_INVALID",
      "PB1.c trusted persisted-metric load request is required.",
    );
  }

  if (
    request.loaderVersion !==
    M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1
  ) {
    return rejectLoader(
      "LOADER_ATTESTATION_INVALID",
      "loaderVersion must be m7-pb1-trusted-persisted-metric-promote-loader-v1.",
    );
  }

  if (
    (request as { supplierPlanning?: unknown }).supplierPlanning !== undefined
  ) {
    return rejectLoader(
      "SUPPLIER_FACTS_INVALID",
      "Org planning defaults must not populate TrustedSupplierPlanningFacts.",
    );
  }

  const organizationId = trimRequired(request.organizationId);
  const storeId = trimRequired(request.storeId);
  const locationId = trimRequired(request.locationId);
  const variantId = trimRequired(request.variantId);

  if (!organizationId || !storeId || !locationId || !variantId) {
    return rejectLoader(
      "GRAIN_MISMATCH",
      "organizationId, storeId, locationId, and variantId are required.",
    );
  }

  const resolvedDeps = deps ?? createDefaultLoaderDeps();

  const userId = await resolvedDeps.getAuthenticatedUserId();
  if (!userId) {
    return rejectLoader(
      "AUTHENTICATION_REQUIRED",
      "Authentication required for trusted persisted-metric diagnostic.",
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

  const storeTimeZoneRaw = await resolvedDeps.loadStoreTimeZone({
    organizationId,
    storeId,
  });
  if (storeTimeZoneRaw === null) {
    return rejectLoader(
      "STORE_NOT_FOUND",
      "Store was not found in the caller's organization scope.",
    );
  }
  const storeTimeZone = storeTimeZoneRaw.trim();
  if (storeTimeZone.length === 0) {
    return rejectLoader(
      "STORE_TIMEZONE_INVALID",
      "stores.timezone is required for PB1.c freshness checks.",
    );
  }

  const asOfInstant = resolvedDeps.now?.() ?? new Date();
  let metricDate: string;
  try {
    metricDate = storeLocalAsOfDate(storeTimeZone, asOfInstant);
  } catch {
    return rejectLoader(
      "STORE_TIMEZONE_INVALID",
      "stores.timezone must be a recognized IANA timezone.",
    );
  }

  const row = await resolvedDeps.loadSkuDailyMetricRow({
    organizationId,
    storeId,
    locationId,
    variantId,
    metricDate,
  });
  if (row === null) {
    return rejectLoader(
      "METRIC_ROW_NOT_FOUND",
      "No current-day sku_daily_metrics row found for the requested grain.",
    );
  }

  let pending: PendingMetricWork;
  try {
    pending = await resolvedDeps.countPendingMetricWork(organizationId);
  } catch (error) {
    return rejectLoader(
      "PENDING_WORK_INSPECTION_FAILED",
      error instanceof Error
        ? error.message
        : "Unable to inspect pending metric work.",
    );
  }

  return evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow({
    loaderVersion: M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
    trustedScope: {
      organizationId,
      storeId,
      storeTimeZone,
    },
    grain: {
      organizationId,
      storeId,
      locationId,
      variantId,
    },
    row,
    hasPendingMetricWork: hasPendingMetricWork(pending),
    asOfInstant,
    stalenessPolicy: request.stalenessPolicy ?? null,
  });
}

function createDefaultLoaderDeps(): Pb1TrustedPersistedMetricPromoteLoaderDeps {
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

    loadStoreTimeZone: async ({ organizationId, storeId }) => {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("stores")
        .select("id,timezone")
        .eq("organization_id", organizationId)
        .eq("id", storeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Unable to load store timezone: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      return typeof data.timezone === "string" ? data.timezone : "";
    },

    loadSkuDailyMetricRow: async ({
      organizationId,
      storeId,
      locationId,
      variantId,
      metricDate,
    }) => {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("sku_daily_metrics")
        .select(
          [
            "organization_id",
            "store_id",
            "location_id",
            "variant_id",
            "metric_date",
            "algorithm_version",
            "updated_at",
            "available_quantity",
            "eligible_incoming_quantity",
            "eligible_incoming_reason_code",
            "sales_velocity_30d",
            "days_of_stock",
            "safety_stock",
            "reorder_point",
            "target_stock",
            "inventory_age_days",
            "demand_trend",
          ].join(","),
        )
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .eq("location_id", locationId)
        .eq("variant_id", variantId)
        .eq("metric_date", metricDate)
        .eq("algorithm_version", SKU_DAILY_METRIC_ALGORITHM_VERSION)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Unable to load sku_daily_metrics row: ${error.message}`,
        );
      }
      if (!data) {
        return null;
      }

      return mapDbRowToTrustedPersistedMetric(
        data as unknown as Record<string, unknown>,
      );
    },

    countPendingMetricWork: async (organizationId) => {
      return countPendingMetricWorkForOrganization(
        createSupabaseAdminClient() as unknown as PendingMetricWorkClient,
        organizationId,
      );
    },
  };
}

function mapDbRowToTrustedPersistedMetric(
  data: Record<string, unknown>,
): Pb1TrustedPersistedSkuDailyMetricRow {
  const demandTrend = data.demand_trend;
  if (
    typeof demandTrend !== "string" ||
    !DEMAND_TRENDS.has(
      demandTrend as Pb1SkuDailyMetricProjection["demandTrend"],
    )
  ) {
    throw new Error("sku_daily_metrics.demand_trend is invalid.");
  }

  return {
    organizationId: String(data.organization_id),
    storeId: String(data.store_id),
    locationId: String(data.location_id),
    variantId: String(data.variant_id),
    metricDate: String(data.metric_date),
    algorithmVersion: String(data.algorithm_version),
    updatedAt: String(data.updated_at),
    availableQuantity: asNullableNumber(data.available_quantity),
    eligibleIncomingQuantity: asNullableNumber(
      data.eligible_incoming_quantity,
    ),
    eligibleIncomingReasonCode:
      data.eligible_incoming_reason_code === null ||
      data.eligible_incoming_reason_code === undefined
        ? null
        : String(data.eligible_incoming_reason_code),
    salesVelocity30d: asNullableNumber(data.sales_velocity_30d),
    daysOfStock: asNullableNumber(data.days_of_stock),
    safetyStock: asNullableNumber(data.safety_stock),
    reorderPoint: asNullableNumber(data.reorder_point),
    targetStock: asNullableNumber(data.target_stock),
    // Persist path always null; pass through only null (never invent age).
    inventoryAgeDays: null,
    demandTrend: demandTrend as Pb1SkuDailyMetricProjection["demandTrend"],
  };
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error("sku_daily_metrics numeric column is invalid.");
}

function trimRequired(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

function rejectLoader(
  code: Pb1TrustedPersistedMetricPromoteLoaderFailureCode,
  detail: string,
): Pb1TrustedPersistedMetricPromoteLoaderRejection {
  return Object.freeze({
    ok: false as const,
    loaderVersion: M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
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
