import type {
  InventoryDecisionInput,
} from "@/lib/decision-engine/types";

export function healthyDecisionInput(
  overrides:
    Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 50,

    validIncomingQuantity: 0,
    incomingStateKnown: true,

    demandVelocity: 4,
    daysOfStock: 12.5,

    leadTimeDays: 7,

    safetyStockUnits: 10,
    reorderPointUnits: 38,
    targetStockUnits: 70,

    recommendedOrderQuantity: 0,

    inventoryAgeDays: 20,

    demandTrend: "stable",

    stockoutRisk: "low",
    overstockRisk: "low",

    forecastExpectedDemandUnits: 28,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}

export function reorderDecisionInput(
  overrides:
    Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 10,

    validIncomingQuantity: 0,
    incomingStateKnown: true,

    demandVelocity: 5,
    daysOfStock: 2,

    leadTimeDays: 7,

    safetyStockUnits: 5,
    reorderPointUnits: 40,
    targetStockUnits: 60,

    recommendedOrderQuantity: 50,

    inventoryAgeDays: 10,

    demandTrend: "stable",

    stockoutRisk: "high",
    overstockRisk: "low",

    forecastExpectedDemandUnits: 35,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}

export function reduceDecisionInput(
  overrides:
    Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 80,

    validIncomingQuantity: 40,
    incomingStateKnown: true,

    demandVelocity: 3,
    daysOfStock: 40,

    leadTimeDays: 7,

    safetyStockUnits: 10,
    reorderPointUnits: 31,
    targetStockUnits: 70,

    recommendedOrderQuantity: 0,

    inventoryAgeDays: 20,

    demandTrend: "stable",

    stockoutRisk: "low",
    overstockRisk: "high",

    forecastExpectedDemandUnits: 30,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}

export function promoteDecisionInput(
  overrides:
    Partial<InventoryDecisionInput> = {},
): InventoryDecisionInput {
  return {
    availableQuantity: 120,

    validIncomingQuantity: 0,
    incomingStateKnown: true,

    demandVelocity: 2,
    daysOfStock: 60,

    leadTimeDays: 7,

    safetyStockUnits: 10,
    reorderPointUnits: 24,
    targetStockUnits: 70,

    recommendedOrderQuantity: 0,

    inventoryAgeDays: 120,

    demandTrend: "stable",

    stockoutRisk: "low",
    overstockRisk: "high",

    forecastExpectedDemandUnits: 20,
    forecastConfidence: "high",

    dataQualityScore: 100,

    ...overrides,
  };
}
