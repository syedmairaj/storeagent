import { describe, expect, it } from "vitest";

import type { MerchantMetricActivationSummary } from "@/lib/metrics-activation/run-org-recompute";
import {
  planningMetricsRefreshFailureReport,
  reportPlanningMetricsRefresh,
} from "@/lib/planning-inputs/refresh-status";

function summary(
  overrides: Partial<MerchantMetricActivationSummary> = {},
): MerchantMetricActivationSummary {
  return {
    organizationId: "org",
    ticks: 1,
    consumedEvents: 0,
    succeeded: 0,
    failed: 0,
    retryScheduled: 0,
    deferred: 0,
    queueErrors: 0,
    stoppedReason: "drained",
    pendingRemaining: false,
    unconsumedSourceEvents: 0,
    openRecomputeRequests: 0,
    ...overrides,
  };
}

describe("planning metrics refresh reporting", () => {
  it("does not claim ready when pending work remains", () => {
    const report = reportPlanningMetricsRefresh(
      summary({
        succeeded: 2,
        pendingRemaining: true,
        openRecomputeRequests: 3,
        stoppedReason: "max_ticks",
      }),
    );
    expect(report.status).toBe("pending");
    expect(report.pendingRemaining).toBe(true);
    expect(report.note).toMatch(/still pending/i);
    expect(report.note).not.toMatch(/thresholds refreshed/i);
  });

  it("reports ready only after a successful drain with no pending work", () => {
    const report = reportPlanningMetricsRefresh(
      summary({
        succeeded: 1,
        pendingRemaining: false,
        stoppedReason: "drained",
      }),
    );
    expect(report.status).toBe("ready");
    expect(report.pendingRemaining).toBe(false);
    expect(report.note).toMatch(/thresholds refreshed/i);
    expect(report.note).toMatch(/Commercial actions stay disabled/);
  });

  it("reports retryable when refresh fails after a successful planning save", () => {
    const report = planningMetricsRefreshFailureReport();
    expect(report.status).toBe("retryable");
    expect(report.pendingRemaining).toBe(true);
    expect(report.note).toMatch(/did not finish/i);
  });
});
