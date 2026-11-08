import {
  coverPriorityRank,
} from "@/lib/inventory-intelligence/classify-cover";
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
      return rows.filter((row) => {
        if (
          row.coverStatus === "pending_freshness" ||
          row.coverStatus === "stale" ||
          row.coverStatus === "short_history" ||
          row.coverStatus === "unknown_demand" ||
          row.coverStatus === "unknown_stock" ||
          row.coverStatus === "missing_metric"
        ) {
          return true;
        }
        return (
          row.coverStatus === "valid" &&
          row.daysOfStock !== null &&
          row.daysOfStock < 14
        );
      });
    case "valid_cover":
      return rows.filter((row) => row.coverStatus === "valid");
    case "unknown_or_missing":
      return rows.filter((row) =>
        ["unknown_demand", "unknown_stock", "missing_metric", "short_history"].includes(
          row.coverStatus,
        ),
      );
    case "zero_demand":
      return rows.filter((row) => row.coverStatus === "zero_demand");
    case "pending_or_stale":
      return rows.filter((row) =>
        ["pending_freshness", "stale"].includes(row.coverStatus),
      );
  }
}

/**
 * Attention-first: low valid cover, then pending/stale/unknown, then zero demand.
 * Within the same status, lower days-of-stock (when present) comes first.
 */
export function prioritizeIntelligenceRows(
  rows: readonly MerchantInventoryIntelligenceRow[],
): MerchantInventoryIntelligenceRow[] {
  return [...rows].sort((left, right) => {
    const leftValidLow =
      left.coverStatus === "valid" &&
      left.daysOfStock !== null &&
      left.daysOfStock < 14;
    const rightValidLow =
      right.coverStatus === "valid" &&
      right.daysOfStock !== null &&
      right.daysOfStock < 14;

    if (leftValidLow !== rightValidLow) {
      return leftValidLow ? -1 : 1;
    }

    const rankDelta =
      coverPriorityRank(left.coverStatus) -
      coverPriorityRank(right.coverStatus);
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
