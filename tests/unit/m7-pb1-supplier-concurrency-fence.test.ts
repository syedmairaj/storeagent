import { describe, expect, it } from "vitest";

import {
  evaluatePb1SupplierConcurrencyFence,
  M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
  type Pb1SupplierBoundFacts,
} from "@/lib/decision-engine/pb1-supplier-concurrency-fence";
import type { Pb1SupplierProductLeadTimeRow } from "@/lib/decision-engine/pb1-trusted-supplier-planning-facts";
import { M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1 } from "@/lib/decision-engine/metric-decision-binding";

const ORG = "8300e000-0000-4000-8000-000000000011";
const VARIANT = "8300e000-0000-4000-8000-000000000014";
const SUPPLIER_A = "8300e000-0000-4000-8000-000000000021";
const SUPPLIER_B = "8300e000-0000-4000-8000-000000000022";
const PRODUCT_A = "8300e000-0000-4000-8000-000000000031";
const PRODUCT_B = "8300e000-0000-4000-8000-000000000032";
const FOREIGN_ORG = "8300e000-0000-4000-8000-000000000091";
const UPDATED = "2026-11-09T12:00:00.000Z";
const UPDATED_LATER = "2026-11-09T13:00:00.000Z";

function row(
  overrides: Partial<Pb1SupplierProductLeadTimeRow> = {},
): Pb1SupplierProductLeadTimeRow {
  return {
    id: PRODUCT_A,
    organizationId: ORG,
    supplierId: SUPPLIER_A,
    variantId: VARIANT,
    leadTimeDays: 7,
    preferred: true,
    updatedAt: UPDATED,
    ...overrides,
  };
}

function bound(
  overrides: Partial<Pb1SupplierBoundFacts> = {},
): Pb1SupplierBoundFacts {
  return {
    organizationId: ORG,
    variantId: VARIANT,
    supplierId: SUPPLIER_A,
    supplierProductId: PRODUCT_A,
    supplierProductUpdatedAt: UPDATED,
    leadTimeDays: 7,
    ...overrides,
  };
}

describe("M7-PB1.h.2 supplier concurrency fence", () => {
  it("passes implicit preferred selection with stated LT (0 allowed; null≠0)", () => {
    const positive = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ leadTimeDays: 7 })],
    });
    expect(positive.ok).toBe(true);
    if (!positive.ok) {
      return;
    }
    expect(positive.selectionMode).toBe("implicit_preferred");
    expect(positive.transactionSafety).toBe("unproven");
    expect(positive.productionCreateEligible).toBe(false);
    expect(positive.provenanceKind).toBe("stated_supplier_product_terms");
    expect(positive.supplierPlanning).toEqual({
      leadTimeDays: 7,
      sourceAttestation: M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1,
    });

    const knownZero = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ leadTimeDays: 0 })],
    });
    expect(knownZero.ok).toBe(true);
    if (knownZero.ok) {
      expect(knownZero.leadTimeDays).toBe(0);
    }

    const nullLt = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ leadTimeDays: null })],
    });
    expect(nullLt.ok).toBe(false);
    if (!nullLt.ok) {
      expect(nullLt.code).toBe("SUPPLIER_FACTS_ABSENT");
    }
  });

  it("supports explicit supplierId even when not preferred", () => {
    const result = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_B,
      rows: [
        row({ preferred: true, leadTimeDays: 9 }),
        row({
          id: PRODUCT_B,
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
    expect(result.selectionMode).toBe("explicit");
    expect(result.supplierId).toBe(SUPPLIER_B);
    expect(result.leadTimeDays).toBe(3);
  });

  it("rejects preferred ambiguity and missing preferred", () => {
    const ambiguous = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [
        row({ leadTimeDays: 5 }),
        row({
          id: PRODUCT_B,
          supplierId: SUPPLIER_B,
          preferred: true,
          leadTimeDays: 8,
        }),
      ],
    });
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) {
      expect(ambiguous.code).toBe("SUPPLIER_FACTS_AMBIGUOUS");
      expect(ambiguous.transactionSafety).toBe("unproven");
    }

    const missing = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ preferred: false, leadTimeDays: 5 })],
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe("SUPPLIER_FACTS_ABSENT");
    }
  });

  it("rejects negative and malformed lead times", () => {
    const negative = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ leadTimeDays: -1 })],
    });
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.code).toBe("SUPPLIER_FACTS_INVALID");
    }

    const malformed = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ leadTimeDays: Number.NaN })],
    });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.code).toBe("SUPPLIER_FACTS_INVALID");
    }
  });

  it("rejects tenant mismatch", () => {
    const foreign = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row({ organizationId: FOREIGN_ORG })],
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.code).toBe("FOREIGN_TENANT_REJECTED");
    }
  });

  it("detects supplier revisions via updated_at / LT / product id", () => {
    const watermark = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ updatedAt: UPDATED_LATER })],
      bound: bound(),
    });
    expect(watermark.ok).toBe(false);
    if (!watermark.ok) {
      expect(watermark.code).toBe("SUPPLIER_FACTS_STALE");
    }

    const ltChanged = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ leadTimeDays: 11 })],
      bound: bound(),
    });
    expect(ltChanged.ok).toBe(false);
    if (!ltChanged.ok) {
      expect(ltChanged.code).toBe("SUPPLIER_FACTS_STALE");
    }

    const productChanged = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ id: PRODUCT_B })],
      bound: bound(),
    });
    expect(productChanged.ok).toBe(false);
    if (!productChanged.ok) {
      expect(productChanged.code).toBe("SUPPLIER_PRODUCT_ID_MISMATCH");
    }

    const stable = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row()],
      bound: bound(),
    });
    expect(stable.ok).toBe(true);
  });

  it("treats deleted mapping as absent / not found against bound facts", () => {
    const deleted = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [],
      bound: bound(),
    });
    expect(deleted.ok).toBe(false);
    if (!deleted.ok) {
      expect(deleted.code).toBe("SUPPLIER_MAPPING_NOT_FOUND");
    }

    const clearedLt = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ leadTimeDays: null })],
      bound: bound(),
    });
    expect(clearedLt.ok).toBe(false);
    if (!clearedLt.ok) {
      expect(clearedLt.code).toBe("SUPPLIER_FACTS_STALE");
    }
  });

  it("forbids org-default and supplier-default LT invention", () => {
    const orgDefaults = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
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

    const supplierDefault = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows: [row()],
      // @ts-expect-error intentional forbidden surface
      supplierDefaultLeadTimeDays: 14,
    });
    expect(supplierDefault.ok).toBe(false);
    if (!supplierDefault.ok) {
      expect(supplierDefault.code).toBe("SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN");
    }
  });

  it("distinguishes null LT from known-zero on bound watermark path", () => {
    const boundZero = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ leadTimeDays: 0 })],
      bound: bound({ leadTimeDays: 0 }),
    });
    expect(boundZero.ok).toBe(true);

    const nullVsZero = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_A,
      rows: [row({ leadTimeDays: null })],
      bound: bound({ leadTimeDays: 0 }),
    });
    expect(nullVsZero.ok).toBe(false);
    if (!nullVsZero.ok) {
      expect(nullVsZero.code).toBe("SUPPLIER_FACTS_STALE");
    }
  });
});
