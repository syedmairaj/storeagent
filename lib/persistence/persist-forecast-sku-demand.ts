import "server-only";

import type { ForecastSkuDemandResult } from "@/lib/forecasting/orchestrate";
import type { ForecastGrain } from "@/lib/forecasting/series";

import {
  loadForecastSkuDemand,
  type ForecastSkuDemandLoaderClient,
  type LoadForecastSkuDemandInput,
  type LoadForecastSkuDemandResult,
} from "@/lib/persistence/load-forecast-sku-demand";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * M6 P3c — server-only forecast persistence adapter.
 *
 * Load path: loadForecastSkuDemand only (no independent recalculation).
 * Write path: persist_forecast_sku_demand_result only (no direct table DML).
 *
 * Persisted rows are historical terminal results only.
 * They are never published and never M7-eligible from this adapter.
 *
 * sourceToken is revalidated inside the RPC transaction. A stale token
 * fails closed here; callers must reload and recalculate — this adapter
 * never silently retries a stale load.
 */

const RPC_NAME = "persist_forecast_sku_demand_result";

const FORBIDDEN_INPUT_KEYS = new Set([
  "trustedCompleteDates",
  "organizationId",
  "storeId",
  "sourceToken",
  "forecastRunId",
  "skuForecastId",
  "disposition",
  "published",
  "m7Eligible",
  "dailyDemand",
  "confidenceIntervals",
  "fabricatedDemand",
]);

export type ForecastPersistDisposition = "created" | "replayed";

export type ForecastPersistClient = ForecastSkuDemandLoaderClient;

export interface ForecastPersistPayload {
  algorithmVersion: string;
  configurationVersion: string;
  algorithmVersions: Record<string, string>;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  forecastAsOf: string;
  inputStartDate: string;
  inputEndDate: string;
  dailyDemand: number | null;
  mode: string;
  dataSufficiency: string;
  confidence: string;
  weightedDailyDemand: number | null;
  trendApplied: boolean;
  trendAdjustedDailyDemand: number | null;
  activeWindows: unknown;
  quality: unknown;
  horizons: unknown;
  reproducibilityFingerprint: string;
  reasonCodes: unknown;
  classifiedDays: unknown;
  parameters: Record<string, unknown>;
  provenance: Record<string, unknown>;
}

export interface PersistForecastSkuDemandResult {
  disposition: ForecastPersistDisposition;
  forecastRunId: string;
  skuForecastId: string;
  sourceToken: string;
  status: "completed";
  /**
   * Explicit: persistence does not publish or claim post-commit freshness.
   */
  persistClaimsPostCommitFreshness: false;
  published: false;
  m7Eligible: false;
  grain: ForecastGrain;
  forecast: ForecastSkuDemandResult;
  load: LoadForecastSkuDemandResult;
}

export class ForecastPersistDeniedError extends Error {
  readonly code = "FORECAST_PERSIST_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPersistDeniedError";
  }
}

export class ForecastPersistValidationError extends Error {
  readonly code = "FORECAST_PERSIST_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPersistValidationError";
  }
}

export class ForecastPersistStaleTokenError extends Error {
  readonly code = "FORECAST_PERSIST_STALE_SOURCE_TOKEN";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPersistStaleTokenError";
  }
}

export class ForecastPersistConflictError extends Error {
  readonly code = "FORECAST_PERSIST_IDEMPOTENCY_BODY_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPersistConflictError";
  }
}

export class ForecastPersistTimeoutError extends Error {
  readonly code = "FORECAST_PERSIST_TIMEOUT";
  readonly sqlstate: string;

  constructor(message: string, sqlstate: string) {
    super(message);
    this.name = "ForecastPersistTimeoutError";
    this.sqlstate = sqlstate;
  }
}

export class ForecastPersistUnavailableError extends Error {
  readonly code = "FORECAST_PERSIST_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPersistUnavailableError";
  }
}

export class ForecastPersistError extends Error {
  readonly code = "FORECAST_PERSIST";

  constructor(message: string) {
    super(message);
    this.name = "ForecastPersistError";
  }
}

/**
 * Load via loadForecastSkuDemand, then persist the exact forecast result.
 * Never recalculates independently of the loader.
 */
export async function persistForecastSkuDemand(
  input: LoadForecastSkuDemandInput,
  client?: ForecastPersistClient,
): Promise<PersistForecastSkuDemandResult> {
  rejectForbiddenInputKeys(input);
  const rpcClient = client ?? createSupabaseAdminClient();
  const loaded = await loadForecastSkuDemand(input, rpcClient);
  return persistLoadedForecastSkuDemand(loaded, rpcClient);
}

/**
 * Persist a previously loaded forecast result without reloading.
 *
 * Used when the caller already holds a LoadForecastSkuDemandResult.
 * On STALE_SOURCE_TOKEN this fails closed — callers must load fresh
 * (persistForecastSkuDemand) rather than retrying the stale payload.
 */
export async function persistLoadedForecastSkuDemand(
  loaded: LoadForecastSkuDemandResult,
  client?: ForecastPersistClient,
): Promise<PersistForecastSkuDemandResult> {
  assertLoadedGrainConsistency(loaded);

  const rpcClient = client ?? createSupabaseAdminClient();
  const payload = buildForecastPersistPayload(loaded);

  const raw = await callPersistRpc(rpcClient, {
    organizationId: loaded.grain.organizationId,
    storeId: loaded.grain.storeId,
    locationId: loaded.grain.locationId,
    variantId: loaded.grain.variantId,
    forecastAsOf: loaded.provenance.forecastAsOf,
    lookbackDays: loaded.provenance.lookbackDays,
    sourceToken: loaded.provenance.sourceToken,
    payload,
  });

  return parsePersistResponse(raw, loaded);
}

/**
 * Maps a loaded forecast into the RPC JSON body. Exported for unit tests.
 * Does not invent demand or confidence intervals.
 */
export function buildForecastPersistPayload(
  loaded: LoadForecastSkuDemandResult,
): ForecastPersistPayload {
  assertLoadedGrainConsistency(loaded);

  const { forecast, provenance, grain } = loaded;

  if (Object.prototype.hasOwnProperty.call(forecast, "trustedCompleteDates")) {
    throw new ForecastPersistValidationError(
      "forecast persist payload must not include trustedCompleteDates.",
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(forecast, "confidenceIntervals")
  ) {
    throw new ForecastPersistValidationError(
      "forecast persist payload must not include confidenceIntervals.",
    );
  }

  return {
    algorithmVersion: forecast.algorithmVersion,
    configurationVersion: forecast.configurationVersion,
    algorithmVersions: { ...forecast.algorithmVersions },
    organizationId: grain.organizationId,
    storeId: grain.storeId,
    locationId: grain.locationId,
    variantId: grain.variantId,
    forecastAsOf: forecast.forecastAsOf,
    inputStartDate: forecast.inputStartDate,
    inputEndDate: forecast.inputEndDate,
    dailyDemand: forecast.dailyDemand,
    mode: forecast.mode,
    dataSufficiency: forecast.dataSufficiency,
    confidence: forecast.confidence,
    weightedDailyDemand: forecast.weightedDailyDemand,
    trendApplied: forecast.trendApplied,
    trendAdjustedDailyDemand: forecast.trendAdjustedDailyDemand,
    activeWindows: jsonClone(forecast.activeWindows),
    quality: jsonClone(forecast.quality),
    horizons: jsonClone(forecast.horizons),
    reproducibilityFingerprint: forecast.reproducibilityFingerprint,
    reasonCodes: jsonClone(forecast.reasonCodes),
    classifiedDays: jsonClone(forecast.classifiedDays),
    parameters: {
      lookbackDays: provenance.lookbackDays,
      inputStartDate: provenance.inputStartDate,
      inputEndDate: provenance.inputEndDate,
      timeZone: provenance.timeZone,
    },
    provenance: {
      loadRpc: provenance.rpc,
      sourceToken: provenance.sourceToken,
      timeZone: provenance.timeZone,
      forecastAsOf: provenance.forecastAsOf,
      lookbackDays: provenance.lookbackDays,
      inputStartDate: provenance.inputStartDate,
      inputEndDate: provenance.inputEndDate,
      pendingCorrectionCount: provenance.pendingCorrectionCount,
      pendingCorrectionFenceApplied:
        provenance.pendingCorrectionFenceApplied,
      trustedCompleteDatesUsed: provenance.trustedCompleteDatesUsed,
      sourceTokenFreshness: provenance.sourceTokenFreshness,
      historicalOnly: true,
      published: false,
      m7Eligible: false,
      persistClaimsPostCommitFreshness: false,
    },
  };
}

function rejectForbiddenInputKeys(input: object): void {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new ForecastPersistDeniedError(
        `persistForecastSkuDemand must not include client-supplied "${key}".`,
      );
    }
  }
}

function assertLoadedGrainConsistency(
  loaded: LoadForecastSkuDemandResult,
): void {
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    loaded.forecast === null ||
    typeof loaded.forecast !== "object" ||
    loaded.grain === null ||
    typeof loaded.grain !== "object" ||
    loaded.provenance === null ||
    typeof loaded.provenance !== "object"
  ) {
    throw new ForecastPersistValidationError(
      "persist requires a complete LoadForecastSkuDemandResult.",
    );
  }

  const { grain, forecast, provenance } = loaded;

  if (
    forecast.organizationId !== grain.organizationId ||
    forecast.storeId !== grain.storeId ||
    forecast.locationId !== grain.locationId ||
    forecast.variantId !== grain.variantId
  ) {
    throw new ForecastPersistValidationError(
      "loaded forecast grain does not match trusted load grain.",
    );
  }

  if (forecast.forecastAsOf !== provenance.forecastAsOf) {
    throw new ForecastPersistValidationError(
      "loaded forecastAsOf does not match snapshot provenance.",
    );
  }

  if (
    typeof provenance.sourceToken !== "string" ||
    !/^[a-f0-9]{32}$/i.test(provenance.sourceToken)
  ) {
    throw new ForecastPersistValidationError(
      "loaded provenance.sourceToken must be an md5 hex digest.",
    );
  }

  if (provenance.trustedCompleteDatesUsed !== false) {
    throw new ForecastPersistValidationError(
      "persist rejects loads that used trustedCompleteDates.",
    );
  }
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function callPersistRpc(
  client: ForecastPersistClient,
  args: {
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
    forecastAsOf: string;
    lookbackDays: number;
    sourceToken: string;
    payload: ForecastPersistPayload;
  },
): Promise<unknown> {
  let result: {
    data: unknown;
    error: { code?: string; message: string } | null;
  };

  try {
    result = await client.rpc(RPC_NAME, {
      p_organization_id: args.organizationId,
      p_store_id: args.storeId,
      p_location_id: args.locationId,
      p_variant_id: args.variantId,
      p_forecast_as_of: args.forecastAsOf,
      p_lookback_days: args.lookbackDays,
      p_source_token: args.sourceToken,
      p_payload: args.payload,
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
    throw new ForecastPersistStaleTokenError(
      "forecast persist rejected a stale sourceToken; reload and recalculate before retrying.",
    );
  }

  if (
    normalized.includes("idempotency_body_conflict") ||
    normalized.includes("body conflict")
  ) {
    throw new ForecastPersistConflictError(
      "forecast persist rejected same-key payload with a conflicting body.",
    );
  }

  if (
    sqlstate === "55P03" ||
    sqlstate === "57014" ||
    normalized.includes("lock timeout") ||
    normalized.includes("statement timeout") ||
    normalized.includes("canceling statement due to statement timeout")
  ) {
    throw new ForecastPersistTimeoutError(
      `forecast persist timed out (${sqlstate || "timeout"}).`,
      sqlstate ||
        (normalized.includes("lock") ? "55P03" : "57014"),
    );
  }

  if (
    normalized.includes("could not find the function") ||
    normalized.includes("function public.persist_forecast_sku_demand_result") ||
    normalized.includes("does not exist") ||
    normalized.includes("requires forecast_sku_demand_source_snapshot") ||
    sqlstate === "42883"
  ) {
    throw new ForecastPersistUnavailableError(
      "forecast persist RPC or snapshot revalidation capability is unavailable.",
    );
  }

  if (
    normalized.includes("permission denied") ||
    normalized.includes("not authorized") ||
    sqlstate === "42501"
  ) {
    throw new ForecastPersistDeniedError(
      "forecast persist RPC execution was denied.",
    );
  }

  if (
    normalized.includes("scope error") ||
    normalized.includes("payload grain does not match") ||
    normalized.includes("trustedcompletedates") ||
    normalized.includes("lookbackdays must be an integer") ||
    normalized.includes("source_token must be") ||
    normalized.includes("malformed") ||
    normalized.includes("missing required")
  ) {
    throw new ForecastPersistValidationError(message);
  }

  throw new ForecastPersistError(
    `forecast persist RPC failed: ${message}`,
  );
}

function parsePersistResponse(
  raw: unknown,
  loaded: LoadForecastSkuDemandResult,
): PersistForecastSkuDemandResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ForecastPersistValidationError(
      "forecast persist returned a malformed payload.",
    );
  }

  const payload = raw as Record<string, unknown>;

  if (payload.ok !== true) {
    throw new ForecastPersistValidationError(
      "forecast persist response ok flag must be true.",
    );
  }

  if (payload.persistClaimsPostCommitFreshness !== false) {
    throw new ForecastPersistValidationError(
      "forecast persist must not claim post-commit freshness.",
    );
  }

  if (payload.status !== "completed") {
    throw new ForecastPersistValidationError(
      "forecast persist must return completed status only.",
    );
  }

  const disposition = payload.disposition;
  if (disposition !== "created" && disposition !== "replayed") {
    throw new ForecastPersistValidationError(
      `unexpected forecast persist disposition "${String(disposition)}".`,
    );
  }

  const forecastRunId = assertUuid(payload.forecastRunId, "forecastRunId");
  const skuForecastId = assertUuid(payload.skuForecastId, "skuForecastId");
  const sourceToken = assertIdentity(payload.sourceToken, "sourceToken");

  if (sourceToken !== loaded.provenance.sourceToken) {
    throw new ForecastPersistValidationError(
      "forecast persist response sourceToken does not match loaded provenance.",
    );
  }

  return {
    disposition,
    forecastRunId,
    skuForecastId,
    sourceToken,
    status: "completed",
    persistClaimsPostCommitFreshness: false,
    published: false,
    m7Eligible: false,
    grain: loaded.grain,
    forecast: loaded.forecast,
    load: loaded,
  };
}

function assertIdentity(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ForecastPersistValidationError(`${field} is required.`);
  }

  return value.trim();
}

function assertUuid(value: unknown, field: string): string {
  const text = assertIdentity(value, field);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    throw new ForecastPersistValidationError(
      `${field} must be a UUID.`,
    );
  }

  return text;
}
