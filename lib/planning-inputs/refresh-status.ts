import type { MerchantMetricActivationSummary } from "@/lib/metrics-activation/run-org-recompute";
import {
  resolveMerchantMetricsActivationStatus,
  type MerchantMetricsActivationStatus,
} from "@/lib/metrics-activation/merchant-copy";

export type PlanningMetricsRefreshStatus = MerchantMetricsActivationStatus;

export type PlanningMetricsRefreshReport = {
  status: PlanningMetricsRefreshStatus;
  note: string;
  pendingRemaining: boolean;
  succeeded: number;
  stoppedReason: string;
};

/**
 * Honest post-save threshold-refresh reporting.
 * Never claims metrics ready when a bounded drain left pending work.
 */
export function reportPlanningMetricsRefresh(
  summary: MerchantMetricActivationSummary,
): PlanningMetricsRefreshReport {
  const status = resolveMerchantMetricsActivationStatus(summary);
  return {
    status,
    note: planningMetricsRefreshNote(status, summary),
    pendingRemaining: summary.pendingRemaining || status === "pending",
    succeeded: summary.succeeded,
    stoppedReason: summary.stoppedReason,
  };
}

export function planningMetricsRefreshFailureReport(): PlanningMetricsRefreshReport {
  return {
    status: "retryable",
    note:
      "Planning inputs saved, but threshold refresh did not finish. Current inventory metrics may still show previous thresholds until you activate demand metrics again. Commercial actions stay disabled.",
    pendingRemaining: true,
    succeeded: 0,
    stoppedReason: "queue_error",
  };
}

function planningMetricsRefreshNote(
  status: PlanningMetricsRefreshStatus,
  summary: Pick<
    MerchantMetricActivationSummary,
    "succeeded" | "pendingRemaining" | "openRecomputeRequests"
  >,
): string {
  switch (status) {
    case "ready":
      return summary.succeeded > 0
        ? `Planning inputs saved. Current inventory thresholds refreshed from organization defaults for ${summary.succeeded} SKU-day record(s). These are merchant assumptions, not verified supplier facts. Commercial actions stay disabled.`
        : "Planning inputs saved. No current metric grains required threshold refresh. Blank stays unknown — 0 is an explicit zero. Commercial actions stay disabled.";
    case "pending":
      return `Planning inputs saved, but threshold refresh is still pending (${summary.openRecomputeRequests} open recompute request(s)). Current metrics may lag until refresh finishes. Commercial actions stay disabled.`;
    case "retryable":
      return "Planning inputs saved, but threshold refresh needs another try. Current metrics may still show previous thresholds. Use Activate demand metrics to continue. Commercial actions stay disabled.";
    case "idle":
      return "Planning inputs saved. No current metric grains required threshold refresh. Blank stays unknown — 0 is an explicit zero. Commercial actions stay disabled.";
  }
}
