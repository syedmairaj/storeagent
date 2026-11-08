import type { InventoryCoverStatus } from "@/lib/inventory-intelligence/types";

export type CoverClassificationInput = {
  availableQuantity: number | null;
  hasPendingMetricWork: boolean;
  asOfMetricDate: string | null;
  metricDate: string | null;
  salesVelocity30d: number | null;
  salesVelocity30dReasonCode: string | null;
  eligibleDays30d: number | null;
  daysOfStock: number | null;
  daysOfStockReasonCode: string | null;
};

/**
 * Fail-closed cover status from persisted metric fields.
 * Does not recompute days-of-stock or velocity.
 */
export function classifyInventoryCoverStatus(
  input: CoverClassificationInput,
): InventoryCoverStatus {
  if (input.hasPendingMetricWork) {
    return "pending_freshness";
  }

  if (input.availableQuantity === null) {
    return "unknown_stock";
  }

  if (input.metricDate === null) {
    return "missing_metric";
  }

  if (
    input.asOfMetricDate !== null &&
    input.metricDate !== input.asOfMetricDate
  ) {
    return "stale";
  }

  if (input.daysOfStockReasonCode === "zero_demand") {
    return "zero_demand";
  }

  if (
    input.salesVelocity30d === 0 ||
    (input.salesVelocity30d === null &&
      input.salesVelocity30dReasonCode === "zero_demand")
  ) {
    return "zero_demand";
  }

  if (
    input.salesVelocity30d === null &&
    input.salesVelocity30dReasonCode === "no_eligible_days"
  ) {
    return "short_history";
  }

  if (
    input.daysOfStock !== null &&
    input.daysOfStockReasonCode === null &&
    input.salesVelocity30d !== null
  ) {
    return "valid";
  }

  if (
    input.salesVelocity30d === null ||
    input.daysOfStock === null ||
    input.daysOfStockReasonCode === "demand_unknown" ||
    input.daysOfStockReasonCode === "inventory_unknown" ||
    input.salesVelocity30dReasonCode === "demand_unknown"
  ) {
    return "unknown_demand";
  }

  return "unknown_demand";
}

/** Merchant copy: limited history when eligible days are sparse (not forecast confidence). */
const LIMITED_HISTORY_ELIGIBLE_DAYS = 7;

export function coverEvidenceLabel(input: {
  status: InventoryCoverStatus;
  daysOfStock: number | null;
  salesVelocity30d: number | null;
  eligibleDays30d: number | null;
  metricDate: string | null;
  asOfMetricDate: string | null;
}): string {
  switch (input.status) {
    case "pending_freshness":
      return "Demand metrics are still updating — stock cover unavailable.";
    case "unknown_stock":
      return "Available quantity is unknown on the latest observation.";
    case "missing_metric":
      return "No demand metric for this SKU, store, and location yet.";
    case "stale":
      return input.metricDate && input.asOfMetricDate
        ? `Metric date ${input.metricDate} is behind store-local ${input.asOfMetricDate} — stock cover unavailable.`
        : "Demand metric is not current for this store — stock cover unavailable.";
    case "short_history":
      return input.eligibleDays30d === null
        ? "Limited history in the 30-day window — stock cover unavailable."
        : `Limited history: ${input.eligibleDays30d} of 30 days — stock cover unavailable.`;
    case "unknown_demand":
      return "Demand velocity is unknown — not treated as zero. Stock cover unavailable.";
    case "zero_demand": {
      const parts = ["No sales observed"];
      if (input.eligibleDays30d !== null) {
        if (input.eligibleDays30d < LIMITED_HISTORY_ELIGIBLE_DAYS) {
          parts.push(
            `Limited history: ${input.eligibleDays30d} of 30 days`,
          );
        } else {
          parts.push(`${input.eligibleDays30d} of 30 eligible days`);
        }
      }
      parts.push("Stock cover unavailable");
      return parts.join(" · ");
    }
    case "valid": {
      const days =
        input.daysOfStock === null
          ? "—"
          : Number.isInteger(input.daysOfStock)
            ? String(input.daysOfStock)
            : input.daysOfStock.toFixed(1);
      const eligible =
        input.eligibleDays30d === null
          ? ""
          : input.eligibleDays30d < LIMITED_HISTORY_ELIGIBLE_DAYS
            ? ` · Limited history: ${input.eligibleDays30d} of 30 days`
            : ` · ${input.eligibleDays30d} of 30 eligible days`;
      return `${days} days of stock from known velocity${eligible}`;
    }
  }
}

/** Lower numbers sort first (attention first). */
export function coverPriorityRank(status: InventoryCoverStatus): number {
  switch (status) {
    case "pending_freshness":
      return 10;
    case "valid":
      return 20;
    case "stale":
      return 30;
    case "short_history":
      return 40;
    case "unknown_demand":
      return 50;
    case "unknown_stock":
      return 60;
    case "missing_metric":
      return 70;
    case "zero_demand":
      return 80;
  }
}
