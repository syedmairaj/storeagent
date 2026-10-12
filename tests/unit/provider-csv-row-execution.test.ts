import { describe, expect, it, vi } from "vitest";

import { createCsvImportAccountingState } from "@/lib/providers/csv/accounting";

import {
  executeCsvInventoryRow,
  executeCsvResourceRow,
  executeCsvSupplierProductRow,
} from "@/lib/providers/csv/row-execution";

describe("CSV row execution", () => {
  it("accounts an accepted imported resource exactly once", async () => {
    const state = createCsvImportAccountingState();

    const orchestrate = vi.fn().mockResolvedValue({
      canonicalEntityId: "product-1",

      disposition: "imported",
    });

    const result = await executeCsvResourceRow(
      state,
      2,
      {
        disposition: "accepted",

        provider: "csv",

        resourceType: "product",

        externalId: "PRODUCT-1",

        externalParentId: null,

        adapterVersion: "product-v1",

        canonical: {
          title: "Product",
        },

        issues: [],
      },
      orchestrate,
    );

    expect(result.disposition).toBe("imported");

    expect(result.canonicalEntityId).toBe("product-1");

    expect(result.accounting.counts).toEqual({
      discovered: 1,
      imported: 1,
      updated: 0,
      skipped: 0,
      quarantined: 0,
      failed: 0,
    });

    expect(orchestrate).toHaveBeenCalledTimes(1);
  });

  it("turns normalization quarantine into a transient resource envelope", async () => {
    const state = createCsvImportAccountingState();

    const orchestrate = vi.fn();

    const result = await executeCsvResourceRow(
      state,
      7,
      {
        disposition: "quarantined",

        provider: "csv",

        resourceType: "product_variant",

        externalId: null,

        externalParentId: "PRODUCT-1",

        adapterVersion: "variant-v1",

        canonical: null,

        issues: [
          {
            code: "EXTERNAL_ID_MISSING",

            message: "Variant identity missing.",

            field: "externalId",
          },
        ],
      },
      orchestrate,
    );

    expect(result.disposition).toBe("quarantined");

    expect(result.quarantine).toMatchObject({
      rowNumber: 7,

      subjectType: "resource",

      resourceType: "product_variant",

      reasonCode: "NORMALIZATION_QUARANTINED",
    });

    expect(result.accounting.counts.quarantined).toBe(1);

    expect(orchestrate).not.toHaveBeenCalled();
  });

  it("accounts normalization skip without persistence", async () => {
    const state = createCsvImportAccountingState();

    const orchestrate = vi.fn();

    const result = await executeCsvResourceRow(
      state,
      11,
      {
        disposition: "skipped",

        provider: "csv",

        resourceType: "product",

        externalId: "PRODUCT-1",

        externalParentId: null,

        adapterVersion: "product-v1",

        canonical: null,

        issues: [
          {
            code: "UNSUPPORTED_RESOURCE",

            message: "Skipped.",

            field: null,
          },
        ],
      },
      orchestrate,
    );

    expect(result.disposition).toBe("skipped");

    expect(result.accounting.counts.skipped).toBe(1);

    expect(orchestrate).not.toHaveBeenCalled();
  });

  it("quarantines an accepted row when relationship resolution fails", async () => {
    const state = createCsvImportAccountingState();

    const result = await executeCsvResourceRow(
      state,
      15,
      {
        disposition: "accepted",

        provider: "csv",

        resourceType: "product_variant",

        externalId: "VARIANT-1",

        externalParentId: "PRODUCT-MISSING",

        adapterVersion: "variant-v1",

        canonical: {
          sku: "SKU-1",
        },

        issues: [],
      },
      async () => ({
        disposition: "quarantined",

        reasonCode: "RELATIONSHIP_UNRESOLVED",

        issues: [
          {
            code: "RELATIONSHIP_UNRESOLVED",

            message: "Parent product missing.",

            field: null,
          },
        ],
      }),
    );

    expect(result.disposition).toBe("quarantined");

    expect(result.quarantine).toMatchObject({
      rowNumber: 15,

      resourceType: "product_variant",

      externalId: "VARIANT-1",

      reasonCode: "RELATIONSHIP_UNRESOLVED",
    });
  });

  it("accounts unexpected operational persistence failure as failed", async () => {
    const state = createCsvImportAccountingState();

    const result = await executeCsvResourceRow(
      state,
      17,
      {
        disposition: "accepted",

        provider: "csv",

        resourceType: "supplier",

        externalId: "SUP-1",

        externalParentId: null,

        adapterVersion: "supplier-v1",

        canonical: {
          name: "Supplier",
        },

        issues: [],
      },
      async () => ({
        disposition: "failed",

        errorCode: "CSV_PERSISTENCE_ERROR",
      }),
    );

    expect(result.disposition).toBe("failed");

    expect(result.errorCode).toBe("CSV_PERSISTENCE_ERROR");

    expect(result.accounting.counts.failed).toBe(1);
  });

  it("preserves inventory observation provenance when quarantined", async () => {
    const state = createCsvImportAccountingState();

    const result = await executeCsvInventoryRow(
      state,
      21,
      {
        disposition: "quarantined",

        provider: "csv",

        observationType: "inventory_snapshot",

        adapterVersion: "inventory-v1",

        variantExternalId: "sku=ABC",

        locationExternalId: "LOC-1",

        canonical: null,

        issues: [
          {
            code: "INVALID_QUANTITY",

            message: "Bad quantity.",

            field: "onHandQuantity",
          },
        ],
      },
      vi.fn(),
    );

    expect(result.quarantine).toMatchObject({
      subjectType: "observation",

      observationType: "inventory_snapshot",

      variantExternalId: "sku=ABC",

      locationExternalId: "LOC-1",
    });
  });

  it("preserves supplier-product relationship provenance when quarantined", async () => {
    const state = createCsvImportAccountingState();

    const result = await executeCsvSupplierProductRow(
      state,
      25,
      {
        disposition: "quarantined",

        provider: "csv",

        relationshipType: "supplier_product",

        adapterVersion: "supplier-product-v1",

        supplierExternalId: "SUP-1",

        variantExternalId: null,

        canonical: null,

        issues: [
          {
            code: "RELATIONSHIP_UNRESOLVED",

            message: "Variant missing.",

            field: "variantExternalId",
          },
        ],
      },
      vi.fn(),
    );

    expect(result.quarantine).toMatchObject({
      subjectType: "relationship",

      relationshipType: "supplier_product",

      supplierExternalId: "SUP-1",

      variantExternalId: null,
    });
  });
});

describe("CSV row execution provider boundary", () => {
  it("rejects a non-CSV accepted record before orchestration", async () => {
    const state = createCsvImportAccountingState();

    const orchestrate = vi.fn();

    await expect(
      executeCsvResourceRow(
        state,
        31,
        {
          disposition: "accepted",

          provider: "shopify",

          resourceType: "product",

          externalId: "PRODUCT-1",

          externalParentId: null,

          adapterVersion: "wrong-provider-v1",

          canonical: {
            title: "Product",
          },

          issues: [],
        },
        orchestrate,
      ),
    ).rejects.toThrow('CSV row execution received provider "shopify".');

    expect(orchestrate).not.toHaveBeenCalled();
  });
});
