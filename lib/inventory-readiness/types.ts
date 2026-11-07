/**
 * Tenant-scoped decision readiness for real merchant inventory.
 *
 * Reuses M5/M7 eligibility semantics (null ≠ 0; fail closed) without
 * inventing demand, cost, lead time, forecast, or commercial actions.
 */

export type DecisionEvidenceInputKey =
  | "inventory_snapshots"
  | "sales_history"
  | "sku_daily_metrics"
  | "lead_time"
  | "safety_stock_days"
  | "review_period_days"
  | "trusted_incoming"
  | "forecast";

export type DecisionCapability =
  | "stock_positions"
  | "cover_days"
  | "reorder_thresholds"
  | "commercial_actions";

/**
 * available  — evidence is present and usable for the named purpose
 * missing    — no evidence of this kind for the organization
 * insufficient — some rows exist but are not grain-aligned, known, or usable
 */
export type EvidenceSufficiency =
  | "available"
  | "missing"
  | "insufficient";

export type EvidencePresence = {
  inventorySnapshotCount: number;
  distinctSkuCount: number;
  distinctStoreCount: number;
  distinctLocationCount: number;
  knownAvailableSkuCount: number;
  /** Org-scoped order_items exist (raw sales presence only). */
  hasSalesHistory: boolean;
  /** Org-scoped sku_daily_metrics rows exist (not necessarily usable). */
  hasSkuDailyMetrics: boolean;
  /**
   * Latest inventory grains (variant×location) that also have a matching
   * org/store/location/variant metric with known sales_velocity_30d.
   * Org-wide head counts alone never populate this.
   */
  grainAlignedKnownDemandCount: number;
};

export type EvidenceInputStatus = {
  key: DecisionEvidenceInputKey;
  /** Convenience: true only when status === "available". */
  present: boolean;
  status: EvidenceSufficiency;
  label: string;
  detail: string;
  nextStep: string | null;
};

export type DecisionCapabilityStatus = {
  key: DecisionCapability;
  ready: boolean;
  label: string;
  detail: string;
};

export type MerchantDecisionReadiness = {
  organizationId: string;
  presence: EvidencePresence;
  inputs: readonly EvidenceInputStatus[];
  capabilities: readonly DecisionCapabilityStatus[];
  /**
   * Remains false for this milestone: commercial engine is not invoked and
   * action-specific M7 prerequisites are not independently authorized.
   */
  commercialActionsEligible: boolean;
  summary: string;
  nextSteps: readonly string[];
};
