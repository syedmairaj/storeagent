/**
 * UX-INV-1c.1 — compact, truthful post-save feedback for replenishment settings.
 * Presentation only: never claims metrics are current when no refresh ran.
 */

import type { MerchantMetricsActivationStatus } from "@/lib/metrics-activation/merchant-copy";
import type { MerchantPlanningConfigurationKind } from "@/lib/planning-inputs/merchant-copy";

export type PlanningSaveFeedbackInput = {
  status: MerchantMetricsActivationStatus;
  succeeded: number;
  pendingRemaining: boolean;
  configurationKind?: MerchantPlanningConfigurationKind;
};

export type PlanningSaveFeedback = {
  headline: string;
  /** State-specific warning only — omitted when nothing truthful to add. */
  warning: string | null;
  /** Combined note for callers that still read metricsRefresh.note. */
  note: string;
};

const HEADLINE = "Settings saved";

/**
 * Split a refresh report into a short merchant headline + optional warning.
 * Does not invent refresh success when succeeded === 0.
 */
export function presentPlanningSaveFeedback(
  report: PlanningSaveFeedbackInput,
): PlanningSaveFeedback {
  const warning = saveFeedbackWarning(report);
  return {
    headline: HEADLINE,
    warning,
    note: warning ? `${HEADLINE}. ${warning}` : HEADLINE,
  };
}

function saveFeedbackWarning(
  report: PlanningSaveFeedbackInput,
): string | null {
  const kind = report.configurationKind;

  if (report.status === "pending") {
    return "Threshold refresh is still pending. Shown SKU thresholds may lag until refresh finishes.";
  }

  if (report.status === "retryable") {
    return "Threshold refresh did not finish. Shown SKU thresholds may still be previous values — activate demand metrics to continue.";
  }

  // ready / idle
  if (kind === "all_blank") {
    return "All planning days are blank. Calculated thresholds stay unavailable — blank is never treated as zero.";
  }

  if (kind === "partial") {
    return "Some planning days are still blank. Thresholds that need those days stay unavailable — blank is never treated as zero.";
  }

  if (report.succeeded > 0) {
    return `Planning thresholds refreshed for ${report.succeeded} SKU-day record(s). These are your assumptions, not verified supplier facts.`;
  }

  // succeeded === 0 must NOT mean “metrics are current”.
  return "No matching SKU-day records needed a threshold refresh. This does not mean inventory metrics are already current.";
}
