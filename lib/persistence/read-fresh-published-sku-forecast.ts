import "server-only";

import type { ForecastGrain } from "@/lib/forecasting/series";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M6 P3d.3 — server-only freshness-gated published forecast reader.
 *
 * One RPC: read_fresh_published_sku_forecast.
 * Never treats pointer existence as freshness. Never executes M7.
 * Never fabricates horizons / trustedCompleteDates / demand.
 *
 * Token equality is check-time identity only — not forecast-age approval.
 */

const RPC_NAME = "read_fresh_published_sku_forecast";

const FRESHNESS_LIMITATION =
  "read_fresh_published_sku_forecast proves source_token identity and publication gates at check time only; it does not prove post-return freshness or acceptable forecast age. M7 owns forecast-age policy and must revalidate before acting.";

const FORBIDDEN_INPUT_KEYS = new Set([
  "trustedCompleteDates",
  "organizationId",
  "storeId",
  "sourceToken",
  "dailyDemand",
  "confidenceIntervals",
  "fabricatedDemand",
  "m7Eligible",
  "m7NumericEligible",
  "forecastExpectedDemandUnits",
  "disposition",
]);

const MISS_DISPOSITIONS = new Set([
  "ABSENT",
  "STALE",
  "PENDING_CORRECTION",
  "FORECAST_UNAVAILABLE",
  "FORECAST_CONFIDENCE_LOW",
]);

export type FreshPublishedForecastMissDisposition =
  | "ABSENT"
  | "STALE"
  | "PENDING_CORRECTION"
  | "FORECAST_UNAVAILABLE"
  | "FORECAST_CONFIDENCE_LOW";

export type FreshPublishedForecastClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export interface ReadFreshPublishedForecastInput {
  tenant: TenantContext;
  locationId: string;
  variantId: string;
}

interface FreshPublishedForecastBase {
  grain: ForecastGrain;
  claimsPostCommitFreshness: false;
  freshnessLimitation: string;
  publicationId: string | null;
  forecastRunId: string | null;
  skuForecastId: string | null;
  sourceToken: string | null;
  forecastAsOf: string | null;
  lookbackDays: number | null;
  confidence: "high" | "medium" | "low" | "none" | null;
  mode: "standard" | "limited_history" | "unavailable" | null;
  dataSufficiency: "sufficient" | "limited" | "insufficient" | null;
}

export interface FreshPublishedForecastEligible
  extends FreshPublishedForecastBase {
  disposition: "eligible";
  m7NumericEligible: true;
  dailyDemand: number;
  publicationId: string;
  forecastRunId: string;
  skuForecastId: string;
  sourceToken: string;
  forecastAsOf: string;
  lookbackDays: number;
  confidence: "high" | "medium";
  mode: "standard" | "limited_history";
  dataSufficiency: "sufficient" | "limited";
}

export interface FreshPublishedForecastMiss extends FreshPublishedForecastBase {
  disposition: FreshPublishedForecastMissDisposition;
  m7NumericEligible: false;
  dailyDemand: null;
}

export type FreshPublishedForecastResult =
  | FreshPublishedForecastEligible
  | FreshPublishedForecastMiss;

export class FreshPublishedForecastDeniedError extends Error {
  readonly code = "FRESH_PUBLISHED_FORECAST_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "FreshPublishedForecastDeniedError";
  }
}

export class FreshPublishedForecastValidationError extends Error {
  readonly code = "FRESH_PUBLISHED_FORECAST_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "FreshPublishedForecastValidationError";
  }
}

export class FreshPublishedForecastTimeoutError extends Error {
  readonly code = "FRESH_PUBLISHED_FORECAST_TIMEOUT";
  readonly sqlstate: string;

  constructor(message: string, sqlstate: string) {
    super(message);
    this.name = "FreshPublishedForecastTimeoutError";
    this.sqlstate = sqlstate;
  }
}

export class FreshPublishedForecastUnavailableError extends Error {
  readonly code = "FRESH_PUBLISHED_FORECAST_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "FreshPublishedForecastUnavailableError";
  }
}

export class FreshPublishedForecastError extends Error {
  readonly code = "FRESH_PUBLISHED_FORECAST";

  constructor(message: string) {
    super(message);
    this.name = "FreshPublishedForecastError";
  }
}

/**
 * Read the current published forecast for a trusted grain after freshness gates.
 * Does not publish, persist, or invoke M7.
 */
export async function readFreshPublishedSkuForecast(
  input: ReadFreshPublishedForecastInput,
  client?: FreshPublishedForecastClient,
): Promise<FreshPublishedForecastResult> {
  rejectForbiddenInputKeys(input);
  const grain = resolveTrustedGrain(input);
  const rpcClient =
    client ??
    (createSupabaseAdminClient() as unknown as FreshPublishedForecastClient);

  const raw = await callReaderRpc(rpcClient, grain);
  return parseReaderResponse(raw, grain);
}

function rejectForbiddenInputKeys(input: object): void {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new FreshPublishedForecastDeniedError(
        `readFreshPublishedSkuForecast must not include client-supplied "${key}".`,
      );
    }
  }
}

function resolveTrustedGrain(
  input: ReadFreshPublishedForecastInput,
): ForecastGrain {
  const { tenant } = input;

  if (
    tenant === null ||
    typeof tenant !== "object" ||
    typeof tenant.organizationId !== "string" ||
    typeof tenant.userId !== "string"
  ) {
    throw new FreshPublishedForecastValidationError(
      "readFreshPublishedSkuForecast requires a trusted TenantContext.",
    );
  }

  if (typeof tenant.storeId !== "string" || tenant.storeId.trim() === "") {
    throw new FreshPublishedForecastValidationError(
      "readFreshPublishedSkuForecast requires an authorized store on TenantContext.",
    );
  }

  return {
    organizationId: assertUuid(tenant.organizationId, "tenant.organizationId"),
    storeId: assertUuid(tenant.storeId, "tenant.storeId"),
    locationId: assertUuid(input.locationId, "locationId"),
    variantId: assertUuid(input.variantId, "variantId"),
  };
}

async function callReaderRpc(
  client: FreshPublishedForecastClient,
  grain: ForecastGrain,
): Promise<unknown> {
  let result: {
    data: unknown;
    error: { code?: string; message: string } | null;
  };

  try {
    result = await client.rpc(RPC_NAME, {
      p_organization_id: grain.organizationId,
      p_store_id: grain.storeId,
      p_location_id: grain.locationId,
      p_variant_id: grain.variantId,
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
    sqlstate === "55P03" ||
    sqlstate === "57014" ||
    normalized.includes("lock timeout") ||
    normalized.includes("statement timeout") ||
    normalized.includes("canceling statement due to statement timeout")
  ) {
    throw new FreshPublishedForecastTimeoutError(
      `fresh published forecast reader timed out (${sqlstate || "timeout"}).`,
      sqlstate ||
        (normalized.includes("lock") ? "55P03" : "57014"),
    );
  }

  if (
    normalized.includes("could not find the function") ||
    normalized.includes("function public.read_fresh_published_sku_forecast") ||
    normalized.includes("does not exist") ||
    normalized.includes("requires forecast_sku_demand_source_snapshot") ||
    sqlstate === "42883"
  ) {
    throw new FreshPublishedForecastUnavailableError(
      "fresh published forecast reader RPC or snapshot capability is unavailable.",
    );
  }

  if (
    normalized.includes("permission denied") ||
    normalized.includes("not authorized") ||
    sqlstate === "42501"
  ) {
    throw new FreshPublishedForecastDeniedError(
      "fresh published forecast reader RPC execution was denied.",
    );
  }

  throw new FreshPublishedForecastError(
    `fresh published forecast reader RPC failed: ${message}`,
  );
}

function parseReaderResponse(
  raw: unknown,
  expectedGrain: ForecastGrain,
): FreshPublishedForecastResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new FreshPublishedForecastValidationError(
      "fresh published forecast reader returned a malformed payload.",
    );
  }

  const payload = raw as Record<string, unknown>;

  if (payload.ok !== true) {
    throw new FreshPublishedForecastValidationError(
      "fresh published forecast reader response ok flag must be true.",
    );
  }

  if (payload.claimsPostCommitFreshness !== false) {
    throw new FreshPublishedForecastValidationError(
      "fresh published forecast reader must not claim post-commit freshness.",
    );
  }

  if (
    typeof payload.freshnessLimitation !== "string" ||
    payload.freshnessLimitation.trim().length === 0
  ) {
    throw new FreshPublishedForecastValidationError(
      "fresh published forecast reader must include freshnessLimitation.",
    );
  }

  if (payload.freshnessLimitation !== FRESHNESS_LIMITATION) {
    throw new FreshPublishedForecastValidationError(
      "freshnessLimitation must match the check-time / non-age-policy contract.",
    );
  }

  const grain = parseGrain(payload.grain, expectedGrain);
  const disposition = payload.disposition;

  if (disposition === "eligible") {
    if (payload.m7NumericEligible !== true) {
      throw new FreshPublishedForecastValidationError(
        "eligible disposition requires m7NumericEligible true.",
      );
    }

    const dailyDemand = payload.dailyDemand;
    if (
      typeof dailyDemand !== "number" ||
      !Number.isFinite(dailyDemand) ||
      dailyDemand < 0
    ) {
      throw new FreshPublishedForecastValidationError(
        "eligible disposition requires finite nonnegative dailyDemand.",
      );
    }

    const confidence = payload.confidence;
    if (confidence !== "medium" && confidence !== "high") {
      throw new FreshPublishedForecastValidationError(
        "eligible disposition requires confidence medium or high.",
      );
    }

    const mode = payload.mode;
    if (mode !== "standard" && mode !== "limited_history") {
      throw new FreshPublishedForecastValidationError(
        "eligible disposition requires standard or limited_history mode.",
      );
    }

    const dataSufficiency = payload.dataSufficiency;
    if (dataSufficiency !== "sufficient" && dataSufficiency !== "limited") {
      throw new FreshPublishedForecastValidationError(
        "eligible disposition requires sufficient or limited dataSufficiency.",
      );
    }

    return {
      disposition: "eligible",
      m7NumericEligible: true,
      dailyDemand,
      claimsPostCommitFreshness: false,
      freshnessLimitation: payload.freshnessLimitation,
      grain,
      publicationId: assertUuid(payload.publicationId, "publicationId"),
      forecastRunId: assertUuid(payload.forecastRunId, "forecastRunId"),
      skuForecastId: assertUuid(payload.skuForecastId, "skuForecastId"),
      sourceToken: assertSourceToken(payload.sourceToken),
      forecastAsOf: assertDate(payload.forecastAsOf, "forecastAsOf"),
      lookbackDays: assertLookback(payload.lookbackDays),
      confidence,
      mode,
      dataSufficiency,
    };
  }

  if (typeof disposition !== "string" || !MISS_DISPOSITIONS.has(disposition)) {
    throw new FreshPublishedForecastValidationError(
      `unexpected fresh published forecast disposition "${String(disposition)}".`,
    );
  }

  if (payload.m7NumericEligible !== false) {
    throw new FreshPublishedForecastValidationError(
      "miss dispositions require m7NumericEligible false.",
    );
  }

  if (payload.dailyDemand !== null) {
    throw new FreshPublishedForecastValidationError(
      "miss dispositions require dailyDemand null.",
    );
  }

  return {
    disposition: disposition as FreshPublishedForecastMissDisposition,
    m7NumericEligible: false,
    dailyDemand: null,
    claimsPostCommitFreshness: false,
    freshnessLimitation: payload.freshnessLimitation,
    grain,
    publicationId: optionalUuid(payload.publicationId, "publicationId"),
    forecastRunId: optionalUuid(payload.forecastRunId, "forecastRunId"),
    skuForecastId: optionalUuid(payload.skuForecastId, "skuForecastId"),
    sourceToken: optionalSourceToken(payload.sourceToken),
    forecastAsOf: optionalDate(payload.forecastAsOf, "forecastAsOf"),
    lookbackDays: optionalLookback(payload.lookbackDays),
    confidence: optionalConfidence(payload.confidence),
    mode: optionalMode(payload.mode),
    dataSufficiency: optionalSufficiency(payload.dataSufficiency),
  };
}

function parseGrain(
  value: unknown,
  expected: ForecastGrain,
): ForecastGrain {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new FreshPublishedForecastValidationError(
      "fresh published forecast reader grain is malformed.",
    );
  }

  const row = value as Record<string, unknown>;
  const grain: ForecastGrain = {
    organizationId: assertUuid(row.organizationId, "grain.organizationId"),
    storeId: assertUuid(row.storeId, "grain.storeId"),
    locationId: assertUuid(row.locationId, "grain.locationId"),
    variantId: assertUuid(row.variantId, "grain.variantId"),
  };

  if (
    grain.organizationId !== expected.organizationId ||
    grain.storeId !== expected.storeId ||
    grain.locationId !== expected.locationId ||
    grain.variantId !== expected.variantId
  ) {
    throw new FreshPublishedForecastValidationError(
      "fresh published forecast reader grain does not match trusted TenantContext.",
    );
  }

  return grain;
}

function assertSourceToken(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{32}$/i.test(value)) {
    throw new FreshPublishedForecastValidationError(
      "sourceToken must be an md5 hex digest.",
    );
  }
  return value.toLowerCase();
}

function optionalSourceToken(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertSourceToken(value);
}

function assertDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FreshPublishedForecastValidationError(
      `${field} must be a YYYY-MM-DD date.`,
    );
  }
  return value;
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertDate(value, field);
}

function assertLookback(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 365
  ) {
    throw new FreshPublishedForecastValidationError(
      "lookbackDays must be an integer from 1 to 365.",
    );
  }
  return value;
}

function optionalLookback(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertLookback(value);
}

function optionalConfidence(
  value: unknown,
): "high" | "medium" | "low" | "none" | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "none"
  ) {
    return value;
  }
  throw new FreshPublishedForecastValidationError(
    `unexpected confidence "${String(value)}".`,
  );
}

function optionalMode(
  value: unknown,
): "standard" | "limited_history" | "unavailable" | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    value === "standard" ||
    value === "limited_history" ||
    value === "unavailable"
  ) {
    return value;
  }
  throw new FreshPublishedForecastValidationError(
    `unexpected mode "${String(value)}".`,
  );
}

function optionalSufficiency(
  value: unknown,
): "sufficient" | "limited" | "insufficient" | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    value === "sufficient" ||
    value === "limited" ||
    value === "insufficient"
  ) {
    return value;
  }
  throw new FreshPublishedForecastValidationError(
    `unexpected dataSufficiency "${String(value)}".`,
  );
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertUuid(value, field);
}

function assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FreshPublishedForecastValidationError(`${field} is required.`);
  }
  const text = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    throw new FreshPublishedForecastValidationError(`${field} must be a UUID.`);
  }
  return text;
}
