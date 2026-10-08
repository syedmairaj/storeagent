import type {
  StoreAgentEvaluationFixture,
} from "@/tests/evaluation/fixture";

export interface ForecastV1EvaluationInput {
  readonly operation: string;
  readonly input: unknown;
}

export interface ForecastV1EvaluationInputCase {
  readonly id: string;
  readonly evaluation:
    ForecastV1EvaluationInput;
}

export const forecastV1Fixture:
  StoreAgentEvaluationFixture<{
    cases:
      readonly ForecastV1EvaluationInputCase[];
  }> = {
  "fixtureSchemaVersion": 1,
  "id": "forecast/forecast-v1-matrix",
  "domain": "forecast",
  "fixtureVersion": 1,
  "description": "Deterministic forecast V1 evaluation inputs.",
  "input": {
    "cases": [
      {
        "id": "forecast/history-6-days-insufficient-v1",
        "evaluation": {
          "operation": "history_sufficiency",
          "input": {
            "usableDays": 6
          }
        }
      },
      {
        "id": "forecast/history-7-days-limited-v1",
        "evaluation": {
          "operation": "history_sufficiency",
          "input": {
            "usableDays": 7
          }
        }
      },
      {
        "id": "forecast/history-27-days-limited-v1",
        "evaluation": {
          "operation": "history_sufficiency",
          "input": {
            "usableDays": 27
          }
        }
      },
      {
        "id": "forecast/history-28-days-sufficient-v1",
        "evaluation": {
          "operation": "history_sufficiency",
          "input": {
            "usableDays": 28
          }
        }
      },
      {
        "id": "forecast/positive-sales-remain-usable-v1",
        "evaluation": {
          "operation": "stockout_observation",
          "input": {
            "date": "2026-10-01",
            "unitsSold": 5,
            "availability": "unavailable",
            "dataComplete": true
          }
        }
      },
      {
        "id": "forecast/stockout-zero-sales-censored-v1",
        "evaluation": {
          "operation": "stockout_observation",
          "input": {
            "date": "2026-10-02",
            "unitsSold": 0,
            "availability": "unavailable",
            "dataComplete": true
          }
        }
      },
      {
        "id": "forecast/available-zero-sales-known-zero-v1",
        "evaluation": {
          "operation": "stockout_observation",
          "input": {
            "date": "2026-10-03",
            "unitsSold": 0,
            "availability": "available",
            "dataComplete": true
          }
        }
      },
      {
        "id": "forecast/unknown-availability-not-zero-demand-v1",
        "evaluation": {
          "operation": "stockout_observation",
          "input": {
            "date": "2026-10-04",
            "unitsSold": 0,
            "availability": "unknown",
            "dataComplete": true
          }
        }
      },
      {
        "id": "forecast/normal-day-baseline-usable-v1",
        "evaluation": {
          "operation": "promotion_observation",
          "input": {
            "date": "2026-10-01",
            "unitsSold": 5,
            "promotionState": "none",
            "dataComplete": true
          }
        }
      },
      {
        "id": "forecast/promotion-excluded-v1",
        "evaluation": {
          "operation": "promotion_observation",
          "input": {
            "date": "2026-10-02",
            "unitsSold": 25,
            "promotionState": "promotion",
            "dataComplete": true
          }
        }
      },
      {
        "id": "forecast/promotion-state-unknown-v1",
        "evaluation": {
          "operation": "promotion_observation",
          "input": {
            "date": "2026-10-03",
            "unitsSold": 3,
            "promotionState": "unknown",
            "dataComplete": true
          }
        }
      },
      {
        "id": "forecast/weighted-demand-known-zero-v1",
        "evaluation": {
          "operation": "weighted_demand",
          "input": {
            "windows": [
              {
                "windowDays": 7,
                "dailyDemand": 0,
                "usableDays": 7
              },
              {
                "windowDays": 14,
                "dailyDemand": 0,
                "usableDays": 14
              }
            ]
          }
        }
      },
      {
        "id": "forecast/weighted-demand-insufficient-window-excluded-v1",
        "evaluation": {
          "operation": "weighted_demand",
          "input": {
            "windows": [
              {
                "windowDays": 7,
                "dailyDemand": 12,
                "usableDays": 3
              },
              {
                "windowDays": 14,
                "dailyDemand": 6,
                "usableDays": 14
              }
            ]
          }
        }
      },
      {
        "id": "forecast/weighted-demand-no-usable-window-v1",
        "evaluation": {
          "operation": "weighted_demand",
          "input": {
            "windows": [
              {
                "windowDays": 7,
                "dailyDemand": null,
                "usableDays": 7
              },
              {
                "windowDays": 14,
                "dailyDemand": 5,
                "usableDays": 3
              }
            ]
          }
        }
      },
      {
        "id": "forecast/trend-stable-v1",
        "evaluation": {
          "operation": "trend_adjustment",
          "input": {
            "baselineDailyDemand": 10,
            "recentDailyDemand": 10.5,
            "priorDailyDemand": 10
          }
        }
      },
      {
        "id": "forecast/trend-moderate-rise-v1",
        "evaluation": {
          "operation": "trend_adjustment",
          "input": {
            "baselineDailyDemand": 10,
            "recentDailyDemand": 11.5,
            "priorDailyDemand": 10
          }
        }
      },
      {
        "id": "forecast/trend-extreme-rise-capped-v1",
        "evaluation": {
          "operation": "trend_adjustment",
          "input": {
            "baselineDailyDemand": 10,
            "recentDailyDemand": 30,
            "priorDailyDemand": 10
          }
        }
      },
      {
        "id": "forecast/trend-extreme-fall-capped-v1",
        "evaluation": {
          "operation": "trend_adjustment",
          "input": {
            "baselineDailyDemand": 10,
            "recentDailyDemand": 1,
            "priorDailyDemand": 10
          }
        }
      },
      {
        "id": "forecast/trend-emerging-from-zero-v1",
        "evaluation": {
          "operation": "trend_adjustment",
          "input": {
            "baselineDailyDemand": 10,
            "recentDailyDemand": 3,
            "priorDailyDemand": 0
          }
        }
      },
      {
        "id": "forecast/cold-start-insufficient-v1",
        "evaluation": {
          "operation": "cold_start",
          "input": {
            "dataSufficiency": "insufficient",
            "baselineDailyDemand": 4
          }
        }
      },
      {
        "id": "forecast/cold-start-limited-v1",
        "evaluation": {
          "operation": "cold_start",
          "input": {
            "dataSufficiency": "limited",
            "baselineDailyDemand": 4
          }
        }
      },
      {
        "id": "forecast/cold-start-known-zero-v1",
        "evaluation": {
          "operation": "cold_start",
          "input": {
            "dataSufficiency": "limited",
            "baselineDailyDemand": 0
          }
        }
      },
      {
        "id": "forecast/cold-start-baseline-unavailable-v1",
        "evaluation": {
          "operation": "cold_start",
          "input": {
            "dataSufficiency": "sufficient",
            "baselineDailyDemand": null
          }
        }
      },
      {
        "id": "forecast/confidence-clean-sufficient-v1",
        "evaluation": {
          "operation": "confidence",
          "input": {
            "dataSufficiency": "sufficient",
            "baselineAvailable": true,
            "totalDays": 100,
            "censoredDays": 0,
            "promotionExcludedDays": 0,
            "unusableDays": 0
          }
        }
      },
      {
        "id": "forecast/confidence-limited-history-v1",
        "evaluation": {
          "operation": "confidence",
          "input": {
            "dataSufficiency": "limited",
            "baselineAvailable": true,
            "totalDays": 100,
            "censoredDays": 0,
            "promotionExcludedDays": 0,
            "unusableDays": 0
          }
        }
      },
      {
        "id": "forecast/confidence-baseline-unavailable-v1",
        "evaluation": {
          "operation": "confidence",
          "input": {
            "dataSufficiency": "sufficient",
            "baselineAvailable": false,
            "totalDays": 100,
            "censoredDays": 0,
            "promotionExcludedDays": 0,
            "unusableDays": 0
          }
        }
      },
      {
        "id": "forecast/confidence-unusable-moderate-boundary-v1",
        "evaluation": {
          "operation": "confidence",
          "input": {
            "dataSufficiency": "sufficient",
            "baselineAvailable": true,
            "totalDays": 100,
            "censoredDays": 0,
            "promotionExcludedDays": 0,
            "unusableDays": 10
          }
        }
      },
      {
        "id": "forecast/confidence-unusable-severe-boundary-v1",
        "evaluation": {
          "operation": "confidence",
          "input": {
            "dataSufficiency": "sufficient",
            "baselineAvailable": true,
            "totalDays": 100,
            "censoredDays": 0,
            "promotionExcludedDays": 0,
            "unusableDays": 25
          }
        }
      },
      {
        "id": "forecast/confidence-censoring-moderate-boundary-v1",
        "evaluation": {
          "operation": "confidence",
          "input": {
            "dataSufficiency": "sufficient",
            "baselineAvailable": true,
            "totalDays": 100,
            "censoredDays": 20,
            "promotionExcludedDays": 0,
            "unusableDays": 0
          }
        }
      },
      {
        "id": "forecast/confidence-censoring-severe-boundary-v1",
        "evaluation": {
          "operation": "confidence",
          "input": {
            "dataSufficiency": "sufficient",
            "baselineAvailable": true,
            "totalDays": 100,
            "censoredDays": 40,
            "promotionExcludedDays": 0,
            "unusableDays": 0
          }
        }
      },
      {
        "id": "forecast/confidence-promotion-severe-boundary-v1",
        "evaluation": {
          "operation": "confidence",
          "input": {
            "dataSufficiency": "sufficient",
            "baselineAvailable": true,
            "totalDays": 100,
            "censoredDays": 0,
            "promotionExcludedDays": 40,
            "unusableDays": 0
          }
        }
      },
      {
        "id": "forecast/horizons-normal-v1",
        "evaluation": {
          "operation": "horizons",
          "input": {
            "dailyDemand": 2.5,
            "leadTimeDays": 4,
            "reviewPeriodDays": 6
          }
        }
      },
      {
        "id": "forecast/horizons-known-zero-v1",
        "evaluation": {
          "operation": "horizons",
          "input": {
            "dailyDemand": 0,
            "leadTimeDays": 4,
            "reviewPeriodDays": 6
          }
        }
      },
      {
        "id": "forecast/horizons-unknown-demand-v1",
        "evaluation": {
          "operation": "horizons",
          "input": {
            "dailyDemand": null,
            "leadTimeDays": 4,
            "reviewPeriodDays": 6
          }
        }
      },
      {
        "id": "forecast/horizons-lead-time-unknown-independent-review-v1",
        "evaluation": {
          "operation": "horizons",
          "input": {
            "dailyDemand": 2,
            "leadTimeDays": null,
            "reviewPeriodDays": 5
          }
        }
      },
      {
        "id": "forecast/backtest-balanced-v1",
        "evaluation": {
          "operation": "backtest",
          "input": [
            {
              "actualDemand": 10,
              "predictedDemand": 12
            },
            {
              "actualDemand": 20,
              "predictedDemand": 18
            }
          ]
        }
      },
      {
        "id": "forecast/backtest-zero-actual-v1",
        "evaluation": {
          "operation": "backtest",
          "input": [
            {
              "actualDemand": 0,
              "predictedDemand": 2
            },
            {
              "actualDemand": 0,
              "predictedDemand": 0
            }
          ]
        }
      },
      {
        "id": "forecast/backtest-empty-v1",
        "evaluation": {
          "operation": "backtest",
          "input": []
        }
      }
    ]
  }
};
