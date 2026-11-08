import type { InventoryPlanningSettings } from "@/lib/metrics/inventory-aggregates";
import { EMPTY_MERCHANT_PLANNING_INPUTS } from "@/lib/planning-inputs/types";

/**
 * Normalize trusted planning JSON / row values into InventoryPlanningSettings.
 * Preserves null=unknown and numeric 0=known zero. Rejects non-integers.
 */
export function toInventoryPlanningSettings(
  raw: unknown,
): InventoryPlanningSettings {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { ...EMPTY_MERCHANT_PLANNING_INPUTS };
  }

  const row = raw as Record<string, unknown>;

  return {
    leadTimeDays: asPlanningDay(row.leadTimeDays ?? row.lead_time_days),
    safetyStockDays: asPlanningDay(
      row.safetyStockDays ?? row.safety_stock_days,
    ),
    reviewPeriodDays: asPlanningDay(
      row.reviewPeriodDays ?? row.review_period_days,
    ),
  };
}

function asPlanningDay(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(
      "organization planning days must be null or a non-negative integer.",
    );
  }

  return value;
}
