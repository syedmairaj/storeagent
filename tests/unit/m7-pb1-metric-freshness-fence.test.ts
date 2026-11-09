import { describe, expect, it } from "vitest";

import { buildMetricSourceWatermark } from "@/lib/decision-engine/metric-decision-binding";
import {
  evaluatePb1MetricFreshnessFence,
  isSourceDateInMetricSalesWindow,
  M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1,
  shiftIsoCalendarDate,
  type Pb1MetricFreshnessFenceRequest,
  type Pb1MetricSourceEventProjection,
} from "@/lib/decision-engine/pb1-metric-freshness-fence";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";

const ORG = "8300e000-0000-4000-8000-000000000011";
const STORE = "8300e000-0000-4000-8000-000000000012";
const LOCATION = "8300e000-0000-4000-8000-000000000013";
const VARIANT = "8300e000-0000-4000-8000-000000000014";
const FOREIGN_ORG = "8300e000-0000-4000-8000-000000000091";
const FOREIGN_STORE = "8300e000-0000-4000-8000-000000000092";
const METRIC_DATE = "2026-11-09";
const UPDATED_AT = "2026-11-09T12:00:00.000Z";
const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function baseRequest(
  overrides: Partial<Pb1MetricFreshnessFenceRequest> = {},
): Pb1MetricFreshnessFenceRequest {
  return {
    fenceVersion: M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1,
    trustedScope: { organizationId: ORG, storeId: STORE },
    grain: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    },
    metric: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
      metricDate: METRIC_DATE,
      algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
      updatedAt: UPDATED_AT,
    },
    storeLocalAsOfDate: METRIC_DATE,
    recomputeRequest: { kind: "observed_absent" },
    unconsumedSourceEvents: { kind: "observed", events: [] },
    sourceToken: {
      kind: "observed",
      boundToken: TOKEN,
      currentToken: TOKEN,
    },
    ...overrides,
  };
}

function event(
  overrides: Partial<Pb1MetricSourceEventProjection> = {},
): Pb1MetricSourceEventProjection {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    sourceDate: METRIC_DATE,
    algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
    consumedAt: null,
    sourceClass: "sales",
    ...overrides,
  };
}

describe("M7-PB1.h.2 metric freshness fence", () => {
  it("passes observed-clean evidence while leaving transactionSafety unproven", () => {
    const result = evaluatePb1MetricFreshnessFence(baseRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.observedEvidenceValidity).toBe("valid");
    expect(result.transactionSafety).toBe("unproven");
    expect(result.productionCreateEligible).toBe(false);
    expect(result.commercialActionsEligible).toBe(false);
    expect(result.metricSourceWatermark).toBe(
      buildMetricSourceWatermark({
        metricDate: METRIC_DATE,
        algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
        updatedAt: UPDATED_AT,
      }),
    );
    expect(result.salesWindow.windowStartDate).toBe(
      shiftIsoCalendarDate(METRIC_DATE, -89),
    );
    expect(result.notes).toContain("LOCAL_READ_MODEL_FRESHNESS_ONLY");
  });

  it("rejects identity mismatch (tenant / store / grain)", () => {
    const foreignTenant = evaluatePb1MetricFreshnessFence(
      baseRequest({
        metric: {
          ...baseRequest().metric!,
          organizationId: FOREIGN_ORG,
        },
      }),
    );
    expect(foreignTenant.ok).toBe(false);
    if (!foreignTenant.ok) {
      expect(foreignTenant.code).toBe("FOREIGN_TENANT_REJECTED");
    }

    const foreignStore = evaluatePb1MetricFreshnessFence(
      baseRequest({
        metric: {
          ...baseRequest().metric!,
          storeId: FOREIGN_STORE,
        },
      }),
    );
    expect(foreignStore.ok).toBe(false);
    if (!foreignStore.ok) {
      expect(foreignStore.code).toBe("FOREIGN_STORE_REJECTED");
    }

    const grainMismatch = evaluatePb1MetricFreshnessFence(
      baseRequest({
        grain: {
          organizationId: ORG,
          storeId: STORE,
          locationId: LOCATION,
          variantId: "8300e000-0000-4000-8000-000000000099",
        },
      }),
    );
    expect(grainMismatch.ok).toBe(false);
    if (!grainMismatch.ok) {
      expect(grainMismatch.code).toBe("GRAIN_MISMATCH");
    }
  });

  it("rejects wrong algorithm and stale metric date / rollover", () => {
    const algo = evaluatePb1MetricFreshnessFence(
      baseRequest({
        metric: {
          ...baseRequest().metric!,
          algorithmVersion: "other-algo",
        },
      }),
    );
    expect(algo.ok).toBe(false);
    if (!algo.ok) {
      expect(algo.code).toBe("UNSUPPORTED_METRIC_ALGORITHM");
    }

    const rollover = evaluatePb1MetricFreshnessFence(
      baseRequest({
        storeLocalAsOfDate: "2026-11-10",
      }),
    );
    expect(rollover.ok).toBe(false);
    if (!rollover.ok) {
      expect(rollover.code).toBe("METRIC_DATE_NOT_CURRENT");
    }

    const historical = evaluatePb1MetricFreshnessFence(
      baseRequest({
        metric: {
          ...baseRequest().metric!,
          metricDate: "2026-11-08",
        },
      }),
    );
    expect(historical.ok).toBe(false);
    if (!historical.ok) {
      expect(historical.code).toBe("METRIC_DATE_NOT_CURRENT");
    }
  });

  it("enforces 89/90-day sales-window boundaries", () => {
    expect(isSourceDateInMetricSalesWindow("2026-08-12", METRIC_DATE)).toBe(
      true,
    ); // metric_date − 89
    expect(isSourceDateInMetricSalesWindow("2026-08-11", METRIC_DATE)).toBe(
      false,
    ); // metric_date − 90
    expect(isSourceDateInMetricSalesWindow(METRIC_DATE, METRIC_DATE)).toBe(
      true,
    );

    const inWindow = evaluatePb1MetricFreshnessFence(
      baseRequest({
        unconsumedSourceEvents: {
          kind: "observed",
          events: [event({ sourceDate: shiftIsoCalendarDate(METRIC_DATE, -89) })],
        },
      }),
    );
    expect(inWindow.ok).toBe(false);
    if (!inWindow.ok) {
      expect(inWindow.code).toBe("METRIC_SOURCE_WINDOW_DIRTY");
    }

    const outOfWindow = evaluatePb1MetricFreshnessFence(
      baseRequest({
        unconsumedSourceEvents: {
          kind: "observed",
          events: [event({ sourceDate: shiftIsoCalendarDate(METRIC_DATE, -90) })],
        },
      }),
    );
    expect(outOfWindow.ok).toBe(true);

    const consumedInWindow = evaluatePb1MetricFreshnessFence(
      baseRequest({
        unconsumedSourceEvents: {
          kind: "observed",
          events: [
            event({
              sourceDate: shiftIsoCalendarDate(METRIC_DATE, -30),
              consumedAt: "2026-11-09T01:00:00.000Z",
            }),
          ],
        },
      }),
    );
    expect(consumedInWindow.ok).toBe(true);
  });

  it("rejects pending generations and open/retry/failed work", () => {
    const dirty = evaluatePb1MetricFreshnessFence(
      baseRequest({
        recomputeRequest: {
          kind: "observed",
          dirtyGeneration: 2,
          claimedGeneration: 1,
          appliedGeneration: 1,
          status: "succeeded",
        },
      }),
    );
    expect(dirty.ok).toBe(false);
    if (!dirty.ok) {
      expect(dirty.code).toBe("PENDING_RECOMPUTE");
    }

    for (const status of [
      "queued",
      "claimed",
      "running",
      "retry_wait",
      "failed",
    ] as const) {
      const open = evaluatePb1MetricFreshnessFence(
        baseRequest({
          recomputeRequest: {
            kind: "observed",
            dirtyGeneration: 1,
            claimedGeneration: 1,
            appliedGeneration: 1,
            status,
          },
        }),
      );
      expect(open.ok).toBe(false);
      if (!open.ok) {
        expect(open.code).toBe("PENDING_RECOMPUTE");
      }
    }

    const cleanSucceeded = evaluatePb1MetricFreshnessFence(
      baseRequest({
        recomputeRequest: {
          kind: "observed",
          dirtyGeneration: 3,
          claimedGeneration: 3,
          appliedGeneration: 3,
          status: "succeeded",
        },
      }),
    );
    expect(cleanSucceeded.ok).toBe(true);
  });

  it("handles planning/attestation dirty solely via generation axis", () => {
    // No in-window sales events; dirty generation alone blocks.
    const planningDirty = evaluatePb1MetricFreshnessFence(
      baseRequest({
        recomputeRequest: {
          kind: "observed",
          dirtyGeneration: 4,
          claimedGeneration: 3,
          appliedGeneration: 3,
          status: "queued",
        },
        unconsumedSourceEvents: { kind: "observed", events: [] },
      }),
    );
    expect(planningDirty.ok).toBe(false);
    if (!planningDirty.ok) {
      expect(planningDirty.code).toBe("PENDING_RECOMPUTE");
    }
  });

  it("fails closed on missing first-request proof and other unproven evidence", () => {
    const missingRequest = evaluatePb1MetricFreshnessFence(
      baseRequest({
        recomputeRequest: { kind: "unproven" },
      }),
    );
    expect(missingRequest.ok).toBe(false);
    if (!missingRequest.ok) {
      expect(missingRequest.code).toBe("RECOMPUTE_REQUEST_EVIDENCE_UNPROVEN");
      expect(missingRequest.transactionSafety).toBe("unproven");
    }

    const missingEvents = evaluatePb1MetricFreshnessFence(
      baseRequest({
        unconsumedSourceEvents: { kind: "unproven" },
      }),
    );
    expect(missingEvents.ok).toBe(false);
    if (!missingEvents.ok) {
      expect(missingEvents.code).toBe("SOURCE_EVENT_EVIDENCE_UNPROVEN");
    }

    const missingToken = evaluatePb1MetricFreshnessFence(
      baseRequest({
        sourceToken: { kind: "unproven" },
      }),
    );
    expect(missingToken.ok).toBe(false);
    if (!missingToken.ok) {
      expect(missingToken.code).toBe("SOURCE_TOKEN_EVIDENCE_UNPROVEN");
    }

    const missingMetric = evaluatePb1MetricFreshnessFence(
      baseRequest({ metric: null }),
    );
    expect(missingMetric.ok).toBe(false);
    if (!missingMetric.ok) {
      expect(missingMetric.code).toBe("METRIC_EVIDENCE_UNPROVEN");
    }
  });

  it("rejects source-token drift (SA008)", () => {
    const drift = evaluatePb1MetricFreshnessFence(
      baseRequest({
        sourceToken: {
          kind: "observed",
          boundToken: TOKEN,
          currentToken: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      }),
    );
    expect(drift.ok).toBe(false);
    if (!drift.ok) {
      expect(drift.code).toBe("SA008");
      expect(drift.detail).toContain("STALE_SOURCE_TOKEN");
    }
  });

  it("rejects expected metric watermark mismatch", () => {
    const stale = evaluatePb1MetricFreshnessFence(
      baseRequest({
        expectedMetricSourceWatermark: "m7-pb1-metric-source-watermark-v1|other",
      }),
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.code).toBe("METRIC_WATERMARK_MISMATCH");
    }
  });

  it("ignores unrelated-grain unconsumed events", () => {
    const result = evaluatePb1MetricFreshnessFence(
      baseRequest({
        unconsumedSourceEvents: {
          kind: "observed",
          events: [
            event({
              variantId: "8300e000-0000-4000-8000-000000000077",
              sourceDate: METRIC_DATE,
            }),
          ],
        },
      }),
    );
    expect(result.ok).toBe(true);
  });
});
