import {
  isHighCoverReview,
  isKnownOutOfStock,
  isLimitedHistoryEvidence,
  isLimitedOrUnknownEvidence,
  isLowCoverAttention,
} from "@/lib/inventory-intelligence/attention";
import { skuAttentionSortRank } from "@/lib/inventory-intelligence/sku-attention-presentation";
import type {
  InventoryIntelligenceFilter,
  MerchantInventoryIntelligenceRow,
} from "@/lib/inventory-intelligence/types";

export function filterIntelligenceRows(
  rows: readonly MerchantInventoryIntelligenceRow[],
  filter: InventoryIntelligenceFilter,
): MerchantInventoryIntelligenceRow[] {
  switch (filter) {
    case "all":
      return [...rows];
    case "needs_attention":
      // Operational stock signals only (OOS + valid low cover).
      // Data-quality attention stays on pending_or_stale / limited_history /
      // unknown_or_missing / limited_or_unknown — so a fully-stale catalog
      // does not inflate "Needs attention" to every position.
      return rows.filter(
        (row) => isKnownOutOfStock(row) || isLowCoverAttention(row),
      );
    case "valid_cover":
      return rows.filter((row) => row.coverStatus === "valid");
    case "unknown_or_missing":
      // Parity with Overview unknown_demand — short_history is limited_history only.
      return rows.filter((row) =>
        ["unknown_demand", "unknown_stock", "missing_metric"].includes(
          row.coverStatus,
        ),
      );
    case "zero_demand":
      return rows.filter((row) => row.coverStatus === "zero_demand");
    case "pending_or_stale":
      return rows.filter((row) =>
        ["pending_freshness", "stale"].includes(row.coverStatus),
      );
    case "out_of_stock":
      return rows.filter((row) => isKnownOutOfStock(row));
    case "low_cover":
      return rows.filter((row) => isLowCoverAttention(row));
    case "high_cover_review":
      return rows.filter((row) => isHighCoverReview(row));
    case "limited_or_unknown":
      return rows.filter((row) => isLimitedOrUnknownEvidence(row));
    case "limited_history":
      return rows.filter((row) => isLimitedHistoryEvidence(row));
  }
}

/**
 * Attention-first: known OOS, low cover, evidence gaps, high-cover review,
 * then adequate cover, then known-zero demand. Within a band, lower
 * days-of-stock (when present) comes first.
 */
export function prioritizeIntelligenceRows(
  rows: readonly MerchantInventoryIntelligenceRow[],
): MerchantInventoryIntelligenceRow[] {
  return [...rows].sort((left, right) => {
    const rankDelta =
      skuAttentionSortRank(left) - skuAttentionSortRank(right);
    if (rankDelta !== 0) {
      return rankDelta;
    }

    const leftDays = left.daysOfStock;
    const rightDays = right.daysOfStock;
    if (leftDays !== null && rightDays !== null && leftDays !== rightDays) {
      return leftDays - rightDays;
    }

    return left.sku.localeCompare(right.sku);
  });
}
