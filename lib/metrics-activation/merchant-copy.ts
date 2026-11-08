import type { MerchantMetricActivationSummary } from "@/lib/metrics-activation/run-org-recompute";

export type MerchantMetricsActivationStatus =
  | "ready"
  | "pending"
  | "retryable"
  | "idle";

export function resolveMerchantMetricsActivationStatus(
  summary: Pick<
    MerchantMetricActivationSummary,
    | "succeeded"
    | "failed"
    | "retryScheduled"
    | "queueErrors"
    | "stoppedReason"
    | "pendingRemaining"
  >,
): MerchantMetricsActivationStatus {
  if (summary.queueErrors > 0 || summary.failed > 0) {
    return "retryable";
  }
  if (
    summary.pendingRemaining ||
    summary.stoppedReason === "max_ticks" ||
    summary.stoppedReason === "budget" ||
    summary.retryScheduled > 0
  ) {
    return "pending";
  }
  if (summary.succeeded > 0) {
    return "ready";
  }
  return "idle";
}

export function merchantMetricsActivationNote(
  status: MerchantMetricsActivationStatus,
  summary: Pick<MerchantMetricActivationSummary, "succeeded">,
): string {
  switch (status) {
    case "ready":
      return summary.succeeded > 0
        ? `Demand metrics updated for your organization (${summary.succeeded} SKU-day record(s)). Days-of-stock cover uses only current, matching store and location demand — unknown demand is not treated as zero.`
        : "Demand metrics are current for your organization. Cover uses only current, matching store and location demand.";
    case "pending":
      return "Sales are saved. Demand metrics are still updating — run Activate demand metrics again if cover stays blocked.";
    case "retryable":
      return "Sales are saved, but demand metrics need another try. Use Activate demand metrics to continue. Cover stays blocked until current demand is ready.";
    case "idle":
      return "No new sales changes needed demand updates. If cover stays blocked, confirm inventory matches the sold SKU, store, and location, then activate demand metrics.";
  }
}
