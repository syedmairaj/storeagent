import { describe, expect, it } from "vitest";

import type { MerchantMetricActivationSummary } from "@/lib/metrics-activation/run-org-recompute";
import {
  planningMetricsRefreshFailureReport,
  reportPlanningMetricsRefresh,
} from "@/lib/planning-inputs/refresh-status";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

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

const complete: MerchantPlanningInputs = {
  leadTimeDays: 7,
  safetyStockDays: 5,
  reviewPeriodDays: 7,
};

const partial: MerchantPlanningInputs = {
  leadTimeDays: 7,
  safetyStockDays: null,
  reviewPeriodDays: 0,
};

const allBlank: MerchantPlanningInputs = {
  leadTimeDays: null,
  safetyStockDays: null,
  reviewPeriodDays: null,
};

describe("planning metrics refresh reporting", () => {
  it("does not claim ready when pending work remains", () => {
    const report = reportPlanningMetricsRefresh(
      summary({
        succeeded: 2,
        pendingRemaining: true,
        openRecomputeRequests: 3,
        stoppedReason: "max_ticks",
      }),
      complete,
    );
    expect(report.status).toBe("pending");
    expect(report.pendingRemaining).toBe(true);
    expect(report.note).toMatch(/still pending/i);
    expect(report.note).not.toMatch(/thresholds refreshed/i);
    expect(report.note).toMatch(/lead 7, safety 5, review 7/);
  });

  it("reports complete saves with exact persisted values and threshold refresh", () => {
    const report = reportPlanningMetricsRefresh(
      summary({
        succeeded: 1,
        pendingRemaining: false,
        stoppedReason: "drained",
      }),
      complete,
    );
    expect(report.status).toBe("ready");
    expect(report.configurationKind).toBe("complete");
    expect(report.pendingRemaining).toBe(false);
    expect(report.note).toMatch(/Replenishment settings saved \(lead 7, safety 5, review 7\)/);
    expect(report.note).toMatch(/thresholds refreshed/i);
    expect(report.note).toMatch(/Commercial actions stay disabled/);
  });

  it("does not claim thresholds available for all-blank saves even after recompute", () => {
    const report = reportPlanningMetricsRefresh(
      summary({
        succeeded: 20,
        pendingRemaining: false,
        stoppedReason: "drained",
      }),
      allBlank,
    );
    expect(report.configurationKind).toBe("all_blank");
    expect(report.note).toMatch(/saved as unknown/i);
    expect(report.note).toMatch(/lead unknown, safety unknown, review unknown/);
    expect(report.note).toMatch(/thresholds remain unavailable/i);
    expect(report.note).not.toMatch(/thresholds refreshed from/i);
    expect(report.note).not.toMatch(/organization defaults for/);
  });

  it("keeps partial saves honest about missing assumptions", () => {
    const report = reportPlanningMetricsRefresh(
      summary({
        succeeded: 4,
        pendingRemaining: false,
        stoppedReason: "drained",
      }),
      partial,
    );
    expect(report.configurationKind).toBe("partial");
    expect(report.note).toMatch(/some values still unknown/i);
    expect(report.note).toMatch(/lead 7, safety unknown, review 0/);
    expect(report.note).toMatch(/stay unavailable/i);
    expect(report.note).not.toMatch(/thresholds refreshed from/i);
  });

  it("reports retryable when refresh fails after a successful planning save", () => {
    const report = planningMetricsRefreshFailureReport(complete);
    expect(report.status).toBe("retryable");
    expect(report.pendingRemaining).toBe(true);
    expect(report.note).toMatch(/did not finish/i);
    expect(report.note).toMatch(/lead 7, safety 5, review 7/);
  });
});
