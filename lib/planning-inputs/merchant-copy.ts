import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

/**
 * Merchant-facing replenishment copy. Placeholders are illustrative examples only —
 * never treated as persisted defaults (blank still saves as NULL).
 */
export const REPLENISHMENT_FIELD_COPY = {
  leadTimeDays: {
    id: "lead-time-days",
    label: "Lead time (days)",
    placeholder: "e.g. 7",
    hint: "Days from placing a replenishment order until stock arrives. Leave blank when unknown; 0 means same-day replenishment as an assumption, not a supplier fact.",
  },
  safetyStockDays: {
    id: "safety-stock-days",
    label: "Safety stock (days)",
    placeholder: "e.g. 5",
    hint: "Extra days of demand kept as a buffer. Leave blank when unknown; 0 means no extra buffer by assumption.",
  },
  reviewPeriodDays: {
    id: "review-period-days",
    label: "Review period (days)",
    placeholder: "e.g. 7",
    hint: "How often you check stock and plan replenishment. Leave blank when unknown; 0 is an explicit zero cadence assumption.",
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
  return value === null ? "unknown" : String(value);
}

export function formatPersistedPlanningSummary(
  inputs: MerchantPlanningInputs,
): string {
  return `lead ${formatPersistedPlanningDay(inputs.leadTimeDays)}, safety ${formatPersistedPlanningDay(inputs.safetyStockDays)}, review ${formatPersistedPlanningDay(inputs.reviewPeriodDays)}`;
}
