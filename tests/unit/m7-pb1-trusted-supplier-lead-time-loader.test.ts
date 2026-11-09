import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  evaluatePb1EvidenceQualifiedReorderFromSupplierFacts,
  loadPb1TrustedSupplierPlanningFacts,
  M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
  type Pb1TrustedSupplierLeadTimeLoaderDeps,
} from "@/lib/decision-engine/pb1-trusted-supplier-lead-time-loader";
import {
  M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
} from "@/lib/decision-engine/pb1-evidence-qualified-reorder-diagnostic";
import type { Pb1SupplierProductLeadTimeRow } from "@/lib/decision-engine/pb1-trusted-supplier-planning-facts";

const ORG = "7500e000-0000-4000-8000-000000000011";
const STORE = "7500e000-0000-4000-8000-000000000012";
const LOCATION = "7500e000-0000-4000-8000-000000000013";
const VARIANT = "7500e000-0000-4000-8000-000000000014";
const SUPPLIER = "7500e000-0000-4000-8000-000000000021";
const PRODUCT = "7500e000-0000-4000-8000-000000000031";
const FOREIGN_ORG = "7500e000-0000-4000-8000-000000000091";
const TZ = "America/New_York";
const METRIC_DATE = "2026-11-08";
const AS_OF = new Date("2026-11-08T17:00:00.000Z");
const UPDATED_AT = "2026-11-08T17:05:00.000Z";

function preferredRow(
  overrides: Partial<Pb1SupplierProductLeadTimeRow> = {},
): Pb1SupplierProductLeadTimeRow {
  return {
    id: PRODUCT,
    organizationId: ORG,
    supplierId: SUPPLIER,
    variantId: VARIANT,
    leadTimeDays: 7,
    preferred: true,
    updatedAt: "2026-11-08T16:00:00.000Z",
    ...overrides,
  };
}

function stubDeps(
  overrides: Partial<Pb1TrustedSupplierLeadTimeLoaderDeps> = {},
): Pb1TrustedSupplierLeadTimeLoaderDeps {
  return {
    getAuthenticatedUserId: async () => "user-1",
    assertOrganizationMembership: async () => true,
    loadSupplierProductRows: async () => [preferredRow()],
    ...overrides,
  };
}

describe("M7-PB1.f trusted supplier lead-time loader", () => {
  it("loads sole preferred supplier_products lead time under membership", async () => {
    const result = await loadPb1TrustedSupplierPlanningFacts(
      {
        loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
      },
      stubDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.loaderVersion).toBe(
      M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
    );
    expect(result.supplierPlanning.leadTimeDays).toBe(7);
    expect(result.notVerifiedDeliveryPerformance).toBe(true);
  });

  it("honors explicit supplierId selection", async () => {
    const other = "7500e000-0000-4000-8000-000000000022";
    const result = await loadPb1TrustedSupplierPlanningFacts(
      {
        loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
        supplierId: other,
      },
      stubDeps({
        loadSupplierProductRows: async ({ supplierId }) => {
          expect(supplierId).toBe(other);
          return [
            preferredRow({
              supplierId: other,
              preferred: false,
              leadTimeDays: 2,
            }),
          ];
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.supplierPlanning.leadTimeDays).toBe(2);
    expect(result.supplierId).toBe(other);
  });

  it("fails closed on auth and foreign membership", async () => {
    const unauth = await loadPb1TrustedSupplierPlanningFacts(
      {
        loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
      },
      stubDeps({ getAuthenticatedUserId: async () => null }),
    );
    expect(unauth.ok).toBe(false);
    if (!unauth.ok) {
      expect(unauth.code).toBe("AUTHENTICATION_REQUIRED");
      expect(unauth.provenance.productionDecisionCreationEligible).toBe(false);
    }

    const denied = await loadPb1TrustedSupplierPlanningFacts(
      {
        loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
        organizationId: FOREIGN_ORG,
        variantId: VARIANT,
      },
      stubDeps({ assertOrganizationMembership: async () => false }),
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("TENANT_ACCESS_DENIED");
    }
  });

  it("re-reads rows so cleared lead time revokes facts", async () => {
    let rows: Pb1SupplierProductLeadTimeRow[] = [preferredRow()];
    const deps = stubDeps({
      loadSupplierProductRows: async () => rows,
    });

    const first = await loadPb1TrustedSupplierPlanningFacts(
      {
        loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
      },
      deps,
    );
    expect(first.ok).toBe(true);

    rows = [preferredRow({ leadTimeDays: null })];
    const second = await loadPb1TrustedSupplierPlanningFacts(
      {
        loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
      },
      deps,
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("SUPPLIER_FACTS_ABSENT");
    }
  });

  it("never accepts org planning defaults on the loader surface", async () => {
    const result = await loadPb1TrustedSupplierPlanningFacts(
      {
        loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
        // @ts-expect-error intentional forbidden surface
        organizationPlanningLeadTimeDays: 11,
      },
      stubDeps(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ORG_PLANNING_DEFAULTS_FORBIDDEN");
    }
  });

  it("feeds resolved facts into evidence-qualified REORDER diagnostic", async () => {
    const loaded = await loadPb1TrustedSupplierPlanningFacts(
      {
        loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
      },
      stubDeps(),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }

    const diagnostic = evaluatePb1EvidenceQualifiedReorderFromSupplierFacts({
      supplierFacts: loaded,
      diagnostic: {
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
        storeLocalAsOfDate: METRIC_DATE,
        hasPendingMetricWork: false,
        metricDate: METRIC_DATE,
        metricUpdatedAt: UPDATED_AT,
        pinnedTimeZone: TZ,
        availableQuantity: 10,
        salesVelocity30d: 5,
        daysOfStock: 2,
        safetyStock: 5,
        reorderPoint: 40,
        targetStock: 60,
        inventoryAgeDays: null,
        demandTrend: "stable",
        incoming: {
          kind: "persisted_eligible_incoming",
          eligibleIncomingQuantity: 0,
          eligibleIncomingReasonCode: null,
        },
        asOfInstant: AS_OF,
      },
    });

    expect(diagnostic.ok).toBe(true);
    if (!diagnostic.ok) {
      return;
    }
    expect(diagnostic.diagnosticVersion).toBe(
      M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
    );
    expect(diagnostic.diagnosticDecision.actionType).toBe("REORDER");
    expect(diagnostic.provenance.productionApprovalEligible).toBe(false);
    expect(diagnostic.provenance.productionDecisionCreationEligible).toBe(
      false,
    );
  });
});
