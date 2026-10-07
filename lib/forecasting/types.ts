import type {
  ConfidenceLevel,
  ForecastDataSufficiency,
} from "@/lib/commerce-domain/types";

export type ForecastWindowDays =
  | 7
  | 14
  | 30
  | 90;

export interface HistorySufficiencyInput {
  usableDays: number;
}

export interface HistorySufficiencyResult {
  dataSufficiency: ForecastDataSufficiency;
  usableDays: number;
}

export interface WeightedDemandWindowInput {
  windowDays: ForecastWindowDays;

  /**
   * Deterministic average daily demand for this window.
   *
   * null means the window cannot produce trusted demand.
   */
  dailyDemand: number | null;

  /**
   * Number of observations inside this window that are usable
   * after missing-data / censoring rules.
   */
  usableDays: number;
}

export interface WeightedDemandForecastInput {
  windows: readonly WeightedDemandWindowInput[];
}

export interface ActiveForecastWindow {
  windowDays: ForecastWindowDays;
  dailyDemand: number;
  usableDays: number;
  configuredWeight: number;
  normalizedWeight: number;
}

export type WeightedDemandReasonCode =
  | "NO_USABLE_FORECAST_WINDOWS";

export interface WeightedDemandForecastResult {
  algorithmVersion: "weighted-demand-v1";
  dailyDemand: number | null;
  activeWindows: readonly ActiveForecastWindow[];
  reasonCode: WeightedDemandReasonCode | null;
}

export interface TrendAdjustmentInput {
  /**
   * Deterministic weighted baseline demand.
   */
  baselineDailyDemand: number;

  /**
   * Recent comparable daily demand.
   */
  recentDailyDemand: number;

  /**
   * Prior comparable daily demand.
   */
  priorDailyDemand: number;
}

export interface TrendAdjustmentResult {
  algorithmVersion: "trend-adjustment-v1";
  baselineDailyDemand: number;
  adjustedDailyDemand: number;
  rawTrendRatio: number | null;
  appliedAdjustmentRatio: number;
  capped: boolean;
}

export type InventoryAvailabilityState =
  | "available"
  | "unavailable"
  | "unknown";

export interface DailyDemandObservationInput {
  date: string;
  unitsSold: number;
  availability: InventoryAvailabilityState;
  dataComplete: boolean;
}

export type DemandObservationDisposition =
  | "usable"
  | "stockout_censored"
  | "unusable";

export type DemandObservationReasonCode =
  | "STOCKOUT_CENSORED"
  | "AVAILABILITY_UNKNOWN"
  | "DATA_INCOMPLETE";

export interface DailyDemandObservationResult {
  date: string;
  unitsSold: number;
  disposition: DemandObservationDisposition;
  reasonCode: DemandObservationReasonCode | null;
}

export interface DemandSeriesQualitySummary {
  usableDays: number;
  censoredDays: number;
  unusableDays: number;
  totalDays: number;
}

export type PromotionState =
  | "none"
  | "promotion"
  | "unknown";

export interface PromotionObservationInput {
  date: string;
  unitsSold: number;
  promotionState: PromotionState;
  dataComplete: boolean;
}

export type PromotionObservationDisposition =
  | "baseline_usable"
  | "promotion_excluded"
  | "unusable";

export type PromotionObservationReasonCode =
  | "PROMOTION_EXCLUDED"
  | "PROMOTION_STATE_UNKNOWN"
  | "PROMOTION_DATA_INCOMPLETE";

export interface PromotionObservationResult {
  date: string;
  unitsSold: number;
  disposition: PromotionObservationDisposition;
  reasonCode: PromotionObservationReasonCode | null;
}

export interface PromotionSeriesQualitySummary {
  baselineUsableDays: number;
  promotionExcludedDays: number;
  unusableDays: number;
  totalDays: number;
}

export type ColdStartForecastMode =
  | "standard"
  | "limited_history"
  | "unavailable";

export type ColdStartReasonCode =
  | "INSUFFICIENT_HISTORY"
  | "BASELINE_UNAVAILABLE";

export interface ColdStartForecastInput {
  dataSufficiency:
    | "sufficient"
    | "limited"
    | "insufficient";

  /**
   * Deterministic own-SKU weighted baseline.
   *
   * null means no trusted baseline exists.
   */
  baselineDailyDemand: number | null;
}

export interface ColdStartForecastResult {
  algorithmVersion: "cold-start-v1";
  mode: ColdStartForecastMode;
  dailyDemand: number | null;
  dataSufficiency:
    | "sufficient"
    | "limited"
    | "insufficient";
  reasonCode: ColdStartReasonCode | null;
}

export interface ForecastConfidenceInput {
  dataSufficiency: ForecastDataSufficiency;

  /**
   * True only when a deterministic forecast baseline exists.
   */
  baselineAvailable: boolean;

  /**
   * Observation counts for the evaluated forecast period.
   */
  totalDays: number;
  censoredDays: number;
  promotionExcludedDays: number;
  unusableDays: number;
}

export type ForecastConfidenceReasonCode =
  | "INSUFFICIENT_HISTORY"
  | "BASELINE_UNAVAILABLE"
  | "LIMITED_HISTORY"
  | "HIGH_UNUSABLE_RATIO"
  | "HIGH_CENSORING_RATIO"
  | "HIGH_PROMOTION_RATIO"
  | "MODERATE_UNUSABLE_RATIO"
  | "MODERATE_CENSORING_RATIO"
  | "MODERATE_PROMOTION_RATIO";

export interface ForecastConfidenceResult {
  algorithmVersion: "forecast-confidence-v1";
  confidence: ConfidenceLevel;

  unusableRatio: number;
  censoredRatio: number;
  promotionExcludedRatio: number;

  reasonCodes: readonly ForecastConfidenceReasonCode[];
}

export interface ForecastHorizonInput {
  dailyDemand: number | null;
  leadTimeDays: number | null;
  reviewPeriodDays: number | null;
}

export type ForecastHorizonReasonCode =
  | "DAILY_DEMAND_UNAVAILABLE"
  | "LEAD_TIME_UNAVAILABLE"
  | "REVIEW_PERIOD_UNAVAILABLE";

export interface ForecastHorizonResult {
  algorithmVersion: "forecast-horizon-v1";

  dailyDemand: number | null;

  leadTimeDays: number | null;
  reviewPeriodDays: number | null;
  replenishmentHorizonDays: number | null;

  leadTimeDemandUnits: number | null;
  reviewPeriodDemandUnits: number | null;
  replenishmentDemandUnits: number | null;

  reasonCodes: readonly ForecastHorizonReasonCode[];
}

export interface ForecastBacktestPoint {
  actualDemand: number;
  predictedDemand: number;
}

export type ForecastBacktestReasonCode =
  | "NO_BACKTEST_POINTS"
  | "ZERO_TOTAL_ACTUAL_DEMAND";

export interface ForecastBacktestResult {
  algorithmVersion: "forecast-backtest-v1";

  observationCount: number;

  mae: number | null;
  wape: number | null;
  biasRatio: number | null;

  totalActualDemand: number;
  totalPredictedDemand: number;
  totalAbsoluteError: number;
  totalSignedError: number;

  reasonCodes: readonly ForecastBacktestReasonCode[];
}

export interface ForecastAlgorithmVersions {
  weightedDemand: "weighted-demand-v1";
  trendAdjustment: "trend-adjustment-v1";
  stockoutCensoring: "stockout-censoring-v1";
  promotionTreatment: "promotion-treatment-v1";
  coldStart: "cold-start-v1";
  confidence: "forecast-confidence-v1";
  horizon: "forecast-horizon-v1";
  backtest: "forecast-backtest-v1";
}

export interface ForecastReproducibilityDescriptor {
  algorithmVersions: ForecastAlgorithmVersions;
  inputStartDate: string;
  inputEndDate: string;
  configurationVersion: string;
}

export interface ForecastReproducibilityResult {
  fingerprint: string;
  descriptor: ForecastReproducibilityDescriptor;
}
