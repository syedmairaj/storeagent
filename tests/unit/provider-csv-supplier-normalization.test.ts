import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeCsvSupplierProductRow,
  normalizeCsvSupplierRow,
} from "@/lib/providers/csv/supplier-normalization";

import type {
  CsvAdapterConfig,
  CsvSupplierProductAdapterConfig,
} from "@/lib/providers/types";

const supplierConfig:
  CsvAdapterConfig = {
    resourceType:
      "supplier",
    adapterVersion:
      "csv-supplier-v1",
    mappings: [
      {
        canonicalField:
          "externalId",
        sourceColumn:
          "Supplier ID",
      },
      {
        canonicalField:
          "title",
        sourceColumn:
          "Supplier",
      },
      {
        canonicalField:
          "defaultLeadTimeDays",
        sourceColumn:
          "Lead Days",
      },
      {
        canonicalField:
          "currency",
        sourceColumn:
          "Currency",
      },
      {
        canonicalField:
          "email",
        sourceColumn:
          "Email",
      },
      {
        canonicalField:
          "phone",
        sourceColumn:
          "Phone",
      },
    ],
  };

const relationshipConfig:
  CsvSupplierProductAdapterConfig = {
    relationshipType:
      "supplier_product",
    adapterVersion:
      "csv-supplier-product-v1",
    mappings: [
      {
        canonicalField:
          "supplierExternalId",
        sourceColumn:
          "Supplier ID",
      },
      {
        canonicalField:
          "variantExternalId",
        sourceColumn:
          "Variant ID",
      },
      {
        canonicalField:
          "sku",
        sourceColumn:
          "SKU",
      },
      {
        canonicalField:
          "supplierSku",
        sourceColumn:
          "Supplier SKU",
      },
      {
        canonicalField:
          "unitCostAmount",
        sourceColumn:
          "Unit Cost",
      },
      {
        canonicalField:
          "currency",
        sourceColumn:
          "Currency",
      },
      {
        canonicalField:
          "leadTimeDays",
        sourceColumn:
          "Lead Days",
      },
      {
        canonicalField:
          "minimumOrderQuantity",
        sourceColumn:
          "MOQ",
      },
      {
        canonicalField:
          "packSize",
        sourceColumn:
          "Pack Size",
      },
      {
        canonicalField:
          "preferred",
        sourceColumn:
          "Preferred",
      },
    ],
  };

describe(
  "CSV supplier normalization",
  () => {
    it(
      "accepts stable supplier identity and organization-scoped data",
      () => {
        const result =
          normalizeCsvSupplierRow(
            {
              "Supplier ID":
                " SUP-1 ",
              Supplier:
                " Acme ",
              "Lead Days":
                "7",
              Currency:
                " usd ",
              Email:
                " ops@example.com ",
              Phone:
                " +1-555 ",
            },
            supplierConfig,
          );

        expect(
          result.disposition,
        ).toBe("accepted");

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical,
          ).toEqual({
            name:
              "Acme",
            defaultLeadTimeDays:
              7,
            currency:
              "USD",
            email:
              "ops@example.com",
            phone:
              "+1-555",
          });
        }
      },
    );

    it(
      "never uses supplier name as identity",
      () => {
        const result =
          normalizeCsvSupplierRow(
            {
              "Supplier ID":
                "",
              Supplier:
                "Acme",
            },
            supplierConfig,
          );

        expect(
          result.externalId,
        ).toBeNull();

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );
      },
    );

    it(
      "allows unknown lead time and currency",
      () => {
        const result =
          normalizeCsvSupplierRow(
            {
              "Supplier ID":
                "SUP-1",
              Supplier:
                "Acme",
              "Lead Days":
                "",
              Currency:
                "",
            },
            supplierConfig,
          );

        expect(
          result.disposition,
        ).toBe("accepted");

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical
              .defaultLeadTimeDays,
          ).toBeNull();

          expect(
            result.canonical
              .currency,
          ).toBeNull();
        }
      },
    );

    it(
      "accepts zero supplier lead time",
      () => {
        const result =
          normalizeCsvSupplierRow(
            {
              "Supplier ID":
                "SUP-1",
              Supplier:
                "Acme",
              "Lead Days":
                "0",
            },
            supplierConfig,
          );

        expect(
          result.disposition,
        ).toBe("accepted");
      },
    );

    it(
      "quarantines negative supplier lead time",
      () => {
        const result =
          normalizeCsvSupplierRow(
            {
              "Supplier ID":
                "SUP-1",
              Supplier:
                "Acme",
              "Lead Days":
                "-1",
            },
            supplierConfig,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.code ===
              "INVALID_QUANTITY",
          ),
        ).toBe(true);
      },
    );
  },
);

describe(
  "CSV supplier-product normalization",
  () => {
    it(
      "normalizes supplier-product relationship without ProviderBinding identity",
      () => {
        const result =
          normalizeCsvSupplierProductRow(
            {
              "Supplier ID":
                "SUP-1",
              "Variant ID":
                "VAR-1",
              "Supplier SKU":
                "S-100",
              "Unit Cost":
                "12.50",
              Currency:
                "usd",
              "Lead Days":
                "5",
              MOQ:
                "6",
              "Pack Size":
                "3",
              Preferred:
                "yes",
            },
            relationshipConfig,
          );

        expect(
          result.disposition,
        ).toBe("accepted");

        expect(
          result,
        ).toMatchObject({
          supplierExternalId:
            "SUP-1",
          variantExternalId:
            "VAR-1",
          relationshipType:
            "supplier_product",
        });

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical,
          ).toMatchObject({
            supplierSku:
              "S-100",
            unitCostAmount:
              "12.5",
            currency:
              "USD",
            leadTimeDays:
              5,
            minimumOrderQuantity:
              6,
            packSize:
              3,
            preferred:
              true,
          });
        }
      },
    );

    it(
      "uses stable SKU fallback for variant relationship",
      () => {
        const result =
          normalizeCsvSupplierProductRow(
            {
              "Supplier ID":
                "SUP-1",
              "Variant ID":
                "",
              SKU:
                "SKU-AbC",
            },
            relationshipConfig,
          );

        expect(
          result.variantExternalId,
        ).toBe(
          "sku=SKU-AbC",
        );
      },
    );

    it(
      "requires supplier relationship",
      () => {
        const result =
          normalizeCsvSupplierProductRow(
            {
              "Supplier ID":
                "",
              "Variant ID":
                "VAR-1",
            },
            relationshipConfig,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );
      },
    );

    it(
      "rejects zero MOQ",
      () => {
        const result =
          normalizeCsvSupplierProductRow(
            {
              "Supplier ID":
                "SUP-1",
              "Variant ID":
                "VAR-1",
              MOQ:
                "0",
            },
            relationshipConfig,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.field ===
                "minimumOrderQuantity",
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects zero pack size",
      () => {
        const result =
          normalizeCsvSupplierProductRow(
            {
              "Supplier ID":
                "SUP-1",
              "Variant ID":
                "VAR-1",
              "Pack Size":
                "0",
            },
            relationshipConfig,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.field ===
                "packSize",
          ),
        ).toBe(true);
      },
    );

    it(
      "requires currency when unit cost is known",
      () => {
        const result =
          normalizeCsvSupplierProductRow(
            {
              "Supplier ID":
                "SUP-1",
              "Variant ID":
                "VAR-1",
              "Unit Cost":
                "10",
              Currency:
                "",
            },
            relationshipConfig,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );
      },
    );

    it(
      "defaults absent preferred flag to false",
      () => {
        const result =
          normalizeCsvSupplierProductRow(
            {
              "Supplier ID":
                "SUP-1",
              "Variant ID":
                "VAR-1",
            },
            relationshipConfig,
          );

        expect(
          result.disposition,
        ).toBe("accepted");

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical
              .preferred,
          ).toBe(false);
        }
      },
    );
  },
);
