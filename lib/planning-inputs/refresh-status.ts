import type { MerchantMetricActivationSummary } from "@/lib/metrics-activation/run-org-recompute";
import {
  resolveMerchantMetricsActivationStatus,
  type MerchantMetricsActivationStatus,
} from "@/lib/metrics-activation/merchant-copy";
import {
  classifyMerchantPlanningConfiguration,
  type MerchantPlanningConfigurationKind,
} from "@/lib/planning-inputs/merchant-copy";
import { presentPlanningSaveFeedback } from "@/lib/planning-inputs/save-feedback";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

export type PlanningMetricsRefreshStatus = MerchantMetricsActivationStatus;

export type PlanningMetricsRefreshReport = {
  status: PlanningMetricsRefreshStatus;
  note: string;
  pendingRemaining: boolean;
  succeeded: number;
  stoppedReason: string;
  configurationKind?: MerchantPlanningConfigurationKind;
};

/**
 * Honest post-save threshold-refresh reporting.
 * Never claims metrics ready when a bounded drain left pending work.
 * Never claims thresholds are available when required assumptions are blank.
 * Never equates “no refresh required” with current metrics.
 */
export function reportPlanningMetricsRefresh(
  summary: MerchantMetricActivationSummary,
  savedInputs?: MerchantPlanningInputs,
): PlanningMetricsRefreshReport {
  const status = resolveMerchantMetricsActivationStatus(summary);
  const configurationKind = savedInputs
    ? classifyMerchantPlanningConfiguration(savedInputs)
    : undefined;
  const base: PlanningMetricsRefreshReport = {
    status,
    note: "",
    pendingRemaining: summary.pendingRemaining || status === "pending",
    succeeded: summary.succeeded,
    stoppedReason: summary.stoppedReason,
    configurationKind,
  };
  base.note = presentPlanningSaveFeedback(base).note;
  return base;
}

export function planningMetricsRefreshFailureReport(
  savedInputs?: MerchantPlanningInputs,
): PlanningMetricsRefreshReport {
  const configurationKind = savedInputs
    ? classifyMerchantPlanningConfiguration(savedInputs)
    : undefined;
  const base: PlanningMetricsRefreshReport = {
    status: "retryable",
    note: "",
    pendingRemaining: true,
    succeeded: 0,
    stoppedReason: "queue_error",
    configurationKind,
  };
  base.note = presentPlanningSaveFeedback(base).note;
  return base;
}
