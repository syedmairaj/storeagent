import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

/**
 * Merchant-facing replenishment copy. Placeholders are illustrative examples only —
 * never treated as persisted defaults (blank still saves as NULL).
 */
export const REPLENISHMENT_FIELD_COPY = {
  leadTimeDays: {
    id: "lead-time-days",
    label: "Supplier lead time (days)",
    placeholder: "e.g. 7",
    hint: "Your assumed days from order to arrival. Blank stays blank (not zero). 0 means same-day by assumption — not a verified supplier fact.",
  },
  safetyStockDays: {
    id: "safety-stock-days",
    label: "Safety stock buffer (days)",
    placeholder: "e.g. 5",
    hint: "Extra demand days you keep as a cushion. Blank stays blank (not zero). Feeds calculated safety stock — not a buy quantity.",
  },
  reviewPeriodDays: {
    id: "review-period-days",
    label: "Stock review frequency (days)",
    placeholder: "e.g. 7",
    hint: "How often you review stock and plan replenishment. Blank stays blank (not zero). Feeds calculated target stock — not an order quantity.",
  },
} as const;

export type MerchantPlanningConfigurationKind =
  | "all_blank"
  | "partial"
  | "complete";

export function classifyMerchantPlanningConfiguration(
  inputs: MerchantPlanningInputs,
): MerchantPlanningConfigurationKind {
  const values = [
    inputs.leadTimeDays,
    inputs.safetyStockDays,
    inputs.reviewPeriodDays,
  ];
  const knownCount = values.filter((value) => value !== null).length;
  if (knownCount === 0) {
    return "all_blank";
  }
  if (knownCount === values.length) {
    return "complete";
  }
  return "partial";
}

export function formatPersistedPlanningDay(value: number | null): string {
  return value === null ? "blank" : String(value);
}

export function formatPersistedPlanningSummary(
  inputs: MerchantPlanningInputs,
): string {
  return `lead ${formatPersistedPlanningDay(inputs.leadTimeDays)}, safety ${formatPersistedPlanningDay(inputs.safetyStockDays)}, review ${formatPersistedPlanningDay(inputs.reviewPeriodDays)}`;
}
