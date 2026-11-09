import { describe, expect, it } from "vitest";

import { M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1 } from "@/lib/decision-engine/metric-decision-binding";
import {
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
  resolvePb1TrustedSupplierPlanningFacts,
  type Pb1SupplierProductLeadTimeRow,
} from "@/lib/decision-engine/pb1-trusted-supplier-planning-facts";

const ORG = "7300e000-0000-4000-8000-000000000011";
const VARIANT = "7300e000-0000-4000-8000-000000000014";
const SUPPLIER_A = "7300e000-0000-4000-8000-000000000021";
const SUPPLIER_B = "7300e000-0000-4000-8000-000000000022";
const FOREIGN_ORG = "7300e000-0000-4000-8000-000000000091";
const FOREIGN_VARIANT = "7300e000-0000-4000-8000-000000000094";

function row(
  overrides: Partial<Pb1SupplierProductLeadTimeRow> = {},
): Pb1SupplierProductLeadTimeRow {
  return {
    id: "7300e000-0000-4000-8000-000000000031",
    organizationId: ORG,
    supplierId: SUPPLIER_A,
    variantId: VARIANT,
    leadTimeDays: 7,
    preferred: true,
    updatedAt: "2026-11-09T12:00:00.000Z",
    ...overrides,
  };
}

describe("M7-PB1.f trusted supplier planning facts resolver", () => {
  it("accepts sole preferred supplier with positive lead time", () => {
    const result = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ leadTimeDays: 7 })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.provenanceKind).toBe("stated_supplier_product_terms");
    expect(result.notVerifiedDeliveryPerformance).toBe(true);
    expect(result.supplierPlanning).toEqual({
      leadTimeDays: 7,
      sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
    });
    expect(result.supplierId).toBe(SUPPLIER_A);
  });

  it("accepts known-zero lead time on sole preferred mapping", () => {
    const result = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ leadTimeDays: 0 })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.supplierPlanning.leadTimeDays).toBe(0);
  });

  it("selects exact supplierId mapping even when not preferred", () => {
    const result = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_B,
      rows: [
        row({ preferred: true, leadTimeDays: 9 }),
        row({
          id: "7300e000-0000-4000-8000-000000000032",
          supplierId: SUPPLIER_B,
          preferred: false,
          leadTimeDays: 3,
        }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.supplierId).toBe(SUPPLIER_B);
    expect(result.supplierPlanning.leadTimeDays).toBe(3);
  });

  it("fails closed on null lead time", () => {
    const result = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ leadTimeDays: null })],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("SUPPLIER_FACTS_ABSENT");
  });

  it("rejects negative and non-finite lead time", () => {
    const negative = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ leadTimeDays: -1 })],
    });
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.code).toBe("SUPPLIER_FACTS_INVALID");
    }

    const nonFinite = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ leadTimeDays: Number.POSITIVE_INFINITY })],
    });
    expect(nonFinite.ok).toBe(false);
    if (!nonFinite.ok) {
      expect(nonFinite.code).toBe("SUPPLIER_FACTS_INVALID");
    }
  });

  it("fails closed when preferred mapping is absent", () => {
    const result = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ preferred: false, leadTimeDays: 5 })],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("SUPPLIER_FACTS_ABSENT");
  });

  it("rejects multiple preferred mappings with lead time", () => {
    const result = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [
        row({ leadTimeDays: 5 }),
        row({
          id: "7300e000-0000-4000-8000-000000000033",
          supplierId: SUPPLIER_B,
          preferred: true,
          leadTimeDays: 8,
        }),
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("SUPPLIER_FACTS_AMBIGUOUS");
  });

  it("rejects foreign organization or wrong variant rows", () => {
    const foreignOrg = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ organizationId: FOREIGN_ORG })],
    });
    expect(foreignOrg.ok).toBe(false);
    if (!foreignOrg.ok) {
      expect(foreignOrg.code).toBe("FOREIGN_TENANT_REJECTED");
    }

    const wrongVariant = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ variantId: FOREIGN_VARIANT })],
    });
    expect(wrongVariant.ok).toBe(false);
    if (!wrongVariant.ok) {
      expect(wrongVariant.code).toBe("VARIANT_MISMATCH");
    }
  });

  it("treats deleted/cleared mapping as absent on re-resolve", () => {
    const before = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ leadTimeDays: 4 })],
    });
    expect(before.ok).toBe(true);

    const cleared = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ leadTimeDays: null })],
    });
    expect(cleared.ok).toBe(false);

    const deleted = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [],
    });
    expect(deleted.ok).toBe(false);
    if (!deleted.ok) {
      expect(deleted.code).toBe("SUPPLIER_FACTS_ABSENT");
    }
  });

  it("rejects org planning defaults and supplier default lead time surfaces", () => {
    const orgDefaults = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row()],
      // @ts-expect-error intentional forbidden surface
      organizationPlanningLeadTimeDays: 11,
    });
    expect(orgDefaults.ok).toBe(false);
    if (!orgDefaults.ok) {
      expect(orgDefaults.code).toBe("ORG_PLANNING_DEFAULTS_FORBIDDEN");
    }

    const supplierDefault = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row()],
      // @ts-expect-error intentional forbidden surface
      supplierDefaultLeadTimeDays: 14,
    });
    expect(supplierDefault.ok).toBe(false);
    if (!supplierDefault.ok) {
      expect(supplierDefault.code).toBe(
        "SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN",
      );
    }
  });

  it("rejects missing explicit supplier mapping", () => {
    const result = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion:
        M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_B,
      rows: [row({ supplierId: SUPPLIER_A })],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("SUPPLIER_MAPPING_NOT_FOUND");
  });
});
