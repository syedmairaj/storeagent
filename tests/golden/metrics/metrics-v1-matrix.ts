import type {
  StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

export const metricsV1Goldens:
  readonly StoreAgentGoldenOutput<unknown>[] =
[
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/sales-velocity-normal-v1",
    "scenarioId": "metrics/sales-velocity-normal-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 6,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Returns and cancellations must reduce demand before velocity is calculated."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/sales-velocity-zero-demand-v1",
    "scenarioId": "metrics/sales-velocity-zero-demand-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 0,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Known zero demand must remain zero rather than becoming unknown."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/sales-velocity-no-eligible-days-v1",
    "scenarioId": "metrics/sales-velocity-no-eligible-days-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": null,
      "reasonCode": "NO_ELIGIBLE_DAYS"
    },
    "review": {
      "status": "approved",
      "rationale": "No eligible history must fail closed rather than fabricating demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/days-of-stock-normal-v1",
    "scenarioId": "metrics/days-of-stock-normal-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 10,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Inventory coverage must equal available inventory divided by trusted daily demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/days-of-stock-known-zero-inventory-v1",
    "scenarioId": "metrics/days-of-stock-known-zero-inventory-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 0,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Known zero inventory must produce zero coverage."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/days-of-stock-unknown-inventory-v1",
    "scenarioId": "metrics/days-of-stock-unknown-inventory-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": null,
      "reasonCode": "INVENTORY_UNKNOWN"
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown inventory must not be treated as zero inventory."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/days-of-stock-zero-demand-v1",
    "scenarioId": "metrics/days-of-stock-zero-demand-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": null,
      "reasonCode": "ZERO_DEMAND"
    },
    "review": {
      "status": "approved",
      "rationale": "Zero demand must not create an infinite persisted coverage value."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/safety-stock-round-up-v1",
    "scenarioId": "metrics/safety-stock-round-up-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 7,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Whole-unit safety stock must round upward."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/reorder-point-basic-v1",
    "scenarioId": "metrics/reorder-point-basic-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 27,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Reorder point must equal lead-time demand plus safety stock."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/target-stock-basic-v1",
    "scenarioId": "metrics/target-stock-basic-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 69,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Target stock must include lead time review period and safety stock."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/order-quantity-valid-incoming-v1",
    "scenarioId": "metrics/order-quantity-valid-incoming-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 55,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Trusted incoming inventory must reduce replenishment need."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/order-quantity-unknown-incoming-v1",
    "scenarioId": "metrics/order-quantity-unknown-incoming-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": null,
      "reasonCode": "INCOMING_STATE_UNKNOWN"
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown incoming inventory must never be silently converted to zero."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/order-quantity-known-zero-incoming-v1",
    "scenarioId": "metrics/order-quantity-known-zero-incoming-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 30,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Null incoming quantity may mean known zero only when incomingStateKnown is true."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/sell-through-normal-v1",
    "scenarioId": "metrics/sell-through-normal-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 0.4,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Sell-through must remain a decimal ratio."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/inventory-age-exact-v1",
    "scenarioId": "metrics/inventory-age-exact-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 45,
      "quality": "exact",
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Trusted receipt history must take precedence over estimates."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/inventory-age-estimated-v1",
    "scenarioId": "metrics/inventory-age-estimated-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": 60,
      "quality": "estimated",
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Estimated age must remain explicitly marked as estimated."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/inventory-age-unavailable-v1",
    "scenarioId": "metrics/inventory-age-unavailable-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": null,
      "quality": "unavailable",
      "reasonCode": "INVENTORY_AGE_UNKNOWN"
    },
    "review": {
      "status": "approved",
      "rationale": "Missing age evidence must not fabricate inventory age."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/demand-trend-positive-boundary-v1",
    "scenarioId": "metrics/demand-trend-positive-boundary-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "stable",
      "changeRatio": 0.1,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Exactly positive ten percent remains inside the stable band."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/demand-trend-negative-boundary-v1",
    "scenarioId": "metrics/demand-trend-negative-boundary-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "stable",
      "changeRatio": -0.1,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Exactly negative ten percent remains inside the stable band."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/demand-trend-emerging-from-zero-v1",
    "scenarioId": "metrics/demand-trend-emerging-from-zero-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "rising",
      "changeRatio": null,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Demand emerging from known zero must be rising without fabricating a relative ratio."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/stockout-risk-lead-time-boundary-v1",
    "scenarioId": "metrics/stockout-risk-lead-time-boundary-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "high",
      "coverageDays": 7,
      "replenishmentHorizonDays": 10,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Coverage equal to lead time must remain HIGH stockout risk."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/stockout-risk-horizon-boundary-v1",
    "scenarioId": "metrics/stockout-risk-horizon-boundary-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "medium",
      "coverageDays": 10,
      "replenishmentHorizonDays": 10,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Coverage equal to replenishment horizon must remain MEDIUM risk."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/stockout-risk-beyond-horizon-v1",
    "scenarioId": "metrics/stockout-risk-beyond-horizon-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "low",
      "coverageDays": 11,
      "replenishmentHorizonDays": 10,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Coverage beyond replenishment horizon must be LOW risk."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/overstock-risk-target-boundary-v1",
    "scenarioId": "metrics/overstock-risk-target-boundary-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "low",
      "inventoryPositionUnits": 100,
      "targetStockUnits": 100,
      "positionToTargetRatio": 1,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Inventory position equal to target remains LOW overstock risk."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/overstock-risk-high-boundary-v1",
    "scenarioId": "metrics/overstock-risk-high-boundary-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "medium",
      "inventoryPositionUnits": 150,
      "targetStockUnits": 100,
      "positionToTargetRatio": 1.5,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Inventory position exactly 1.5 times target remains MEDIUM risk."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/overstock-risk-above-high-boundary-v1",
    "scenarioId": "metrics/overstock-risk-above-high-boundary-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "high",
      "inventoryPositionUnits": 151,
      "targetStockUnits": 100,
      "positionToTargetRatio": 1.51,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Inventory position above 1.5 times target must become HIGH risk."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/overstock-zero-target-zero-position-v1",
    "scenarioId": "metrics/overstock-zero-target-zero-position-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "low",
      "inventoryPositionUnits": 0,
      "targetStockUnits": 0,
      "positionToTargetRatio": null,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Zero target with zero position must remain LOW without division by zero."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/overstock-zero-target-positive-position-v1",
    "scenarioId": "metrics/overstock-zero-target-positive-position-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "value": "high",
      "inventoryPositionUnits": 10,
      "targetStockUnits": 0,
      "positionToTargetRatio": null,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Positive inventory against zero target must be HIGH risk without division by zero."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/supplier-no-constraints-v1",
    "scenarioId": "metrics/supplier-no-constraints-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "requiredQuantity": 13,
      "constrainedQuantity": 13,
      "minimumOrderQuantity": null,
      "packSize": null,
      "minimumApplied": false,
      "packRoundingApplied": false
    },
    "review": {
      "status": "approved",
      "rationale": "No supplier constraints must preserve deterministic base need."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/supplier-moq-v1",
    "scenarioId": "metrics/supplier-moq-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "requiredQuantity": 5,
      "constrainedQuantity": 12,
      "minimumOrderQuantity": 12,
      "packSize": null,
      "minimumApplied": true,
      "packRoundingApplied": false
    },
    "review": {
      "status": "approved",
      "rationale": "Positive need below MOQ must increase to MOQ."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/supplier-pack-rounding-v1",
    "scenarioId": "metrics/supplier-pack-rounding-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "requiredQuantity": 25,
      "constrainedQuantity": 30,
      "minimumOrderQuantity": null,
      "packSize": 6,
      "minimumApplied": false,
      "packRoundingApplied": true
    },
    "review": {
      "status": "approved",
      "rationale": "Required quantity must round upward to a valid pack multiple."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/supplier-moq-pack-v1",
    "scenarioId": "metrics/supplier-moq-pack-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "requiredQuantity": 13,
      "constrainedQuantity": 18,
      "minimumOrderQuantity": 12,
      "packSize": 6,
      "minimumApplied": false,
      "packRoundingApplied": true
    },
    "review": {
      "status": "approved",
      "rationale": "MOQ is applied before pack-size rounding."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/supplier-zero-need-v1",
    "scenarioId": "metrics/supplier-zero-need-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "requiredQuantity": 0,
      "constrainedQuantity": 0,
      "minimumOrderQuantity": 12,
      "packSize": 6,
      "minimumApplied": false,
      "packRoundingApplied": false
    },
    "review": {
      "status": "approved",
      "rationale": "Supplier constraints must never create an order from zero base need."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-draft-v1",
    "scenarioId": "metrics/po-draft-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": 0,
      "incomingStateKnown": true,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Draft purchase orders must not suppress reorder need."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-submitted-v1",
    "scenarioId": "metrics/po-submitted-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": 100,
      "incomingStateKnown": true,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Submitted purchase orders count as trusted incoming inventory."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-partial-v1",
    "scenarioId": "metrics/po-partial-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": 60,
      "incomingStateKnown": true,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Partially received orders count only remaining quantity."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-partial-unknown-received-v1",
    "scenarioId": "metrics/po-partial-unknown-received-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": null,
      "incomingStateKnown": false,
      "reasonCode": "RECEIVED_QUANTITY_UNKNOWN"
    },
    "review": {
      "status": "approved",
      "rationale": "Missing partial receipt quantity must fail closed."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-received-v1",
    "scenarioId": "metrics/po-received-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": 0,
      "incomingStateKnown": true,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Fully received purchase orders are no longer incoming."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-cancelled-v1",
    "scenarioId": "metrics/po-cancelled-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": 0,
      "incomingStateKnown": true,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Cancelled purchase orders must not suppress reorder need."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-unknown-status-v1",
    "scenarioId": "metrics/po-unknown-status-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": null,
      "incomingStateKnown": false,
      "reasonCode": "PURCHASE_ORDER_STATUS_UNKNOWN"
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown PO status must not be treated as known zero incoming."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-over-received-v1",
    "scenarioId": "metrics/po-over-received-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": null,
      "incomingStateKnown": false,
      "reasonCode": "RECEIVED_EXCEEDS_ORDERED"
    },
    "review": {
      "status": "approved",
      "rationale": "Over-receipt must never produce negative incoming inventory."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-aggregate-valid-v1",
    "scenarioId": "metrics/po-aggregate-valid-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": 70,
      "incomingStateKnown": true,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "Trusted incoming PO lines must aggregate their valid remaining quantities."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-aggregate-ambiguous-v1",
    "scenarioId": "metrics/po-aggregate-ambiguous-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": null,
      "incomingStateKnown": false,
      "reasonCode": "PURCHASE_ORDER_STATUS_UNKNOWN"
    },
    "review": {
      "status": "approved",
      "rationale": "One ambiguous PO line makes aggregate incoming state unknown."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "metrics/po-aggregate-empty-v1",
    "scenarioId": "metrics/po-aggregate-empty-v1",
    "configurationVersion": "metrics-config-v1",
    "fixture": {
      "fixtureId": "metrics/metrics-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "validIncomingQuantity": 0,
      "incomingStateKnown": true,
      "reasonCode": null
    },
    "review": {
      "status": "approved",
      "rationale": "An empty trusted incoming set represents known zero incoming inventory."
    }
  }
];
