import {
  calculateForecastBacktest,
  FORECAST_BACKTEST_VERSION_V1,
} from "./backtesting";

import {
  DEFAULT_FORECAST_LOOKBACK_DAYS_V1,
  FORECAST_CONFIGURATION_VERSION_V1,
  FORECAST_ORCHESTRATOR_VERSION_V1,
  forecastSkuDemand,
} from "./orchestrate";

import {
  FORECAST_ALGORITHM_VERSIONS_V1,
} from "./reproducibility";

import {
  assertForecastDate,
  classifyForecastDay,
  shiftForecastDate,
  type ForecastDailyFact,
  type ForecastGrain,
} from "./series";

import type {
  ForecastBacktestResult,
  InventoryAvailabilityState,
  PromotionState,
} from "./types";

/**
 * M6 P4a — pure TypeScript cutoff-safe rolling-origin harness (H=1).
 *
 * Controlled point-in-time fixture histories only. knownAsOf establishes
 * historical knowledge; as-of date filters alone do not.
 *
 * Does not change frozen forecast math, defaults, publication, or M7.
 * Preliminary aggregates are diagnostic only — not production approval.
 */

export const FORECAST_BACKTEST_HARNESS_VERSION_V1 =
  "forecast-backtest-harness-v1" as const;

export const FORECAST_BACKTEST_HORIZON_DAYS_V1 = 1 as const;

export const FORECAST_BACKTEST_MIN_ORIGINS_V1 = 14 as const;

export type ForecastBacktestDemandClass =
  | "smooth"
  | "intermittent"
  | "unknown";

export type ForecastBacktestHarnessDisposition =
  | "preliminary"
  | "INSUFFICIENT_BACKTEST_POINTS"
  | "NO_ELIGIBLE_ORIGINS"
  | "INVALID_HISTORY";

export type ForecastBacktestHarnessReasonCode =
  | "INSUFFICIENT_BACKTEST_POINTS"
  | "NO_ELIGIBLE_ORIGINS"
  | "INVALID_HISTORY"
  | "KNOWN_AS_OF_BEFORE_FACT_DATE"
  | "DUPLICATE_FACT_REVISION"
  | "MISSING_KNOWN_AS_OF"
  | "ZERO_TOTAL_ACTUAL_DEMAND"
  | "MASE_DENOMINATOR_ZERO"
  | "PROMOTION_EXCLUDED_FROM_PRIMARY_SCORE"
  | "SCORE_DAY_NOT_CLEAN"
  | "ORIGIN_LAG_NOT_CLEAN"
  | "CANDIDATE_FORECAST_UNAVAILABLE";

/**
 * One point-in-time revision of a daily grain fact.
 * knownAsOf is the store-local date when this revision became knowable.
 */
export interface BacktestPointInTimeFact {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  date: string;
  unitsSold: number;
  availability: InventoryAvailabilityState;
  promotionState: PromotionState;
  dataComplete: boolean;
  knownAsOf: string;
}

export interface ForecastBacktestHarnessInput {
  grain: ForecastGrain;
  /**
   * Inclusive origin window. Score date = origin + 1.
   */
  originStart: string;
  originEnd: string;
  facts: readonly BacktestPointInTimeFact[];
  lookbackDays?: number;
}

export interface ForecastBacktestOriginPoint {
  originDate: string;
  scoreDate: string;
  actualDemand: number;
  candidatePredictedDemand: number;
  naivePredictedDemand: number;
  zeroPredictedDemand: 0;
}

export interface ForecastBacktestModelScores {
  model: "candidate" | "naive_lag1" | "zero";
  backtest: ForecastBacktestResult;
  mase: number | null;
  maseReasonCode: ForecastBacktestHarnessReasonCode | null;
}

export interface ForecastBacktestSegmentResult {
  demandClass: ForecastBacktestDemandClass;
  originCount: number;
  scoredDates: readonly string[];
  models: readonly ForecastBacktestModelScores[];
}

export interface ForecastBacktestHarnessResult {
  algorithmVersion: typeof FORECAST_BACKTEST_HARNESS_VERSION_V1;
  harnessHorizonDays: typeof FORECAST_BACKTEST_HORIZON_DAYS_V1;
  minOriginsRequired: typeof FORECAST_BACKTEST_MIN_ORIGINS_V1;
  disposition: ForecastBacktestHarnessDisposition;
  reasonCodes: readonly ForecastBacktestHarnessReasonCode[];
  grain: ForecastGrain;
  demandClass: ForecastBacktestDemandClass;
  originCount: number;
  scoredDates: readonly string[];
  origins: readonly ForecastBacktestOriginPoint[];
  models: readonly ForecastBacktestModelScores[];
  segments: readonly ForecastBacktestSegmentResult[];
  reproducibilityFingerprint: string;
  claimsProductionApproval: false;
  claimsM7NumericEligibility: false;
  orchestratorVersion: typeof FORECAST_ORCHESTRATOR_VERSION_V1;
  configurationVersion: typeof FORECAST_CONFIGURATION_VERSION_V1;
  algorithmVersions: typeof FORECAST_ALGORITHM_VERSIONS_V1;
  backtestMetricVersion: typeof FORECAST_BACKTEST_VERSION_V1;
}

function assertIdentity(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function toDailyFact(fact: BacktestPointInTimeFact): ForecastDailyFact {
  return {
    organizationId: fact.organizationId,
    storeId: fact.storeId,
    locationId: fact.locationId,
    variantId: fact.variantId,
    date: fact.date,
    unitsSold: fact.unitsSold,
    availability: fact.availability,
    promotionState: fact.promotionState,
    dataComplete: fact.dataComplete,
  };
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
  throw new Error("Unsupported fingerprint value.");
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function enumerateOrigins(start: string, end: string): string[] {
  assertForecastDate(start, "originStart");
  assertForecastDate(end, "originEnd");
  if (start > end) {
    throw new Error("originStart must be <= originEnd.");
  }
  const origins: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    origins.push(cursor);
    cursor = shiftForecastDate(cursor, 1);
  }
  return origins;
}

/**
 * Latest revision of a date knowable at knowledgeCutoff (inclusive).
 */
export function resolveFactAtKnowledgeCutoff(
  facts: readonly BacktestPointInTimeFact[],
  grain: ForecastGrain,
  date: string,
  knowledgeCutoff: string,
): BacktestPointInTimeFact | null {
  let chosen: BacktestPointInTimeFact | null = null;

  for (const fact of facts) {
    if (
      fact.organizationId !== grain.organizationId ||
      fact.storeId !== grain.storeId ||
      fact.locationId !== grain.locationId ||
      fact.variantId !== grain.variantId ||
      fact.date !== date
    ) {
      continue;
    }
    if (fact.knownAsOf > knowledgeCutoff) {
      continue;
    }
    if (
      chosen === null ||
      fact.knownAsOf > chosen.knownAsOf ||
      (fact.knownAsOf === chosen.knownAsOf &&
        stableSerialize(fact) > stableSerialize(chosen))
    ) {
      chosen = fact;
    }
  }

  return chosen;
}

/**
 * Final observed revision for scoring (held-out may be observed after origin).
 */
export function resolveFinalFactForDate(
  facts: readonly BacktestPointInTimeFact[],
  grain: ForecastGrain,
  date: string,
): BacktestPointInTimeFact | null {
  let chosen: BacktestPointInTimeFact | null = null;

  for (const fact of facts) {
    if (
      fact.organizationId !== grain.organizationId ||
      fact.storeId !== grain.storeId ||
      fact.locationId !== grain.locationId ||
      fact.variantId !== grain.variantId ||
      fact.date !== date
    ) {
      continue;
    }
    if (
      chosen === null ||
      fact.knownAsOf > chosen.knownAsOf ||
      (fact.knownAsOf === chosen.knownAsOf &&
        stableSerialize(fact) > stableSerialize(chosen))
    ) {
      chosen = fact;
    }
  }

  return chosen;
}

function validatePointInTimeHistory(
  facts: readonly BacktestPointInTimeFact[],
  grain: ForecastGrain,
): ForecastBacktestHarnessReasonCode[] {
  const reasons: ForecastBacktestHarnessReasonCode[] = [];
  const revisionKeys = new Set<string>();

  for (const fact of facts) {
    if (
      fact.organizationId !== grain.organizationId ||
      fact.storeId !== grain.storeId ||
      fact.locationId !== grain.locationId ||
      fact.variantId !== grain.variantId
    ) {
      continue;
    }

    if (
      typeof fact.knownAsOf !== "string" ||
      fact.knownAsOf.trim().length === 0
    ) {
      reasons.push("MISSING_KNOWN_AS_OF");
      continue;
    }

    try {
      assertForecastDate(fact.date, "fact.date");
      assertForecastDate(fact.knownAsOf, "fact.knownAsOf");
    } catch {
      reasons.push("INVALID_HISTORY");
      continue;
    }

    // Knowing a calendar day's outcome before that day exists is leakage.
    if (fact.knownAsOf < fact.date) {
      reasons.push("KNOWN_AS_OF_BEFORE_FACT_DATE");
    }

    const key = `${fact.date}|${fact.knownAsOf}|${stableSerialize({
      unitsSold: fact.unitsSold,
      availability: fact.availability,
      promotionState: fact.promotionState,
      dataComplete: fact.dataComplete,
    })}`;
    if (revisionKeys.has(key)) {
      reasons.push("DUPLICATE_FACT_REVISION");
    }
    revisionKeys.add(key);
  }

  return [...new Set(reasons)];
}

function buildTrainFactsAtOrigin(
  facts: readonly BacktestPointInTimeFact[],
  grain: ForecastGrain,
  originDate: string,
  lookbackDays: number,
): ForecastDailyFact[] {
  const start = shiftForecastDate(originDate, -(lookbackDays - 1));
  const out: ForecastDailyFact[] = [];

  for (let offset = 0; offset < lookbackDays; offset += 1) {
    const date = shiftForecastDate(start, offset);
    if (date > originDate) {
      break;
    }
    const resolved = resolveFactAtKnowledgeCutoff(
      facts,
      grain,
      date,
      originDate,
    );
    if (resolved !== null) {
      out.push(toDailyFact(resolved));
    }
  }

  return out;
}

function classifyCleanActual(
  fact: BacktestPointInTimeFact | null,
): { ok: true; actual: number } | { ok: false; reason: ForecastBacktestHarnessReasonCode } {
  if (fact === null) {
    return { ok: false, reason: "SCORE_DAY_NOT_CLEAN" };
  }

  const classified = classifyForecastDay({
    date: fact.date,
    unitsSold: fact.unitsSold,
    availability: fact.availability,
    promotionState: fact.promotionState,
    dataComplete: fact.dataComplete,
  });

  if (classified.disposition === "promotion_excluded") {
    return { ok: false, reason: "PROMOTION_EXCLUDED_FROM_PRIMARY_SCORE" };
  }

  if (classified.disposition !== "baseline_usable") {
    return { ok: false, reason: "SCORE_DAY_NOT_CLEAN" };
  }

  if (!Number.isFinite(classified.unitsSold) || classified.unitsSold < 0) {
    return { ok: false, reason: "SCORE_DAY_NOT_CLEAN" };
  }

  return { ok: true, actual: classified.unitsSold };
}

function classifyDemandClass(
  actuals: readonly number[],
): ForecastBacktestDemandClass {
  if (actuals.length === 0) {
    return "unknown";
  }
  const zeroCount = actuals.filter((value) => value === 0).length;
  return zeroCount / actuals.length >= 0.5 ? "intermittent" : "smooth";
}

function calculateMase(
  candidatePoints: readonly ForecastBacktestOriginPoint[],
): { mase: number | null; reason: ForecastBacktestHarnessReasonCode | null } {
  if (candidatePoints.length === 0) {
    return { mase: null, reason: "NO_ELIGIBLE_ORIGINS" };
  }

  let absoluteCandidate = 0;
  let absoluteNaive = 0;

  for (const point of candidatePoints) {
    absoluteCandidate += Math.abs(
      point.candidatePredictedDemand - point.actualDemand,
    );
    absoluteNaive += Math.abs(
      point.naivePredictedDemand - point.actualDemand,
    );
  }

  if (absoluteNaive === 0) {
    return { mase: null, reason: "MASE_DENOMINATOR_ZERO" };
  }

  const maeCandidate = absoluteCandidate / candidatePoints.length;
  const maeNaive = absoluteNaive / candidatePoints.length;

  return { mase: maeCandidate / maeNaive, reason: null };
}

function scoresForModel(
  model: "candidate" | "naive_lag1" | "zero",
  origins: readonly ForecastBacktestOriginPoint[],
): ForecastBacktestModelScores {
  const points = origins.map((origin) => {
    const predictedDemand =
      model === "candidate"
        ? origin.candidatePredictedDemand
        : model === "naive_lag1"
          ? origin.naivePredictedDemand
          : 0;
    return {
      actualDemand: origin.actualDemand,
      predictedDemand,
    };
  });

  const backtest = calculateForecastBacktest(points);

  if (model === "candidate") {
    const mase = calculateMase(origins);
    return {
      model,
      backtest,
      mase: mase.mase,
      maseReasonCode: mase.reason,
    };
  }

  // Baselines: MASE is defined vs naive, so only meaningful for candidate.
  return {
    model,
    backtest: {
      ...backtest,
      reasonCodes: backtest.reasonCodes,
    },
    mase: null,
    maseReasonCode:
      backtest.reasonCodes.includes("ZERO_TOTAL_ACTUAL_DEMAND")
        ? "ZERO_TOTAL_ACTUAL_DEMAND"
        : backtest.reasonCodes.includes("NO_BACKTEST_POINTS")
          ? "NO_ELIGIBLE_ORIGINS"
          : null,
  };
}

function emptyResult(
  input: ForecastBacktestHarnessInput,
  disposition: ForecastBacktestHarnessDisposition,
  reasonCodes: readonly ForecastBacktestHarnessReasonCode[],
): ForecastBacktestHarnessResult {
  const grain = input.grain;
  const fingerprint = fnv1a32(
    stableSerialize({
      harness: FORECAST_BACKTEST_HARNESS_VERSION_V1,
      grain,
      originStart: input.originStart,
      originEnd: input.originEnd,
      disposition,
      reasonCodes,
    }),
  );

  return {
    algorithmVersion: FORECAST_BACKTEST_HARNESS_VERSION_V1,
    harnessHorizonDays: FORECAST_BACKTEST_HORIZON_DAYS_V1,
    minOriginsRequired: FORECAST_BACKTEST_MIN_ORIGINS_V1,
    disposition,
    reasonCodes,
    grain,
    demandClass: "unknown",
    originCount: 0,
    scoredDates: [],
    origins: [],
    models: [],
    segments: [],
    reproducibilityFingerprint: fingerprint,
    claimsProductionApproval: false,
    claimsM7NumericEligibility: false,
    orchestratorVersion: FORECAST_ORCHESTRATOR_VERSION_V1,
    configurationVersion: FORECAST_CONFIGURATION_VERSION_V1,
    algorithmVersions: FORECAST_ALGORITHM_VERSIONS_V1,
    backtestMetricVersion: FORECAST_BACKTEST_VERSION_V1,
  };
}

/**
 * Rolling-origin H=1 evaluation over controlled point-in-time histories.
 */
export function evaluateForecastBacktestHarness(
  input: ForecastBacktestHarnessInput,
): ForecastBacktestHarnessResult {
  assertIdentity(input.grain.organizationId, "grain.organizationId");
  assertIdentity(input.grain.storeId, "grain.storeId");
  assertIdentity(input.grain.locationId, "grain.locationId");
  assertIdentity(input.grain.variantId, "grain.variantId");

  const historyReasons = validatePointInTimeHistory(input.facts, input.grain);
  if (historyReasons.length > 0) {
    return emptyResult(input, "INVALID_HISTORY", [
      "INVALID_HISTORY",
      ...historyReasons,
    ]);
  }

  const lookbackDays =
    input.lookbackDays ?? DEFAULT_FORECAST_LOOKBACK_DAYS_V1;
  if (
    !Number.isInteger(lookbackDays) ||
    lookbackDays < 1 ||
    lookbackDays > 365
  ) {
    throw new Error("lookbackDays must be an integer from 1 to 365.");
  }

  const originDates = enumerateOrigins(input.originStart, input.originEnd);
  const eligible: ForecastBacktestOriginPoint[] = [];
  const skipReasons = new Set<ForecastBacktestHarnessReasonCode>();

  for (const originDate of originDates) {
    const scoreDate = shiftForecastDate(
      originDate,
      FORECAST_BACKTEST_HORIZON_DAYS_V1,
    );

    const trainFacts = buildTrainFactsAtOrigin(
      input.facts,
      input.grain,
      originDate,
      lookbackDays,
    );

    // Guard: never train on score-date or later calendar days.
    if (trainFacts.some((fact) => fact.date > originDate)) {
      return emptyResult(input, "INVALID_HISTORY", [
        "INVALID_HISTORY",
      ]);
    }

    const forecast = forecastSkuDemand({
      grain: input.grain,
      forecastAsOf: originDate,
      lookbackDays,
      facts: trainFacts,
    });

    if (
      forecast.dailyDemand === null ||
      !Number.isFinite(forecast.dailyDemand) ||
      forecast.dailyDemand < 0
    ) {
      skipReasons.add("CANDIDATE_FORECAST_UNAVAILABLE");
      continue;
    }

    const originFact = resolveFactAtKnowledgeCutoff(
      input.facts,
      input.grain,
      originDate,
      originDate,
    );
    const originActual = classifyCleanActual(originFact);
    if (!originActual.ok) {
      skipReasons.add("ORIGIN_LAG_NOT_CLEAN");
      continue;
    }

    const scoreFact = resolveFinalFactForDate(
      input.facts,
      input.grain,
      scoreDate,
    );
    const scoreActual = classifyCleanActual(scoreFact);
    if (!scoreActual.ok) {
      skipReasons.add(scoreActual.reason);
      continue;
    }

    eligible.push({
      originDate,
      scoreDate,
      actualDemand: scoreActual.actual,
      candidatePredictedDemand: forecast.dailyDemand,
      naivePredictedDemand: originActual.actual,
      zeroPredictedDemand: 0,
    });
  }

  if (eligible.length === 0) {
    return emptyResult(input, "NO_ELIGIBLE_ORIGINS", [
      "NO_ELIGIBLE_ORIGINS",
      ...skipReasons,
    ]);
  }

  const demandClass = classifyDemandClass(
    eligible.map((point) => point.actualDemand),
  );
  const models = [
    scoresForModel("candidate", eligible),
    scoresForModel("naive_lag1", eligible),
    scoresForModel("zero", eligible),
  ] as const;

  const scoredDates = eligible.map((point) => point.scoreDate);
  const reasonCodes: ForecastBacktestHarnessReasonCode[] = [];
  let disposition: ForecastBacktestHarnessDisposition = "preliminary";

  if (eligible.length < FORECAST_BACKTEST_MIN_ORIGINS_V1) {
    disposition = "INSUFFICIENT_BACKTEST_POINTS";
    reasonCodes.push("INSUFFICIENT_BACKTEST_POINTS");
  }

  if (models[0].maseReasonCode === "MASE_DENOMINATOR_ZERO") {
    reasonCodes.push("MASE_DENOMINATOR_ZERO");
  }
  if (models[0].backtest.reasonCodes.includes("ZERO_TOTAL_ACTUAL_DEMAND")) {
    reasonCodes.push("ZERO_TOTAL_ACTUAL_DEMAND");
  }

  const segment: ForecastBacktestSegmentResult = {
    demandClass,
    originCount: eligible.length,
    scoredDates,
    models,
  };

  const fingerprint = fnv1a32(
    stableSerialize({
      harness: FORECAST_BACKTEST_HARNESS_VERSION_V1,
      grain: input.grain,
      originStart: input.originStart,
      originEnd: input.originEnd,
      lookbackDays,
      facts: input.facts,
      origins: eligible,
      models,
      disposition,
      reasonCodes,
    }),
  );

  return {
    algorithmVersion: FORECAST_BACKTEST_HARNESS_VERSION_V1,
    harnessHorizonDays: FORECAST_BACKTEST_HORIZON_DAYS_V1,
    minOriginsRequired: FORECAST_BACKTEST_MIN_ORIGINS_V1,
    disposition,
    reasonCodes,
    grain: input.grain,
    demandClass,
    originCount: eligible.length,
    scoredDates,
    origins: eligible,
    models,
    segments: [segment],
    reproducibilityFingerprint: fingerprint,
    claimsProductionApproval: false,
    claimsM7NumericEligibility: false,
    orchestratorVersion: FORECAST_ORCHESTRATOR_VERSION_V1,
    configurationVersion: FORECAST_CONFIGURATION_VERSION_V1,
    algorithmVersions: FORECAST_ALGORITHM_VERSIONS_V1,
    backtestMetricVersion: FORECAST_BACKTEST_VERSION_V1,
  };
}
