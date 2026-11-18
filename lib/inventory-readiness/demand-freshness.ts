/**
 * Merchant demand-freshness guidance for readiness UI.
 * Pure — no I/O. Does not invent sales, stock, or commercial actions.
 */

export type DemandFreshnessKind =
  | "missing_sales"
  | "missing_inventory"
  | "missing_current_day_stock"
  | "activate_metrics"
  | "ready";

export type DemandFreshnessGuidance = {
  kind: DemandFreshnessKind;
  /**
   * When true, render ActivateDemandMetricsButton (authorized in-process
   * recompute). Never gated solely on cover capability readiness.
   */
  showActivateButton: boolean;
  headline: string;
  detail: string;
  primaryNextStep: string;
  /**
   * Merchant-facing primary CTA label for link actions.
   * Null when the CTA is the activate button or review-only.
   */
  ctaLabel: string | null;
  /**
   * Destination for link CTAs. Null for activate button / ready review.
   */
  ctaHref:
    | "inventory-import"
    | "sales-import"
    | "inventory"
    | null;
};

export type DemandFreshnessInput = {
  hasSalesHistory: boolean;
  knownAvailableSkuCount: number;
  /**
   * True only when every known-available place/grain is observed on
   * store-local as-of. Mixed fresh/stale locations must be false.
   */
  hasCurrentDayInventoryObservation: boolean;
  /** At least one sku_daily_metrics row for store-local as-of. */
  hasCurrentDayMetrics: boolean;
  hasPendingMetricWork: boolean;
  grainAlignedKnownDemandCount: number;
  hasActivationScope: boolean;
  asOfMetricDate: string | null;
  /** Optional place-level mix signal for clearer merchant copy. */
  inventoryPlaceFreshnessKind?:
    | "empty"
    | "all_current"
    | "all_stale"
    | "mixed"
    | "unknown";
};

/**
 * Choose the merchant next action for demand / cover freshness.
 *
 * Order matters: sales → any stock → current-day stock → activate → ready.
 * Cover capability `ready` alone must not hide an eligible activate action
 * when pending work or non-current metrics remain.
 */
export function resolveDemandFreshnessGuidance(
  input: DemandFreshnessInput,
): DemandFreshnessGuidance {
  const asOfLabel = input.asOfMetricDate
    ? `store-local ${input.asOfMetricDate}`
    : "the store-local business date";

  if (input.knownAvailableSkuCount <= 0) {
    return {
      kind: "missing_inventory",
      showActivateButton: false,
      headline: "Import inventory",
      detail: input.hasSalesHistory
        ? "Sales exist, but there is no known available quantity to pair with demand. Null stock is not treated as zero."
        : "No known available quantity yet. Import stock before demand cover can be calculated — null is not zero.",
      primaryNextStep:
        "Import an inventory CSV with SKU and available quantity.",
      ctaLabel: "Import inventory",
      ctaHref: "inventory-import",
    };
  }

  if (!input.hasSalesHistory) {
    return {
      kind: "missing_sales",
      showActivateButton: false,
      headline: "Import sales history",
      detail:
        "Demand velocity stays unknown until sold lines exist for this organization. Unknown demand is never treated as zero.",
      primaryNextStep:
        "Import sales history CSV for the same store and location as your stock.",
      ctaLabel: "Import sales history",
      ctaHref: "sales-import",
    };
  }

  if (!input.hasCurrentDayInventoryObservation) {
    const mixed =
      input.inventoryPlaceFreshnessKind === "mixed"
        ? " Some stores/locations are current while others are stale — upload updated stock for every place that still needs a same-day observation."
        : "";
    return {
      kind: "missing_current_day_stock",
      showActivateButton: false,
      headline: "Upload updated stock",
      detail: `Imported stock exists, but not every store/location has an observation on ${asOfLabel}.${mixed} Historical snapshots alone leave demand metrics stale.`,
      primaryNextStep:
        "Upload updated stock (append-only CSV observation) for each stale store and location, then activate demand metrics.",
      ctaLabel: "Upload updated stock",
      ctaHref: "inventory-import",
    };
  }

  const needsActivation =
    input.hasPendingMetricWork ||
    !input.hasCurrentDayMetrics ||
    input.grainAlignedKnownDemandCount <= 0;

  if (needsActivation) {
    return {
      kind: "activate_metrics",
      showActivateButton: input.hasActivationScope,
      headline: input.hasPendingMetricWork
        ? "Activate demand metrics"
        : "Refresh demand metrics",
      detail: input.hasPendingMetricWork
        ? "Sales and current-day stock are present, but demand metrics are still updating. Cover stays blocked until current matching metrics finish."
        : `Sales and current-day stock are present, but demand metrics are not current for ${asOfLabel}. Activate demand metrics to recompute from trusted history — StoreAgent will not invent sales.`,
      primaryNextStep: input.hasActivationScope
        ? "Activate demand metrics for this store and location."
        : "Choose one authorized store and location (Import inventory / Import sales), then activate demand metrics. StoreAgent will not guess which place to authorize.",
      ctaLabel: null,
      ctaHref: null,
    };
  }

  return {
    kind: "ready",
    showActivateButton: false,
    headline: "Demand metrics are current",
    detail: `Current demand metrics match imported stock on ${asOfLabel} (${input.grainAlignedKnownDemandCount} position(s) with known velocity). Commercial recommendations stay disabled.`,
    primaryNextStep:
      "Review cover below. Configure planning inputs before reorder thresholds unlock.",
    ctaLabel: "Review stock cover",
    ctaHref: "inventory",
  };
}
