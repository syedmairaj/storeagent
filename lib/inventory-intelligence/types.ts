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
  | "pending_or_stale";
