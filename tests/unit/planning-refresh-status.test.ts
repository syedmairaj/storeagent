import { describe, expect, it } from "vitest";

import type { MerchantMetricActivationSummary } from "@/lib/metrics-activation/run-org-recompute";
import {
  planningMetricsRefreshFailureReport,
  reportPlanningMetricsRefresh,
} from "@/lib/planning-inputs/refresh-status";
import { presentPlanningSaveFeedback } from "@/lib/planning-inputs/save-feedback";
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

describe("planning metrics refresh reporting (UX-INV-1c.1)", () => {
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
    expect(report.note).toMatch(/^Settings saved\./);
    expect(report.note).toMatch(/still pending/i);
    expect(report.note).not.toMatch(/Planning thresholds refreshed/i);
  });

  it("reports complete saves with Settings saved + refresh warning only when refresh ran", () => {
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
    const feedback = presentPlanningSaveFeedback(report);
    expect(feedback.headline).toBe("Settings saved");
    expect(feedback.warning).toMatch(/Planning thresholds refreshed for 1/i);
    expect(feedback.warning).toMatch(/not verified supplier facts/i);
  });

  it("does not equate no refresh with current metrics", () => {
    const report = reportPlanningMetricsRefresh(
      summary({
        succeeded: 0,
        pendingRemaining: false,
        stoppedReason: "drained",
      }),
      complete,
    );
    expect(report.note).toMatch(/^Settings saved\./);
    expect(report.note).toMatch(/does not mean inventory metrics are already current/i);
    expect(report.note).not.toMatch(/thresholds refreshed/i);
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
    expect(report.note).toMatch(/All planning days are blank/i);
    expect(report.note).toMatch(/thresholds stay unavailable/i);
    expect(report.note).not.toMatch(/Planning thresholds refreshed/i);
  });

  it("keeps partial saves honest about blank assumptions", () => {
    const report = reportPlanningMetricsRefresh(
      summary({
        succeeded: 4,
        pendingRemaining: false,
        stoppedReason: "drained",
      }),
      partial,
    );
    expect(report.configurationKind).toBe("partial");
    expect(report.note).toMatch(/still blank/i);
    expect(report.note).toMatch(/stay unavailable/i);
    expect(report.note).not.toMatch(/Planning thresholds refreshed/i);
  });

  it("reports retryable when refresh fails after a successful planning save", () => {
    const report = planningMetricsRefreshFailureReport(complete);
    expect(report.status).toBe("retryable");
    expect(report.pendingRemaining).toBe(true);
    expect(report.note).toMatch(/^Settings saved\./);
    expect(report.note).toMatch(/did not finish/i);
  });
});
