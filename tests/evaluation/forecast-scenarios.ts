import type {
  StoreAgentEvaluationRisk,
  StoreAgentEvaluationScenario,
} from "@/tests/evaluation/types";

import {
  forecastV1Fixture,
  type ForecastV1EvaluationInput,
} from "@/tests/fixtures/forecast/forecast-v1-matrix";

import {
  forecastV1Goldens,
} from "@/tests/golden/forecast/forecast-v1-matrix";

const metadata:
  Readonly<
    Record<
      string,
      {
        title: string;
        risk:
          StoreAgentEvaluationRisk;
        protects:
          readonly string[];
      }
    >
  > =
{
  "forecast/history-6-days-insufficient-v1": {
    "title": "History 6 Days Insufficient",
    "risk": "critical",
    "protects": [
      "Six usable days must not publish sufficient or limited history."
    ]
  },
  "forecast/history-7-days-limited-v1": {
    "title": "History 7 Days Limited",
    "risk": "critical",
    "protects": [
      "Seven usable days is the exact V1 limited-history boundary."
    ]
  },
  "forecast/history-27-days-limited-v1": {
    "title": "History 27 Days Limited",
    "risk": "critical",
    "protects": [
      "Twenty-seven usable days remains limited history."
    ]
  },
  "forecast/history-28-days-sufficient-v1": {
    "title": "History 28 Days Sufficient",
    "risk": "critical",
    "protects": [
      "Twenty-eight usable days is the exact sufficient-history boundary."
    ]
  },
  "forecast/positive-sales-remain-usable-v1": {
    "title": "Positive Sales Remain Usable",
    "risk": "high",
    "protects": [
      "Observed positive sales prove demand even when inventory is later recorded unavailable."
    ]
  },
  "forecast/stockout-zero-sales-censored-v1": {
    "title": "Stockout Zero Sales Censored",
    "risk": "critical",
    "protects": [
      "Zero sales during known stockout must not become zero demand."
    ]
  },
  "forecast/available-zero-sales-known-zero-v1": {
    "title": "Available Zero Sales Known Zero",
    "risk": "critical",
    "protects": [
      "Zero sales with known available inventory remains usable known-zero demand."
    ]
  },
  "forecast/unknown-availability-not-zero-demand-v1": {
    "title": "Unknown Availability Not Zero Demand",
    "risk": "critical",
    "protects": [
      "Unknown availability must fail closed instead of becoming zero demand."
    ]
  },
  "forecast/normal-day-baseline-usable-v1": {
    "title": "Normal Day Baseline Usable",
    "risk": "high",
    "protects": [
      "Normal observations participate in baseline forecasting."
    ]
  },
  "forecast/promotion-excluded-v1": {
    "title": "Promotion Excluded",
    "risk": "critical",
    "protects": [
      "Promotion demand must not contaminate ordinary baseline demand."
    ]
  },
  "forecast/promotion-state-unknown-v1": {
    "title": "Promotion State Unknown",
    "risk": "critical",
    "protects": [
      "Unknown promotion state must not silently become normal demand."
    ]
  },
  "forecast/weighted-demand-known-zero-v1": {
    "title": "Weighted Demand Known Zero",
    "risk": "critical",
    "protects": [
      "Known-zero forecast-window demand must remain numeric zero."
    ]
  },
  "forecast/weighted-demand-insufficient-window-excluded-v1": {
    "title": "Weighted Demand Insufficient Window Excluded",
    "risk": "critical",
    "protects": [
      "Forecast windows below their minimum usable-day threshold must not participate."
    ]
  },
  "forecast/weighted-demand-no-usable-window-v1": {
    "title": "Weighted Demand No Usable Window",
    "risk": "critical",
    "protects": [
      "No usable forecast window must produce unavailable demand instead of fabrication."
    ]
  },
  "forecast/trend-stable-v1": {
    "title": "Trend Stable",
    "risk": "high",
    "protects": [
      "Movement inside the stable band must not alter baseline forecast demand."
    ]
  },
  "forecast/trend-moderate-rise-v1": {
    "title": "Trend Moderate Rise",
    "risk": "high",
    "protects": [
      "Moderate positive trend may adjust baseline without being capped."
    ]
  },
  "forecast/trend-extreme-rise-capped-v1": {
    "title": "Trend Extreme Rise Capped",
    "risk": "critical",
    "protects": [
      "Extreme positive trend must not increase baseline by more than twenty percent."
    ]
  },
  "forecast/trend-extreme-fall-capped-v1": {
    "title": "Trend Extreme Fall Capped",
    "risk": "critical",
    "protects": [
      "Extreme negative trend must not reduce baseline by more than twenty percent."
    ]
  },
  "forecast/trend-emerging-from-zero-v1": {
    "title": "Trend Emerging From Zero",
    "risk": "critical",
    "protects": [
      "Demand emerging from zero must use the bounded upward adjustment rather than infinite growth."
    ]
  },
  "forecast/cold-start-insufficient-v1": {
    "title": "Cold Start Insufficient",
    "risk": "critical",
    "protects": [
      "Insufficient history must suppress numeric forecast publication."
    ]
  },
  "forecast/cold-start-limited-v1": {
    "title": "Cold Start Limited",
    "risk": "high",
    "protects": [
      "Limited history may expose only the own-SKU baseline as limited history."
    ]
  },
  "forecast/cold-start-known-zero-v1": {
    "title": "Cold Start Known Zero",
    "risk": "critical",
    "protects": [
      "Known zero own-SKU demand must remain zero when history permits forecasting."
    ]
  },
  "forecast/cold-start-baseline-unavailable-v1": {
    "title": "Cold Start Baseline Unavailable",
    "risk": "critical",
    "protects": [
      "Sufficient history without a valid baseline must not fabricate forecast demand."
    ]
  },
  "forecast/confidence-clean-sufficient-v1": {
    "title": "Confidence Clean Sufficient",
    "risk": "high",
    "protects": [
      "Clean sufficient history must begin at high confidence."
    ]
  },
  "forecast/confidence-limited-history-v1": {
    "title": "Confidence Limited History",
    "risk": "high",
    "protects": [
      "Limited history must not receive high confidence."
    ]
  },
  "forecast/confidence-baseline-unavailable-v1": {
    "title": "Confidence Baseline Unavailable",
    "risk": "critical",
    "protects": [
      "Unavailable deterministic baseline must force low confidence."
    ]
  },
  "forecast/confidence-unusable-moderate-boundary-v1": {
    "title": "Confidence Unusable Moderate Boundary",
    "risk": "critical",
    "protects": [
      "Exactly ten percent unusable observations must degrade confidence one level."
    ]
  },
  "forecast/confidence-unusable-severe-boundary-v1": {
    "title": "Confidence Unusable Severe Boundary",
    "risk": "critical",
    "protects": [
      "Exactly twenty-five percent unusable observations must force low confidence."
    ]
  },
  "forecast/confidence-censoring-moderate-boundary-v1": {
    "title": "Confidence Censoring Moderate Boundary",
    "risk": "critical",
    "protects": [
      "Exactly twenty percent censored history must degrade confidence one level."
    ]
  },
  "forecast/confidence-censoring-severe-boundary-v1": {
    "title": "Confidence Censoring Severe Boundary",
    "risk": "critical",
    "protects": [
      "Exactly forty percent censored history must force low confidence."
    ]
  },
  "forecast/confidence-promotion-severe-boundary-v1": {
    "title": "Confidence Promotion Severe Boundary",
    "risk": "critical",
    "protects": [
      "Exactly forty percent promotion exclusion must force low confidence."
    ]
  },
  "forecast/horizons-normal-v1": {
    "title": "Horizons Normal",
    "risk": "high",
    "protects": [
      "Forecast horizons must preserve fractional expected demand without inventory rounding."
    ]
  },
  "forecast/horizons-known-zero-v1": {
    "title": "Horizons Known Zero",
    "risk": "critical",
    "protects": [
      "Known-zero demand must remain zero through all forecast horizons."
    ]
  },
  "forecast/horizons-unknown-demand-v1": {
    "title": "Horizons Unknown Demand",
    "risk": "critical",
    "protects": [
      "Unknown demand must not become zero while the known time horizon remains explicit."
    ]
  },
  "forecast/horizons-lead-time-unknown-independent-review-v1": {
    "title": "Horizons Lead Time Unknown Independent Review",
    "risk": "critical",
    "protects": [
      "Unknown lead time must not erase independently calculable review-period demand."
    ]
  },
  "forecast/backtest-balanced-v1": {
    "title": "Backtest Balanced",
    "risk": "high",
    "protects": [
      "Backtesting must expose absolute error and directional bias independently."
    ]
  },
  "forecast/backtest-zero-actual-v1": {
    "title": "Backtest Zero Actual",
    "risk": "high",
    "protects": [
      "Zero total actual demand must not create invalid WAPE or normalized bias."
    ]
  },
  "forecast/backtest-empty-v1": {
    "title": "Backtest Empty",
    "risk": "medium",
    "protects": [
      "No historical comparison points must produce unavailable accuracy rather than invented accuracy."
    ]
  }
};

const goldenByScenarioId =
  new Map(
    forecastV1Goldens.map(
      (golden) => [
        golden.scenarioId,
        golden,
      ],
    ),
  );

export const FORECAST_V1_SCENARIOS:
  readonly StoreAgentEvaluationScenario<
    ForecastV1EvaluationInput,
    unknown
  >[] =
  forecastV1Fixture.input.cases.map(
    (fixtureCase) => {
      const scenarioMetadata =
        metadata[
          fixtureCase.id
        ];

      if (!scenarioMetadata) {
        throw new Error(
          `Missing evaluation metadata for "${fixtureCase.id}".`,
        );
      }

      const golden =
        goldenByScenarioId.get(
          fixtureCase.id,
        );

      if (!golden) {
        throw new Error(
          `Missing approved golden for "${fixtureCase.id}".`,
        );
      }

      return {
        schemaVersion: 1,

        id:
          fixtureCase.id,

        title:
          scenarioMetadata.title,

        domain:
          "forecast",

        risk:
          scenarioMetadata.risk,

        configurationVersion:
          golden.configurationVersion,

        input:
          fixtureCase.evaluation,

        expected:
          golden.expected,

        protects:
          scenarioMetadata.protects,
      };
    },
  );
