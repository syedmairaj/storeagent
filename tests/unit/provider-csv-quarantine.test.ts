import { describe, expect, it } from "vitest";

import {
  buildCsvInventoryQuarantineEnvelope,
  buildCsvQuarantineEnvelope,
  buildCsvSupplierProductQuarantineEnvelope,
} from "@/lib/providers/csv/quarantine";

describe("CSV quarantine provenance", () => {
  it("preserves bindable resource provenance", () => {
    const result = buildCsvQuarantineEnvelope(7, {
      provider: "csv",
      resourceType: "product_variant",
      externalId: "sku=ABC",
      externalParentId: "PRODUCT-1",
      adapterVersion: "variant-v1",
      reasonCode: "RELATIONSHIP_UNRESOLVED",
      issues: [
        {
          code: "RELATIONSHIP_UNRESOLVED",
          message: "Parent missing.",
          field: null,
        },
      ],
    });

    expect(result).toEqual({
      rowNumber: 7,
      provider: "csv",
      adapterVersion: "variant-v1",
      reasonCode: "RELATIONSHIP_UNRESOLVED",
      issues: [
        {
          code: "RELATIONSHIP_UNRESOLVED",
          message: "Parent missing.",
          field: null,
        },
      ],
      subjectType: "resource",
      resourceType: "product_variant",
      externalId: "sku=ABC",
      externalParentId: "PRODUCT-1",
    });
  });

  it("does not pretend inventory is a ProviderBinding resource", () => {
    const result = buildCsvInventoryQuarantineEnvelope({
      rowNumber: 8,
      adapterVersion: "inventory-v1",
      variantExternalId: "sku=ABC",
      locationExternalId: "LOC-1",
      reasonCode: "NORMALIZATION_QUARANTINED",
      issues: [
        {
          code: "INVALID_QUANTITY",
          message: "Bad quantity.",
          field: "onHandQuantity",
        },
      ],
    });

    expect(result.subjectType).toBe("observation");

    expect(result.observationType).toBe("inventory_snapshot");

    expect("resourceType" in result).toBe(false);
  });

  it("does not pretend supplier-product is a provider resource", () => {
    const result = buildCsvSupplierProductQuarantineEnvelope({
      rowNumber: 9,
      adapterVersion: "supplier-product-v1",
      supplierExternalId: "SUP-1",
      variantExternalId: "VAR-1",
      reasonCode: "RELATIONSHIP_UNRESOLVED",
      issues: [
        {
          code: "RELATIONSHIP_UNRESOLVED",
          message: "Variant missing.",
          field: "variantExternalId",
        },
      ],
    });

    expect(result.subjectType).toBe("relationship");

    expect(result.relationshipType).toBe("supplier_product");

    expect("resourceType" in result).toBe(false);
  });
});
