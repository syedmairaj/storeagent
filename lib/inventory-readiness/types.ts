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

/**
 * Durable merchant organization planning assumptions for readiness evidence.
 * Not verified supplier/SKU facts. null = unknown; 0 = explicit known zero.
 * Maps to InventoryPlanningSettings / organization_planning_inputs.
 */
export type PlanningEvidencePresence = {
  leadTimeDays: number | null;
  safetyStockDays: number | null;
  reviewPeriodDays: number | null;
};

/**
 * Trusted current-day incoming presence for readiness copy.
 * Snapshot CSV incomingQuantity is never counted here.
 */
export type TrustedIncomingEvidencePresence = {
  /** Destination-scoped purchase_order_items exist for the org. */
  hasPurchaseOrderItemRows: boolean;
  /** Stores with evidence_complete=true attestation. */
  evidenceCompleteStoreCount: number;
  /** Current as-of metric grains with known incoming (qty not null). */
  knownIncomingGrainCount: number;
  /** Subset of known grains with qty === 0. */
  knownZeroGrainCount: number;
  /** Subset of known grains with qty > 0. */
  positiveIncomingGrainCount: number;
};

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
   * org/store/location/variant metric for the store-local as-of metric_date
   * with known sales_velocity_30d. Stale metric_dates do not count.
   * Pending source-event / recompute work also blocks this count.
   * Org-wide head counts alone never populate this.
   */
  grainAlignedKnownDemandCount: number;
  /**
   * True when unconsumed metric source events or open recompute requests
   * remain for the organization. Metrics are not "current" while pending.
   */
  hasPendingMetricWork: boolean;
  /**
   * Merchant-configured organization planning days when present.
   * Absence of a row is represented as all-null (unknown).
   */
  planning: PlanningEvidencePresence;
  trustedIncoming: TrustedIncomingEvidencePresence;
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
