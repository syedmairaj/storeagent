import type {
  PurchaseOrderStatus,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

export type MetricReasonCode =
  | "NO_ELIGIBLE_DAYS"
  | "DEMAND_UNKNOWN"
  | "ZERO_DEMAND"
  | "INVENTORY_UNKNOWN"
  | "SAFETY_STOCK_DAYS_UNKNOWN"
  | "SAFETY_STOCK_UNKNOWN"
  | "LEAD_TIME_UNKNOWN"
  | "REVIEW_PERIOD_UNKNOWN"
  | "TARGET_STOCK_UNKNOWN"
  | "INCOMING_STATE_UNKNOWN"
  | "SELL_THROUGH_DENOMINATOR_ZERO"
  | "INVENTORY_AGE_UNKNOWN"
  | "TREND_INPUT_UNKNOWN"
  | "STOCK_COVERAGE_UNKNOWN"
  | "PURCHASE_ORDER_STATUS_UNKNOWN"
  | "RECEIVED_QUANTITY_UNKNOWN"
  | "RECEIVED_EXCEEDS_ORDERED";

export interface MetricResult<T> {
  value: T | null;
  reasonCode: MetricReasonCode | null;
}

export interface SalesVelocityInput {
  /**
   * Gross sold units during the selected window.
   */
  soldUnits: UnitQuantity;

  /**
   * Units cancelled during the selected window.
   */
  cancelledUnits: UnitQuantity;

  /**
   * Returned units to subtract from demand according to the
   * configured V1 return treatment.
   */
  returnedUnits: UnitQuantity;

  /**
   * Number of valid demand-observation days.
   */
  eligibleDays: number;
}

export interface DaysOfStockInput {
  availableQuantity: UnitQuantity | null;
  dailyDemand: number | null;
}

export interface SafetyStockInput {
  dailyDemand: number | null;
  safetyStockDays: number | null;
}

export interface ReorderPointInput {
  dailyDemand: number | null;
  leadTimeDays: number | null;
  safetyStockUnits: number | null;
}

export interface TargetStockInput {
  dailyDemand: number | null;
  leadTimeDays: number | null;
  reviewPeriodDays: number | null;
  safetyStockUnits: number | null;
}

export interface RecommendedOrderQuantityInput {
  targetStockUnits: number | null;
  availableQuantity: UnitQuantity | null;

  /**
   * Known valid incoming inventory.
   *
   * null means incoming inventory state is not trustworthy/known.
   */
  validIncomingQuantity: UnitQuantity | null;

  /**
   * True only when StoreAgent has reliable evidence that
   * null incoming quantity means there is no incoming stock.
   */
  incomingStateKnown: boolean;
}

export interface SellThroughInput {
  /**
   * Net units sold during the selected measurement window.
   */
  unitsSold: UnitQuantity;

  /**
   * Total units that were available for sale during the same window.
   *
   * Must be >= unitsSold.
   */
  unitsAvailableForSale: UnitQuantity;
}

export type InventoryAgeQuality =
  | "exact"
  | "estimated"
  | "unavailable";

export interface InventoryAgeInput {
  /**
   * Age derived from trusted receipt/inbound history.
   */
  exactAgeDays: number | null;

  /**
   * Documented fallback estimate when exact receipt history
   * is unavailable.
   */
  estimatedAgeDays: number | null;
}

export interface InventoryAgeResult {
  value: number | null;
  quality: InventoryAgeQuality;
  reasonCode: MetricReasonCode | null;
}

export type DemandTrend =
  | "rising"
  | "stable"
  | "falling";

export interface DemandTrendInput {
  recentDailyDemand: number | null;
  priorDailyDemand: number | null;
}

export interface DemandTrendResult {
  value: DemandTrend | null;

  /**
   * Relative change from prior period when mathematically defined.
   *
   * Example: 0.20 means +20%.
   */
  changeRatio: number | null;

  reasonCode: MetricReasonCode | null;
}

export type InventoryRiskLevel =
  | "low"
  | "medium"
  | "high";

export interface StockoutRiskInput {
  /**
   * Previously calculated days-of-stock value.
   */
  daysOfStock: number | null;

  leadTimeDays: number | null;
  safetyStockDays: number | null;
}

export interface StockoutRiskResult {
  value: InventoryRiskLevel | null;
  coverageDays: number | null;
  replenishmentHorizonDays: number | null;
  reasonCode: MetricReasonCode | null;
}

export interface OverstockRiskInput {
  availableQuantity: UnitQuantity | null;

  /**
   * Valid incoming stock only.
   *
   * null may mean either known zero or unknown depending on
   * incomingStateKnown.
   */
  validIncomingQuantity: UnitQuantity | null;

  incomingStateKnown: boolean;
  targetStockUnits: number | null;
}

export interface OverstockRiskResult {
  value: InventoryRiskLevel | null;
  inventoryPositionUnits: number | null;
  targetStockUnits: number | null;
  positionToTargetRatio: number | null;
  reasonCode: MetricReasonCode | null;
}

export interface SupplierOrderConstraintInput {
  /**
   * Base deterministic reorder need before supplier constraints.
   */
  requiredQuantity: number;

  /**
   * Supplier minimum order quantity.
   *
   * null means no MOQ constraint is known/configured.
   */
  minimumOrderQuantity: number | null;

  /**
   * Supplier pack/carton multiple.
   *
   * null means no pack-size constraint is known/configured.
   */
  packSize: number | null;
}

export interface SupplierOrderConstraintResult {
  requiredQuantity: number;
  constrainedQuantity: number;
  minimumOrderQuantity: number | null;
  packSize: number | null;
  minimumApplied: boolean;
  packRoundingApplied: boolean;
}

export interface IncomingPurchaseOrderLineInput {
  status: PurchaseOrderStatus;
  orderedQuantity: UnitQuantity;
  receivedQuantity: UnitQuantity | null;
}

export interface IncomingPurchaseOrderLineResult {
  validIncomingQuantity: number | null;
  incomingStateKnown: boolean;
  reasonCode: MetricReasonCode | null;
}

export interface IncomingPurchaseOrderAggregateResult {
  validIncomingQuantity: number | null;
  incomingStateKnown: boolean;
  reasonCode: MetricReasonCode | null;
}
