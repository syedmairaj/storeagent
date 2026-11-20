/**
 * Merchant inventory intelligence V1 — display contracts only.
 * Cover and velocity come from persisted sku_daily_metrics; never invent demand.
 */

export type InventoryCoverStatus =
  | "pending_freshness"
  | "unknown_stock"
  | "missing_metric"
  | "stale"
  | "short_history"
  | "unknown_demand"
  | "zero_demand"
  | "valid";

export type MerchantInventoryIntelligenceRow = {
  grainKey: string;
  snapshotId: string;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  sku: string;
  productTitle: string | null;
  storeName: string;
  locationName: string;
  availableQuantity: number | null;
  onHandQuantity: number | null;
  observedAt: string;
  asOfMetricDate: string | null;
  metricDate: string | null;
  salesVelocity30d: number | null;
  salesVelocity30dReasonCode: string | null;
  eligibleDays30d: number | null;
  coverageRatio30d: number | null;
  daysOfStock: number | null;
  daysOfStockReasonCode: string | null;
  /**
   * Persisted planning thresholds from sku_daily_metrics when known.
   * Null / reason-coded unknown means not shown as merchant thresholds.
   */
  safetyStock: number | null;
  safetyStockReasonCode: string | null;
  reorderPoint: number | null;
  reorderPointReasonCode: string | null;
  targetStock: number | null;
  targetStockReasonCode: string | null;
  coverStatus: InventoryCoverStatus;
  /** Merchant-facing one-line explanation of evidence / cover. */
  evidenceLabel: string;
};

export type MerchantInventoryIntelligenceResult = {
  organizationId: string;
  hasPendingMetricWork: boolean;
  rows: readonly MerchantInventoryIntelligenceRow[];
};

export type InventoryIntelligenceFilter =
  | "all"
  | "needs_attention"
  | "valid_cover"
  | "unknown_or_missing"
  | "zero_demand"
  | "pending_or_stale"
  /** Known available quantity === 0 (unknown stock excluded). */
  | "out_of_stock"
  /** Valid cover below the existing <14-day attention band. */
  | "low_cover"
  /** Valid cover at/above the presentation high-cover review band. */
  | "high_cover_review"
  /**
   * Matches Overview limited/unknown attention: pending/stale/short/unknown
   * statuses plus sparse eligible-days on valid/zero-demand rows.
   */
  | "limited_or_unknown"
  /** Sparse eligible days only (not forecast confidence). */
  | "limited_history";
