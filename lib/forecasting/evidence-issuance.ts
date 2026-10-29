import type { OrganizationMemberRole } from "@/lib/commerce-domain/types";

import type { TenantContext } from "@/lib/tenancy/types";

import {
  assertForecastDate,
} from "./series";

import type {
  CommerceDayCoverageEvidence,
  CommerceDayEventWatermark,
  CommerceDayPromotionEvidence,
  ForecastCoverageLevel,
  ForecastCoverageStream,
  ForecastEvidenceTrust,
  ForecastPromotionEvidenceState,
} from "./evidence";

/**
 * Pure M6 P2b.2a trusted evidence issuance.
 *
 * Trust is stamped only by which issuance function is called.
 * Payloads must not carry trust, org, store, or actor fields.
 *
 * No DB, HTTP, or provider SDKs. Callers that hold a verified provider
 * import context or an owner/admin TenantContext may invoke these helpers;
 * CSV sync success alone is not closure proof.
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
  "syncRunStatus",
  "syncRunId",
  "trustedCompleteDates",
]);

export interface VerifiedProviderIssuanceContext {
  organizationId: string;
  /**
   * Store-day evidence requires an already-authorized store scope.
   * Must come from trusted integration binding, never from CSV/content.
   */
  storeId: string;
  integrationId: string;
  provider: string;
}

export interface ExplicitStreamClosureProof {
  /**
   * Only explicit day/stream closure may authorize coverage=complete.
   * SyncRun completed / provider identity is intentionally not a kind.
   */
  kind: "explicit_day_stream_closure";
  watermarkAsOf: string;
  closureId: string;
}

export interface PromotionIssuanceRequest {
  localDate: string;
  state: ForecastPromotionEvidenceState;
  /**
   * Optional narrowing only. null/omitted = store-wide (no silent widen).
   */
  locationId?: string | null;
  variantId?: string | null;
  observedAt: string;
  idempotencyKey: string;
  version?: number;
  supersedesEvidenceId?: string | null;
}

export interface CoverageIssuanceRequest {
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
   * Required when coverage === "complete". Absent or wrong kind → reject.
   */
  closure?: ExplicitStreamClosureProof;
}

export interface ForecastEvidenceIssuanceMeta {
  path: ForecastEvidenceTrust;
  idempotencyKey: string;
  issuedAt: string;
  integrationId: string | null;
  actorUserId: string | null;
  provider: string | null;
  closureId: string | null;
}

export interface IssuedPromotionEvidence {
  evidence: CommerceDayPromotionEvidence;
  issuance: ForecastEvidenceIssuanceMeta;
}

export interface IssuedCoverageEvidence {
  evidence: CommerceDayCoverageEvidence;
  issuance: ForecastEvidenceIssuanceMeta;
}

function assertIdentity(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function assertInstant(value: string, field: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid UTC instant.`);
  }
}

function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("evidence version must be an integer >= 1.");
  }
}

function rejectForbiddenPayloadKeys(
  request: object,
  label: string,
): void {
  for (const key of Object.keys(request)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      throw new Error(
        `${label} must not include client-supplied "${key}".`,
      );
    }
  }
}

function normalizeOptionalScopeId(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  assertIdentity(value, field);
  return value;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deterministicEvidenceId(parts: readonly string[]): string {
  return `ev_${fnv1a32(parts.join("\u0000"))}`;
}

function assertVerifiedProviderContext(
  context: VerifiedProviderIssuanceContext,
): void {
  assertIdentity(context.organizationId, "organizationId");
  assertIdentity(context.storeId, "storeId");
  assertIdentity(context.integrationId, "integrationId");
  assertIdentity(context.provider, "provider");
}

/**
 * Maps a store-scoped CSV trusted import context (or equivalent) into
 * issuance context. Null store is rejected — no silent widening.
 */
export function verifiedProviderContextFromTrustedImport(input: {
  organizationId: string;
  storeId: string | null;
  integrationId: string;
  provider: string;
}): VerifiedProviderIssuanceContext {
  if (input.storeId === null) {
    throw new Error(
      "Store-day evidence issuance requires a store-scoped trusted integration.",
    );
  }

  const context: VerifiedProviderIssuanceContext = {
    organizationId: input.organizationId,
    storeId: input.storeId,
    integrationId: input.integrationId,
    provider: input.provider,
  };

  assertVerifiedProviderContext(context);
  return context;
}

function assertMerchantAttestationContext(
  tenant: TenantContext,
): asserts tenant is TenantContext & { storeId: string } {
  assertIdentity(tenant.userId, "userId");
  assertIdentity(tenant.organizationId, "organizationId");

  if (tenant.storeId === null) {
    throw new Error(
      "Merchant attestation requires an authorized store on TenantContext.",
    );
  }

  assertIdentity(tenant.storeId, "storeId");

  if (!ATTESTATION_ROLES.has(tenant.role)) {
    throw new Error(
      `Merchant attestation requires owner or admin; received "${tenant.role}".`,
    );
  }
}

function assertPromotionRequest(request: PromotionIssuanceRequest): void {
  rejectForbiddenPayloadKeys(request, "Promotion issuance request");
  assertForecastDate(request.localDate, "localDate");
  assertInstant(request.observedAt, "observedAt");
  assertIdentity(request.idempotencyKey, "idempotencyKey");

  if (request.state !== "none" && request.state !== "promotion") {
    throw new Error("promotion state must be none or promotion.");
  }

  if (request.version !== undefined) {
    assertVersion(request.version);
  }

  if (
    request.supersedesEvidenceId !== undefined &&
    request.supersedesEvidenceId !== null
  ) {
    assertIdentity(request.supersedesEvidenceId, "supersedesEvidenceId");
  }

  normalizeOptionalScopeId(request.locationId, "locationId");
  normalizeOptionalScopeId(request.variantId, "variantId");
}

function assertCoverageRequest(request: CoverageIssuanceRequest): void {
  rejectForbiddenPayloadKeys(request, "Coverage issuance request");
  assertForecastDate(request.localDate, "localDate");
  assertInstant(request.observedAt, "observedAt");
  assertInstant(request.asOf, "asOf");
  assertIdentity(request.idempotencyKey, "idempotencyKey");

  if (request.stream !== "orders" && request.stream !== "returns") {
    throw new Error("coverage stream must be orders or returns.");
  }

  if (request.coverage !== "complete" && request.coverage !== "partial") {
    throw new Error("coverage level must be complete or partial.");
  }

  if (request.version !== undefined) {
    assertVersion(request.version);
  }

  if (
    request.supersedesEvidenceId !== undefined &&
    request.supersedesEvidenceId !== null
  ) {
    assertIdentity(request.supersedesEvidenceId, "supersedesEvidenceId");
  }

  normalizeOptionalScopeId(request.locationId, "locationId");
  normalizeOptionalScopeId(request.variantId, "variantId");

  if (request.coverage === "complete") {
    if (request.closure === undefined) {
      throw new Error(
        "coverage=complete requires explicit_day_stream_closure proof.",
      );
    }

    if (request.closure.kind !== "explicit_day_stream_closure") {
      throw new Error(
        "coverage=complete requires explicit_day_stream_closure proof.",
      );
    }

    assertIdentity(request.closure.closureId, "closureId");
    assertInstant(request.closure.watermarkAsOf, "watermarkAsOf");

    if (request.closure.watermarkAsOf !== request.asOf) {
      throw new Error(
        "closure watermarkAsOf must match coverage asOf.",
      );
    }
  } else if (request.closure !== undefined) {
    throw new Error(
      "partial coverage must not include stream closure proof.",
    );
  }
}

function issuePromotion(
  path: ForecastEvidenceTrust,
  organizationId: string,
  storeId: string,
  request: PromotionIssuanceRequest,
  meta: Omit<
    ForecastEvidenceIssuanceMeta,
    "path" | "idempotencyKey" | "issuedAt" | "closureId"
  >,
): IssuedPromotionEvidence {
  assertPromotionRequest(request);

  const version = request.version ?? 1;
  const locationId = normalizeOptionalScopeId(
    request.locationId,
    "locationId",
  );
  const variantId = normalizeOptionalScopeId(
    request.variantId,
    "variantId",
  );

  const evidenceId = deterministicEvidenceId([
    path,
    "promotion",
    organizationId,
    storeId,
    locationId ?? "",
    variantId ?? "",
    request.localDate,
    request.idempotencyKey,
    String(version),
  ]);

  const source =
    path === "trusted_provider"
      ? `provider:${meta.provider}:integration:${meta.integrationId}`
      : `merchant:attestation:actor:${meta.actorUserId}`;

  return {
    evidence: {
      evidenceId,
      organizationId,
      storeId,
      locationId,
      variantId,
      localDate: request.localDate,
      state: request.state,
      trust: path,
      source,
      observedAt: request.observedAt,
      version,
      invalidatedAt: null,
      supersedesEvidenceId: request.supersedesEvidenceId ?? null,
    },
    issuance: {
      path,
      idempotencyKey: request.idempotencyKey,
      issuedAt: request.observedAt,
      integrationId: meta.integrationId,
      actorUserId: meta.actorUserId,
      provider: meta.provider,
      closureId: null,
    },
  };
}

function issueCoverage(
  path: ForecastEvidenceTrust,
  organizationId: string,
  storeId: string,
  request: CoverageIssuanceRequest,
  meta: Omit<
    ForecastEvidenceIssuanceMeta,
    "path" | "idempotencyKey" | "issuedAt" | "closureId"
  >,
): IssuedCoverageEvidence {
  assertCoverageRequest(request);

  const version = request.version ?? 1;
  const locationId = normalizeOptionalScopeId(
    request.locationId,
    "locationId",
  );
  const variantId = normalizeOptionalScopeId(
    request.variantId,
    "variantId",
  );

  const evidenceId = deterministicEvidenceId([
    path,
    "coverage",
    organizationId,
    storeId,
    locationId ?? "",
    variantId ?? "",
    request.localDate,
    request.stream,
    request.idempotencyKey,
    String(version),
  ]);

  const source =
    path === "trusted_provider"
      ? `provider:${meta.provider}:integration:${meta.integrationId}`
      : `merchant:attestation:actor:${meta.actorUserId}`;

  return {
    evidence: {
      evidenceId,
      organizationId,
      storeId,
      locationId,
      variantId,
      localDate: request.localDate,
      stream: request.stream,
      coverage: request.coverage,
      trust: path,
      source,
      asOf: request.asOf,
      observedAt: request.observedAt,
      version,
      invalidatedAt: null,
      supersedesEvidenceId: request.supersedesEvidenceId ?? null,
    },
    issuance: {
      path,
      idempotencyKey: request.idempotencyKey,
      issuedAt: request.observedAt,
      integrationId: meta.integrationId,
      actorUserId: meta.actorUserId,
      provider: meta.provider,
      closureId: request.closure?.closureId ?? null,
    },
  };
}

export function issueTrustedProviderPromotion(
  context: VerifiedProviderIssuanceContext,
  request: PromotionIssuanceRequest,
): IssuedPromotionEvidence {
  assertVerifiedProviderContext(context);

  return issuePromotion(
    "trusted_provider",
    context.organizationId,
    context.storeId,
    request,
    {
      integrationId: context.integrationId,
      actorUserId: null,
      provider: context.provider,
    },
  );
}

export function issueTrustedProviderCoverage(
  context: VerifiedProviderIssuanceContext,
  request: CoverageIssuanceRequest,
): IssuedCoverageEvidence {
  assertVerifiedProviderContext(context);

  return issueCoverage(
    "trusted_provider",
    context.organizationId,
    context.storeId,
    request,
    {
      integrationId: context.integrationId,
      actorUserId: null,
      provider: context.provider,
    },
  );
}

export function issueMerchantAttestationPromotion(
  tenant: TenantContext,
  request: PromotionIssuanceRequest,
): IssuedPromotionEvidence {
  assertMerchantAttestationContext(tenant);

  return issuePromotion(
    "verified_merchant_attestation",
    tenant.organizationId,
    tenant.storeId,
    request,
    {
      integrationId: null,
      actorUserId: tenant.userId,
      provider: null,
    },
  );
}

export function issueMerchantAttestationCoverage(
  tenant: TenantContext,
  request: CoverageIssuanceRequest,
): IssuedCoverageEvidence {
  assertMerchantAttestationContext(tenant);

  return issueCoverage(
    "verified_merchant_attestation",
    tenant.organizationId,
    tenant.storeId,
    request,
    {
      integrationId: null,
      actorUserId: tenant.userId,
      provider: null,
    },
  );
}

/**
 * Late commerce after asOf invalidates coverage. Restoring complete
 * requires a fresh issuance (new version / supersedes), not mutation of trust.
 */
export function invalidateIssuedCoverage(
  issued: IssuedCoverageEvidence,
  invalidatedAt: string,
): IssuedCoverageEvidence {
  assertInstant(invalidatedAt, "invalidatedAt");

  if (issued.evidence.invalidatedAt !== null) {
    throw new Error("coverage evidence is already invalidated.");
  }

  return {
    evidence: {
      ...issued.evidence,
      invalidatedAt,
    },
    issuance: issued.issuance,
  };
}

/**
 * Deterministic helper: if late events exist past asOf, return invalidated
 * coverage; otherwise return the original record unchanged.
 * Restoring complete requires a fresh issuance that supersedes this row.
 */
export function applyLateCorrectionToIssuedCoverage(
  issued: IssuedCoverageEvidence,
  dayEvents: readonly CommerceDayEventWatermark[],
  invalidatedAt: string,
): IssuedCoverageEvidence {
  const late = dayEvents.some((event) => {
    if (
      event.organizationId !== issued.evidence.organizationId ||
      event.storeId !== issued.evidence.storeId ||
      event.localDate !== issued.evidence.localDate ||
      event.stream !== issued.evidence.stream
    ) {
      return false;
    }

    if (
      issued.evidence.locationId !== null &&
      event.locationId !== null &&
      event.locationId !== issued.evidence.locationId
    ) {
      return false;
    }

    if (
      issued.evidence.variantId !== null &&
      event.variantId !== issued.evidence.variantId
    ) {
      return false;
    }

    return Date.parse(event.observedAt) > Date.parse(issued.evidence.asOf);
  });

  if (!late) {
    return issued;
  }

  return invalidateIssuedCoverage(issued, invalidatedAt);
}

export function assertIssuanceReplayCompatible(
  existing: IssuedPromotionEvidence | IssuedCoverageEvidence,
  candidate: IssuedPromotionEvidence | IssuedCoverageEvidence,
): void {
  if (
    existing.issuance.idempotencyKey !== candidate.issuance.idempotencyKey
  ) {
    throw new Error("issuance replay requires the same idempotencyKey.");
  }

  if (
    existing.issuance.path !== candidate.issuance.path ||
    existing.evidence.evidenceId !== candidate.evidence.evidenceId ||
    JSON.stringify(existing.evidence) !== JSON.stringify(candidate.evidence) ||
    JSON.stringify(existing.issuance) !== JSON.stringify(candidate.issuance)
  ) {
    throw new Error(
      "duplicate issuance idempotency key has conflicting payload.",
    );
  }
}
