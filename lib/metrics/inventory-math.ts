import type {
  DaysOfStockInput,
  MetricResult,
  SafetyStockInput,
  SalesVelocityInput,
} from "./types";

function assertNonNegativeInteger(
  value: number,
  field: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
}

function assertNonNegativeFiniteNumber(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number.`);
  }
}

/**
 * sales-velocity-v1
 *
 * net demand =
 * sold - cancelled - configured returned units
 *
 * velocity =
 * max(0, net demand) / eligible days
 */
export function calculateSalesVelocity(
  input: SalesVelocityInput,
): MetricResult<number> {
  assertNonNegativeInteger(input.soldUnits, "soldUnits");
  assertNonNegativeInteger(input.cancelledUnits, "cancelledUnits");
  assertNonNegativeInteger(input.returnedUnits, "returnedUnits");

  if (!Number.isInteger(input.eligibleDays) || input.eligibleDays < 0) {
    throw new Error(
      "eligibleDays must be a non-negative integer.",
    );
  }

  if (input.eligibleDays === 0) {
    return {
      value: null,
      reasonCode: "NO_ELIGIBLE_DAYS",
    };
  }

  const netDemand = Math.max(
    0,
    input.soldUnits -
      input.cancelledUnits -
      input.returnedUnits,
  );

  return {
    value: netDemand / input.eligibleDays,
    reasonCode: null,
  };
}

/**
 * days-of-stock-v1
 *
 * daysOfStock =
 * available quantity / daily demand
 *
 * Infinity is intentionally not returned for zero demand.
 */
export function calculateDaysOfStock(
  input: DaysOfStockInput,
): MetricResult<number> {
  if (input.availableQuantity === null) {
    return {
      value: null,
      reasonCode: "INVENTORY_UNKNOWN",
    };
  }

  assertNonNegativeInteger(
    input.availableQuantity,
    "availableQuantity",
  );

  if (input.dailyDemand === null) {
    return {
      value: null,
      reasonCode: "DEMAND_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.dailyDemand,
    "dailyDemand",
  );

  if (input.dailyDemand === 0) {
    return {
      value: null,
      reasonCode: "ZERO_DEMAND",
    };
  }

  return {
    value: input.availableQuantity / input.dailyDemand,
    reasonCode: null,
  };
}

/**
 * safety-stock-v1
 *
 * safety stock =
 * daily demand * configured safety-stock days
 *
 * Result is rounded upward because V1 inventory is whole-unit.
 */
export function calculateSafetyStock(
  input: SafetyStockInput,
): MetricResult<number> {
  if (input.dailyDemand === null) {
    return {
      value: null,
      reasonCode: "DEMAND_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.dailyDemand,
    "dailyDemand",
  );

  if (input.safetyStockDays === null) {
    return {
      value: null,
      reasonCode: "SAFETY_STOCK_DAYS_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.safetyStockDays,
    "safetyStockDays",
  );

  return {
    value: Math.ceil(
      input.dailyDemand * input.safetyStockDays,
    ),
    reasonCode: null,
  };
}

/**
 * reorder-point-v1
 *
 * reorder point =
 * expected lead-time demand + safety stock
 *
 * expected lead-time demand =
 * daily demand * lead-time days
 */
export function calculateReorderPoint(
  input: import("./types").ReorderPointInput,
): MetricResult<number> {
  if (input.dailyDemand === null) {
    return {
      value: null,
      reasonCode: "DEMAND_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.dailyDemand,
    "dailyDemand",
  );

  if (input.leadTimeDays === null) {
    return {
      value: null,
      reasonCode: "LEAD_TIME_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.leadTimeDays,
    "leadTimeDays",
  );

  if (input.safetyStockUnits === null) {
    return {
      value: null,
      reasonCode: "SAFETY_STOCK_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.safetyStockUnits,
    "safetyStockUnits",
  );

  return {
    value: Math.ceil(
      input.dailyDemand * input.leadTimeDays +
        input.safetyStockUnits,
    ),
    reasonCode: null,
  };
}

/**
 * target-stock-v1
 *
 * target stock =
 * daily demand *
 * (lead-time days + review-period days)
 * + safety stock
 */
export function calculateTargetStock(
  input: import("./types").TargetStockInput,
): MetricResult<number> {
  if (input.dailyDemand === null) {
    return {
      value: null,
      reasonCode: "DEMAND_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.dailyDemand,
    "dailyDemand",
  );

  if (input.leadTimeDays === null) {
    return {
      value: null,
      reasonCode: "LEAD_TIME_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.leadTimeDays,
    "leadTimeDays",
  );

  if (input.reviewPeriodDays === null) {
    return {
      value: null,
      reasonCode: "REVIEW_PERIOD_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.reviewPeriodDays,
    "reviewPeriodDays",
  );

  if (input.safetyStockUnits === null) {
    return {
      value: null,
      reasonCode: "SAFETY_STOCK_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.safetyStockUnits,
    "safetyStockUnits",
  );

  return {
    value: Math.ceil(
      input.dailyDemand *
        (input.leadTimeDays + input.reviewPeriodDays) +
        input.safetyStockUnits,
    ),
    reasonCode: null,
  };
}

/**
 * order-quantity-v1
 *
 * raw need =
 * target stock
 * - available
 * - valid incoming
 *
 * result =
 * max(0, raw need)
 */
export function calculateRecommendedOrderQuantity(
  input: import("./types").RecommendedOrderQuantityInput,
): MetricResult<number> {
  if (input.targetStockUnits === null) {
    return {
      value: null,
      reasonCode: "TARGET_STOCK_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.targetStockUnits,
    "targetStockUnits",
  );

  if (input.availableQuantity === null) {
    return {
      value: null,
      reasonCode: "INVENTORY_UNKNOWN",
    };
  }

  assertNonNegativeInteger(
    input.availableQuantity,
    "availableQuantity",
  );

  let incomingQuantity: number;

  if (input.validIncomingQuantity === null) {
    if (!input.incomingStateKnown) {
      return {
        value: null,
        reasonCode: "INCOMING_STATE_UNKNOWN",
      };
    }

    incomingQuantity = 0;
  } else {
    assertNonNegativeInteger(
      input.validIncomingQuantity,
      "validIncomingQuantity",
    );

    incomingQuantity = input.validIncomingQuantity;
  }

  const rawNeed =
    input.targetStockUnits -
    input.availableQuantity -
    incomingQuantity;

  return {
    value: Math.max(0, Math.ceil(rawNeed)),
    reasonCode: null,
  };
}

/**
 * sell-through-v1
 *
 * sell through =
 * units sold / units available for sale
 *
 * The denominator must represent the same measurement window.
 */
export function calculateSellThrough(
  input: import("./types").SellThroughInput,
): MetricResult<number> {
  assertNonNegativeInteger(
    input.unitsSold,
    "unitsSold",
  );

  assertNonNegativeInteger(
    input.unitsAvailableForSale,
    "unitsAvailableForSale",
  );

  if (input.unitsAvailableForSale === 0) {
    return {
      value: null,
      reasonCode: "SELL_THROUGH_DENOMINATOR_ZERO",
    };
  }

  if (input.unitsSold > input.unitsAvailableForSale) {
    throw new Error(
      "unitsSold cannot exceed unitsAvailableForSale.",
    );
  }

  return {
    value:
      input.unitsSold /
      input.unitsAvailableForSale,
    reasonCode: null,
  };
}

/**
 * inventory-age-v1
 *
 * Prefer trusted receipt-history age.
 * Fall back to documented estimated age.
 *
 * Never present an estimate as exact.
 */
export function calculateInventoryAge(
  input: import("./types").InventoryAgeInput,
): import("./types").InventoryAgeResult {
  if (input.exactAgeDays !== null) {
    assertNonNegativeInteger(
      input.exactAgeDays,
      "exactAgeDays",
    );

    return {
      value: input.exactAgeDays,
      quality: "exact",
      reasonCode: null,
    };
  }

  if (input.estimatedAgeDays !== null) {
    assertNonNegativeInteger(
      input.estimatedAgeDays,
      "estimatedAgeDays",
    );

    return {
      value: input.estimatedAgeDays,
      quality: "estimated",
      reasonCode: null,
    };
  }

  return {
    value: null,
    quality: "unavailable",
    reasonCode: "INVENTORY_AGE_UNKNOWN",
  };
}

/**
 * demand-trend-v1
 *
 * Stable band is +/-10% relative change.
 */
export const DEMAND_TREND_STABLE_BAND_RATIO_V1 = 0.10;

export function calculateDemandTrend(
  input: import("./types").DemandTrendInput,
): import("./types").DemandTrendResult {
  if (
    input.recentDailyDemand === null ||
    input.priorDailyDemand === null
  ) {
    return {
      value: null,
      changeRatio: null,
      reasonCode: "TREND_INPUT_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.recentDailyDemand,
    "recentDailyDemand",
  );

  assertNonNegativeFiniteNumber(
    input.priorDailyDemand,
    "priorDailyDemand",
  );

  if (
    input.priorDailyDemand === 0 &&
    input.recentDailyDemand === 0
  ) {
    return {
      value: "stable",
      changeRatio: 0,
      reasonCode: null,
    };
  }

  if (input.priorDailyDemand === 0) {
    return {
      value: "rising",
      changeRatio: null,
      reasonCode: null,
    };
  }

  const changeRatio =
    (input.recentDailyDemand -
      input.priorDailyDemand) /
    input.priorDailyDemand;

  if (
    changeRatio >
    DEMAND_TREND_STABLE_BAND_RATIO_V1
  ) {
    return {
      value: "rising",
      changeRatio,
      reasonCode: null,
    };
  }

  if (
    changeRatio <
    -DEMAND_TREND_STABLE_BAND_RATIO_V1
  ) {
    return {
      value: "falling",
      changeRatio,
      reasonCode: null,
    };
  }

  return {
    value: "stable",
    changeRatio,
    reasonCode: null,
  };
}

/**
 * stockout-risk-v1
 *
 * HIGH:
 * coverage is at or below supplier lead time.
 *
 * MEDIUM:
 * coverage exceeds lead time but does not exceed
 * lead time + safety-stock days.
 *
 * LOW:
 * coverage exceeds the replenishment horizon.
 */
export function calculateStockoutRisk(
  input: import("./types").StockoutRiskInput,
): import("./types").StockoutRiskResult {
  if (input.daysOfStock === null) {
    return {
      value: null,
      coverageDays: null,
      replenishmentHorizonDays: null,
      reasonCode: "STOCK_COVERAGE_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.daysOfStock,
    "daysOfStock",
  );

  if (input.leadTimeDays === null) {
    return {
      value: null,
      coverageDays: input.daysOfStock,
      replenishmentHorizonDays: null,
      reasonCode: "LEAD_TIME_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.leadTimeDays,
    "leadTimeDays",
  );

  if (input.safetyStockDays === null) {
    return {
      value: null,
      coverageDays: input.daysOfStock,
      replenishmentHorizonDays: null,
      reasonCode: "SAFETY_STOCK_DAYS_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.safetyStockDays,
    "safetyStockDays",
  );

  const replenishmentHorizonDays =
    input.leadTimeDays +
    input.safetyStockDays;

  if (input.daysOfStock <= input.leadTimeDays) {
    return {
      value: "high",
      coverageDays: input.daysOfStock,
      replenishmentHorizonDays,
      reasonCode: null,
    };
  }

  if (
    input.daysOfStock <=
    replenishmentHorizonDays
  ) {
    return {
      value: "medium",
      coverageDays: input.daysOfStock,
      replenishmentHorizonDays,
      reasonCode: null,
    };
  }

  return {
    value: "low",
    coverageDays: input.daysOfStock,
    replenishmentHorizonDays,
    reasonCode: null,
  };
}

/**
 * overstock-risk-v1
 *
 * inventory position =
 * available + valid incoming
 *
 * LOW:
 * inventory position <= target
 *
 * MEDIUM:
 * target < inventory position <= 1.5 * target
 *
 * HIGH:
 * inventory position > 1.5 * target
 */
export const OVERSTOCK_HIGH_RATIO_V1 = 1.5;

export function calculateOverstockRisk(
  input: import("./types").OverstockRiskInput,
): import("./types").OverstockRiskResult {
  if (input.availableQuantity === null) {
    return {
      value: null,
      inventoryPositionUnits: null,
      targetStockUnits: input.targetStockUnits,
      positionToTargetRatio: null,
      reasonCode: "INVENTORY_UNKNOWN",
    };
  }

  assertNonNegativeInteger(
    input.availableQuantity,
    "availableQuantity",
  );

  if (input.targetStockUnits === null) {
    return {
      value: null,
      inventoryPositionUnits: null,
      targetStockUnits: null,
      positionToTargetRatio: null,
      reasonCode: "TARGET_STOCK_UNKNOWN",
    };
  }

  assertNonNegativeFiniteNumber(
    input.targetStockUnits,
    "targetStockUnits",
  );

  let incomingQuantity: number;

  if (input.validIncomingQuantity === null) {
    if (!input.incomingStateKnown) {
      return {
        value: null,
        inventoryPositionUnits: null,
        targetStockUnits: input.targetStockUnits,
        positionToTargetRatio: null,
        reasonCode: "INCOMING_STATE_UNKNOWN",
      };
    }

    incomingQuantity = 0;
  } else {
    assertNonNegativeInteger(
      input.validIncomingQuantity,
      "validIncomingQuantity",
    );

    incomingQuantity =
      input.validIncomingQuantity;
  }

  const inventoryPositionUnits =
    input.availableQuantity +
    incomingQuantity;

  if (input.targetStockUnits === 0) {
    return {
      value:
        inventoryPositionUnits === 0
          ? "low"
          : "high",
      inventoryPositionUnits,
      targetStockUnits: 0,
      positionToTargetRatio: null,
      reasonCode: null,
    };
  }

  const positionToTargetRatio =
    inventoryPositionUnits /
    input.targetStockUnits;

  if (positionToTargetRatio <= 1) {
    return {
      value: "low",
      inventoryPositionUnits,
      targetStockUnits: input.targetStockUnits,
      positionToTargetRatio,
      reasonCode: null,
    };
  }

  if (
    positionToTargetRatio <=
    OVERSTOCK_HIGH_RATIO_V1
  ) {
    return {
      value: "medium",
      inventoryPositionUnits,
      targetStockUnits: input.targetStockUnits,
      positionToTargetRatio,
      reasonCode: null,
    };
  }

  return {
    value: "high",
    inventoryPositionUnits,
    targetStockUnits: input.targetStockUnits,
    positionToTargetRatio,
    reasonCode: null,
  };
}

/**
 * supplier-order-constraints-v1
 *
 * Applies MOQ first, then rounds upward to the nearest
 * valid pack-size multiple.
 *
 * Zero need always remains zero.
 */
export function applySupplierOrderConstraints(
  input: import("./types").SupplierOrderConstraintInput,
): import("./types").SupplierOrderConstraintResult {
  assertNonNegativeInteger(
    input.requiredQuantity,
    "requiredQuantity",
  );

  if (
    input.minimumOrderQuantity !== null &&
    (!Number.isInteger(input.minimumOrderQuantity) ||
      input.minimumOrderQuantity <= 0)
  ) {
    throw new Error(
      "minimumOrderQuantity must be a positive integer.",
    );
  }

  if (
    input.packSize !== null &&
    (!Number.isInteger(input.packSize) ||
      input.packSize <= 0)
  ) {
    throw new Error(
      "packSize must be a positive integer.",
    );
  }

  if (input.requiredQuantity === 0) {
    return {
      requiredQuantity: 0,
      constrainedQuantity: 0,
      minimumOrderQuantity:
        input.minimumOrderQuantity,
      packSize: input.packSize,
      minimumApplied: false,
      packRoundingApplied: false,
    };
  }

  let constrainedQuantity =
    input.requiredQuantity;

  let minimumApplied = false;
  let packRoundingApplied = false;

  if (
    input.minimumOrderQuantity !== null &&
    constrainedQuantity <
      input.minimumOrderQuantity
  ) {
    constrainedQuantity =
      input.minimumOrderQuantity;

    minimumApplied = true;
  }

  if (input.packSize !== null) {
    const rounded =
      Math.ceil(
        constrainedQuantity /
          input.packSize,
      ) * input.packSize;

    if (rounded !== constrainedQuantity) {
      packRoundingApplied = true;
    }

    constrainedQuantity = rounded;
  }

  return {
    requiredQuantity: input.requiredQuantity,
    constrainedQuantity,
    minimumOrderQuantity:
      input.minimumOrderQuantity,
    packSize: input.packSize,
    minimumApplied,
    packRoundingApplied,
  };
}

/**
 * incoming-stock-v1
 *
 * Determines how much of one purchase-order line may safely
 * reduce replenishment need.
 *
 * draft:
 *   does not count as committed incoming inventory
 *
 * submitted / confirmed:
 *   full ordered quantity counts as incoming
 *
 * partially_received:
 *   only remaining quantity counts
 *
 * received / cancelled:
 *   zero incoming
 *
 * unknown or inconsistent receipt data:
 *   fail closed
 */
export function calculateValidIncomingPurchaseOrderLine(
  input: import("./types").IncomingPurchaseOrderLineInput,
): import("./types").IncomingPurchaseOrderLineResult {
  assertNonNegativeInteger(
    input.orderedQuantity,
    "orderedQuantity",
  );

  if (input.receivedQuantity !== null) {
    assertNonNegativeInteger(
      input.receivedQuantity,
      "receivedQuantity",
    );

    if (
      input.receivedQuantity >
      input.orderedQuantity
    ) {
      return {
        validIncomingQuantity: null,
        incomingStateKnown: false,
        reasonCode: "RECEIVED_EXCEEDS_ORDERED",
      };
    }
  }

  switch (input.status) {
    case "draft":
      return {
        validIncomingQuantity: 0,
        incomingStateKnown: true,
        reasonCode: null,
      };

    case "submitted":
    case "confirmed":
      return {
        validIncomingQuantity:
          input.orderedQuantity,
        incomingStateKnown: true,
        reasonCode: null,
      };

    case "partially_received": {
      if (input.receivedQuantity === null) {
        return {
          validIncomingQuantity: null,
          incomingStateKnown: false,
          reasonCode: "RECEIVED_QUANTITY_UNKNOWN",
        };
      }

      return {
        validIncomingQuantity:
          input.orderedQuantity -
          input.receivedQuantity,
        incomingStateKnown: true,
        reasonCode: null,
      };
    }

    case "received":
    case "cancelled":
      return {
        validIncomingQuantity: 0,
        incomingStateKnown: true,
        reasonCode: null,
      };

    case "unknown":
      return {
        validIncomingQuantity: null,
        incomingStateKnown: false,
        reasonCode: "PURCHASE_ORDER_STATUS_UNKNOWN",
      };
  }
}

/**
 * incoming-stock-aggregate-v1
 *
 * Aggregates multiple PO lines.
 *
 * If any line is not trustworthy, the total is unknown.
 * StoreAgent must not subtract a partial known total when the
 * remaining inbound state is ambiguous.
 */
export function calculateValidIncomingPurchaseOrders(
  lines: readonly import("./types").IncomingPurchaseOrderLineInput[],
): import("./types").IncomingPurchaseOrderAggregateResult {
  let total = 0;

  for (const line of lines) {
    const result =
      calculateValidIncomingPurchaseOrderLine(line);

    if (
      !result.incomingStateKnown ||
      result.validIncomingQuantity === null
    ) {
      return {
        validIncomingQuantity: null,
        incomingStateKnown: false,
        reasonCode: result.reasonCode,
      };
    }

    total += result.validIncomingQuantity;
  }

  return {
    validIncomingQuantity: total,
    incomingStateKnown: true,
    reasonCode: null,
  };
}
