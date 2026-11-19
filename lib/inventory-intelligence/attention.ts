/**
 * Merchant attention signals from persisted inventory intelligence rows.
 * Presentation counts only — does not invent risk scores, ROI, or M7 actions.
 */

import type {
  InventoryIntelligenceFilter,
  MerchantInventoryIntelligenceRow,
} from "@/lib/inventory-intelligence/types";

/**
 * Existing Inventory prioritization attention band (< 14 days of calculable cover).
 * Origin: `filterIntelligenceRows(..., "needs_attention")` / prioritize low-cover sort.
 * Not SS/ROP/target planning formulas and not stockout-risk-v1.
 */
export const LOW_COVER_ATTENTION_DAYS = 14;

/**
 * Overview/Inventory presentation review band for high calculable cover (≥ 60 days).
 * Origin: UX-INV-1a review heuristic only (not overstock-risk-v1, which needs
 * target + trusted incoming at 1.5× target). Not a REDUCE action or formula change.
 */
export const HIGH_COVER_REVIEW_DAYS = 60;

/** Sparse eligible-days disclosure (matches Inventory limited-history chip). */
export const LIMITED_HISTORY_ELIGIBLE_DAYS = 7;

export type SignalEvaluation = "evaluated" | "unavailable";

export type MerchantAttentionFocus =
  | "out_of_stock"
  | "low_cover"
  | "high_cover_review"
  | "limited_history"
  | "unknown_demand"
  | "pending_or_stale"
  | "limited_or_unknown"
  | "needs_attention"
  | "all";

export type MerchantAttentionSummary = {
  positionCount: number;
  /**
   * Latest observation date (UTC calendar date from observedAt), or null.
   * Used to qualify last-recorded stock signals when cover is stale.
   */
  lastObservationDate: string | null;
  /** Known available quantity === 0 on latest observation (unknown stock excluded). */
  lastRecordedOutOfStockCount: number;
  /** Positions with calculable cover (status valid) — not a health claim. */
  calculableCoverCount: number;
  /**
   * Low/high cover are only meaningful when at least one position has valid cover.
   * When unavailable, UI must not present count 0 as an evaluated zero.
   */
  coverSignalEvaluation: SignalEvaluation;
  lowCoverCount: number;
  highCoverReviewCount: number;
  /**
   * Sparse eligibleDays30d on valid / zero_demand / stale / pending rows, or
   * short_history (no_eligible_days). Independent of cover freshness — not unknown demand.
   */
  limitedHistoryCount: number;
  /** Unknown stock, unknown demand, or missing metrics — never known zero/positive. */
  unknownDemandCount: number;
  /** Pending freshness or stale cover status. */
  staleOrPendingCount: number;
  knownZeroDemandCount: number;
  /**
   * @deprecated Prefer limitedHistoryCount + unknownDemandCount + staleOrPendingCount.
   * Retained as union for older deep-links.
   */
  limitedOrUnknownEvidenceCount: number;
  /** Alias for lastRecordedOutOfStockCount (compat). */
  outOfStockCount: number;
};

export function isKnownOutOfStock(
  row: MerchantInventoryIntelligenceRow,
): boolean {
  return row.availableQuantity === 0;
}

export function isLowCoverAttention(
  row: MerchantInventoryIntelligenceRow,
): boolean {
  return (
    row.coverStatus === "valid" &&
    row.daysOfStock !== null &&
    row.daysOfStock < LOW_COVER_ATTENTION_DAYS
  );
}

export function isHighCoverReview(
  row: MerchantInventoryIntelligenceRow,
): boolean {
  return (
    row.coverStatus === "valid" &&
    row.daysOfStock !== null &&
    row.daysOfStock >= HIGH_COVER_REVIEW_DAYS
  );
}

export function isLimitedHistoryEvidence(
  row: MerchantInventoryIntelligenceRow,
): boolean {
  // Cover blocked solely by no_eligible_days — limited history, not unknown demand.
  if (row.coverStatus === "short_history") {
    return true;
  }
  // Sparse eligible days is independent of stock freshness. Stale/pending cover must
  // not suppress limited-history counts when raw eligibleDays30d remains sparse.
  // Unknown demand / unknown stock / missing metric stay on the unknown dimension.
  if (
    row.eligibleDays30d === null ||
    row.eligibleDays30d >= LIMITED_HISTORY_ELIGIBLE_DAYS
  ) {
    return false;
  }
  return (
    row.coverStatus === "valid" ||
    row.coverStatus === "zero_demand" ||
    row.coverStatus === "stale" ||
    row.coverStatus === "pending_freshness"
  );
}

export function isUnknownDemandEvidence(
  row: MerchantInventoryIntelligenceRow,
): boolean {
  // short_history is limited-history evidence, not unknown demand.
  // Known valid / zero_demand never qualify here — even with sparse eligible days.
  return (
    row.coverStatus === "unknown_demand" ||
    row.coverStatus === "unknown_stock" ||
    row.coverStatus === "missing_metric"
  );
}

export function isStaleOrPendingEvidence(
  row: MerchantInventoryIntelligenceRow,
): boolean {
  return (
    row.coverStatus === "pending_freshness" || row.coverStatus === "stale"
  );
}

/** @deprecated Prefer the separated helpers above. */
export function isLimitedOrUnknownEvidence(
  row: MerchantInventoryIntelligenceRow,
): boolean {
  return (
    isStaleOrPendingEvidence(row) ||
    isUnknownDemandEvidence(row) ||
    isLimitedHistoryEvidence(row)
  );
}

function observationDate(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Grounded attention counts from trusted available qty + days-of-stock fields.
 * Unknown stock (null available) is never counted as out-of-stock.
 * Low/high cover require calculable (valid) cover — otherwise evaluation is unavailable.
 */
export function summarizeMerchantAttention(
  rows: readonly MerchantInventoryIntelligenceRow[],
): MerchantAttentionSummary {
  let lastRecordedOutOfStockCount = 0;
  let lowCoverCount = 0;
  let highCoverReviewCount = 0;
  let limitedHistoryCount = 0;
  let unknownDemandCount = 0;
  let staleOrPendingCount = 0;
  let knownZeroDemandCount = 0;
  let calculableCoverCount = 0;
  let latestObsMs = Number.NEGATIVE_INFINITY;
  let lastObservationDate: string | null = null;

  for (const row of rows) {
    const obs = observationDate(row.observedAt);
    const ms = Date.parse(row.observedAt);
    if (!Number.isNaN(ms) && ms >= latestObsMs) {
      latestObsMs = ms;
      lastObservationDate = obs;
    }

    if (isKnownOutOfStock(row)) {
      lastRecordedOutOfStockCount += 1;
    }
    if (isLowCoverAttention(row)) {
      lowCoverCount += 1;
    }
    if (isHighCoverReview(row)) {
      highCoverReviewCount += 1;
    }
    if (isLimitedHistoryEvidence(row)) {
      limitedHistoryCount += 1;
    }
    if (isUnknownDemandEvidence(row)) {
      unknownDemandCount += 1;
    }
    if (isStaleOrPendingEvidence(row)) {
      staleOrPendingCount += 1;
    }
    if (row.coverStatus === "zero_demand") {
      knownZeroDemandCount += 1;
    }
    if (row.coverStatus === "valid") {
      calculableCoverCount += 1;
    }
  }

  const coverSignalEvaluation: SignalEvaluation =
    calculableCoverCount > 0 ? "evaluated" : "unavailable";

  const limitedOrUnknownEvidenceCount = rows.filter((row) =>
    isLimitedOrUnknownEvidence(row),
  ).length;

  return {
    positionCount: rows.length,
    lastObservationDate,
    lastRecordedOutOfStockCount,
    calculableCoverCount,
    coverSignalEvaluation,
    lowCoverCount: coverSignalEvaluation === "evaluated" ? lowCoverCount : 0,
    highCoverReviewCount:
      coverSignalEvaluation === "evaluated" ? highCoverReviewCount : 0,
    limitedHistoryCount,
    unknownDemandCount,
    staleOrPendingCount,
    knownZeroDemandCount,
    limitedOrUnknownEvidenceCount,
    outOfStockCount: lastRecordedOutOfStockCount,
  };
}

export function attentionFocusToInventoryFilter(
  focus: MerchantAttentionFocus,
): InventoryIntelligenceFilter {
  switch (focus) {
    case "out_of_stock":
      return "out_of_stock";
    case "low_cover":
      return "low_cover";
    case "high_cover_review":
      return "high_cover_review";
    case "limited_history":
      return "limited_history";
    case "unknown_demand":
      return "unknown_or_missing";
    case "pending_or_stale":
      return "pending_or_stale";
    case "limited_or_unknown":
      return "limited_or_unknown";
    case "needs_attention":
      return "needs_attention";
    case "all":
      return "all";
  }
}

export function parseInventoryAttentionFilter(
  value: string | null | undefined,
): InventoryIntelligenceFilter | null {
  if (!value) {
    return null;
  }
  const allowed: InventoryIntelligenceFilter[] = [
    "all",
    "needs_attention",
    "valid_cover",
    "unknown_or_missing",
    "zero_demand",
    "pending_or_stale",
    "out_of_stock",
    "low_cover",
    "high_cover_review",
    "limited_or_unknown",
    "limited_history",
  ];
  return allowed.includes(value as InventoryIntelligenceFilter)
    ? (value as InventoryIntelligenceFilter)
    : null;
}

/** Anchor so Overview deep-links land on SKU evidence, not readiness chrome. */
export const INVENTORY_EVIDENCE_ANCHOR = "inventory-evidence";

export function inventoryFilterHref(
  organizationId: string,
  filter: InventoryIntelligenceFilter,
): string {
  const anchor = `#${INVENTORY_EVIDENCE_ANCHOR}`;
  if (filter === "all") {
    return `/app/${organizationId}/inventory${anchor}`;
  }
  return `/app/${organizationId}/inventory?filter=${encodeURIComponent(filter)}${anchor}`;
}

export function formatObservationDateLabel(isoDate: string | null): string {
  if (!isoDate) {
    return "unknown date";
  }
  const ms = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(ms)) {
    return isoDate;
  }
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
