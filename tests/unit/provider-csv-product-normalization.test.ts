import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeCsvProductRow,
  normalizeCsvProductVariantRow,
} from "@/lib/providers/csv/product-normalization";

import type {
  CsvAdapterConfig,
} from "@/lib/providers/types";

const productConfig:
  CsvAdapterConfig = {
    resourceType:
      "product",
    adapterVersion:
      "csv-product-v1",
    mappings: [
      {
        canonicalField:
          "externalId",
        sourceColumn:
          "Product ID",
      },
      {
        canonicalField:
          "title",
        sourceColumn:
          "Name",
      },
      {
        canonicalField:
          "brand",
        sourceColumn:
          "Brand",
      },
      {
        canonicalField:
          "category",
        sourceColumn:
          "Category",
      },
      {
        canonicalField:
          "status",
        sourceColumn:
          "Status",
      },
    ],
  };

const variantConfig:
  CsvAdapterConfig = {
    resourceType:
      "product_variant",
    adapterVersion:
      "csv-variant-v1",
    mappings: [
      {
        canonicalField:
          "externalId",
        sourceColumn:
          "Variant ID",
      },
      {
        canonicalField:
          "externalParentId",
        sourceColumn:
          "Product ID",
      },
      {
        canonicalField:
          "sku",
        sourceColumn:
          "SKU",
      },
      {
        canonicalField:
          "title",
        sourceColumn:
          "Variant",
      },
      {
        canonicalField:
          "barcode",
        sourceColumn:
          "Barcode",
      },
      {
        canonicalField:
          "status",
        sourceColumn:
          "Status",
      },
      {
        canonicalField:
          "costAmount",
        sourceColumn:
          "Cost",
      },
      {
        canonicalField:
          "sellingPriceAmount",
        sourceColumn:
          "Price",
      },
      {
        canonicalField:
          "currency",
        sourceColumn:
          "Currency",
      },
    ],
  };

describe(
  "CSV product normalization",
  () => {
    it(
      "accepts an explicit product identity and canonical fields",
      () => {
        const result =
          normalizeCsvProductRow(
            {
              "Product ID":
                " PROD-1 ",
              Name:
                " Blue Shirt ",
              Brand:
                " Acme ",
              Category:
                " Apparel ",
              Status:
                " ACTIVE ",
            },
            productConfig,
          );

        expect(
          result,
        ).toEqual({
          disposition:
            "accepted",
          provider:
            "csv",
          resourceType:
            "product",
          externalId:
            "PROD-1",
          externalParentId:
            null,
          adapterVersion:
            "csv-product-v1",
          canonical: {
            title:
              "Blue Shirt",
            brand:
              "Acme",
            category:
              "Apparel",
            status:
              "active",
          },
          issues: [],
        });
      },
    );

    it(
      "preserves blank optional product fields as null",
      () => {
        const result =
          normalizeCsvProductRow(
            {
              "Product ID":
                "P-1",
              Name:
                "Product",
              Brand: " ",
              Category: "",
              Status:
                "draft",
            },
            productConfig,
          );

        expect(
          result.disposition,
        ).toBe(
          "accepted",
        );

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical
              .brand,
          ).toBeNull();

          expect(
            result.canonical
              .category,
          ).toBeNull();
        }
      },
    );

    it(
      "quarantines product without stable external identity",
      () => {
        const result =
          normalizeCsvProductRow(
            {
              "Product ID":
                "",
              Name:
                "Product",
              Status:
                "active",
            },
            productConfig,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );

        expect(
          result.issues,
        ).toContainEqual({
          code:
            "EXTERNAL_ID_MISSING",
          message:
            "CSV product requires a stable external identity.",
          field:
            "externalId",
        });
      },
    );

    it(
      "never uses product title as identity",
      () => {
        const result =
          normalizeCsvProductRow(
            {
              "Product ID":
                "",
              Name:
                "Unique Looking Name",
              Status:
                "active",
            },
            productConfig,
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
      "quarantines missing title",
      () => {
        const result =
          normalizeCsvProductRow(
            {
              "Product ID":
                "P-1",
              Name: " ",
              Status:
                "active",
            },
            productConfig,
          );

        expect(
          result.issues.some(
            (issue) =>
              issue.code ===
              "REQUIRED_FIELD_MISSING" &&
              issue.field ===
              "title",
          ),
        ).toBe(true);
      },
    );

    it(
      "normalizes product status deterministically",
      () => {
        for (
          const [
            input,
            expected,
          ] of [
            [
              "ACTIVE",
              "active",
            ],
            [
              " Draft ",
              "draft",
            ],
            [
              "archived",
              "archived",
            ],
          ] as const
        ) {
          const result =
            normalizeCsvProductRow(
              {
                "Product ID":
                  `P-${expected}`,
                Name:
                  "Product",
                Status:
                  input,
              },
              productConfig,
            );

          expect(
            result.disposition,
          ).toBe(
            "accepted",
          );

          if (
            result.disposition ===
            "accepted"
          ) {
            expect(
              result.canonical
                .status,
            ).toBe(
              expected,
            );
          }
        }
      },
    );

    it(
      "quarantines unsupported product status instead of guessing",
      () => {
        const result =
          normalizeCsvProductRow(
            {
              "Product ID":
                "P-1",
              Name:
                "Product",
              Status:
                "published",
            },
            productConfig,
          );

        expect(
          result.issues.some(
            (issue) =>
              issue.code ===
              "UNSUPPORTED_STATUS",
          ),
        ).toBe(true);
      },
    );
  },
);

describe(
  "CSV product-variant normalization",
  () => {
    it(
      "accepts explicit variant identity and exact money",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                " V-1 ",
              "Product ID":
                " P-1 ",
              SKU:
                " SKU-AbC ",
              Variant:
                " Large ",
              Barcode:
                " 12345 ",
              Status:
                " ACTIVE ",
              Cost:
                " 0012.3400 ",
              Price:
                " 0019.9900 ",
              Currency:
                " usd ",
            },
            variantConfig,
            2,
          );

        expect(
          result,
        ).toEqual({
          disposition:
            "accepted",
          provider:
            "csv",
          resourceType:
            "product_variant",
          externalId:
            "V-1",
          externalParentId:
            "P-1",
          adapterVersion:
            "csv-variant-v1",
          canonical: {
            sku:
              "SKU-AbC",
            barcode:
              "12345",
            title:
              "Large",
            status:
              "active",
            costAmount:
              "12.34",
            sellingPriceAmount:
              "19.99",
            currency:
              "USD",
          },
          issues: [],
        });
      },
    );

    it(
      "uses stable SKU composite identity when explicit variant ID is absent",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "",
              "Product ID":
                "P-1",
              SKU:
                "SKU-AbC",
              Status:
                "active",
            },
            variantConfig,
            5,
          );

        expect(
          result.disposition,
        ).toBe(
          "accepted",
        );

        expect(
          result.externalId,
        ).toBe(
          "sku=SKU-AbC",
        );
      },
    );

    it(
      "requires canonical SKU even when external ID exists",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU: " ",
              Status:
                "active",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );

        expect(
          result.issues.some(
            (issue) =>
              issue.field ===
                "sku" &&
              issue.code ===
                "REQUIRED_FIELD_MISSING",
          ),
        ).toBe(true);
      },
    );

    it(
      "requires stable parent product identity",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "",
              SKU:
                "SKU-1",
              Status:
                "active",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );

        expect(
          result.issues.some(
            (issue) =>
              issue.code ===
                "RELATIONSHIP_UNRESOLVED" &&
              issue.field ===
                "externalParentId",
          ),
        ).toBe(true);
      },
    );

    it(
      "preserves blank optional variant fields as null",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU:
                "SKU-1",
              Variant: "",
              Barcode: " ",
              Status:
                "inactive",
              Cost: "",
              Price: "",
              Currency: "",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "accepted",
        );

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical,
          ).toMatchObject({
            title: null,
            barcode: null,
            costAmount:
              null,
            sellingPriceAmount:
              null,
            currency:
              null,
            status:
              "inactive",
          });
        }
      },
    );

    it(
      "preserves explicit zero money",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU:
                "SKU-1",
              Status:
                "active",
              Cost:
                "0.00",
              Price:
                "000.000",
              Currency:
                "usd",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "accepted",
        );

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical
              .costAmount,
          ).toBe("0");

          expect(
            result.canonical
              .sellingPriceAmount,
          ).toBe("0");
        }
      },
    );

    it(
      "quarantines malformed exact money",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU:
                "SKU-1",
              Status:
                "active",
              Cost:
                "$12.50",
              Currency:
                "USD",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );

        expect(
          result.issues.some(
            (issue) =>
              issue.code ===
              "INVALID_MONEY" &&
              issue.field ===
              "costAmount",
          ),
        ).toBe(true);
      },
    );

    it(
      "quarantines negative commercial money",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU:
                "SKU-1",
              Status:
                "active",
              Cost:
                "-1.25",
              Currency:
                "USD",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );

        expect(
          result.issues.some(
            (issue) =>
              issue.code ===
              "INVALID_MONEY",
          ),
        ).toBe(true);
      },
    );

    it(
      "requires currency when money is supplied",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU:
                "SKU-1",
              Status:
                "active",
              Price:
                "19.99",
              Currency: "",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );

        expect(
          result.issues.some(
            (issue) =>
              issue.code ===
                "INVALID_CURRENCY" &&
              issue.field ===
                "currency",
          ),
        ).toBe(true);
      },
    );

    it(
      "normalizes a known currency even when amounts are unknown",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU:
                "SKU-1",
              Status:
                "active",
              Cost: "",
              Price: "",
              Currency:
                " usd ",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "accepted",
        );

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical
              .currency,
          ).toBe(
            "USD",
          );
        }
      },
    );

    it(
      "normalizes variant status deterministically",
      () => {
        for (
          const status of [
            "active",
            "inactive",
            "archived",
          ] as const
        ) {
          const result =
            normalizeCsvProductVariantRow(
              {
                "Variant ID":
                  `V-${status}`,
                "Product ID":
                  "P-1",
                SKU:
                  `SKU-${status}`,
                Status:
                  status.toUpperCase(),
              },
              variantConfig,
              2,
            );

          expect(
            result.disposition,
          ).toBe(
            "accepted",
          );

          if (
            result.disposition ===
            "accepted"
          ) {
            expect(
              result.canonical
                .status,
            ).toBe(
              status,
            );
          }
        }
      },
    );

    it(
      "quarantines unsupported variant status instead of guessing",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU:
                "SKU-1",
              Status:
                "enabled",
            },
            variantConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );

        expect(
          result.issues.some(
            (issue) =>
              issue.code ===
              "UNSUPPORTED_STATUS",
          ),
        ).toBe(true);
      },
    );

    it(
      "preserves external identity case",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "VaR-AbC",
              "Product ID":
                "PrOd-AbC",
              SKU:
                "SKU-AbC",
              Status:
                "active",
            },
            variantConfig,
            2,
          );

        expect(
          result.externalId,
        ).toBe(
          "VaR-AbC",
        );

        expect(
          result.externalParentId,
        ).toBe(
          "PrOd-AbC",
        );
      },
    );

    it(
      "does not put diagnostic row number into canonical output",
      () => {
        const result =
          normalizeCsvProductVariantRow(
            {
              "Variant ID":
                "V-1",
              "Product ID":
                "P-1",
              SKU:
                "SKU-1",
              Status:
                "active",
            },
            variantConfig,
            99,
          );

        expect(
          result.disposition,
        ).toBe(
          "accepted",
        );

        if (
          result.disposition ===
          "accepted"
        ) {
          expect(
            result.canonical,
          ).not.toHaveProperty(
            "rowNumber",
          );
        }
      },
    );

    it(
      "rejects invalid adapter resource configuration",
      () => {
        expect(() =>
          normalizeCsvProductRow(
            {},
            {
              ...productConfig,
              resourceType:
                "order",
            },
          ),
        ).toThrow(
          'CSV adapter resource type must be "product".',
        );
      },
    );

    it(
      "requires positive diagnostic row number for variant normalization",
      () => {
        expect(() =>
          normalizeCsvProductVariantRow(
            {},
            variantConfig,
            0,
          ),
        ).toThrow(
          "CSV row number must be a positive safe integer.",
        );
      },
    );
  },
);
