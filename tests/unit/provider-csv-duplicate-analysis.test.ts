import { describe, expect, it } from "vitest";

import {
  analyzeCsvDuplicates,
  csvInventoryDuplicateIdentity,
  csvResourceDuplicateIdentity,
  csvSupplierProductDuplicateIdentity,
  stableCsvDuplicateFingerprint,
} from "@/lib/providers/csv/duplicate-analysis";

describe("CSV deterministic duplicate analysis", () => {
  it("keeps a unique identity unique", () => {
    const decisions = analyzeCsvDuplicates([
      {
        rowNumber: 4,
        identity: "product-1",
        payload: {
          title: "Product",
          status: "active",
        },
      },
    ]);

    expect(decisions.get(4)).toEqual({
      disposition: "unique",
      rowNumber: 4,
    });
  });

  it("chooses the lowest row number as representative for identical duplicates", () => {
    const candidates = [
      {
        rowNumber: 9,
        identity: "product-1",
        payload: {
          title: "Product",
          status: "active",
        },
      },
      {
        rowNumber: 3,
        identity: "product-1",
        payload: {
          title: "Product",
          status: "active",
        },
      },
    ];

    const decisions = analyzeCsvDuplicates(candidates);

    expect(decisions.get(3)).toEqual({
      disposition: "representative",
      rowNumber: 3,
    });

    expect(decisions.get(9)).toEqual({
      disposition: "redundant",
      rowNumber: 9,
      representativeRowNumber: 3,
    });
  });

  it("quarantines every member of a contradictory duplicate group", () => {
    const decisions = analyzeCsvDuplicates([
      {
        rowNumber: 2,
        identity: "product-1",
        payload: {
          title: "Alpha",
        },
      },
      {
        rowNumber: 7,
        identity: "product-1",
        payload: {
          title: "Beta",
        },
      },
    ]);

    expect(decisions.get(2)).toEqual({
      disposition: "conflict",
      rowNumber: 2,
    });

    expect(decisions.get(7)).toEqual({
      disposition: "conflict",
      rowNumber: 7,
    });
  });

  it("is invariant to incoming candidate order", () => {
    const first = [
      {
        rowNumber: 8,
        identity: "same",
        payload: {
          b: 2,
          a: 1,
        },
      },
      {
        rowNumber: 2,
        identity: "same",
        payload: {
          a: 1,
          b: 2,
        },
      },
    ];

    const reversed = [...first].reverse();

    expect(
      [...analyzeCsvDuplicates(first).entries()].sort(([a], [b]) => a - b),
    ).toEqual(
      [...analyzeCsvDuplicates(reversed).entries()].sort(([a], [b]) => a - b),
    );
  });

  it("fingerprints object keys deterministically", () => {
    expect(
      stableCsvDuplicateFingerprint({
        z: 1,
        a: {
          y: true,
          b: null,
        },
      }),
    ).toBe(
      stableCsvDuplicateFingerprint({
        a: {
          b: null,
          y: true,
        },
        z: 1,
      }),
    );
  });

  it("uses resource type and external identity for bindable resources", () => {
    expect(
      csvResourceDuplicateIdentity({
        resourceType: "product",
        externalId: "P-1",
      }),
    ).not.toBe(
      csvResourceDuplicateIdentity({
        resourceType: "supplier",
        externalId: "P-1",
      }),
    );
  });

  it("uses variant, location, and observedAt for inventory observation identity", () => {
    const first = csvInventoryDuplicateIdentity({
      variantExternalId: "V-1",
      locationExternalId: "L-1",
      observedAt: "2026-10-12T08:00:00.000Z",
    });

    const second = csvInventoryDuplicateIdentity({
      variantExternalId: "V-1",
      locationExternalId: "L-1",
      observedAt: "2026-10-12T09:00:00.000Z",
    });

    expect(first).not.toBe(second);
  });

  it("uses supplier and variant identities for supplier-product relationships", () => {
    expect(
      csvSupplierProductDuplicateIdentity({
        supplierExternalId: "S-1",
        variantExternalId: "V-1",
      }),
    ).not.toBe(
      csvSupplierProductDuplicateIdentity({
        supplierExternalId: "S-2",
        variantExternalId: "V-1",
      }),
    );
  });

  it("rejects duplicate diagnostic row numbers", () => {
    expect(() =>
      analyzeCsvDuplicates([
        {
          rowNumber: 2,
          identity: "A",
          payload: {},
        },
        {
          rowNumber: 2,
          identity: "B",
          payload: {},
        },
      ]),
    ).toThrow("CSV duplicate analysis received row 2 more than once.");
  });

  it("rejects blank duplicate identities", () => {
    expect(() =>
      analyzeCsvDuplicates([
        {
          rowNumber: 2,
          identity: "   ",
          payload: {},
        },
      ]),
    ).toThrow("CSV duplicate analysis identity must not be blank.");
  });
});
