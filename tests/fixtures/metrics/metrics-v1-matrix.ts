import type {
  StoreAgentEvaluationFixture,
} from "@/tests/evaluation/fixture";

export interface MetricsV1EvaluationInput {
  readonly operation: string;
  readonly input: unknown;
}

export interface MetricsV1EvaluationInputCase {
  readonly id: string;
  readonly evaluation:
    MetricsV1EvaluationInput;
}

export const metricsV1Fixture:
  StoreAgentEvaluationFixture<{
    cases:
      readonly MetricsV1EvaluationInputCase[];
  }> = {
  "fixtureSchemaVersion": 1,
  "id": "metrics/metrics-v1-matrix",
  "domain": "metrics",
  "fixtureVersion": 1,
  "description": "Deterministic metrics V1 evaluation inputs.",
  "input": {
    "cases": [
      {
        "id": "metrics/sales-velocity-normal-v1",
        "evaluation": {
          "operation": "sales_velocity",
          "input": {
            "soldUnits": 100,
            "cancelledUnits": 10,
            "returnedUnits": 6,
            "eligibleDays": 14
          }
        }
      },
      {
        "id": "metrics/sales-velocity-zero-demand-v1",
        "evaluation": {
          "operation": "sales_velocity",
          "input": {
            "soldUnits": 0,
            "cancelledUnits": 0,
            "returnedUnits": 0,
            "eligibleDays": 30
          }
        }
      },
      {
        "id": "metrics/sales-velocity-no-eligible-days-v1",
        "evaluation": {
          "operation": "sales_velocity",
          "input": {
            "soldUnits": 20,
            "cancelledUnits": 0,
            "returnedUnits": 0,
            "eligibleDays": 0
          }
        }
      },
      {
        "id": "metrics/days-of-stock-normal-v1",
        "evaluation": {
          "operation": "days_of_stock",
          "input": {
            "availableQuantity": 30,
            "dailyDemand": 3
          }
        }
      },
      {
        "id": "metrics/days-of-stock-known-zero-inventory-v1",
        "evaluation": {
          "operation": "days_of_stock",
          "input": {
            "availableQuantity": 0,
            "dailyDemand": 3
          }
        }
      },
      {
        "id": "metrics/days-of-stock-unknown-inventory-v1",
        "evaluation": {
          "operation": "days_of_stock",
          "input": {
            "availableQuantity": null,
            "dailyDemand": 3
          }
        }
      },
      {
        "id": "metrics/days-of-stock-zero-demand-v1",
        "evaluation": {
          "operation": "days_of_stock",
          "input": {
            "availableQuantity": 100,
            "dailyDemand": 0
          }
        }
      },
      {
        "id": "metrics/safety-stock-round-up-v1",
        "evaluation": {
          "operation": "safety_stock",
          "input": {
            "dailyDemand": 2.25,
            "safetyStockDays": 3
          }
        }
      },
      {
        "id": "metrics/reorder-point-basic-v1",
        "evaluation": {
          "operation": "reorder_point",
          "input": {
            "dailyDemand": 3,
            "leadTimeDays": 7,
            "safetyStockUnits": 6
          }
        }
      },
      {
        "id": "metrics/target-stock-basic-v1",
        "evaluation": {
          "operation": "target_stock",
          "input": {
            "dailyDemand": 3,
            "leadTimeDays": 7,
            "reviewPeriodDays": 14,
            "safetyStockUnits": 6
          }
        }
      },
      {
        "id": "metrics/order-quantity-valid-incoming-v1",
        "evaluation": {
          "operation": "recommended_order_quantity",
          "input": {
            "targetStockUnits": 100,
            "availableQuantity": 25,
            "validIncomingQuantity": 20,
            "incomingStateKnown": true
          }
        }
      },
      {
        "id": "metrics/order-quantity-unknown-incoming-v1",
        "evaluation": {
          "operation": "recommended_order_quantity",
          "input": {
            "targetStockUnits": 50,
            "availableQuantity": 20,
            "validIncomingQuantity": null,
            "incomingStateKnown": false
          }
        }
      },
      {
        "id": "metrics/order-quantity-known-zero-incoming-v1",
        "evaluation": {
          "operation": "recommended_order_quantity",
          "input": {
            "targetStockUnits": 50,
            "availableQuantity": 20,
            "validIncomingQuantity": null,
            "incomingStateKnown": true
          }
        }
      },
      {
        "id": "metrics/sell-through-normal-v1",
        "evaluation": {
          "operation": "sell_through",
          "input": {
            "unitsSold": 40,
            "unitsAvailableForSale": 100
          }
        }
      },
      {
        "id": "metrics/inventory-age-exact-v1",
        "evaluation": {
          "operation": "inventory_age",
          "input": {
            "exactAgeDays": 45,
            "estimatedAgeDays": 60
          }
        }
      },
      {
        "id": "metrics/inventory-age-estimated-v1",
        "evaluation": {
          "operation": "inventory_age",
          "input": {
            "exactAgeDays": null,
            "estimatedAgeDays": 60
          }
        }
      },
      {
        "id": "metrics/inventory-age-unavailable-v1",
        "evaluation": {
          "operation": "inventory_age",
          "input": {
            "exactAgeDays": null,
            "estimatedAgeDays": null
          }
        }
      },
      {
        "id": "metrics/demand-trend-positive-boundary-v1",
        "evaluation": {
          "operation": "demand_trend",
          "input": {
            "recentDailyDemand": 11,
            "priorDailyDemand": 10
          }
        }
      },
      {
        "id": "metrics/demand-trend-negative-boundary-v1",
        "evaluation": {
          "operation": "demand_trend",
          "input": {
            "recentDailyDemand": 9,
            "priorDailyDemand": 10
          }
        }
      },
      {
        "id": "metrics/demand-trend-emerging-from-zero-v1",
        "evaluation": {
          "operation": "demand_trend",
          "input": {
            "recentDailyDemand": 2,
            "priorDailyDemand": 0
          }
        }
      },
      {
        "id": "metrics/stockout-risk-lead-time-boundary-v1",
        "evaluation": {
          "operation": "stockout_risk",
          "input": {
            "daysOfStock": 7,
            "leadTimeDays": 7,
            "safetyStockDays": 3
          }
        }
      },
      {
        "id": "metrics/stockout-risk-horizon-boundary-v1",
        "evaluation": {
          "operation": "stockout_risk",
          "input": {
            "daysOfStock": 10,
            "leadTimeDays": 7,
            "safetyStockDays": 3
          }
        }
      },
      {
        "id": "metrics/stockout-risk-beyond-horizon-v1",
        "evaluation": {
          "operation": "stockout_risk",
          "input": {
            "daysOfStock": 11,
            "leadTimeDays": 7,
            "safetyStockDays": 3
          }
        }
      },
      {
        "id": "metrics/overstock-risk-target-boundary-v1",
        "evaluation": {
          "operation": "overstock_risk",
          "input": {
            "availableQuantity": 90,
            "validIncomingQuantity": 10,
            "incomingStateKnown": true,
            "targetStockUnits": 100
          }
        }
      },
      {
        "id": "metrics/overstock-risk-high-boundary-v1",
        "evaluation": {
          "operation": "overstock_risk",
          "input": {
            "availableQuantity": 150,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "targetStockUnits": 100
          }
        }
      },
      {
        "id": "metrics/overstock-risk-above-high-boundary-v1",
        "evaluation": {
          "operation": "overstock_risk",
          "input": {
            "availableQuantity": 151,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "targetStockUnits": 100
          }
        }
      },
      {
        "id": "metrics/overstock-zero-target-zero-position-v1",
        "evaluation": {
          "operation": "overstock_risk",
          "input": {
            "availableQuantity": 0,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "targetStockUnits": 0
          }
        }
      },
      {
        "id": "metrics/overstock-zero-target-positive-position-v1",
        "evaluation": {
          "operation": "overstock_risk",
          "input": {
            "availableQuantity": 10,
            "validIncomingQuantity": 0,
            "incomingStateKnown": true,
            "targetStockUnits": 0
          }
        }
      },
      {
        "id": "metrics/supplier-no-constraints-v1",
        "evaluation": {
          "operation": "supplier_constraints",
          "input": {
            "requiredQuantity": 13,
            "minimumOrderQuantity": null,
            "packSize": null
          }
        }
      },
      {
        "id": "metrics/supplier-moq-v1",
        "evaluation": {
          "operation": "supplier_constraints",
          "input": {
            "requiredQuantity": 5,
            "minimumOrderQuantity": 12,
            "packSize": null
          }
        }
      },
      {
        "id": "metrics/supplier-pack-rounding-v1",
        "evaluation": {
          "operation": "supplier_constraints",
          "input": {
            "requiredQuantity": 25,
            "minimumOrderQuantity": null,
            "packSize": 6
          }
        }
      },
      {
        "id": "metrics/supplier-moq-pack-v1",
        "evaluation": {
          "operation": "supplier_constraints",
          "input": {
            "requiredQuantity": 13,
            "minimumOrderQuantity": 12,
            "packSize": 6
          }
        }
      },
      {
        "id": "metrics/supplier-zero-need-v1",
        "evaluation": {
          "operation": "supplier_constraints",
          "input": {
            "requiredQuantity": 0,
            "minimumOrderQuantity": 12,
            "packSize": 6
          }
        }
      },
      {
        "id": "metrics/po-draft-v1",
        "evaluation": {
          "operation": "incoming_po_line",
          "input": {
            "status": "draft",
            "orderedQuantity": 100,
            "receivedQuantity": null
          }
        }
      },
      {
        "id": "metrics/po-submitted-v1",
        "evaluation": {
          "operation": "incoming_po_line",
          "input": {
            "status": "submitted",
            "orderedQuantity": 100,
            "receivedQuantity": null
          }
        }
      },
      {
        "id": "metrics/po-partial-v1",
        "evaluation": {
          "operation": "incoming_po_line",
          "input": {
            "status": "partially_received",
            "orderedQuantity": 100,
            "receivedQuantity": 40
          }
        }
      },
      {
        "id": "metrics/po-partial-unknown-received-v1",
        "evaluation": {
          "operation": "incoming_po_line",
          "input": {
            "status": "partially_received",
            "orderedQuantity": 100,
            "receivedQuantity": null
          }
        }
      },
      {
        "id": "metrics/po-received-v1",
        "evaluation": {
          "operation": "incoming_po_line",
          "input": {
            "status": "received",
            "orderedQuantity": 100,
            "receivedQuantity": 100
          }
        }
      },
      {
        "id": "metrics/po-cancelled-v1",
        "evaluation": {
          "operation": "incoming_po_line",
          "input": {
            "status": "cancelled",
            "orderedQuantity": 100,
            "receivedQuantity": null
          }
        }
      },
      {
        "id": "metrics/po-unknown-status-v1",
        "evaluation": {
          "operation": "incoming_po_line",
          "input": {
            "status": "unknown",
            "orderedQuantity": 100,
            "receivedQuantity": null
          }
        }
      },
      {
        "id": "metrics/po-over-received-v1",
        "evaluation": {
          "operation": "incoming_po_line",
          "input": {
            "status": "partially_received",
            "orderedQuantity": 100,
            "receivedQuantity": 110
          }
        }
      },
      {
        "id": "metrics/po-aggregate-valid-v1",
        "evaluation": {
          "operation": "incoming_po_aggregate",
          "input": [
            {
              "status": "confirmed",
              "orderedQuantity": 40,
              "receivedQuantity": null
            },
            {
              "status": "partially_received",
              "orderedQuantity": 50,
              "receivedQuantity": 20
            },
            {
              "status": "cancelled",
              "orderedQuantity": 100,
              "receivedQuantity": null
            }
          ]
        }
      },
      {
        "id": "metrics/po-aggregate-ambiguous-v1",
        "evaluation": {
          "operation": "incoming_po_aggregate",
          "input": [
            {
              "status": "confirmed",
              "orderedQuantity": 40,
              "receivedQuantity": null
            },
            {
              "status": "unknown",
              "orderedQuantity": 30,
              "receivedQuantity": null
            }
          ]
        }
      },
      {
        "id": "metrics/po-aggregate-empty-v1",
        "evaluation": {
          "operation": "incoming_po_aggregate",
          "input": []
        }
      }
    ]
  }
};
