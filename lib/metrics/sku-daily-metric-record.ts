import type { InventoryAggregateResult } from "./inventory-aggregates";
import type { SalesAggregateResult } from "./sales-aggregates";
import type { MetricReasonCode } from "./types";

export const SKU_DAILY_METRIC_ALGORITHM_VERSION =
  "m5-derived-metrics-v1";

const PERSISTED_REASON_CODES: Record<
  Exclude<MetricReasonCode, "STOCK_COVERAGE_UNKNOWN">,
  string
> = {
  NO_ELIGIBLE_DAYS: "no_eligible_days",
  DEMAND_UNKNOWN: "demand_unknown",
  ZERO_DEMAND: "zero_demand",
  INVENTORY_UNKNOWN: "inventory_unknown",
  SAFETY_STOCK_DAYS_UNKNOWN: "safety_stock_days_unknown",
  SAFETY_STOCK_UNKNOWN: "safety_stock_unknown",
  LEAD_TIME_UNKNOWN: "lead_time_unknown",
  REVIEW_PERIOD_UNKNOWN: "review_period_unknown",
  TARGET_STOCK_UNKNOWN: "target_stock_unknown",
  INCOMING_STATE_UNKNOWN: "incoming_state_unknown",
  SELL_THROUGH_DENOMINATOR_ZERO: "sell_through_denominator_zero",
  INVENTORY_AGE_UNKNOWN: "inventory_age_unknown",
  TREND_INPUT_UNKNOWN: "trend_input_unknown",
  PURCHASE_ORDER_STATUS_UNKNOWN: "purchase_order_status_unknown",
  RECEIVED_QUANTITY_UNKNOWN: "received_quantity_unknown",
  RECEIVED_EXCEEDS_ORDERED: "received_exceeds_ordered",
};

export interface PersistedSkuDailyMetric {
  timeZone: string;
  unitsSold: number;
  returnedUnits: number;
  netUnitsSold: number;
  eligibleDays7d: number;
  eligibleDays14d: number;
  eligibleDays30d: number;
  eligibleDays90d: number;
  salesVelocity7d: number | null;
  salesVelocity14d: number | null;
  salesVelocity30d: number | null;
  salesVelocity90d: number | null;
  salesVelocity7dReasonCode: string | null;
  salesVelocity14dReasonCode: string | null;
  salesVelocity30dReasonCode: string | null;
  salesVelocity90dReasonCode: string | null;
  availableQuantity: number | null;
  eligibleIncomingQuantity: null;
  eligibleIncomingReasonCode: "incoming_state_unknown";
  inventoryPosition: null;
  daysOfStock: number | null;
  daysOfStockReasonCode: string | null;
  sellThroughRate: number | null;
  sellThroughReasonCode: string | null;
  inventoryAgeDays: null;
  inventoryAgeQuality: "unavailable";
  inventoryAgeReasonCode: "inventory_age_unknown";
  demandTrend: "rising" | "stable" | "falling" | "unknown";
  demandTrendReasonCode: string | null;
  safetyStock: number | null;
  safetyStockReasonCode: string | null;
  reorderPoint: number | null;
  reorderPointReasonCode: string | null;
  targetStock: number | null;
  targetStockReasonCode: string | null;
}

/**
 * Maps one M5.3 sales result and one M5.4 inventory result to the
 * existing sku_daily_metrics columns. Coverage is not included.
 * PostgreSQL computes it from the eligible-day counts.
 */
export function toPersistedSkuDailyMetric(
  metricDate: string,
  timeZone: string,
  sales: SalesAggregateResult,
  inventory: InventoryAggregateResult,
): PersistedSkuDailyMetric {
  const day = sales.days.find(
    (candidate) => candidate.metricDate === metricDate,
  );

  if (day === undefined) {
    throw new Error(
      "sales aggregate is missing the metric date.",
    );
  }

  return {
    timeZone,
    unitsSold: day.unitsSold,
    returnedUnits: day.returnedUnits,
    netUnitsSold: day.netUnitsSold,
    eligibleDays7d: sales.windows[7].eligibleDays,
    eligibleDays14d: sales.windows[14].eligibleDays,
    eligibleDays30d: sales.windows[30].eligibleDays,
    eligibleDays90d: sales.windows[90].eligibleDays,
    salesVelocity7d: sales.windows[7].velocity,
    salesVelocity14d: sales.windows[14].velocity,
    salesVelocity30d: sales.windows[30].velocity,
    salesVelocity90d: sales.windows[90].velocity,
    salesVelocity7dReasonCode: persistedReason(
      sales.windows[7].reasonCode,
    ),
    salesVelocity14dReasonCode: persistedReason(
      sales.windows[14].reasonCode,
    ),
    salesVelocity30dReasonCode: persistedReason(
      sales.windows[30].reasonCode,
    ),
    salesVelocity90dReasonCode: persistedReason(
      sales.windows[90].reasonCode,
    ),
    availableQuantity: inventory.availableQuantity,
    eligibleIncomingQuantity: null,
    eligibleIncomingReasonCode: "incoming_state_unknown",
    inventoryPosition: null,
    daysOfStock: inventory.daysOfStock,
    daysOfStockReasonCode: persistedReason(
      inventory.daysOfStockReasonCode,
    ),
    sellThroughRate: inventory.sellThroughRate,
    sellThroughReasonCode: persistedReason(
      inventory.sellThroughReasonCode,
    ),
    inventoryAgeDays: null,
    inventoryAgeQuality: "unavailable",
    inventoryAgeReasonCode: "inventory_age_unknown",
    demandTrend: inventory.demandTrend,
    demandTrendReasonCode: persistedReason(
      inventory.demandTrendReasonCode,
    ),
    safetyStock: inventory.safetyStock,
    safetyStockReasonCode: persistedReason(
      inventory.safetyStockReasonCode,
    ),
    reorderPoint: inventory.reorderPoint,
    reorderPointReasonCode: persistedReason(
      inventory.reorderPointReasonCode,
    ),
    targetStock: inventory.targetStock,
    targetStockReasonCode: persistedReason(
      inventory.targetStockReasonCode,
    ),
  };
}

function persistedReason(
  reasonCode: MetricReasonCode | null,
): string | null {
  if (reasonCode === null) {
    return null;
  }

  if (reasonCode === "STOCK_COVERAGE_UNKNOWN") {
    throw new Error(
      "STOCK_COVERAGE_UNKNOWN is not a persisted M5 reason.",
    );
  }

  return PERSISTED_REASON_CODES[reasonCode];
}
