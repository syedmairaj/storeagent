import type { MerchantMetricActivationSummary } from "@/lib/metrics-activation/run-org-recompute";
import {
  resolveMerchantMetricsActivationStatus,
  type MerchantMetricsActivationStatus,
} from "@/lib/metrics-activation/merchant-copy";
import {
  classifyMerchantPlanningConfiguration,
  formatPersistedPlanningSummary,
  type MerchantPlanningConfigurationKind,
} from "@/lib/planning-inputs/merchant-copy";
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
 * Never claims thresholds are available when required assumptions are unknown.
 */
export function reportPlanningMetricsRefresh(
  summary: MerchantMetricActivationSummary,
  savedInputs?: MerchantPlanningInputs,
): PlanningMetricsRefreshReport {
  const status = resolveMerchantMetricsActivationStatus(summary);
  const configurationKind = savedInputs
    ? classifyMerchantPlanningConfiguration(savedInputs)
    : undefined;
  return {
    status,
    note: planningMetricsRefreshNote(status, summary, savedInputs),
    pendingRemaining: summary.pendingRemaining || status === "pending",
    succeeded: summary.succeeded,
    stoppedReason: summary.stoppedReason,
    configurationKind,
  };
}

export function planningMetricsRefreshFailureReport(
  savedInputs?: MerchantPlanningInputs,
): PlanningMetricsRefreshReport {
  const configurationKind = savedInputs
    ? classifyMerchantPlanningConfiguration(savedInputs)
    : undefined;
  const prefix = savedInputs
    ? `Replenishment settings saved (${formatPersistedPlanningSummary(savedInputs)})`
    : "Replenishment settings saved";
  return {
    status: "retryable",
    note: `${prefix}, but threshold refresh did not finish. Current inventory metrics may still show previous thresholds until you activate demand metrics again. Commercial actions stay disabled.`,
    pendingRemaining: true,
    succeeded: 0,
    stoppedReason: "queue_error",
    configurationKind,
  };
}

function planningMetricsRefreshNote(
  status: PlanningMetricsRefreshStatus,
  summary: Pick<
    MerchantMetricActivationSummary,
    "succeeded" | "pendingRemaining" | "openRecomputeRequests"
  >,
  savedInputs?: MerchantPlanningInputs,
): string {
  if (!savedInputs) {
    return genericRefreshNote(status, summary);
  }

  const kind = classifyMerchantPlanningConfiguration(savedInputs);
  const summaryText = formatPersistedPlanningSummary(savedInputs);
  const commercial =
    "Commercial actions stay disabled.";

  switch (status) {
    case "ready":
      return readyNoteForConfiguration(kind, summaryText, summary.succeeded, commercial);
    case "pending":
      return `Replenishment settings saved (${summaryText}), but threshold refresh is still pending (${summary.openRecomputeRequests} open recompute request(s)). Current metrics may lag until refresh finishes. ${commercial}`;
    case "retryable":
      return `Replenishment settings saved (${summaryText}), but threshold refresh needs another try. Current metrics may still show previous thresholds. Use Activate demand metrics to continue. ${commercial}`;
    case "idle":
      return readyNoteForConfiguration(kind, summaryText, 0, commercial);
  }
}

function readyNoteForConfiguration(
  kind: MerchantPlanningConfigurationKind,
  summaryText: string,
  succeeded: number,
  commercial: string,
): string {
  switch (kind) {
    case "all_blank":
      return succeeded > 0
        ? `Replenishment settings saved as unknown (${summaryText}). Metrics were recalculated for ${succeeded} SKU-day record(s), but reorder thresholds remain unavailable while these assumptions are unknown. Blank stays unknown — 0 is an explicit zero. ${commercial}`
        : `Replenishment settings saved as unknown (${summaryText}). No reorder thresholds are available from these assumptions. Blank stays unknown — 0 is an explicit zero. ${commercial}`;
    case "partial":
      return succeeded > 0
        ? `Replenishment settings saved with some values still unknown (${summaryText}). Metrics were recalculated for ${succeeded} SKU-day record(s); thresholds that need missing assumptions stay unavailable. Blank stays unknown — 0 is an explicit zero. ${commercial}`
        : `Replenishment settings saved with some values still unknown (${summaryText}). Thresholds that need missing assumptions stay unavailable. Blank stays unknown — 0 is an explicit zero. ${commercial}`;
    case "complete":
      return succeeded > 0
        ? `Replenishment settings saved (${summaryText}). Current inventory thresholds refreshed from these organization defaults for ${succeeded} SKU-day record(s). These are merchant assumptions, not verified supplier facts. ${commercial}`
        : `Replenishment settings saved (${summaryText}). No current metric grains required threshold refresh. Blank stays unknown — 0 is an explicit zero. ${commercial}`;
  }
}

function genericRefreshNote(
  status: PlanningMetricsRefreshStatus,
  summary: Pick<
    MerchantMetricActivationSummary,
    "succeeded" | "pendingRemaining" | "openRecomputeRequests"
  >,
): string {
  const commercial = "Commercial actions stay disabled.";
  switch (status) {
    case "ready":
      return summary.succeeded > 0
        ? `Saved. Current inventory metrics refreshed for ${summary.succeeded} SKU-day record(s). ${commercial}`
        : `Saved. No current metric grains required refresh. ${commercial}`;
    case "pending":
      return `Saved, but metric refresh is still pending (${summary.openRecomputeRequests} open recompute request(s)). ${commercial}`;
    case "retryable":
      return `Saved, but metric refresh needs another try. Use Activate demand metrics to continue. ${commercial}`;
    case "idle":
      return `Saved. No current metric grains required refresh. ${commercial}`;
  }
}
