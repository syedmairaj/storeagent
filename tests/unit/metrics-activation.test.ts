import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  merchantMetricsActivationNote,
  resolveMerchantMetricsActivationStatus,
} from "@/lib/metrics-activation/merchant-copy";
import { hasPendingMetricWork } from "@/lib/metrics-activation/pending-work";
import { storeLocalAsOfDate } from "@/lib/metrics-activation/store-local-as-of";

describe("storeLocalAsOfDate", () => {
  it("resolves UTC calendar dates", () => {
    expect(
      storeLocalAsOfDate("UTC", new Date("2026-11-08T15:30:00.000Z")),
    ).toBe("2026-11-08");
  });

  it("respects timezone day boundaries", () => {
    expect(
      storeLocalAsOfDate(
        "America/Los_Angeles",
        new Date("2026-11-08T02:00:00.000Z"),
      ),
    ).toBe("2026-11-07");
  });

  it("rejects blank timezones", () => {
    expect(() => storeLocalAsOfDate("   ")).toThrow(/timezone/i);
  });
});

describe("merchant metrics activation status", () => {
  it("marks incomplete drains as pending, not silent success", () => {
    expect(
      resolveMerchantMetricsActivationStatus({
        succeeded: 3,
        failed: 0,
        retryScheduled: 0,
        queueErrors: 0,
        stoppedReason: "max_ticks",
        pendingRemaining: true,
      }),
    ).toBe("pending");

    expect(
      resolveMerchantMetricsActivationStatus({
        succeeded: 0,
        failed: 1,
        retryScheduled: 0,
        queueErrors: 0,
        stoppedReason: "drained",
        pendingRemaining: true,
      }),
    ).toBe("retryable");
  });

  it("keeps merchant notes free of worker jargon", () => {
    const note = merchantMetricsActivationNote("pending", { succeeded: 1 });
    expect(note.toLowerCase()).toContain("still updating");
    expect(note.toLowerCase()).not.toContain("cron");
    expect(note.toLowerCase()).not.toContain("worker");
    expect(note.toLowerCase()).not.toContain("lease");
  });

  it("detects pending metric work from either queue signal", () => {
    expect(
      hasPendingMetricWork({
        unconsumedSourceEvents: 1,
        openRecomputeRequests: 0,
      }),
    ).toBe(true);
    expect(
      hasPendingMetricWork({
        unconsumedSourceEvents: 0,
        openRecomputeRequests: 2,
      }),
    ).toBe(true);
    expect(
      hasPendingMetricWork({
        unconsumedSourceEvents: 0,
        openRecomputeRequests: 0,
      }),
    ).toBe(false);
  });
});
