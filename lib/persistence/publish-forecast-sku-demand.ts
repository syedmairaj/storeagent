import "server-only";

import type { ForecastGrain } from "@/lib/forecasting/series";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M6 P3d.2 — server-only forecast publication adapter.
 *
 * Explicit publishForecastSkuDemand for a trusted server-owned forecastRunId.
 * Write path: publish_sku_forecast once (no direct publication/current DML).
 * Persistence never auto-publishes; callers must invoke this separately.
 *
 * Publication proves identity for the validated source_token at check time
 * only. It is NOT a post-commit freshness claim. m7Eligible is always false.
 *
 * STALE_SOURCE_TOKEN / PENDING_CORRECTION fail closed (thrown). This adapter
 * never silently retries a stale forecast or publishes an older run as
 * fallback.
 */

const RPC_NAME = "publish_sku_forecast";

const FRESHNESS_LIMITATION =
  "publication proves source_token identity at post-lock revalidation only; it does not prove commerce/evidence freshness after commit. M7 must revalidate separately.";

const FORBIDDEN_INPUT_KEYS = new Set([
  "trustedCompleteDates",
  "organizationId",
  "storeId",
  "sourceToken",
  "dailyDemand",
  "confidenceIntervals",
  "fabricatedDemand",
  "m7Eligible",
  "published",
  "isCurrent",
  "disposition",
  "publicationId",
]);

const RETURNED_WITHHOLD_REASONS = new Set([
  "MODE_UNAVAILABLE",
  "NULL_DEMAND",
  "INSUFFICIENT_EVIDENCE",
  "OLDER_AS_OF_THAN_CURRENT",
  "OLDER_SOURCE_VERSION",
]);

export type ForecastPublishDisposition =
  | "published"
  | "replayed"
  | "withheld";

export type ForecastPublishWithholdReason =
  | "MODE_UNAVAILABLE"
  | "NULL_DEMAND"
  | "INSUFFICIENT_EVIDENCE"
  | "OLDER_AS_OF_THAN_CURRENT"
  | "OLDER_SOURCE_VERSION";

/**
 * Minimal PostgREST surface: RPC publish + one forecast_runs grain read.
 * No publication/current table writes.
 */
export type ForecastPublishClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
  from: (relation: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: Record<string, unknown> | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
  };
};

/**
 * Grain comes only from trusted TenantContext + server-selected
 * location/variant. Callers must not supply organizationId/storeId.
 */
export interface PublishForecastSkuDemandInput {
  tenant: TenantContext;
  locationId: string;
  variantId: string;
  /** Trusted server-owned id from a prior persist result. */
  forecastRunId: string;
}

export interface PublishForecastSkuDemandResult {
  disposition: ForecastPublishDisposition;
  outcome: "published" | "withheld";
  publicationId: string;
  forecastRunId: string;
  skuForecastId: string;
  sourceToken: string;
  grain: ForecastGrain;
  /**
   * True iff outcome === "published" (published or replayed disposition).
   * Withheld is never reported as published.
   */
  published: boolean;
  /**
   * True only when this call advanced the current pointer.
   * Replayed/withheld never claim current.
   */
  isCurrent: boolean;
  pointerAdvanced: boolean;
  m7Eligible: false;
  publicationClaimsPostCommitFreshness: false;
  persistClaimsPostCommitFreshness: false;
  withholdReason: ForecastPublishWithholdReason | null;
  supersedesPublicationId: string | null;
  freshnessLimitation: string;
}

export class ForecastPublishDeniedError extends Error {
  readonly code = "FORECAST_PUBLISH_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPublishDeniedError";
  }
}

export class ForecastPublishValidationError extends Error {
  readonly code = "FORECAST_PUBLISH_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPublishValidationError";
  }
}

export class ForecastPublishForeignGrainError extends Error {
  readonly code = "FORECAST_PUBLISH_FOREIGN_GRAIN";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPublishForeignGrainError";
  }
}

export class ForecastPublishStaleTokenError extends Error {
  readonly code = "FORECAST_PUBLISH_STALE_SOURCE_TOKEN";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPublishStaleTokenError";
  }
}

export class ForecastPublishPendingCorrectionError extends Error {
  readonly code = "FORECAST_PUBLISH_PENDING_CORRECTION";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPublishPendingCorrectionError";
  }
}

export class ForecastPublishTimeoutError extends Error {
  readonly code = "FORECAST_PUBLISH_TIMEOUT";
  readonly sqlstate: string;

  constructor(message: string, sqlstate: string) {
    super(message);
    this.name = "ForecastPublishTimeoutError";
    this.sqlstate = sqlstate;
  }
}

export class ForecastPublishUnavailableError extends Error {
  readonly code = "FORECAST_PUBLISH_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPublishUnavailableError";
  }
}

export class ForecastPublishError extends Error {
  readonly code = "FORECAST_PUBLISH";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPublishError";
  }
}

/**
 * Publish a previously persisted completed forecast run.
 * Calls publish_sku_forecast exactly once. Never auto-invoked from persist.
 */
export async function publishForecastSkuDemand(
  input: PublishForecastSkuDemandInput,
  client?: ForecastPublishClient,
): Promise<PublishForecastSkuDemandResult> {
  rejectForbiddenInputKeys(input);

  const grain = resolveTrustedGrain(input);
  const forecastRunId = assertUuid(input.forecastRunId, "forecastRunId");
  // Narrow structural client; Supabase generics are too deep to assign directly.
  const rpcClient =
    client ??
    (createSupabaseAdminClient() as unknown as ForecastPublishClient);

  await assertRunMatchesTrustedGrain(rpcClient, forecastRunId, grain);

  const raw = await callPublishRpc(rpcClient, forecastRunId);
  return parsePublishResponse(raw, forecastRunId, grain);
}

function rejectForbiddenInputKeys(input: object): void {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new ForecastPublishDeniedError(
        `publishForecastSkuDemand must not include client-supplied "${key}".`,
      );
    }
  }
}

function resolveTrustedGrain(
  input: PublishForecastSkuDemandInput,
): ForecastGrain {
  const { tenant } = input;

  if (
    tenant === null ||
    typeof tenant !== "object" ||
    typeof tenant.organizationId !== "string" ||
    typeof tenant.userId !== "string"
  ) {
    throw new ForecastPublishValidationError(
      "publishForecastSkuDemand requires a trusted TenantContext.",
    );
  }

  const organizationId = assertUuid(
    tenant.organizationId,
    "tenant.organizationId",
  );

  if (typeof tenant.storeId !== "string" || tenant.storeId.trim() === "") {
    throw new ForecastPublishValidationError(
      "publishForecastSkuDemand requires an authorized store on TenantContext.",
    );
  }

  return {
    organizationId,
    storeId: assertUuid(tenant.storeId, "tenant.storeId"),
    locationId: assertUuid(input.locationId, "locationId"),
    variantId: assertUuid(input.variantId, "variantId"),
  };
}

async function assertRunMatchesTrustedGrain(
  client: ForecastPublishClient,
  forecastRunId: string,
  grain: ForecastGrain,
): Promise<void> {
  let result: {
    data: Record<string, unknown> | null;
    error: { code?: string; message: string } | null;
  };

  try {
    result = await client
      .from("forecast_runs")
      .select(
        "id, organization_id, store_id, location_id, variant_id, status",
      )
      .eq("id", forecastRunId)
      .maybeSingle();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw mapRpcFailure(message, undefined);
  }

  if (result.error !== null) {
    throw mapRpcFailure(result.error.message, result.error.code);
  }

  if (result.data === null) {
    throw new ForecastPublishForeignGrainError(
      "forecast publish rejected unknown or foreign forecastRunId for trusted grain.",
    );
  }

  const row = result.data;
  const rowOrg = assertUuid(row.organization_id, "forecast_runs.organization_id");
  const rowStore = assertUuid(row.store_id, "forecast_runs.store_id");
  const rowLocation = assertUuid(row.location_id, "forecast_runs.location_id");
  const rowVariant = assertUuid(row.variant_id, "forecast_runs.variant_id");

  if (
    rowOrg !== grain.organizationId ||
    rowStore !== grain.storeId ||
    rowLocation !== grain.locationId ||
    rowVariant !== grain.variantId
  ) {
    throw new ForecastPublishForeignGrainError(
      "forecast publish rejected forecastRunId outside the trusted tenant grain.",
    );
  }

  if (row.status !== "completed") {
    throw new ForecastPublishValidationError(
      "forecast publish requires a completed historical run.",
    );
  }
}

async function callPublishRpc(
  client: ForecastPublishClient,
  forecastRunId: string,
): Promise<unknown> {
  let result: {
    data: unknown;
    error: { code?: string; message: string } | null;
  };

  try {
    result = await client.rpc(RPC_NAME, {
      p_forecast_run_id: forecastRunId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw mapRpcFailure(message, undefined);
  }

  if (result.error !== null) {
    throw mapRpcFailure(result.error.message, result.error.code);
  }

  return result.data;
}

function mapRpcFailure(message: string, code: string | undefined): never {
  const normalized = message.toLowerCase();
  const sqlstate = (code ?? "").toUpperCase();

  if (
    normalized.includes("stale_source_token") ||
    normalized.includes("stale source token")
  ) {
    throw new ForecastPublishStaleTokenError(
      "forecast publish rejected a stale sourceToken; reload, recalculate, and persist before retrying.",
    );
  }

  if (
    normalized.includes("pending_correction") ||
    normalized.includes("pending correction")
  ) {
    throw new ForecastPublishPendingCorrectionError(
      "forecast publish rejected a run with pending corrections; resolve and reload before retrying.",
    );
  }

  if (
    sqlstate === "55P03" ||
    sqlstate === "57014" ||
    normalized.includes("lock timeout") ||
    normalized.includes("statement timeout") ||
    normalized.includes("canceling statement due to statement timeout")
  ) {
    throw new ForecastPublishTimeoutError(
      `forecast publish timed out (${sqlstate || "timeout"}).`,
      sqlstate ||
        (normalized.includes("lock") ? "55P03" : "57014"),
    );
  }

  if (
    normalized.includes("could not find the function") ||
    normalized.includes("function public.publish_sku_forecast") ||
    normalized.includes("does not exist") ||
    normalized.includes("requires forecast_sku_demand_source_snapshot") ||
    sqlstate === "42883"
  ) {
    throw new ForecastPublishUnavailableError(
      "forecast publish RPC or snapshot revalidation capability is unavailable.",
    );
  }

  if (
    normalized.includes("permission denied") ||
    normalized.includes("not authorized") ||
    sqlstate === "42501"
  ) {
    throw new ForecastPublishDeniedError(
      "forecast publish RPC execution was denied.",
    );
  }

  if (
    normalized.includes("run not found") ||
    normalized.includes("requires a completed") ||
    normalized.includes("requires 1:1") ||
    normalized.includes("grain mismatch") ||
    normalized.includes("requires forecast_run_id")
  ) {
    throw new ForecastPublishValidationError(message);
  }

  throw new ForecastPublishError(
    `forecast publish RPC failed: ${message}`,
  );
}

function parsePublishResponse(
  raw: unknown,
  expectedRunId: string,
  grain: ForecastGrain,
): PublishForecastSkuDemandResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ForecastPublishValidationError(
      "forecast publish returned a malformed payload.",
    );
  }

  const payload = raw as Record<string, unknown>;

  if (payload.ok !== true) {
    throw new ForecastPublishValidationError(
      "forecast publish response ok flag must be true.",
    );
  }

  if (payload.persistClaimsPostCommitFreshness !== false) {
    throw new ForecastPublishValidationError(
      "forecast publish must not claim post-commit freshness.",
    );
  }

  if (payload.m7Eligible !== false) {
    throw new ForecastPublishValidationError(
      "forecast publish must not claim M7 eligibility.",
    );
  }

  const disposition = payload.disposition;
  if (
    disposition !== "published" &&
    disposition !== "replayed" &&
    disposition !== "withheld"
  ) {
    throw new ForecastPublishValidationError(
      `unexpected forecast publish disposition "${String(disposition)}".`,
    );
  }

  const outcome = payload.outcome;
  if (outcome !== "published" && outcome !== "withheld") {
    throw new ForecastPublishValidationError(
      `unexpected forecast publish outcome "${String(outcome)}".`,
    );
  }

  const forecastRunId = assertUuid(payload.forecastRunId, "forecastRunId");
  if (forecastRunId !== expectedRunId) {
    throw new ForecastPublishValidationError(
      "forecast publish response forecastRunId does not match requested run.",
    );
  }

  const skuForecastId = assertUuid(payload.skuForecastId, "skuForecastId");
  const publicationId = assertUuid(payload.publicationId, "publicationId");
  const sourceToken = assertSourceToken(payload.sourceToken);

  if (typeof payload.pointerAdvanced !== "boolean") {
    throw new ForecastPublishValidationError(
      "forecast publish response pointerAdvanced must be boolean.",
    );
  }
  const pointerAdvanced = payload.pointerAdvanced;

  let withholdReason: ForecastPublishWithholdReason | null = null;
  let supersedesPublicationId: string | null = null;

  if (disposition === "published") {
    if (outcome !== "published") {
      throw new ForecastPublishValidationError(
        "published disposition requires outcome published.",
      );
    }
    if (payload.withholdReason != null) {
      throw new ForecastPublishValidationError(
        "published disposition must not include withholdReason.",
      );
    }
    if (pointerAdvanced !== true) {
      throw new ForecastPublishValidationError(
        "published disposition requires pointerAdvanced true.",
      );
    }
    if (
      payload.supersedesPublicationId !== null &&
      payload.supersedesPublicationId !== undefined
    ) {
      supersedesPublicationId = assertUuid(
        payload.supersedesPublicationId,
        "supersedesPublicationId",
      );
    } else {
      supersedesPublicationId = null;
    }
  } else if (disposition === "replayed") {
    if (outcome !== "published") {
      throw new ForecastPublishValidationError(
        "replayed disposition requires outcome published.",
      );
    }
    if (payload.withholdReason != null) {
      throw new ForecastPublishValidationError(
        "replayed disposition must not include withholdReason.",
      );
    }
    if (pointerAdvanced !== false) {
      throw new ForecastPublishValidationError(
        "replayed disposition requires pointerAdvanced false.",
      );
    }
    if (
      payload.supersedesPublicationId !== null &&
      payload.supersedesPublicationId !== undefined
    ) {
      throw new ForecastPublishValidationError(
        "replayed disposition must not include supersedesPublicationId.",
      );
    }
  } else {
    // withheld
    if (outcome !== "withheld") {
      throw new ForecastPublishValidationError(
        "withheld disposition requires outcome withheld.",
      );
    }
    if (pointerAdvanced !== false) {
      throw new ForecastPublishValidationError(
        "withheld disposition requires pointerAdvanced false.",
      );
    }
    if (
      payload.supersedesPublicationId !== null &&
      payload.supersedesPublicationId !== undefined
    ) {
      throw new ForecastPublishValidationError(
        "withheld disposition must not include supersedesPublicationId.",
      );
    }

    const reason = payload.withholdReason;
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new ForecastPublishValidationError(
        "withheld disposition requires withholdReason.",
      );
    }

    if (reason === "STALE_SOURCE_TOKEN") {
      throw new ForecastPublishStaleTokenError(
        "forecast publish rejected a stale sourceToken; reload, recalculate, and persist before retrying.",
      );
    }

    if (reason === "PENDING_CORRECTION") {
      throw new ForecastPublishPendingCorrectionError(
        "forecast publish rejected a run with pending corrections; resolve and reload before retrying.",
      );
    }

    if (!RETURNED_WITHHOLD_REASONS.has(reason)) {
      throw new ForecastPublishValidationError(
        `unexpected forecast publish withholdReason "${reason}".`,
      );
    }

    withholdReason = reason as ForecastPublishWithholdReason;
  }

  const published = outcome === "published";
  const isCurrent = disposition === "published" && pointerAdvanced === true;

  if (!published && (isCurrent || disposition === "published")) {
    throw new ForecastPublishValidationError(
      "withheld publication must never be reported as current.",
    );
  }

  return {
    disposition,
    outcome,
    publicationId,
    forecastRunId,
    skuForecastId,
    sourceToken,
    grain,
    published,
    isCurrent,
    pointerAdvanced,
    m7Eligible: false,
    publicationClaimsPostCommitFreshness: false,
    persistClaimsPostCommitFreshness: false,
    withholdReason,
    supersedesPublicationId,
    freshnessLimitation: FRESHNESS_LIMITATION,
  };
}

function assertSourceToken(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{32}$/i.test(value)) {
    throw new ForecastPublishValidationError(
      "sourceToken must be an md5 hex digest.",
    );
  }

  return value.toLowerCase();
}

function assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ForecastPublishValidationError(`${field} is required.`);
  }

  const text = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    throw new ForecastPublishValidationError(`${field} must be a UUID.`);
  }

  return text;
}
