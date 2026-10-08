import {
  classifyHistorySufficiency,
} from "@/lib/forecasting/history-sufficiency";

import {
  classifyDemandObservation,
  summarizeDemandSeriesQuality,
} from "@/lib/forecasting/stockout-censoring";

import {
  classifyPromotionObservation,
  summarizePromotionSeriesQuality,
} from "@/lib/forecasting/promotion-treatment";

import {
  calculateWeightedDemandForecast,
} from "@/lib/forecasting/weighted-demand";

import {
  applyTrendAdjustment,
} from "@/lib/forecasting/trend-adjustment";

import {
  resolveColdStartForecast,
} from "@/lib/forecasting/cold-start";

import {
  calculateForecastConfidence,
} from "@/lib/forecasting/confidence";

import {
  calculateForecastHorizons,
} from "@/lib/forecasting/horizons";

import {
  calculateForecastBacktest,
} from "@/lib/forecasting/backtesting";

import type {
  ColdStartForecastInput,
  DailyDemandObservationInput,
  ForecastBacktestPoint,
  ForecastConfidenceInput,
  ForecastHorizonInput,
  HistorySufficiencyInput,
  PromotionObservationInput,
  TrendAdjustmentInput,
  WeightedDemandForecastInput,
} from "@/lib/forecasting/types";

export type ForecastEvaluationCase =
  | {
      operation:
        "history_sufficiency";
      input:
        HistorySufficiencyInput;
      expected:
        ReturnType<
          typeof classifyHistorySufficiency
        >;
    }
  | {
      operation:
        "stockout_observation";
      input:
        DailyDemandObservationInput;
      expected:
        ReturnType<
          typeof classifyDemandObservation
        >;
    }
  | {
      operation:
        "stockout_summary";
      input:
        readonly DailyDemandObservationInput[];
      expected:
        ReturnType<
          typeof summarizeDemandSeriesQuality
        >;
    }
  | {
      operation:
        "promotion_observation";
      input:
        PromotionObservationInput;
      expected:
        ReturnType<
          typeof classifyPromotionObservation
        >;
    }
  | {
      operation:
        "promotion_summary";
      input:
        readonly PromotionObservationInput[];
      expected:
        ReturnType<
          typeof summarizePromotionSeriesQuality
        >;
    }
  | {
      operation:
        "weighted_demand";
      input:
        WeightedDemandForecastInput;
      expected:
        ReturnType<
          typeof calculateWeightedDemandForecast
        >;
    }
  | {
      operation:
        "trend_adjustment";
      input:
        TrendAdjustmentInput;
      expected:
        ReturnType<
          typeof applyTrendAdjustment
        >;
    }
  | {
      operation:
        "cold_start";
      input:
        ColdStartForecastInput;
      expected:
        ReturnType<
          typeof resolveColdStartForecast
        >;
    }
  | {
      operation:
        "confidence";
      input:
        ForecastConfidenceInput;
      expected:
        ReturnType<
          typeof calculateForecastConfidence
        >;
    }
  | {
      operation:
        "horizons";
      input:
        ForecastHorizonInput;
      expected:
        ReturnType<
          typeof calculateForecastHorizons
        >;
    }
  | {
      operation:
        "backtest";
      input:
        readonly ForecastBacktestPoint[];
      expected:
        ReturnType<
          typeof calculateForecastBacktest
        >;
    };

export function runForecastEvaluationCase(
  evaluationCase:
    ForecastEvaluationCase,
): ForecastEvaluationCase["expected"] {
  switch (evaluationCase.operation) {
    case "history_sufficiency":
      return classifyHistorySufficiency(
        evaluationCase.input,
      );

    case "stockout_observation":
      return classifyDemandObservation(
        evaluationCase.input,
      );

    case "stockout_summary":
      return summarizeDemandSeriesQuality(
        evaluationCase.input,
      );

    case "promotion_observation":
      return classifyPromotionObservation(
        evaluationCase.input,
      );

    case "promotion_summary":
      return summarizePromotionSeriesQuality(
        evaluationCase.input,
      );

    case "weighted_demand":
      return calculateWeightedDemandForecast(
        evaluationCase.input,
      );

    case "trend_adjustment":
      return applyTrendAdjustment(
        evaluationCase.input,
      );

    case "cold_start":
      return resolveColdStartForecast(
        evaluationCase.input,
      );

    case "confidence":
      return calculateForecastConfidence(
        evaluationCase.input,
      );

    case "horizons":
      return calculateForecastHorizons(
        evaluationCase.input,
      );

    case "backtest":
      return calculateForecastBacktest(
        evaluationCase.input,
      );
  }
}
