import type {
  StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

export const forecastV1Goldens:
  readonly StoreAgentGoldenOutput<unknown>[] =
[
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/history-6-days-insufficient-v1",
    "scenarioId": "forecast/history-6-days-insufficient-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "dataSufficiency": "insufficient",
      "usableDays": 6
    },
    "review": {
      "status": "approved",
      "rationale": "Six usable days must not publish sufficient or limited history."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/history-7-days-limited-v1",
    "scenarioId": "forecast/history-7-days-limited-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "dataSufficiency": "limited",
      "usableDays": 7
    },
    "review": {
      "status": "approved",
      "rationale": "Seven usable days is the exact V1 limited-history boundary."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/history-27-days-limited-v1",
    "scenarioId": "forecast/history-27-days-limited-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "dataSufficiency": "limited",
      "usableDays": 27
    },
    "review": {
      "status": "approved",
      "rationale": "Twenty-seven usable days remains limited history."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/history-28-days-sufficient-v1",
    "scenarioId": "forecast/history-28-days-sufficient-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "dataSufficiency": "sufficient",
      "usableDays": 28
    },
    "review": {
      "status": "approved",
      "rationale": "Twenty-eight usable days is the exact sufficient-history boundary."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/positive-sales-remain-usable-v1",
    "scenarioId": "forecast/positive-sales-remain-usable-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "date": "2026-10-01",
      "unitsSold": 5,
      "disposition": "usable",
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Observed positive sales prove demand even when inventory is later recorded unavailable."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/stockout-zero-sales-censored-v1",
    "scenarioId": "forecast/stockout-zero-sales-censored-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "date": "2026-10-02",
      "unitsSold": 0,
      "disposition": "stockout_censored",
      "reasonCode": "STOCKOUT_CENSORED"
    },
    "review": {
      "status": "approved",
      "rationale": "Zero sales during known stockout must not become zero demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/available-zero-sales-known-zero-v1",
    "scenarioId": "forecast/available-zero-sales-known-zero-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "date": "2026-10-03",
      "unitsSold": 0,
      "disposition": "usable",
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Zero sales with known available inventory remains usable known-zero demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/unknown-availability-not-zero-demand-v1",
    "scenarioId": "forecast/unknown-availability-not-zero-demand-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "date": "2026-10-04",
      "unitsSold": 0,
      "disposition": "unusable",
      "reasonCode": "AVAILABILITY_UNKNOWN"
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown availability must fail closed instead of becoming zero demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/normal-day-baseline-usable-v1",
    "scenarioId": "forecast/normal-day-baseline-usable-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "date": "2026-10-01",
      "unitsSold": 5,
      "disposition": "baseline_usable",
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Normal observations participate in baseline forecasting."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/promotion-excluded-v1",
    "scenarioId": "forecast/promotion-excluded-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "date": "2026-10-02",
      "unitsSold": 25,
      "disposition": "promotion_excluded",
      "reasonCode": "PROMOTION_EXCLUDED"
    },
    "review": {
      "status": "approved",
      "rationale": "Promotion demand must not contaminate ordinary baseline demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/promotion-state-unknown-v1",
    "scenarioId": "forecast/promotion-state-unknown-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "date": "2026-10-03",
      "unitsSold": 3,
      "disposition": "unusable",
      "reasonCode": "PROMOTION_STATE_UNKNOWN"
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown promotion state must not silently become normal demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/weighted-demand-known-zero-v1",
    "scenarioId": "forecast/weighted-demand-known-zero-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "weighted-demand-v1",
      "dailyDemand": 0,
      "activeWindows": [
        {
          "windowDays": 7,
          "dailyDemand": 0,
          "usableDays": 7,
          "configuredWeight": 0.4,
          "normalizedWeight": 0.5714285714285715
        },
        {
          "windowDays": 14,
          "dailyDemand": 0,
          "usableDays": 14,
          "configuredWeight": 0.3,
          "normalizedWeight": 0.4285714285714286
        }
      ],
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Known-zero forecast-window demand must remain numeric zero."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/weighted-demand-insufficient-window-excluded-v1",
    "scenarioId": "forecast/weighted-demand-insufficient-window-excluded-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "weighted-demand-v1",
      "dailyDemand": 6,
      "activeWindows": [
        {
          "windowDays": 14,
          "dailyDemand": 6,
          "usableDays": 14,
          "configuredWeight": 0.3,
          "normalizedWeight": 1
        }
      ],
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Forecast windows below their minimum usable-day threshold must not participate."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/weighted-demand-no-usable-window-v1",
    "scenarioId": "forecast/weighted-demand-no-usable-window-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "weighted-demand-v1",
      "dailyDemand": null,
      "activeWindows": [],
      "reasonCode": "NO_USABLE_FORECAST_WINDOWS"
    },
    "review": {
      "status": "approved",
      "rationale": "No usable forecast window must produce unavailable demand instead of fabrication."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/trend-stable-v1",
    "scenarioId": "forecast/trend-stable-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "trend-adjustment-v1",
      "baselineDailyDemand": 10,
      "adjustedDailyDemand": 10,
      "rawTrendRatio": 0.05,
      "appliedAdjustmentRatio": 0,
      "capped": false
    },
    "review": {
      "status": "approved",
      "rationale": "Movement inside the stable band must not alter baseline forecast demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/trend-moderate-rise-v1",
    "scenarioId": "forecast/trend-moderate-rise-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "trend-adjustment-v1",
      "baselineDailyDemand": 10,
      "adjustedDailyDemand": 11.5,
      "rawTrendRatio": 0.15,
      "appliedAdjustmentRatio": 0.15,
      "capped": false
    },
    "review": {
      "status": "approved",
      "rationale": "Moderate positive trend may adjust baseline without being capped."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/trend-extreme-rise-capped-v1",
    "scenarioId": "forecast/trend-extreme-rise-capped-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "trend-adjustment-v1",
      "baselineDailyDemand": 10,
      "adjustedDailyDemand": 12,
      "rawTrendRatio": 2,
      "appliedAdjustmentRatio": 0.2,
      "capped": true
    },
    "review": {
      "status": "approved",
      "rationale": "Extreme positive trend must not increase baseline by more than twenty percent."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/trend-extreme-fall-capped-v1",
    "scenarioId": "forecast/trend-extreme-fall-capped-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "trend-adjustment-v1",
      "baselineDailyDemand": 10,
      "adjustedDailyDemand": 8,
      "rawTrendRatio": -0.9,
      "appliedAdjustmentRatio": -0.2,
      "capped": true
    },
    "review": {
      "status": "approved",
      "rationale": "Extreme negative trend must not reduce baseline by more than twenty percent."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/trend-emerging-from-zero-v1",
    "scenarioId": "forecast/trend-emerging-from-zero-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "trend-adjustment-v1",
      "baselineDailyDemand": 10,
      "adjustedDailyDemand": 12,
      "rawTrendRatio": null,
      "appliedAdjustmentRatio": 0.2,
      "capped": true
    },
    "review": {
      "status": "approved",
      "rationale": "Demand emerging from zero must use the bounded upward adjustment rather than infinite growth."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/cold-start-insufficient-v1",
    "scenarioId": "forecast/cold-start-insufficient-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "cold-start-v1",
      "mode": "unavailable",
      "dailyDemand": null,
      "dataSufficiency": "insufficient",
      "reasonCode": "INSUFFICIENT_HISTORY"
    },
    "review": {
      "status": "approved",
      "rationale": "Insufficient history must suppress numeric forecast publication."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/cold-start-limited-v1",
    "scenarioId": "forecast/cold-start-limited-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "cold-start-v1",
      "mode": "limited_history",
      "dailyDemand": 4,
      "dataSufficiency": "limited",
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Limited history may expose only the own-SKU baseline as limited history."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/cold-start-known-zero-v1",
    "scenarioId": "forecast/cold-start-known-zero-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "cold-start-v1",
      "mode": "limited_history",
      "dailyDemand": 0,
      "dataSufficiency": "limited",
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Known zero own-SKU demand must remain zero when history permits forecasting."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/cold-start-baseline-unavailable-v1",
    "scenarioId": "forecast/cold-start-baseline-unavailable-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "cold-start-v1",
      "mode": "unavailable",
      "dailyDemand": null,
      "dataSufficiency": "sufficient",
      "reasonCode": "BASELINE_UNAVAILABLE"
    },
    "review": {
      "status": "approved",
      "rationale": "Sufficient history without a valid baseline must not fabricate forecast demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/confidence-clean-sufficient-v1",
    "scenarioId": "forecast/confidence-clean-sufficient-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-confidence-v1",
      "confidence": "high",
      "unusableRatio": 0,
      "censoredRatio": 0,
      "promotionExcludedRatio": 0,
      "reasonCodes": []
    },
    "review": {
      "status": "approved",
      "rationale": "Clean sufficient history must begin at high confidence."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/confidence-limited-history-v1",
    "scenarioId": "forecast/confidence-limited-history-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-confidence-v1",
      "confidence": "medium",
      "unusableRatio": 0,
      "censoredRatio": 0,
      "promotionExcludedRatio": 0,
      "reasonCodes": [
        "LIMITED_HISTORY"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Limited history must not receive high confidence."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/confidence-baseline-unavailable-v1",
    "scenarioId": "forecast/confidence-baseline-unavailable-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-confidence-v1",
      "confidence": "low",
      "unusableRatio": 0,
      "censoredRatio": 0,
      "promotionExcludedRatio": 0,
      "reasonCodes": [
        "BASELINE_UNAVAILABLE"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Unavailable deterministic baseline must force low confidence."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/confidence-unusable-moderate-boundary-v1",
    "scenarioId": "forecast/confidence-unusable-moderate-boundary-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-confidence-v1",
      "confidence": "medium",
      "unusableRatio": 0.1,
      "censoredRatio": 0,
      "promotionExcludedRatio": 0,
      "reasonCodes": [
        "MODERATE_UNUSABLE_RATIO"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Exactly ten percent unusable observations must degrade confidence one level."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/confidence-unusable-severe-boundary-v1",
    "scenarioId": "forecast/confidence-unusable-severe-boundary-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-confidence-v1",
      "confidence": "low",
      "unusableRatio": 0.25,
      "censoredRatio": 0,
      "promotionExcludedRatio": 0,
      "reasonCodes": [
        "HIGH_UNUSABLE_RATIO"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Exactly twenty-five percent unusable observations must force low confidence."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/confidence-censoring-moderate-boundary-v1",
    "scenarioId": "forecast/confidence-censoring-moderate-boundary-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-confidence-v1",
      "confidence": "medium",
      "unusableRatio": 0,
      "censoredRatio": 0.2,
      "promotionExcludedRatio": 0,
      "reasonCodes": [
        "MODERATE_CENSORING_RATIO"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Exactly twenty percent censored history must degrade confidence one level."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/confidence-censoring-severe-boundary-v1",
    "scenarioId": "forecast/confidence-censoring-severe-boundary-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-confidence-v1",
      "confidence": "low",
      "unusableRatio": 0,
      "censoredRatio": 0.4,
      "promotionExcludedRatio": 0,
      "reasonCodes": [
        "HIGH_CENSORING_RATIO"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Exactly forty percent censored history must force low confidence."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/confidence-promotion-severe-boundary-v1",
    "scenarioId": "forecast/confidence-promotion-severe-boundary-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-confidence-v1",
      "confidence": "low",
      "unusableRatio": 0,
      "censoredRatio": 0,
      "promotionExcludedRatio": 0.4,
      "reasonCodes": [
        "HIGH_PROMOTION_RATIO"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Exactly forty percent promotion exclusion must force low confidence."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/horizons-normal-v1",
    "scenarioId": "forecast/horizons-normal-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-horizon-v1",
      "dailyDemand": 2.5,
      "leadTimeDays": 4,
      "reviewPeriodDays": 6,
      "replenishmentHorizonDays": 10,
      "leadTimeDemandUnits": 10,
      "reviewPeriodDemandUnits": 15,
      "replenishmentDemandUnits": 25,
      "reasonCodes": []
    },
    "review": {
      "status": "approved",
      "rationale": "Forecast horizons must preserve fractional expected demand without inventory rounding."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/horizons-known-zero-v1",
    "scenarioId": "forecast/horizons-known-zero-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-horizon-v1",
      "dailyDemand": 0,
      "leadTimeDays": 4,
      "reviewPeriodDays": 6,
      "replenishmentHorizonDays": 10,
      "leadTimeDemandUnits": 0,
      "reviewPeriodDemandUnits": 0,
      "replenishmentDemandUnits": 0,
      "reasonCodes": []
    },
    "review": {
      "status": "approved",
      "rationale": "Known-zero demand must remain zero through all forecast horizons."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/horizons-unknown-demand-v1",
    "scenarioId": "forecast/horizons-unknown-demand-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-horizon-v1",
      "dailyDemand": null,
      "leadTimeDays": 4,
      "reviewPeriodDays": 6,
      "replenishmentHorizonDays": 10,
      "leadTimeDemandUnits": null,
      "reviewPeriodDemandUnits": null,
      "replenishmentDemandUnits": null,
      "reasonCodes": [
        "DAILY_DEMAND_UNAVAILABLE"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown demand must not become zero while the known time horizon remains explicit."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/horizons-lead-time-unknown-independent-review-v1",
    "scenarioId": "forecast/horizons-lead-time-unknown-independent-review-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-horizon-v1",
      "dailyDemand": 2,
      "leadTimeDays": null,
      "reviewPeriodDays": 5,
      "replenishmentHorizonDays": null,
      "leadTimeDemandUnits": null,
      "reviewPeriodDemandUnits": 10,
      "replenishmentDemandUnits": null,
      "reasonCodes": [
        "LEAD_TIME_UNAVAILABLE"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown lead time must not erase independently calculable review-period demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/backtest-balanced-v1",
    "scenarioId": "forecast/backtest-balanced-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-backtest-v1",
      "observationCount": 2,
      "mae": 2,
      "wape": 0.13333333333333333,
      "biasRatio": 0,
      "totalActualDemand": 30,
      "totalPredictedDemand": 30,
      "totalAbsoluteError": 4,
      "totalSignedError": 0,
      "reasonCodes": []
    },
    "review": {
      "status": "approved",
      "rationale": "Backtesting must expose absolute error and directional bias independently."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/backtest-zero-actual-v1",
    "scenarioId": "forecast/backtest-zero-actual-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-backtest-v1",
      "observationCount": 2,
      "mae": 1,
      "wape": null,
      "biasRatio": null,
      "totalActualDemand": 0,
      "totalPredictedDemand": 2,
      "totalAbsoluteError": 2,
      "totalSignedError": 2,
      "reasonCodes": [
        "ZERO_TOTAL_ACTUAL_DEMAND"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Zero total actual demand must not create invalid WAPE or normalized bias."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "forecast/backtest-empty-v1",
    "scenarioId": "forecast/backtest-empty-v1",
    "configurationVersion": "forecast-config-v1",
    "fixture": {
      "fixtureId": "forecast/forecast-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "forecast-backtest-v1",
      "observationCount": 0,
      "mae": null,
      "wape": null,
      "biasRatio": null,
      "totalActualDemand": 0,
      "totalPredictedDemand": 0,
      "totalAbsoluteError": 0,
      "totalSignedError": 0,
      "reasonCodes": [
        "NO_BACKTEST_POINTS"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "No historical comparison points must produce unavailable accuracy rather than invented accuracy."
    }
  }
];
