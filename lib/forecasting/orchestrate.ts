import {
  resolveColdStartForecast,
} from "./cold-start";

import {
  calculateForecastConfidence,
} from "./confidence";

import {
  classifyHistorySufficiency,
} from "./history-sufficiency";

import {
  calculateForecastHorizons,
} from "./horizons";

import {
  buildForecastReproducibilityFingerprint,
  FORECAST_ALGORITHM_VERSIONS_V1,
} from "./reproducibility";

import {
  buildClassifiedForecastSeries,
  buildTrendComparisonDemand,
  buildWeightedDemandWindows,
  type ForecastDailyFact,
  type ForecastGrain,
  type ForecastSeriesQuality,
  type ClassifiedForecastDay,
} from "./series";

import {
  applyTrendAdjustment,
} from "./trend-adjustment";

import {
  calculateWeightedDemandForecast,
} from "./weighted-demand";

import type {
  ActiveForecastWindow,
  ColdStartForecastMode,
  ForecastConfidenceReasonCode,
  ForecastHorizonReasonCode,
  ForecastHorizonResult,
  WeightedDemandReasonCode,
} from "./types";

import type {
  ConfidenceLevel,
  ForecastDataSufficiency,
} from "@/lib/commerce-domain/types";

export const FORECAST_CONFIGURATION_VERSION_V1 =
  "forecast-config-v1" as const;

export const FORECAST_ORCHESTRATOR_VERSION_V1 =
  "forecast-orchestrator-v1" as const;

export const DEFAULT_FORECAST_LOOKBACK_DAYS_V1 = 90;

export type ForecastOrchestratorReasonCode =
  | WeightedDemandReasonCode
  | "INSUFFICIENT_HISTORY"
  | "BASELINE_UNAVAILABLE"
  | "TREND_COMPARISON_UNAVAILABLE"
  | ForecastConfidenceReasonCode
  | ForecastHorizonReasonCode;

export interface ForecastSkuDemandInput {
  grain: ForecastGrain;
  forecastAsOf: string;
  /**
   * Inclusive calendar length ending on forecastAsOf.
   * Defaults to 90 so the longest weighted window can participate.
   */
  lookbackDays?: number;
  facts: readonly ForecastDailyFact[];
  leadTimeDays?: number | null;
  reviewPeriodDays?: number | null;
}

export interface ForecastSkuDemandResult {
  algorithmVersion: typeof FORECAST_ORCHESTRATOR_VERSION_V1;
  configurationVersion: typeof FORECAST_CONFIGURATION_VERSION_V1;
  algorithmVersions: typeof FORECAST_ALGORITHM_VERSIONS_V1;

  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  forecastAsOf: string;
  inputStartDate: string;
  inputEndDate: string;

  dailyDemand: number | null;
  mode: ColdStartForecastMode;
  dataSufficiency: ForecastDataSufficiency;
  confidence: ConfidenceLevel;

  weightedDailyDemand: number | null;
  trendApplied: boolean;
  trendAdjustedDailyDemand: number | null;

  activeWindows: readonly ActiveForecastWindow[];
  quality: ForecastSeriesQuality;
  horizons: ForecastHorizonResult;
  reproducibilityFingerprint: string;

  reasonCodes: readonly ForecastOrchestratorReasonCode[];
  classifiedDays: readonly ClassifiedForecastDay[];
}

/**
 * forecast-orchestrator-v1
 *
 * Pure in-memory M6 Phase 1 pipeline:
 * dense series → stockout+promotion classification → history
 * sufficiency → weighted-demand-v1 → optional trend-adjustment-v1
 * → cold-start-v1 → confidence → horizons → reproducibility.
 *
 * Does not persist, invent demand, estimate lost sales, or emit
 * inventory decisions. Does not consume M5 velocity columns as input.
 */
export function forecastSkuDemand(
  input: ForecastSkuDemandInput,
): ForecastSkuDemandResult {
  const lookbackDays =
    input.lookbackDays ?? DEFAULT_FORECAST_LOOKBACK_DAYS_V1;

  const leadTimeDays =
    input.leadTimeDays === undefined
      ? null
      : input.leadTimeDays;

  const reviewPeriodDays =
    input.reviewPeriodDays === undefined
      ? null
      : input.reviewPeriodDays;

  const series = buildClassifiedForecastSeries({
    grain: input.grain,
    forecastAsOf: input.forecastAsOf,
    lookbackDays,
    facts: input.facts,
  });

  const sufficiency = classifyHistorySufficiency({
    usableDays: series.quality.baselineUsableDays,
  });

  const windows = buildWeightedDemandWindows(
    series.days,
    input.forecastAsOf,
  );

  const weighted = calculateWeightedDemandForecast({
    windows,
  });

  const reasonCodes: ForecastOrchestratorReasonCode[] = [];

  if (weighted.reasonCode !== null) {
    reasonCodes.push(weighted.reasonCode);
  }

  let baselineForColdStart = weighted.dailyDemand;
  let trendApplied = false;
  let trendAdjustedDailyDemand: number | null = null;

  if (weighted.dailyDemand !== null) {
    const trendComparison = buildTrendComparisonDemand(
      series.days,
      input.forecastAsOf,
    );

    if (trendComparison.eligible) {
      const trend = applyTrendAdjustment({
        baselineDailyDemand: weighted.dailyDemand,
        recentDailyDemand:
          trendComparison.recentDailyDemand as number,
        priorDailyDemand:
          trendComparison.priorDailyDemand as number,
      });

      trendApplied = true;
      trendAdjustedDailyDemand = trend.adjustedDailyDemand;
      baselineForColdStart = trend.adjustedDailyDemand;
    } else {
      reasonCodes.push("TREND_COMPARISON_UNAVAILABLE");
    }
  }

  const coldStart = resolveColdStartForecast({
    dataSufficiency: sufficiency.dataSufficiency,
    baselineDailyDemand: baselineForColdStart,
  });

  if (coldStart.reasonCode !== null) {
    reasonCodes.push(coldStart.reasonCode);
  }

  const confidence = calculateForecastConfidence({
    dataSufficiency: sufficiency.dataSufficiency,
    baselineAvailable: coldStart.dailyDemand !== null,
    totalDays: series.quality.totalDays,
    censoredDays: series.quality.censoredDays,
    promotionExcludedDays:
      series.quality.promotionExcludedDays,
    unusableDays: series.quality.unusableDays,
  });

  reasonCodes.push(...confidence.reasonCodes);

  const horizons = calculateForecastHorizons({
    dailyDemand: coldStart.dailyDemand,
    leadTimeDays,
    reviewPeriodDays,
  });

  reasonCodes.push(...horizons.reasonCodes);

  const canonicalInput = {
    grain: input.grain,
    forecastAsOf: input.forecastAsOf,
    lookbackDays,
    leadTimeDays,
    reviewPeriodDays,
    algorithmVersions: FORECAST_ALGORITHM_VERSIONS_V1,
    configurationVersion: FORECAST_CONFIGURATION_VERSION_V1,
    facts: input.facts
      .filter(
        (fact) =>
          fact.organizationId === input.grain.organizationId &&
          fact.storeId === input.grain.storeId &&
          fact.locationId === input.grain.locationId &&
          fact.variantId === input.grain.variantId &&
          fact.date >= series.inputStartDate &&
          fact.date <= series.inputEndDate,
      )
      .map((fact) => ({
        date: fact.date,
        unitsSold: fact.unitsSold,
        availability: fact.availability,
        promotionState: fact.promotionState,
        dataComplete: fact.dataComplete,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };

  const reproducibility =
    buildForecastReproducibilityFingerprint(
      {
        algorithmVersions: FORECAST_ALGORITHM_VERSIONS_V1,
        inputStartDate: series.inputStartDate,
        inputEndDate: series.inputEndDate,
        configurationVersion:
          FORECAST_CONFIGURATION_VERSION_V1,
      },
      canonicalInput,
    );

  return {
    algorithmVersion: FORECAST_ORCHESTRATOR_VERSION_V1,
    configurationVersion: FORECAST_CONFIGURATION_VERSION_V1,
    algorithmVersions: FORECAST_ALGORITHM_VERSIONS_V1,

    organizationId: input.grain.organizationId,
    storeId: input.grain.storeId,
    locationId: input.grain.locationId,
    variantId: input.grain.variantId,
    forecastAsOf: input.forecastAsOf,
    inputStartDate: series.inputStartDate,
    inputEndDate: series.inputEndDate,

    dailyDemand: coldStart.dailyDemand,
    mode: coldStart.mode,
    dataSufficiency: sufficiency.dataSufficiency,
    confidence: confidence.confidence,

    weightedDailyDemand: weighted.dailyDemand,
    trendApplied,
    trendAdjustedDailyDemand,

    activeWindows: weighted.activeWindows,
    quality: series.quality,
    horizons,
    reproducibilityFingerprint: reproducibility.fingerprint,

    reasonCodes: [...new Set(reasonCodes)],
    classifiedDays: series.days,
  };
}
