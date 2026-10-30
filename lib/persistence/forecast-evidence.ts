import "server-only";

import type { OrganizationMemberRole } from "@/lib/commerce-domain/types";

import type {
  ForecastCoverageLevel,
  ForecastCoverageStream,
  ForecastEvidenceTrust,
  ForecastPromotionEvidenceState,
} from "@/lib/forecasting/evidence";

import type {
  VerifiedProviderIssuanceContext,
} from "@/lib/forecasting/evidence-issuance";

import type { TenantContext } from "@/lib/tenancy/types";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Server-only M6 P2b.2b.3 adapter for forecast evidence RPCs.
 *
 * Org/store/integration/actor come only from verified contexts.
 * Trust and closure_id are never accepted from callers; RPCs stamp them.
 * No direct table writes.
 */

const ATTESTATION_ROLES = new Set<OrganizationMemberRole>([
  "owner",
  "admin",
]);

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "trust",
  "organizationId",
  "storeId",
  "actorUserId",
  "userId",
  "role",
  "integrationId",
  "provider",
  "invalidatedAt",
  "evidenceId",
  "closureId",
  "closure",
  "source",
  "syncRunStatus",
  "syncRunId",
  "trustedCompleteDates",
]);

export type ForecastEvidenceDisposition = "created" | "replayed";

export type ForecastEvidenceInvalidationDisposition = "invalidated";

export interface PersistPromotionEvidenceRequest {
  localDate: string;
  state: ForecastPromotionEvidenceState;
  locationId?: string | null;
  variantId?: string | null;
  observedAt: string;
  idempotencyKey: string;
  version?: number;
  supersedesEvidenceId?: string | null;
}

export interface PersistCoverageEvidenceRequest {
  localDate: string;
  stream: ForecastCoverageStream;
  coverage: ForecastCoverageLevel;
  locationId?: string | null;
  variantId?: string | null;
  observedAt: string;
  asOf: string;
  idempotencyKey: string;
  version?: number;
  supersedesEvidenceId?: string | null;
  /**
   * Merchant complete only. Never a client-supplied closure_id.
   * Provider complete remains fail-closed regardless of this flag.
   */
  assertDayStreamClosed?: boolean;
}

export interface PersistPromotionEvidenceResult {
  evidenceId: string;
  disposition: ForecastEvidenceDisposition;
  trust: ForecastEvidenceTrust;
  version: number;
}

export interface PersistCoverageEvidenceResult {
  evidenceId: string;
  disposition: ForecastEvidenceDisposition;
  trust: ForecastEvidenceTrust;
  version: number;
  coverage: ForecastCoverageLevel;
  closureId: string | null;
}

export interface InvalidateCoverageEvidenceResult {
  evidenceId: string;
  disposition: ForecastEvidenceInvalidationDisposition;
  invalidatedAt: string;
}

export type ForecastEvidencePersistenceClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export class ForecastEvidenceConflictError extends Error {
  readonly code = "FORECAST_EVIDENCE_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ForecastEvidenceConflictError";
  }
}

export class ForecastEvidenceDeniedError extends Error {
  readonly code = "FORECAST_EVIDENCE_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "ForecastEvidenceDeniedError";
  }
}

export class ForecastEvidencePersistenceError extends Error {
  readonly code = "FORECAST_EVIDENCE_PERSISTENCE";

  constructor(message: string) {
    super(message);
    this.name = "ForecastEvidencePersistenceError";
  }
}

function assertIdentity(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ForecastEvidenceDeniedError(`${field} is required.`);
  }

  return value.trim();
}

function rejectForbiddenPayloadKeys(
  request: object,
  label: string,
): void {
  for (const key of Object.keys(request)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      throw new ForecastEvidenceDeniedError(
        `${label} must not include client-supplied "${key}".`,
      );
    }
  }
}

function optionalScopeId(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return assertIdentity(value, field);
}

function assertProviderContext(
  context: VerifiedProviderIssuanceContext,
): VerifiedProviderIssuanceContext {
  return {
    organizationId: assertIdentity(
      context.organizationId,
      "organizationId",
    ),
    storeId: assertIdentity(context.storeId, "storeId"),
    integrationId: assertIdentity(
      context.integrationId,
      "integrationId",
    ),
    provider: assertIdentity(context.provider, "provider"),
  };
}

function assertMerchantContext(
  tenant: TenantContext,
): TenantContext & { storeId: string } {
  assertIdentity(tenant.userId, "userId");
  assertIdentity(tenant.organizationId, "organizationId");

  if (tenant.storeId === null) {
    throw new ForecastEvidenceDeniedError(
      "Merchant attestation requires an authorized store on TenantContext.",
    );
  }

  assertIdentity(tenant.storeId, "storeId");

  if (!ATTESTATION_ROLES.has(tenant.role)) {
    throw new ForecastEvidenceDeniedError(
      `Merchant attestation requires owner or admin; received "${tenant.role}".`,
    );
  }

  return tenant as TenantContext & { storeId: string };
}

function mapRpcFailure(rpcName: string, message: string): never {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("conflicting payload") ||
    normalized.includes("scope mismatch") ||
    normalized.includes("unique") ||
    normalized.includes("duplicate")
  ) {
    throw new ForecastEvidenceConflictError(
      `Forecast evidence RPC "${rpcName}" conflict: ${message}`,
    );
  }

  if (
    normalized.includes("requires") ||
    normalized.includes("unavailable") ||
    normalized.includes("owner or admin") ||
    normalized.includes("not an organization member") ||
    normalized.includes("trusted integration") ||
    normalized.includes("store scope") ||
    normalized.includes("already invalidated") ||
    normalized.includes("not found") ||
    normalized.includes("exactly one of") ||
    normalized.includes("after coverage as_of") ||
    normalized.includes("closure")
  ) {
    throw new ForecastEvidenceDeniedError(
      `Forecast evidence RPC "${rpcName}" denied: ${message}`,
    );
  }

  throw new ForecastEvidencePersistenceError(
    `Forecast evidence RPC "${rpcName}" failed: ${message}`,
  );
}

function firstRow<T extends Record<string, unknown>>(
  rpcName: string,
  data: unknown,
): T {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new ForecastEvidencePersistenceError(
      `Forecast evidence RPC "${rpcName}" returned an unexpected payload.`,
    );
  }

  const row = data[0];

  if (row === null || typeof row !== "object") {
    throw new ForecastEvidencePersistenceError(
      `Forecast evidence RPC "${rpcName}" returned an unexpected row.`,
    );
  }

  return row as T;
}

function assertDisposition(
  value: unknown,
): ForecastEvidenceDisposition {
  if (value === "created" || value === "replayed") {
    return value;
  }

  throw new ForecastEvidencePersistenceError(
    `Unexpected forecast evidence disposition "${String(value)}".`,
  );
}

async function callRpc(
  client: ForecastEvidencePersistenceClient,
  rpcName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(rpcName, args);

  if (error) {
    mapRpcFailure(rpcName, error.message);
  }

  return data;
}

function promotionArgs(
  organizationId: string,
  storeId: string,
  request: PersistPromotionEvidenceRequest,
): Record<string, unknown> {
  rejectForbiddenPayloadKeys(request, "Promotion persistence request");
  assertIdentity(request.localDate, "localDate");
  assertIdentity(request.observedAt, "observedAt");
  assertIdentity(request.idempotencyKey, "idempotencyKey");

  if (request.state !== "none" && request.state !== "promotion") {
    throw new ForecastEvidenceDeniedError(
      "promotion state must be none or promotion.",
    );
  }

  const version = request.version ?? 1;

  if (!Number.isInteger(version) || version < 1) {
    throw new ForecastEvidenceDeniedError(
      "evidence version must be an integer >= 1.",
    );
  }

  return {
    p_organization_id: organizationId,
    p_store_id: storeId,
    p_local_date: request.localDate,
    p_state: request.state,
    p_observed_at: request.observedAt,
    p_idempotency_key: request.idempotencyKey.trim(),
    p_location_id: optionalScopeId(request.locationId, "locationId"),
    p_variant_id: optionalScopeId(request.variantId, "variantId"),
    p_version: version,
    p_supersedes_evidence_id:
      request.supersedesEvidenceId === undefined
        ? null
        : request.supersedesEvidenceId === null
          ? null
          : assertIdentity(
              request.supersedesEvidenceId,
              "supersedesEvidenceId",
            ),
  };
}

function coverageArgs(
  organizationId: string,
  storeId: string,
  request: PersistCoverageEvidenceRequest,
): Record<string, unknown> {
  rejectForbiddenPayloadKeys(request, "Coverage persistence request");
  assertIdentity(request.localDate, "localDate");
  assertIdentity(request.observedAt, "observedAt");
  assertIdentity(request.asOf, "asOf");
  assertIdentity(request.idempotencyKey, "idempotencyKey");

  if (request.stream !== "orders" && request.stream !== "returns") {
    throw new ForecastEvidenceDeniedError(
      "coverage stream must be orders or returns.",
    );
  }

  if (request.coverage !== "complete" && request.coverage !== "partial") {
    throw new ForecastEvidenceDeniedError(
      "coverage level must be complete or partial.",
    );
  }

  const version = request.version ?? 1;

  if (!Number.isInteger(version) || version < 1) {
    throw new ForecastEvidenceDeniedError(
      "evidence version must be an integer >= 1.",
    );
  }

  return {
    p_organization_id: organizationId,
    p_store_id: storeId,
    p_local_date: request.localDate,
    p_stream: request.stream,
    p_coverage: request.coverage,
    p_as_of: request.asOf,
    p_observed_at: request.observedAt,
    p_idempotency_key: request.idempotencyKey.trim(),
    p_location_id: optionalScopeId(request.locationId, "locationId"),
    p_variant_id: optionalScopeId(request.variantId, "variantId"),
    p_version: version,
    p_supersedes_evidence_id:
      request.supersedesEvidenceId === undefined
        ? null
        : request.supersedesEvidenceId === null
          ? null
          : assertIdentity(
              request.supersedesEvidenceId,
              "supersedesEvidenceId",
            ),
  };
}

export interface ForecastEvidencePersistencePort {
  issueTrustedProviderPromotion(
    context: VerifiedProviderIssuanceContext,
    request: PersistPromotionEvidenceRequest,
  ): Promise<PersistPromotionEvidenceResult>;

  issueMerchantAttestationPromotion(
    tenant: TenantContext,
    request: PersistPromotionEvidenceRequest,
  ): Promise<PersistPromotionEvidenceResult>;

  issueTrustedProviderCoverage(
    context: VerifiedProviderIssuanceContext,
    request: PersistCoverageEvidenceRequest,
  ): Promise<PersistCoverageEvidenceResult>;

  issueMerchantAttestationCoverage(
    tenant: TenantContext,
    request: PersistCoverageEvidenceRequest,
  ): Promise<PersistCoverageEvidenceResult>;

  invalidateCoverageWithProvider(
    context: VerifiedProviderIssuanceContext,
    input: {
      evidenceId: string;
      invalidatedAt: string;
      lateEventObservedAt: string;
    },
  ): Promise<InvalidateCoverageEvidenceResult>;

  invalidateCoverageWithMerchant(
    tenant: TenantContext,
    input: {
      evidenceId: string;
      invalidatedAt: string;
      lateEventObservedAt: string;
    },
  ): Promise<InvalidateCoverageEvidenceResult>;
}

export function createForecastEvidencePersistence(
  client: ForecastEvidencePersistenceClient = createSupabaseAdminClient(),
): ForecastEvidencePersistencePort {
  return {
    async issueTrustedProviderPromotion(context, request) {
      const verified = assertProviderContext(context);
      const args = promotionArgs(
        verified.organizationId,
        verified.storeId,
        request,
      );

      const data = await callRpc(
        client,
        "issue_trusted_provider_promotion_evidence",
        {
          ...args,
          p_integration_id: verified.integrationId,
        },
      );

      const row = firstRow<{
        evidence_id: string;
        disposition: string;
        trust: string;
        version: number;
      }>("issue_trusted_provider_promotion_evidence", data);

      if (row.trust !== "trusted_provider") {
        throw new ForecastEvidencePersistenceError(
          "Provider promotion RPC returned unexpected trust.",
        );
      }

      return {
        evidenceId: assertIdentity(row.evidence_id, "evidenceId"),
        disposition: assertDisposition(row.disposition),
        trust: "trusted_provider",
        version: row.version,
      };
    },

    async issueMerchantAttestationPromotion(tenant, request) {
      const verified = assertMerchantContext(tenant);
      const args = promotionArgs(
        verified.organizationId,
        verified.storeId,
        request,
      );

      const data = await callRpc(
        client,
        "issue_merchant_attestation_promotion_evidence",
        {
          ...args,
          p_actor_user_id: verified.userId,
        },
      );

      const row = firstRow<{
        evidence_id: string;
        disposition: string;
        trust: string;
        version: number;
      }>("issue_merchant_attestation_promotion_evidence", data);

      if (row.trust !== "verified_merchant_attestation") {
        throw new ForecastEvidencePersistenceError(
          "Merchant promotion RPC returned unexpected trust.",
        );
      }

      return {
        evidenceId: assertIdentity(row.evidence_id, "evidenceId"),
        disposition: assertDisposition(row.disposition),
        trust: "verified_merchant_attestation",
        version: row.version,
      };
    },

    async issueTrustedProviderCoverage(context, request) {
      const verified = assertProviderContext(context);

      // Fail closed before RPC: no provider day/stream closure authority yet.
      if (request.coverage === "complete") {
        throw new ForecastEvidenceDeniedError(
          "trusted_provider coverage=complete is unavailable: no authoritative day/stream closure source.",
        );
      }

      if (request.assertDayStreamClosed === true) {
        throw new ForecastEvidenceDeniedError(
          "trusted_provider coverage must not assert day/stream closure.",
        );
      }

      const args = coverageArgs(
        verified.organizationId,
        verified.storeId,
        request,
      );

      const data = await callRpc(
        client,
        "issue_trusted_provider_coverage_evidence",
        {
          ...args,
          p_integration_id: verified.integrationId,
        },
      );

      const row = firstRow<{
        evidence_id: string;
        disposition: string;
        trust: string;
        version: number;
        coverage: string;
        closure_id: string | null;
      }>("issue_trusted_provider_coverage_evidence", data);

      if (row.trust !== "trusted_provider") {
        throw new ForecastEvidencePersistenceError(
          "Provider coverage RPC returned unexpected trust.",
        );
      }

      if (row.coverage !== "partial" || row.closure_id !== null) {
        throw new ForecastEvidencePersistenceError(
          "Provider coverage RPC returned unexpected completion shape.",
        );
      }

      return {
        evidenceId: assertIdentity(row.evidence_id, "evidenceId"),
        disposition: assertDisposition(row.disposition),
        trust: "trusted_provider",
        version: row.version,
        coverage: "partial",
        closureId: null,
      };
    },

    async issueMerchantAttestationCoverage(tenant, request) {
      const verified = assertMerchantContext(tenant);

      if (
        request.coverage === "complete" &&
        request.assertDayStreamClosed !== true
      ) {
        throw new ForecastEvidenceDeniedError(
          "merchant coverage=complete requires explicit day/stream closure attestation.",
        );
      }

      if (
        request.coverage === "partial" &&
        request.assertDayStreamClosed === true
      ) {
        throw new ForecastEvidenceDeniedError(
          "partial coverage must not assert day/stream closure.",
        );
      }

      const args = coverageArgs(
        verified.organizationId,
        verified.storeId,
        request,
      );

      const data = await callRpc(
        client,
        "issue_merchant_attestation_coverage_evidence",
        {
          ...args,
          p_actor_user_id: verified.userId,
          p_assert_day_stream_closed:
            request.assertDayStreamClosed === true,
        },
      );

      const row = firstRow<{
        evidence_id: string;
        disposition: string;
        trust: string;
        version: number;
        coverage: string;
        closure_id: string | null;
      }>("issue_merchant_attestation_coverage_evidence", data);

      if (row.trust !== "verified_merchant_attestation") {
        throw new ForecastEvidencePersistenceError(
          "Merchant coverage RPC returned unexpected trust.",
        );
      }

      if (
        row.coverage !== "complete" &&
        row.coverage !== "partial"
      ) {
        throw new ForecastEvidencePersistenceError(
          "Merchant coverage RPC returned unexpected coverage.",
        );
      }

      return {
        evidenceId: assertIdentity(row.evidence_id, "evidenceId"),
        disposition: assertDisposition(row.disposition),
        trust: "verified_merchant_attestation",
        version: row.version,
        coverage: row.coverage,
        closureId: row.closure_id,
      };
    },

    async invalidateCoverageWithProvider(context, input) {
      const verified = assertProviderContext(context);
      const evidenceId = assertIdentity(input.evidenceId, "evidenceId");
      const invalidatedAt = assertIdentity(
        input.invalidatedAt,
        "invalidatedAt",
      );
      const lateEventObservedAt = assertIdentity(
        input.lateEventObservedAt,
        "lateEventObservedAt",
      );

      const data = await callRpc(
        client,
        "invalidate_forecast_day_coverage_evidence",
        {
          p_organization_id: verified.organizationId,
          p_evidence_id: evidenceId,
          p_invalidated_at: invalidatedAt,
          p_late_event_observed_at: lateEventObservedAt,
          p_integration_id: verified.integrationId,
          p_actor_user_id: null,
        },
      );

      const row = firstRow<{
        evidence_id: string;
        disposition: string;
        invalidated_at: string;
      }>("invalidate_forecast_day_coverage_evidence", data);

      if (row.disposition !== "invalidated") {
        throw new ForecastEvidencePersistenceError(
          "Invalidation RPC returned unexpected disposition.",
        );
      }

      return {
        evidenceId: assertIdentity(row.evidence_id, "evidenceId"),
        disposition: "invalidated",
        invalidatedAt: assertIdentity(
          row.invalidated_at,
          "invalidatedAt",
        ),
      };
    },

    async invalidateCoverageWithMerchant(tenant, input) {
      const verified = assertMerchantContext(tenant);
      const evidenceId = assertIdentity(input.evidenceId, "evidenceId");
      const invalidatedAt = assertIdentity(
        input.invalidatedAt,
        "invalidatedAt",
      );
      const lateEventObservedAt = assertIdentity(
        input.lateEventObservedAt,
        "lateEventObservedAt",
      );

      const data = await callRpc(
        client,
        "invalidate_forecast_day_coverage_evidence",
        {
          p_organization_id: verified.organizationId,
          p_evidence_id: evidenceId,
          p_invalidated_at: invalidatedAt,
          p_late_event_observed_at: lateEventObservedAt,
          p_integration_id: null,
          p_actor_user_id: verified.userId,
        },
      );

      const row = firstRow<{
        evidence_id: string;
        disposition: string;
        invalidated_at: string;
      }>("invalidate_forecast_day_coverage_evidence", data);

      if (row.disposition !== "invalidated") {
        throw new ForecastEvidencePersistenceError(
          "Invalidation RPC returned unexpected disposition.",
        );
      }

      return {
        evidenceId: assertIdentity(row.evidence_id, "evidenceId"),
        disposition: "invalidated",
        invalidatedAt: assertIdentity(
          row.invalidated_at,
          "invalidatedAt",
        ),
      };
    },
  };
}
