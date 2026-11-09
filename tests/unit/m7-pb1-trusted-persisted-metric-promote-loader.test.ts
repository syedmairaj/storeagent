import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1 } from "@/lib/decision-engine/metric-decision-binding";
import {
  evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow,
  loadPb1TrustedPersistedMetricPromoteDiagnostic,
  M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
  type Pb1TrustedPersistedMetricPromoteLoadedRequest,
  type Pb1TrustedPersistedMetricPromoteLoaderDeps,
  type Pb1TrustedPersistedSkuDailyMetricRow,
} from "@/lib/decision-engine/pb1-trusted-persisted-metric-promote-loader";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";

const ORG = "7200e000-0000-4000-8000-000000000011";
const STORE = "7200e000-0000-4000-8000-000000000012";
const LOCATION = "7200e000-0000-4000-8000-000000000013";
const VARIANT = "7200e000-0000-4000-8000-000000000014";
const FOREIGN_ORG = "7200e000-0000-4000-8000-000000000091";
const TZ = "America/New_York";
const METRIC_DATE = "2026-11-08";
const AS_OF = new Date("2026-11-08T17:00:00.000Z"); // 12:00 America/New_York
const UPDATED_AT = "2026-11-08T17:05:00.000Z";

function qualifyingRow(
  overrides: Partial<Pb1TrustedPersistedSkuDailyMetricRow> = {},
): Pb1TrustedPersistedSkuDailyMetricRow {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    metricDate: METRIC_DATE,
    algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
    updatedAt: UPDATED_AT,
    availableQuantity: 120,
    eligibleIncomingQuantity: 0,
    eligibleIncomingReasonCode: null,
    salesVelocity30d: 2,
    daysOfStock: 60,
    safetyStock: 10,
    reorderPoint: 24,
    targetStock: 70,
    inventoryAgeDays: null,
    demandTrend: "falling",
    ...overrides,
  };
}

function loadedRequest(
  overrides: Partial<Pb1TrustedPersistedMetricPromoteLoadedRequest> = {},
): Pb1TrustedPersistedMetricPromoteLoadedRequest {
  return {
    loaderVersion: M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
    trustedScope: {
      organizationId: ORG,
      storeId: STORE,
      storeTimeZone: TZ,
    },
    grain: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    },
    row: qualifyingRow(),
    hasPendingMetricWork: false,
    asOfInstant: AS_OF,
    ...overrides,
  };
}

function stubDeps(
  overrides: Partial<Pb1TrustedPersistedMetricPromoteLoaderDeps> = {},
): Pb1TrustedPersistedMetricPromoteLoaderDeps {
  return {
    getAuthenticatedUserId: async () => "user-1",
    assertOrganizationMembership: async () => true,
    loadStoreTimeZone: async () => TZ,
    loadSkuDailyMetricRow: async () => qualifyingRow(),
    countPendingMetricWork: async () => ({
      unconsumedSourceEvents: 0,
      openRecomputeRequests: 0,
    }),
    now: () => AS_OF,
    ...overrides,
  };
}

describe("M7-PB1.c trusted persisted-metric PROMOTE loader", () => {
  it("produces diagnostic PROMOTE from a real-shaped persisted row", () => {
    const result = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.loaderVersion).toBe(
      M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
    );
    expect(result.diagnosticDecision.actionType).toBe("PROMOTE");
    expect(result.decisionInput.inventoryAgeDays).toBeNull();
    expect(result.decisionInput.leadTimeDays).toBeNull();
    expect(result.decisionInput.validIncomingQuantity).toBe(0);
    expect(result.decisionInput.overstockRisk).toBe("high");
    expect(result.provenance.productionApprovalEligible).toBe(false);
    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    expect(result.warnings).toContain("NOT_production_decision_create");
    expect(result.warnings).toContain("NOT_m7_3_approvable");
  });

  it("also qualifies PROMOTE on known-zero demand pressure", () => {
    const result = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        row: qualifyingRow({
          salesVelocity30d: 0,
          demandTrend: "stable",
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.diagnosticDecision.actionType).toBe("PROMOTE");
    expect(result.diagnosticDecision.reasonCodes).toContain("ZERO_DEMAND");
  });

  it("does not invent demand pressure when trend is unknown and velocity is positive", () => {
    const result = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        row: qualifyingRow({
          demandTrend: "unknown",
          salesVelocity30d: 3,
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.demandTrend).toBeNull();
    expect(result.diagnosticDecision.actionType).not.toBe("PROMOTE");
  });

  it("never invents inventory age from the loader path", () => {
    const result = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        row: qualifyingRow({
          // Even if a projection claims age, loader forces null.
          inventoryAgeDays: 120,
          demandTrend: "stable",
          salesVelocity30d: 3,
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.inventoryAgeDays).toBeNull();
    expect(result.diagnosticDecision.reasonCodes).not.toContain(
      "AGED_INVENTORY",
    );
    expect(result.diagnosticDecision.actionType).not.toBe("PROMOTE");
  });

  it("fails closed when incoming is unknown (overstock not derived)", () => {
    const result = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        row: qualifyingRow({
          eligibleIncomingQuantity: null,
          eligibleIncomingReasonCode: "incoming_state_unknown",
        }),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.decisionInput.incomingStateKnown).toBe(false);
    expect(result.decisionInput.overstockRisk).toBeNull();
    expect(result.diagnosticDecision.actionType).not.toBe("PROMOTE");
  });

  it("preserves null≠0 for target and velocity", () => {
    const missingTarget = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        row: qualifyingRow({ targetStock: null }),
      }),
    );
    expect(missingTarget.ok).toBe(true);
    if (missingTarget.ok) {
      expect(missingTarget.decisionInput.targetStockUnits).toBeNull();
      expect(missingTarget.diagnosticDecision.actionType).not.toBe("PROMOTE");
      expect(missingTarget.diagnosticDecision.reasonCodes).toContain(
        "TARGET_STOCK_UNKNOWN",
      );
    }

    const missingVelocity =
      evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
        loadedRequest({
          row: qualifyingRow({ salesVelocity30d: null }),
        }),
      );
    expect(missingVelocity.ok).toBe(true);
    if (missingVelocity.ok) {
      expect(missingVelocity.decisionInput.demandVelocity).toBeNull();
      expect(missingVelocity.diagnosticDecision.actionType).not.toBe(
        "PROMOTE",
      );
    }
  });

  it("rejects pending work and non-current metric dates", () => {
    const pending = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({ hasPendingMetricWork: true }),
    );
    expect(pending.ok).toBe(false);
    if (!pending.ok) {
      expect(pending.code).toBe("PENDING_RECOMPUTE");
      expect(pending.provenance.productionApprovalEligible).toBe(false);
    }

    const historical = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        row: qualifyingRow({ metricDate: "2026-11-07" }),
      }),
    );
    expect(historical.ok).toBe(false);
    if (!historical.ok) {
      expect(historical.code).toBe("METRIC_DATE_NOT_CURRENT");
    }
  });

  it("rejects unsupported algorithm and invalid demand trend", () => {
    const algorithm = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        row: qualifyingRow({ algorithmVersion: "other-algo" }),
      }),
    );
    expect(algorithm.ok).toBe(false);
    if (!algorithm.ok) {
      expect(algorithm.code).toBe("UNSUPPORTED_METRIC_ALGORITHM");
    }

    const trend = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        row: qualifyingRow({
          demandTrend: "sideways" as unknown as "falling",
        }),
      }),
    );
    expect(trend.ok).toBe(false);
    if (!trend.ok) {
      expect(trend.code).toBe("DEMAND_TREND_INVALID");
    }
  });

  it("rejects foreign tenant/grain mismatch and supplierPlanning smuggle", () => {
    const foreign = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow(
      loadedRequest({
        trustedScope: {
          organizationId: FOREIGN_ORG,
          storeId: STORE,
          storeTimeZone: TZ,
        },
      }),
    );
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.code).toBe("FOREIGN_TENANT_REJECTED");
    }

    const smuggled = evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow({
      ...loadedRequest(),
      supplierPlanning: {
        leadTimeDays: 7,
        sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
      },
    } as unknown as Pb1TrustedPersistedMetricPromoteLoadedRequest);
    expect(smuggled.ok).toBe(false);
    if (!smuggled.ok) {
      expect(smuggled.code).toBe("SUPPLIER_FACTS_INVALID");
    }
  });

  it("I/O path enforces auth, membership, missing row, and pending work", async () => {
    const unauth = await loadPb1TrustedPersistedMetricPromoteDiagnostic(
      {
        loaderVersion:
          M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      stubDeps({ getAuthenticatedUserId: async () => null }),
    );
    expect(unauth.ok).toBe(false);
    if (!unauth.ok) {
      expect(unauth.code).toBe("AUTHENTICATION_REQUIRED");
    }

    const denied = await loadPb1TrustedPersistedMetricPromoteDiagnostic(
      {
        loaderVersion:
          M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      stubDeps({ assertOrganizationMembership: async () => false }),
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("TENANT_ACCESS_DENIED");
    }

    const missing = await loadPb1TrustedPersistedMetricPromoteDiagnostic(
      {
        loaderVersion:
          M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      stubDeps({ loadSkuDailyMetricRow: async () => null }),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe("METRIC_ROW_NOT_FOUND");
    }

    const pending = await loadPb1TrustedPersistedMetricPromoteDiagnostic(
      {
        loaderVersion:
          M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      stubDeps({
        countPendingMetricWork: async () => ({
          unconsumedSourceEvents: 1,
          openRecomputeRequests: 0,
        }),
      }),
    );
    expect(pending.ok).toBe(false);
    if (!pending.ok) {
      expect(pending.code).toBe("PENDING_RECOMPUTE");
    }
  });

  it("I/O happy path selects current-day grain and returns PROMOTE", async () => {
    let requestedMetricDate: string | null = null;

    const result = await loadPb1TrustedPersistedMetricPromoteDiagnostic(
      {
        loaderVersion:
          M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      stubDeps({
        loadSkuDailyMetricRow: async (args) => {
          requestedMetricDate = args.metricDate;
          return qualifyingRow({ metricDate: args.metricDate });
        },
      }),
    );

    expect(requestedMetricDate).toBe(METRIC_DATE);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.diagnosticDecision.actionType).toBe("PROMOTE");
    expect(result.loaderVersion).toBe(
      M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
    );
  });
});
