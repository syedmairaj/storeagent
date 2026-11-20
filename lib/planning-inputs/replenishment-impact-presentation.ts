/**
 * UX-INV-1c — merchant presentation for replenishment assumptions → thresholds.
 * Presentation only: no formula, schema, or commercial unlock changes.
 */

import {
  classifyMerchantPlanningConfiguration,
  formatPersistedPlanningDay,
  formatPersistedPlanningSummary,
  type MerchantPlanningConfigurationKind,
} from "@/lib/planning-inputs/merchant-copy";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

export type ReplenishmentFieldKey =
  | "leadTimeDays"
  | "safetyStockDays"
  | "reviewPeriodDays";

export type ReplenishmentFieldExplainer = {
  key: ReplenishmentFieldKey;
  label: string;
  shortLabel: string;
  meaning: string;
  drives: string;
  persistedLabel: string;
};

export type ReplenishmentImpactPresentation = {
  configurationKind: MerchantPlanningConfigurationKind;
  eyebrow: string;
  headline: string;
  supporting: string;
  persistedSummary: string;
  impactBridge: string;
  fieldExplainers: readonly ReplenishmentFieldExplainer[];
  nextStep: string;
  commercialFence: string;
};

export type CalculatedThresholdBits = {
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  metricDate: string | null;
  historical: boolean;
};

const COMMERCIAL_FENCE =
  "Commercial recommendations stay unauthorized — these settings never place or approve a purchase.";

export function buildReplenishmentImpactPresentation(
  inputs: MerchantPlanningInputs,
): ReplenishmentImpactPresentation {
  const configurationKind = classifyMerchantPlanningConfiguration(inputs);
  const persistedSummary = formatPersistedPlanningSummary(inputs);

  const fieldExplainers: ReplenishmentFieldExplainer[] = [
    {
      key: "leadTimeDays",
      label: "Supplier lead time",
      shortLabel: "Lead",
      meaning:
        "Your assumed days from placing an order until stock arrives.",
      drives: "Feeds reorder point — when to review replenishment.",
      persistedLabel: formatDayWithKnownZero(inputs.leadTimeDays, "day"),
    },
    {
      key: "safetyStockDays",
      label: "Safety stock buffer",
      shortLabel: "Safety",
      meaning:
        "Extra demand days kept as a cushion against delay or spikes.",
      drives: "Feeds safety stock — a buffer quantity, not a buy amount.",
      persistedLabel: formatDayWithKnownZero(inputs.safetyStockDays, "day"),
    },
    {
      key: "reviewPeriodDays",
      label: "Stock review frequency",
      shortLabel: "Review",
      meaning: "How often you review stock and plan the next cycle.",
      drives: "Feeds target stock — a planning ceiling, not an order quantity.",
      persistedLabel: formatDayWithKnownZero(inputs.reviewPeriodDays, "day"),
    },
  ];

  switch (configurationKind) {
    case "all_blank":
      return {
        configurationKind,
        eyebrow: "Your replenishment assumptions",
        headline: "Replenishment settings",
        supporting:
          "Set supplier lead time, safety stock buffer, and stock review frequency. These are your assumptions — not verified supplier facts. Blank stays blank (never zero). Field examples are illustrations only.",
        persistedSummary,
        impactBridge:
          "No planning days are saved yet, so safety stock, reorder point, and target stock stay unavailable.",
        fieldExplainers,
        nextStep:
          "Save all three days, then inspect a product to see calculated thresholds.",
        commercialFence: COMMERCIAL_FENCE,
      };
    case "partial":
      return {
        configurationKind,
        eyebrow: "Your replenishment assumptions",
        headline: "Replenishment settings",
        supporting:
          "Partial assumptions save as-is. Blank days stay blank (never zero), so some thresholds may stay unavailable until all three are set. Still assumptions — not verified supplier facts.",
        persistedSummary,
        impactBridge: `Saved assumptions: ${humanPersistedSummary(inputs)}. Complete the blank day(s) before all calculated thresholds unlock.`,
        fieldExplainers,
        nextStep:
          "Fill the remaining blank day(s) and save, then inspect a product for threshold impact.",
        commercialFence: COMMERCIAL_FENCE,
      };
    case "complete":
      return {
        configurationKind,
        eyebrow: "Your replenishment assumptions",
        headline: "Replenishment settings",
        supporting:
          "These organization defaults drive calculated planning thresholds. They are your assumptions — not verified supplier or SKU facts.",
        persistedSummary,
        impactBridge: `Saved assumptions: ${humanPersistedSummary(inputs)}. They calculate safety stock, reorder point, and target stock — planning thresholds, not purchase quantities.`,
        fieldExplainers,
        nextStep:
          "Inspect a product above to see SKU-specific thresholds from these assumptions.",
        commercialFence: COMMERCIAL_FENCE,
      };
  }
}

/** Compact line for SKU inspector — uses only persisted planning inputs. */
export function formatPlanningAssumptionsForInspector(
  inputs: MerchantPlanningInputs | null | undefined,
): string | null {
  if (!inputs) {
    return null;
  }
  const kind = classifyMerchantPlanningConfiguration(inputs);
  if (kind === "all_blank") {
    return "No replenishment assumptions saved yet — calculated thresholds stay unavailable.";
  }
  return `Assumptions in use: ${humanPersistedSummary(inputs)}${
    kind === "partial" ? " (partial — some thresholds may be missing)" : ""
  }`;
}

/**
 * Merchant-facing threshold fact line from persisted metric values only.
 * Never invents quantities; callers must pass already-known thresholds.
 */
export function formatCalculatedThresholdsValue(
  bits: CalculatedThresholdBits,
): string | null {
  const parts: string[] = [];
  if (bits.safetyStock !== null) {
    parts.push(`Safety stock ${bits.safetyStock}`);
  }
  if (bits.reorderPoint !== null) {
    parts.push(`Reorder point ${bits.reorderPoint}`);
  }
  if (bits.targetStock !== null) {
    parts.push(`Target stock ${bits.targetStock}`);
  }
  if (parts.length === 0) {
    return null;
  }

  const metricStamp = bits.metricDate ? ` · metric ${bits.metricDate}` : "";
  const historyNote = bits.historical
    ? " · historical while cover is not current"
    : "";
  return `${parts.join(" · ")}${metricStamp}${historyNote}`;
}

export function calculatedThresholdsMissingLabel(): string {
  return "Calculated safety stock / reorder point / target stock";
}

export function calculatedThresholdsSectionLabel(historical: boolean): string {
  return historical
    ? "Historical calculated thresholds"
    : "Calculated planning thresholds";
}

export function calculatedThresholdsMissingCopy(): string {
  return "Safety stock, reorder point, and target stock are not available as known calculated thresholds for this grain.";
}

function formatDayWithKnownZero(
  value: number | null,
  unit: "day",
): string {
  if (value === null) {
    return "blank";
  }
  if (value === 0) {
    return `0 ${unit}s (known zero)`;
  }
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function humanPersistedSummary(inputs: MerchantPlanningInputs): string {
  return `lead ${formatPersistedPlanningDay(inputs.leadTimeDays)} · safety ${formatPersistedPlanningDay(inputs.safetyStockDays)} · review ${formatPersistedPlanningDay(inputs.reviewPeriodDays)}`;
}
