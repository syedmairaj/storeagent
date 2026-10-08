import type {
  StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

export const decisionV1Goldens:
  readonly StoreAgentGoldenOutput<unknown>[] =
[
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reorder-critical-v1",
    "scenarioId": "decision/reorder-critical-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "REORDER",
      "actionType": "REORDER",
      "compatibleSecondaryActionTypes": [],
      "priority": "critical",
      "recommendedQuantity": 50,
      "confidence": "high",
      "reasonCodes": [
        "REORDER_QUANTITY_POSITIVE",
        "STOCKOUT_RISK_HIGH",
        "BELOW_REORDER_POINT"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "A trusted positive deterministic replenishment quantity produces REORDER and preserves that quantity."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reorder-known-zero-incoming-v1",
    "scenarioId": "decision/reorder-known-zero-incoming-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "REORDER",
      "actionType": "REORDER",
      "compatibleSecondaryActionTypes": [],
      "priority": "critical",
      "recommendedQuantity": 50,
      "confidence": "high",
      "reasonCodes": [
        "REORDER_QUANTITY_POSITIVE",
        "STOCKOUT_RISK_HIGH",
        "BELOW_REORDER_POINT"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Known-zero incoming inventory must remain trusted zero rather than unknown."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reduce-incoming-excess-v1",
    "scenarioId": "decision/reduce-incoming-excess-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "REDUCE",
      "actionType": "REDUCE",
      "compatibleSecondaryActionTypes": [],
      "priority": "high",
      "recommendedQuantity": null,
      "confidence": "high",
      "reasonCodes": [
        "ABOVE_TARGET_STOCK",
        "OVERSTOCK_RISK_HIGH"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Trusted incoming inventory that creates an overstock position produces REDUCE."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/promote-aged-excess-v1",
    "scenarioId": "decision/promote-aged-excess-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "PROMOTE",
      "actionType": "PROMOTE",
      "compatibleSecondaryActionTypes": [],
      "priority": "high",
      "recommendedQuantity": null,
      "confidence": "high",
      "reasonCodes": [
        "ABOVE_TARGET_STOCK",
        "OVERSTOCK_RISK_HIGH",
        "AGED_INVENTORY"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Existing aged excess inventory with no incoming supply can produce PROMOTE without incorrectly producing REDUCE."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/promote-known-zero-demand-v1",
    "scenarioId": "decision/promote-known-zero-demand-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "PROMOTE",
      "actionType": "PROMOTE",
      "compatibleSecondaryActionTypes": [],
      "priority": "high",
      "recommendedQuantity": null,
      "confidence": "high",
      "reasonCodes": [
        "ABOVE_TARGET_STOCK",
        "OVERSTOCK_RISK_HIGH",
        "ZERO_DEMAND"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Known zero demand remains commercial evidence rather than being mistaken for unknown demand."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reduce-primary-promote-secondary-v1",
    "scenarioId": "decision/reduce-primary-promote-secondary-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "REDUCE",
      "actionType": "REDUCE",
      "compatibleSecondaryActionTypes": [
        "PROMOTE"
      ],
      "priority": "high",
      "recommendedQuantity": null,
      "confidence": "high",
      "reasonCodes": [
        "ABOVE_TARGET_STOCK",
        "OVERSTOCK_RISK_HIGH"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "REDUCE and PROMOTE are compatible; REDUCE remains primary while PROMOTE is retained as secondary."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reorder-reduce-conflict-watch-v1",
    "scenarioId": "decision/reorder-reduce-conflict-watch-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "WATCH",
      "actionType": "WATCH",
      "compatibleSecondaryActionTypes": [],
      "priority": "high",
      "recommendedQuantity": null,
      "confidence": "low",
      "reasonCodes": [
        "CONFLICTING_SIGNALS"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Contradictory replenishment and reduction evidence must fail safely to WATCH rather than arbitrarily selecting an action."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reorder-promote-conflict-watch-v1",
    "scenarioId": "decision/reorder-promote-conflict-watch-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "WATCH",
      "actionType": "WATCH",
      "compatibleSecondaryActionTypes": [],
      "priority": "high",
      "recommendedQuantity": null,
      "confidence": "low",
      "reasonCodes": [
        "CONFLICTING_SIGNALS"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Contradictory replenishment and promotion evidence must fail safely to WATCH."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/healthy-no-intervention-v1",
    "scenarioId": "decision/healthy-no-intervention-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "HEALTHY",
      "actionType": null,
      "compatibleSecondaryActionTypes": [],
      "priority": null,
      "recommendedQuantity": null,
      "confidence": "high",
      "reasonCodes": [
        "HEALTHY_NO_INTERVENTION"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Trusted evidence with no supported intervention remains HEALTHY and does not force an action."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/watch-unknown-inventory-v1",
    "scenarioId": "decision/watch-unknown-inventory-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "WATCH",
      "actionType": "WATCH",
      "compatibleSecondaryActionTypes": [],
      "priority": "medium",
      "recommendedQuantity": null,
      "confidence": "low",
      "reasonCodes": [
        "MATERIAL_UNCERTAINTY",
        "INVENTORY_STATE_UNKNOWN"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown available inventory must produce WATCH rather than a fabricated commercial action."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/watch-unknown-incoming-v1",
    "scenarioId": "decision/watch-unknown-incoming-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "WATCH",
      "actionType": "WATCH",
      "compatibleSecondaryActionTypes": [],
      "priority": "medium",
      "recommendedQuantity": null,
      "confidence": "low",
      "reasonCodes": [
        "MATERIAL_UNCERTAINTY",
        "INCOMING_STATE_UNKNOWN"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown incoming state must produce WATCH rather than silently treating incoming inventory as zero."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/watch-forecast-unavailable-v1",
    "scenarioId": "decision/watch-forecast-unavailable-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "WATCH",
      "actionType": "WATCH",
      "compatibleSecondaryActionTypes": [],
      "priority": "medium",
      "recommendedQuantity": null,
      "confidence": "low",
      "reasonCodes": [
        "MATERIAL_UNCERTAINTY",
        "FORECAST_UNAVAILABLE"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Unavailable deterministic forecast must produce WATCH when no commercial intervention is otherwise supported."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/watch-low-forecast-confidence-v1",
    "scenarioId": "decision/watch-low-forecast-confidence-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "WATCH",
      "actionType": "WATCH",
      "compatibleSecondaryActionTypes": [],
      "priority": "medium",
      "recommendedQuantity": null,
      "confidence": "low",
      "reasonCodes": [
        "MATERIAL_UNCERTAINTY",
        "FORECAST_CONFIDENCE_LOW"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Low forecast confidence cannot be promoted into a trusted commercial intervention fallback."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/healthy-known-zero-demand-v1",
    "scenarioId": "decision/healthy-known-zero-demand-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "HEALTHY",
      "actionType": null,
      "compatibleSecondaryActionTypes": [],
      "priority": null,
      "recommendedQuantity": null,
      "confidence": "high",
      "reasonCodes": [
        "HEALTHY_NO_INTERVENTION"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Known zero demand is distinct from unknown demand and does not automatically force WATCH."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reorder-medium-forecast-confidence-v1",
    "scenarioId": "decision/reorder-medium-forecast-confidence-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "REORDER",
      "actionType": "REORDER",
      "compatibleSecondaryActionTypes": [],
      "priority": "critical",
      "recommendedQuantity": 50,
      "confidence": "medium",
      "reasonCodes": [
        "REORDER_QUANTITY_POSITIVE",
        "STOCKOUT_RISK_HIGH",
        "BELOW_REORDER_POINT"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Decision confidence must never exceed deterministic forecast confidence."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reorder-medium-data-quality-v1",
    "scenarioId": "decision/reorder-medium-data-quality-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "REORDER",
      "actionType": "REORDER",
      "compatibleSecondaryActionTypes": [],
      "priority": "critical",
      "recommendedQuantity": 50,
      "confidence": "medium",
      "reasonCodes": [
        "REORDER_QUANTITY_POSITIVE",
        "STOCKOUT_RISK_HIGH",
        "BELOW_REORDER_POINT",
        "DATA_QUALITY_MEDIUM"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Medium data quality caps otherwise-high decision confidence at medium."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/reorder-low-data-quality-v1",
    "scenarioId": "decision/reorder-low-data-quality-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "algorithmVersion": "inventory-decision-v1",
      "healthState": "REORDER",
      "actionType": "REORDER",
      "compatibleSecondaryActionTypes": [],
      "priority": "critical",
      "recommendedQuantity": 50,
      "confidence": "low",
      "reasonCodes": [
        "REORDER_QUANTITY_POSITIVE",
        "STOCKOUT_RISK_HIGH",
        "BELOW_REORDER_POINT",
        "DATA_QUALITY_LOW"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Low data quality forces low decision confidence without changing deterministic action type."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/evidence-snapshot-canonical-v1",
    "scenarioId": "decision/evidence-snapshot-canonical-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "availableQuantity": 20,
      "incomingQuantity": 10,
      "demandVelocity": 5,
      "daysOfStock": 4,
      "leadTimeDays": 7,
      "safetyStockUnits": 10,
      "reorderPointUnits": 45,
      "targetStockUnits": 70,
      "inventoryAgeDays": 30,
      "forecastExpectedDemandUnits": 35,
      "dataQualityScore": 95,
      "reasonCodes": [
        "REORDER_QUANTITY_POSITIVE",
        "STOCKOUT_RISK_HIGH"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Persisted action evidence must copy decision-time deterministic truth without recalculating it."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "decision/evidence-unknown-incoming-v1",
    "scenarioId": "decision/evidence-unknown-incoming-v1",
    "configurationVersion": "decision-config-v1",
    "fixture": {
      "fixtureId": "decision/decision-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "availableQuantity": 50,
      "incomingQuantity": null,
      "demandVelocity": 4,
      "daysOfStock": 12.5,
      "leadTimeDays": 7,
      "safetyStockUnits": 10,
      "reorderPointUnits": 38,
      "targetStockUnits": 70,
      "inventoryAgeDays": 20,
      "forecastExpectedDemandUnits": 28,
      "dataQualityScore": 100,
      "reasonCodes": [
        "INCOMING_STATE_UNKNOWN"
      ]
    },
    "review": {
      "status": "approved",
      "rationale": "Evidence snapshot must preserve unknown incoming state as null rather than fabricating zero."
    }
  }
];
