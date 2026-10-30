import "server-only";

import { createHash } from "node:crypto";

import {
  evaluateForecastBacktestHarness,
  FORECAST_BACKTEST_HARNESS_VERSION_V1,
  FORECAST_BACKTEST_HORIZON_DAYS_V1,
  type ForecastBacktestHarnessResult,
  type ForecastBacktestModelScores,
} from "@/lib/forecasting/backtest-harness";

import { FORECAST_BACKTEST_VERSION_V1 } from "@/lib/forecasting/backtesting";

import {
  FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
  type HistoricalEvidenceIntegrityAccepted,
  type HistoricalEvidenceIntegrityResult,
} from "@/lib/forecasting/historical-evidence-integrity";

import {
  DEFAULT_FORECAST_LOOKBACK_DAYS_V1,
  FORECAST_CONFIGURATION_VERSION_V1,
  FORECAST_ORCHESTRATOR_VERSION_V1,
} from "@/lib/forecasting/orchestrate";

import { FORECAST_ALGORITHM_VERSIONS_V1 } from "@/lib/forecasting/reproducibility";

import type { ForecastGrain } from "@/lib/forecasting/series";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M6 P4c.2 — server-only forecast evaluation persistence adapter.
 *
 * Runs only after P4b integrity classification.
 * Scored evaluations require accepted controlled_pit_fixture + harness
 * preliminary/insufficient diagnostics.
 * Rejected integrity persists as audit-only rows with zero model scores.
 *
 * One RPC: persist_forecast_evaluation_result. No direct table DML.
 * bodyHash is derived server-side; caller-supplied hashes are ignored.
 * Never publishes, never changes defaults, never claims M7/approval.
 */

const RPC_NAME = "persist_forecast_evaluation_result";

const FORBIDDEN_INPUT_KEYS = new Set([
  "trustedCompleteDates",
  "organizationId",
  "storeId",
  "bodyHash",
  "fixtureFingerprint",
  "algorithmVersionsFingerprint",
  "originsHash",
  "resultFingerprint",
  "evaluationRunId",
  "claimsProductionApproval",
  "claimsM7NumericEligibility",
  "algorithmApproved",
  "published",
  "m7Eligible",
  "sourceToken",
  "orders",
  "orderItems",
  "returnRefunds",
  "inventorySnapshots",
  "pendingCorrections",
]);

export type ForecastEvaluationPersistDisposition = "created" | "replayed";

export type ForecastEvaluationPersistClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export interface PersistForecastEvaluationInput {
  tenant: TenantContext;
  locationId: string;
  variantId: string;
  originStart: string;
  originEnd: string;
  lookbackDays?: number;
  integrity: HistoricalEvidenceIntegrityResult;
  /**
   * Required when integrity is rejected (accepted uses integrity.pinnedTimeZone).
   */
  pinnedTimeZone?: string;
}

export interface ForecastEvaluationModelScorePayload {
  model: "candidate" | "naive_lag1" | "zero";
  observationCount: number;
  mae: number | null;
  wape: number | null;
  biasRatio: number | null;
  mase: number | null;
  totalActualDemand: number;
  totalPredictedDemand: number;
  totalAbsoluteError: number;
  totalSignedError: number;
  metricReasonCodes: string[];
}

export interface ForecastEvaluationPersistPayload {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  harnessVersion: string;
  integrityVersion: string;
  backtestMetricVersion: string;
  orchestratorVersion: string;
  configurationVersion: string;
  algorithmVersions: Record<string, string>;
  algorithmVersionsFingerprint: string;
  fixtureFingerprint: string;
  originsHash: string;
  resultFingerprint: string;
  bodyHash: string;
  originStart: string;
  originEnd: string;
  lookbackDays: number;
  harnessHorizonDays: 1;
  pinnedTimeZone: string;
  integritySourceClass: string;
  integrityDisposition: string;
  integrityReasonCodes: string[];
  evaluationDisposition: string;
  harnessReasonCodes: string[];
  demandClass: string;
  originCount: number;
  scoredDates: string[];
  segments: unknown[];
  claimsProductionApproval: false;
  claimsM7NumericEligibility: false;
  algorithmApproved: false;
  models: ForecastEvaluationModelScorePayload[];
}

export interface PersistForecastEvaluationResult {
  disposition: ForecastEvaluationPersistDisposition;
  evaluationRunId: string;
  isScoredEvaluation: boolean;
  claimsProductionApproval: false;
  claimsM7NumericEligibility: false;
  algorithmApproved: false;
  grain: ForecastGrain;
  integrity: HistoricalEvidenceIntegrityResult;
  harness: ForecastBacktestHarnessResult | null;
  payload: ForecastEvaluationPersistPayload;
}

export class ForecastEvaluationPersistDeniedError extends Error {
  readonly code = "FORECAST_EVALUATION_PERSIST_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "ForecastEvaluationPersistDeniedError";
  }
}

export class ForecastEvaluationPersistValidationError extends Error {
  readonly code = "FORECAST_EVALUATION_PERSIST_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "ForecastEvaluationPersistValidationError";
  }
}

export class ForecastEvaluationPersistConflictError extends Error {
  readonly code = "FORECAST_EVALUATION_PERSIST_IDEMPOTENCY_BODY_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ForecastEvaluationPersistConflictError";
  }
}

export class ForecastEvaluationPersistTimeoutError extends Error {
  readonly code = "FORECAST_EVALUATION_PERSIST_TIMEOUT";
  readonly sqlstate: string;

  constructor(message: string, sqlstate: string) {
    super(message);
    this.name = "ForecastEvaluationPersistTimeoutError";
    this.sqlstate = sqlstate;
  }
}

export class ForecastEvaluationPersistUnavailableError extends Error {
  readonly code = "FORECAST_EVALUATION_PERSIST_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "ForecastEvaluationPersistUnavailableError";
  }
}

export class ForecastEvaluationPersistError extends Error {
  readonly code = "FORECAST_EVALUATION_PERSIST";

  constructor(message: string) {
    super(message);
    this.name = "ForecastEvaluationPersistError";
  }
}

/**
 * Classify integrity, optionally run P4a harness, persist via one RPC.
 */
export async function persistForecastEvaluation(
  input: PersistForecastEvaluationInput,
  client?: ForecastEvaluationPersistClient,
): Promise<PersistForecastEvaluationResult> {
  rejectForbiddenInputKeys(input);

  const grain = resolveTrustedGrain(input);
  assertIntegrityGrain(input.integrity, grain);

  const lookbackDays =
    input.lookbackDays ?? DEFAULT_FORECAST_LOOKBACK_DAYS_V1;
  assertLookbackDays(lookbackDays);

  let harness: ForecastBacktestHarnessResult | null = null;

  if (input.integrity.disposition === "accepted") {
    if (input.integrity.sourceClass !== "controlled_pit_fixture") {
      throw new ForecastEvaluationPersistValidationError(
        "accepted integrity must be controlled_pit_fixture for evaluation persistence.",
      );
    }

    harness = evaluateForecastBacktestHarness({
      grain,
      originStart: input.originStart,
      originEnd: input.originEnd,
      lookbackDays,
      facts: input.integrity.facts,
    });
  }

  const payload = buildForecastEvaluationPersistPayload({
    grain,
    originStart: input.originStart,
    originEnd: input.originEnd,
    lookbackDays,
    integrity: input.integrity,
    harness,
    pinnedTimeZone: resolvePinnedTimeZone(input),
  });

  const rpcClient = client ?? createSupabaseAdminClient();
  const raw = await callPersistRpc(rpcClient, {
    organizationId: grain.organizationId,
    storeId: grain.storeId,
    locationId: grain.locationId,
    variantId: grain.variantId,
    payload,
  });

  return parsePersistResponse(raw, {
    grain,
    integrity: input.integrity,
    harness,
    payload,
  });
}

/**
 * Builds the RPC JSON body. Derives all hashes server-side.
 * Exported for unit tests.
 */
export function buildForecastEvaluationPersistPayload(args: {
  grain: ForecastGrain;
  originStart: string;
  originEnd: string;
  lookbackDays: number;
  integrity: HistoricalEvidenceIntegrityResult;
  harness: ForecastBacktestHarnessResult | null;
  pinnedTimeZone: string;
}): ForecastEvaluationPersistPayload {
  const {
    grain,
    originStart,
    originEnd,
    lookbackDays,
    integrity,
    harness,
    pinnedTimeZone,
  } = args;

  if (
    typeof pinnedTimeZone !== "string" ||
    pinnedTimeZone.trim().length === 0
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "pinnedTimeZone is required for evaluation persistence.",
    );
  }

  assertLookbackDays(lookbackDays);

  const algorithmVersions = { ...FORECAST_ALGORITHM_VERSIONS_V1 };
  const algorithmVersionsFingerprint = md5Hex(
    stableSerialize(algorithmVersions),
  );

  const fixtureFingerprint = md5Hex(
    stableSerialize({
      integrityVersion: FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
      sourceClass: integrity.sourceClass,
      disposition: integrity.disposition,
      reasonCodes: integrity.reasonCodes,
      facts: integrity.facts,
      pinnedTimeZone: pinnedTimeZone.trim(),
    }),
  );

  if (
    integrity.disposition === "UNSUPPORTED_HISTORICAL_REPLAY" ||
    integrity.disposition === "INVALID_HISTORY"
  ) {
    const withoutHash = {
      organizationId: grain.organizationId,
      storeId: grain.storeId,
      locationId: grain.locationId,
      variantId: grain.variantId,
      harnessVersion: FORECAST_BACKTEST_HARNESS_VERSION_V1,
      integrityVersion: FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
      backtestMetricVersion: FORECAST_BACKTEST_VERSION_V1,
      orchestratorVersion: FORECAST_ORCHESTRATOR_VERSION_V1,
      configurationVersion: FORECAST_CONFIGURATION_VERSION_V1,
      algorithmVersions,
      algorithmVersionsFingerprint,
      fixtureFingerprint,
      originsHash: md5Hex(stableSerialize([])),
      resultFingerprint: md5Hex(
        stableSerialize({
          integrityDisposition: integrity.disposition,
          integrityReasonCodes: integrity.reasonCodes,
        }),
      ),
      originStart,
      originEnd,
      lookbackDays,
      harnessHorizonDays: FORECAST_BACKTEST_HORIZON_DAYS_V1,
      pinnedTimeZone: pinnedTimeZone.trim(),
      integritySourceClass: integrity.sourceClass,
      integrityDisposition: integrity.disposition,
      integrityReasonCodes: [...integrity.reasonCodes],
      evaluationDisposition: integrity.disposition,
      harnessReasonCodes: [] as string[],
      demandClass: "unknown",
      originCount: 0,
      scoredDates: [] as string[],
      segments: [] as unknown[],
      claimsProductionApproval: false as const,
      claimsM7NumericEligibility: false as const,
      algorithmApproved: false as const,
      models: [] as ForecastEvaluationModelScorePayload[],
    };

    return {
      ...withoutHash,
      bodyHash: md5Hex(stableSerialize(withoutHash)),
    };
  }

  if (harness === null) {
    throw new ForecastEvaluationPersistValidationError(
      "accepted integrity requires a harness result for evaluation persistence.",
    );
  }

  assertHarnessGrain(harness, grain);
  assertHarnessTrustFlags(harness);

  const scored =
    harness.disposition === "preliminary" ||
    harness.disposition === "INSUFFICIENT_BACKTEST_POINTS";

  if (scored) {
    if (harness.originCount < 1 || harness.models.length !== 3) {
      throw new ForecastEvaluationPersistValidationError(
        "scored evaluation requires originCount >= 1 and exactly three model scores.",
      );
    }
  } else if (harness.originCount !== 0 || harness.models.length !== 0) {
    // NO_ELIGIBLE_ORIGINS / INVALID_HISTORY empty harness shapes.
    if (harness.models.length !== 0) {
      throw new ForecastEvaluationPersistValidationError(
        "non-scored harness results must not carry model scores for persistence.",
      );
    }
  }

  const models = scored
    ? harness.models.map((model) => mapModelScore(model, harness.originCount))
    : [];

  const originsHash = md5Hex(stableSerialize(harness.origins));
  const resultFingerprint = md5Hex(
    stableSerialize({
      harnessFingerprint: harness.reproducibilityFingerprint,
      disposition: harness.disposition,
      reasonCodes: harness.reasonCodes,
      originCount: harness.originCount,
      scoredDates: harness.scoredDates,
      demandClass: harness.demandClass,
      models,
    }),
  );

  const withoutHash = {
    organizationId: grain.organizationId,
    storeId: grain.storeId,
    locationId: grain.locationId,
    variantId: grain.variantId,
    harnessVersion: FORECAST_BACKTEST_HARNESS_VERSION_V1,
    integrityVersion: FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
    backtestMetricVersion: FORECAST_BACKTEST_VERSION_V1,
    orchestratorVersion: FORECAST_ORCHESTRATOR_VERSION_V1,
    configurationVersion: FORECAST_CONFIGURATION_VERSION_V1,
    algorithmVersions,
    algorithmVersionsFingerprint,
    fixtureFingerprint,
    originsHash,
    resultFingerprint,
    originStart,
    originEnd,
    lookbackDays,
    harnessHorizonDays: FORECAST_BACKTEST_HORIZON_DAYS_V1,
    pinnedTimeZone: pinnedTimeZone.trim(),
    integritySourceClass: integrity.sourceClass,
    integrityDisposition: integrity.disposition,
    integrityReasonCodes: [...integrity.reasonCodes],
    evaluationDisposition: harness.disposition,
    harnessReasonCodes: [...harness.reasonCodes],
    demandClass: harness.demandClass,
    originCount: scored ? harness.originCount : 0,
    scoredDates: scored ? [...harness.scoredDates] : [],
    segments: scored
      ? harness.segments.map((segment) => ({
          demandClass: segment.demandClass,
          originCount: segment.originCount,
          scoredDates: [...segment.scoredDates],
        }))
      : [],
    claimsProductionApproval: false as const,
    claimsM7NumericEligibility: false as const,
    algorithmApproved: false as const,
    models,
  };

  return {
    ...withoutHash,
    bodyHash: md5Hex(stableSerialize(withoutHash)),
  };
}

function mapModelScore(
  model: ForecastBacktestModelScores,
  originCount: number,
): ForecastEvaluationModelScorePayload {
  const backtest = model.backtest;

  if (backtest.observationCount !== originCount) {
    throw new ForecastEvaluationPersistValidationError(
      "model observationCount must equal harness originCount.",
    );
  }

  const mae = assertFiniteOrNull(backtest.mae, "mae");
  const wape = assertFiniteOrNull(backtest.wape, "wape");
  const biasRatio = assertFiniteOrNull(backtest.biasRatio, "biasRatio");
  const mase = assertFiniteOrNull(model.mase, "mase");

  const metricReasonCodes = [
    ...backtest.reasonCodes,
    ...(model.maseReasonCode !== null ? [model.maseReasonCode] : []),
  ];

  return {
    model: model.model,
    observationCount: backtest.observationCount,
    mae,
    wape,
    biasRatio,
    mase,
    totalActualDemand: assertFiniteNumber(
      backtest.totalActualDemand,
      "totalActualDemand",
    ),
    totalPredictedDemand: assertFiniteNumber(
      backtest.totalPredictedDemand,
      "totalPredictedDemand",
    ),
    totalAbsoluteError: assertFiniteNumber(
      backtest.totalAbsoluteError,
      "totalAbsoluteError",
    ),
    totalSignedError: assertFiniteNumber(
      backtest.totalSignedError,
      "totalSignedError",
    ),
    metricReasonCodes,
  };
}

function resolvePinnedTimeZone(
  input: PersistForecastEvaluationInput,
): string {
  if (input.integrity.disposition === "accepted") {
    return (input.integrity as HistoricalEvidenceIntegrityAccepted)
      .pinnedTimeZone;
  }

  if (
    typeof input.pinnedTimeZone !== "string" ||
    input.pinnedTimeZone.trim().length === 0
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "rejected integrity persistence requires pinnedTimeZone.",
    );
  }

  return input.pinnedTimeZone.trim();
}

function resolveTrustedGrain(
  input: PersistForecastEvaluationInput,
): ForecastGrain {
  const { tenant, locationId, variantId } = input;

  if (
    tenant === null ||
    typeof tenant !== "object" ||
    typeof tenant.organizationId !== "string" ||
    tenant.organizationId.trim().length === 0 ||
    typeof tenant.userId !== "string" ||
    tenant.userId.trim().length === 0
  ) {
    throw new ForecastEvaluationPersistDeniedError(
      "persistForecastEvaluation requires a trusted TenantContext.",
    );
  }

  if (
    typeof tenant.storeId !== "string" ||
    tenant.storeId.trim().length === 0
  ) {
    throw new ForecastEvaluationPersistDeniedError(
      "persistForecastEvaluation requires an authorized store on TenantContext.",
    );
  }

  if (
    typeof locationId !== "string" ||
    locationId.trim().length === 0 ||
    typeof variantId !== "string" ||
    variantId.trim().length === 0
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "locationId and variantId are required.",
    );
  }

  return {
    organizationId: tenant.organizationId.trim(),
    storeId: tenant.storeId.trim(),
    locationId: locationId.trim(),
    variantId: variantId.trim(),
  };
}

function assertIntegrityGrain(
  integrity: HistoricalEvidenceIntegrityResult,
  grain: ForecastGrain,
): void {
  if (
    integrity.grain.organizationId !== grain.organizationId ||
    integrity.grain.storeId !== grain.storeId ||
    integrity.grain.locationId !== grain.locationId ||
    integrity.grain.variantId !== grain.variantId
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "integrity grain does not match trusted TenantContext grain.",
    );
  }

  if (
    integrity.claimsProductionApproval !== false ||
    integrity.claimsM7NumericEligibility !== false
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "integrity result must not claim production approval or M7 eligibility.",
    );
  }
}

function assertHarnessGrain(
  harness: ForecastBacktestHarnessResult,
  grain: ForecastGrain,
): void {
  if (
    harness.grain.organizationId !== grain.organizationId ||
    harness.grain.storeId !== grain.storeId ||
    harness.grain.locationId !== grain.locationId ||
    harness.grain.variantId !== grain.variantId
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "harness grain does not match trusted TenantContext grain.",
    );
  }
}

function assertHarnessTrustFlags(
  harness: ForecastBacktestHarnessResult,
): void {
  if (
    harness.claimsProductionApproval !== false ||
    harness.claimsM7NumericEligibility !== false
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "harness result must not claim production approval or M7 eligibility.",
    );
  }
}

function assertLookbackDays(lookbackDays: number): void {
  if (
    !Number.isInteger(lookbackDays) ||
    lookbackDays < 1 ||
    lookbackDays > 365
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "lookbackDays must be an integer from 1 to 365.",
    );
  }
}

function rejectForbiddenInputKeys(input: object): void {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new ForecastEvaluationPersistDeniedError(
        `persistForecastEvaluation must not include client-supplied "${key}".`,
      );
    }
  }
}

function assertFiniteNumber(value: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ForecastEvaluationPersistValidationError(
      `forecast evaluation rejects non-finite ${field}.`,
    );
  }
  return value;
}

function assertFiniteOrNull(
  value: number | null,
  field: string,
): number | null {
  if (value === null) {
    return null;
  }
  return assertFiniteNumber(value, field);
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  throw new ForecastEvaluationPersistValidationError(
    "Unsupported evaluation persist fingerprint value.",
  );
}

function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

async function callPersistRpc(
  client: ForecastEvaluationPersistClient,
  args: {
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
    payload: ForecastEvaluationPersistPayload;
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
    normalized.includes("evaluation_idempotency_body_conflict") ||
    normalized.includes("idempotency_body_conflict") ||
    normalized.includes("body conflict")
  ) {
    throw new ForecastEvaluationPersistConflictError(
      "forecast evaluation persist rejected same-key payload with a conflicting body.",
    );
  }

  if (
    sqlstate === "55P03" ||
    sqlstate === "57014" ||
    normalized.includes("lock timeout") ||
    normalized.includes("statement timeout") ||
    normalized.includes("canceling statement due to statement timeout")
  ) {
    throw new ForecastEvaluationPersistTimeoutError(
      `forecast evaluation persist timed out (${sqlstate || "timeout"}).`,
      sqlstate ||
        (normalized.includes("lock") ? "55P03" : "57014"),
    );
  }

  if (
    normalized.includes("could not find the function") ||
    (normalized.includes("persist_forecast_evaluation_result") &&
      normalized.includes("does not exist")) ||
    sqlstate === "42883"
  ) {
    throw new ForecastEvaluationPersistUnavailableError(
      "forecast evaluation persist RPC is unavailable.",
    );
  }

  if (
    normalized.includes("permission denied") ||
    normalized.includes("not authorized") ||
    sqlstate === "42501"
  ) {
    throw new ForecastEvaluationPersistDeniedError(
      "forecast evaluation persist RPC execution was denied.",
    );
  }

  if (
    normalized.includes("scope error") ||
    normalized.includes("payload grain does not match") ||
    normalized.includes("trustedcompletedates") ||
    normalized.includes("rejects production/m7/algorithm approval") ||
    normalized.includes("missing required") ||
    normalized.includes("non-finite") ||
    normalized.includes("must persist zero model scores") ||
    normalized.includes("requires exactly three model scores")
  ) {
    throw new ForecastEvaluationPersistValidationError(message);
  }

  throw new ForecastEvaluationPersistError(
    `forecast evaluation persist RPC failed: ${message}`,
  );
}

function parsePersistResponse(
  raw: unknown,
  context: {
    grain: ForecastGrain;
    integrity: HistoricalEvidenceIntegrityResult;
    harness: ForecastBacktestHarnessResult | null;
    payload: ForecastEvaluationPersistPayload;
  },
): PersistForecastEvaluationResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ForecastEvaluationPersistValidationError(
      "forecast evaluation persist returned a malformed payload.",
    );
  }

  const response = raw as Record<string, unknown>;

  if (response.ok !== true) {
    throw new ForecastEvaluationPersistValidationError(
      "forecast evaluation persist response ok flag must be true.",
    );
  }

  if (
    response.claimsProductionApproval !== false ||
    response.claimsM7NumericEligibility !== false ||
    response.algorithmApproved !== false
  ) {
    throw new ForecastEvaluationPersistValidationError(
      "forecast evaluation persist must not claim production, M7, or algorithm approval.",
    );
  }

  const disposition = response.disposition;
  if (disposition !== "created" && disposition !== "replayed") {
    throw new ForecastEvaluationPersistValidationError(
      `unexpected forecast evaluation persist disposition "${String(disposition)}".`,
    );
  }

  const evaluationRunId = assertUuid(
    response.evaluationRunId,
    "evaluationRunId",
  );

  if (typeof response.isScoredEvaluation !== "boolean") {
    throw new ForecastEvaluationPersistValidationError(
      "forecast evaluation persist response isScoredEvaluation must be boolean.",
    );
  }

  const expectedScored = context.payload.models.length === 3;
  if (response.isScoredEvaluation !== expectedScored) {
    throw new ForecastEvaluationPersistValidationError(
      "forecast evaluation persist isScoredEvaluation does not match payload models.",
    );
  }

  return {
    disposition,
    evaluationRunId,
    isScoredEvaluation: response.isScoredEvaluation,
    claimsProductionApproval: false,
    claimsM7NumericEligibility: false,
    algorithmApproved: false,
    grain: context.grain,
    integrity: context.integrity,
    harness: context.harness,
    payload: context.payload,
  };
}

function assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ForecastEvaluationPersistValidationError(
      `${field} is required.`,
    );
  }
  const text = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    throw new ForecastEvaluationPersistValidationError(
      `${field} must be a UUID.`,
    );
  }
  return text;
}
