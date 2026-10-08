import type {
  StoreAgentEvaluationFixture,
} from "@/tests/evaluation/fixture";

export interface DecisionV1EvaluationInput {
  readonly operation: string;
  readonly input: unknown;
}

export interface DecisionV1EvaluationInputCase {
  readonly id: string;
  readonly evaluation:
    DecisionV1EvaluationInput;
}

export const decisionV1Fixture:
  StoreAgentEvaluationFixture<{
    cases:
      readonly DecisionV1EvaluationInputCase[];
  }> = {
  "fixtureSchemaVersion": 1,
  "id": "decision/decision-v1-matrix",
  "domain": "decision",
  "fixtureVersion": 1,
  "description": "Deterministic decision V1 evaluation inputs.",
  "input": {
    "cases": [
      {
        "id": "decision/reorder-critical-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 10,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 5,
            "daysOfStock": 2,
            "leadTimeDays": 7,
            "safetyStockUnits": 5,
            "reorderPointUnits": 40,
            "targetStockUnits": 60,
            "recommendedOrderQuantity": 50,
            "inventoryAgeDays": 10,
            "demandTrend": "stable",
            "stockoutRisk": "high",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 35,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/reorder-known-zero-incoming-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 10,
            "validIncomingQuantity": null,
            "incomingStateKnown": true,
            "demandVelocity": 5,
            "daysOfStock": 2,
            "leadTimeDays": 7,
            "safetyStockUnits": 5,
            "reorderPointUnits": 40,
            "targetStockUnits": 60,
            "recommendedOrderQuantity": 50,
            "inventoryAgeDays": 10,
            "demandTrend": "stable",
            "stockoutRisk": "high",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 35,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/reduce-incoming-excess-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 80,
            "validIncomingQuantity": 40,
            "incomingStateKnown": true,
            "demandVelocity": 3,
            "daysOfStock": 40,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 31,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 20,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "high",
            "forecastExpectedDemandUnits": 30,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/promote-aged-excess-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 120,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 2,
            "daysOfStock": 60,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 24,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 120,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "high",
            "forecastExpectedDemandUnits": 20,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/promote-known-zero-demand-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 120,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 0,
            "daysOfStock": 60,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 24,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 30,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "high",
            "forecastExpectedDemandUnits": 20,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/reduce-primary-promote-secondary-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 120,
            "validIncomingQuantity": 40,
            "incomingStateKnown": true,
            "demandVelocity": 2,
            "daysOfStock": 60,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 24,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 120,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "high",
            "forecastExpectedDemandUnits": 20,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/reorder-reduce-conflict-watch-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 80,
            "validIncomingQuantity": 40,
            "incomingStateKnown": true,
            "demandVelocity": 3,
            "daysOfStock": 2,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 31,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 20,
            "inventoryAgeDays": 20,
            "demandTrend": "stable",
            "stockoutRisk": "high",
            "overstockRisk": "high",
            "forecastExpectedDemandUnits": 30,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/reorder-promote-conflict-watch-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 120,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 2,
            "daysOfStock": 2,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 24,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 20,
            "inventoryAgeDays": 120,
            "demandTrend": "stable",
            "stockoutRisk": "high",
            "overstockRisk": "high",
            "forecastExpectedDemandUnits": 20,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/healthy-no-intervention-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 50,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 4,
            "daysOfStock": 12.5,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 38,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 20,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 28,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/watch-unknown-inventory-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": null,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 4,
            "daysOfStock": 12.5,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 38,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 20,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 28,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/watch-unknown-incoming-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 50,
            "validIncomingQuantity": null,
            "incomingStateKnown": false,
            "demandVelocity": 4,
            "daysOfStock": 12.5,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 38,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 20,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 28,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/watch-forecast-unavailable-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 50,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 4,
            "daysOfStock": 12.5,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 38,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 20,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": null,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/watch-low-forecast-confidence-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 50,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 4,
            "daysOfStock": 12.5,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 38,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 20,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 28,
            "forecastConfidence": "low",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/healthy-known-zero-demand-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 50,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 0,
            "daysOfStock": 12.5,
            "leadTimeDays": 7,
            "safetyStockUnits": 10,
            "reorderPointUnits": 38,
            "targetStockUnits": 70,
            "recommendedOrderQuantity": 0,
            "inventoryAgeDays": 20,
            "demandTrend": "stable",
            "stockoutRisk": "low",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 0,
            "forecastConfidence": "high",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/reorder-medium-forecast-confidence-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 10,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 5,
            "daysOfStock": 2,
            "leadTimeDays": 7,
            "safetyStockUnits": 5,
            "reorderPointUnits": 40,
            "targetStockUnits": 60,
            "recommendedOrderQuantity": 50,
            "inventoryAgeDays": 10,
            "demandTrend": "stable",
            "stockoutRisk": "high",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 35,
            "forecastConfidence": "medium",
            "dataQualityScore": 100
          }
        }
      },
      {
        "id": "decision/reorder-medium-data-quality-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 10,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 5,
            "daysOfStock": 2,
            "leadTimeDays": 7,
            "safetyStockUnits": 5,
            "reorderPointUnits": 40,
            "targetStockUnits": 60,
            "recommendedOrderQuantity": 50,
            "inventoryAgeDays": 10,
            "demandTrend": "stable",
            "stockoutRisk": "high",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 35,
            "forecastConfidence": "high",
            "dataQualityScore": 70
          }
        }
      },
      {
        "id": "decision/reorder-low-data-quality-v1",
        "evaluation": {
          "operation": "decide",
          "input": {
            "availableQuantity": 10,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "demandVelocity": 5,
            "daysOfStock": 2,
            "leadTimeDays": 7,
            "safetyStockUnits": 5,
            "reorderPointUnits": 40,
            "targetStockUnits": 60,
            "recommendedOrderQuantity": 50,
            "inventoryAgeDays": 10,
            "demandTrend": "stable",
            "stockoutRisk": "high",
            "overstockRisk": "low",
            "forecastExpectedDemandUnits": 35,
            "forecastConfidence": "high",
            "dataQualityScore": 59
          }
        }
      },
      {
        "id": "decision/evidence-snapshot-canonical-v1",
        "evaluation": {
          "operation": "evidence",
          "input": {
            "decisionInput": {
              "availableQuantity": 20,
              "validIncomingQuantity": 10,
              "incomingStateKnown": true,
              "demandVelocity": 5,
              "daysOfStock": 4,
              "leadTimeDays": 7,
              "safetyStockUnits": 10,
              "reorderPointUnits": 45,
              "targetStockUnits": 70,
              "recommendedOrderQuantity": 50,
              "inventoryAgeDays": 30,
              "demandTrend": "stable",
              "stockoutRisk": "high",
              "overstockRisk": "low",
              "forecastExpectedDemandUnits": 35,
              "forecastConfidence": "high",
              "dataQualityScore": 95
            },
            "reasonCodes": [
              "REORDER_QUANTITY_POSITIVE",
              "STOCKOUT_RISK_HIGH"
            ]
          }
        }
      },
      {
        "id": "decision/evidence-unknown-incoming-v1",
        "evaluation": {
          "operation": "evidence",
          "input": {
            "decisionInput": {
              "availableQuantity": 50,
              "validIncomingQuantity": null,
              "incomingStateKnown": false,
              "demandVelocity": 4,
              "daysOfStock": 12.5,
              "leadTimeDays": 7,
              "safetyStockUnits": 10,
              "reorderPointUnits": 38,
              "targetStockUnits": 70,
              "recommendedOrderQuantity": 0,
              "inventoryAgeDays": 20,
              "demandTrend": "stable",
              "stockoutRisk": "low",
              "overstockRisk": "low",
              "forecastExpectedDemandUnits": 28,
              "forecastConfidence": "high",
              "dataQualityScore": 100
            },
            "reasonCodes": [
              "INCOMING_STATE_UNKNOWN"
            ]
          }
        }
      }
    ]
  }
};
