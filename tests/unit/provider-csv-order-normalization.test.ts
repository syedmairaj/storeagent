import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeCsvOrderItemRow,
  normalizeCsvOrderRow,
} from "@/lib/providers/csv/order-normalization";

import type {
  CsvAdapterConfig,
} from "@/lib/providers/types";

const orderConfig:
  CsvAdapterConfig = {
    resourceType:
      "order",

    adapterVersion:
      "csv-order-v1",

    mappings: [
      {
        canonicalField:
          "externalId",
        sourceColumn:
          "Order ID",
      },
      {
        canonicalField:
          "externalReference",
        sourceColumn:
          "Order Number",
      },
      {
        canonicalField:
          "orderedAt",
        sourceColumn:
          "Ordered At",
      },
      {
        canonicalField:
          "status",
        sourceColumn:
          "Status",
      },
      {
        canonicalField:
          "currency",
        sourceColumn:
          "Currency",
      },
      {
        canonicalField:
          "grossAmount",
        sourceColumn:
          "Gross",
      },
      {
        canonicalField:
          "discountAmount",
        sourceColumn:
          "Discount",
      },
      {
        canonicalField:
          "netAmount",
        sourceColumn:
          "Net",
      },
    ],
  };

const itemConfig:
  CsvAdapterConfig = {
    resourceType:
      "order_item",

    adapterVersion:
      "csv-order-item-v1",

    mappings: [
      {
        canonicalField:
          "externalId",
        sourceColumn:
          "Line ID",
      },
      {
        canonicalField:
          "externalParentId",
        sourceColumn:
          "Order ID",
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
          "locationExternalId",
        sourceColumn:
          "Location ID",
      },
      {
        canonicalField:
          "quantity",
        sourceColumn:
          "Quantity",
      },
      {
        canonicalField:
          "unitPriceAmount",
        sourceColumn:
          "Unit Price",
      },
      {
        canonicalField:
          "discountAmount",
        sourceColumn:
          "Discount",
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
    ],
  };

describe(
  "CSV order normalization",
  () => {
    it(
      "accepts explicit order identity and exact commercial values",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                " ORD-1 ",
              "Order Number":
                " #1001 ",
              "Ordered At":
                "2026-10-11T12:00:00+04:00",
              Status:
                " COMPLETED ",
              Currency:
                " usd ",
              Gross:
                " 100.00 ",
              Discount:
                " 10.00 ",
              Net:
                " 90.00 ",
            },
            orderConfig,
          );

        expect(
          result,
        ).toEqual({
          disposition:
            "accepted",
          provider:
            "csv",
          resourceType:
            "order",
          externalId:
            "ORD-1",
          externalParentId:
            null,
          adapterVersion:
            "csv-order-v1",
          canonical: {
            externalReference:
              "#1001",
            status:
              "completed",
            orderedAt:
              "2026-10-11T08:00:00.000Z",
            currency:
              "USD",
            grossAmount:
              "100",
            discountAmount:
              "10",
            netAmount:
              "90",
          },
          issues: [],
        });
      },
    );

    it(
      "does not use external reference as identity",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID": "",
              "Order Number":
                "#1001",
              "Ordered At":
                "2026-10-11T08:00:00Z",
              Currency:
                "USD",
            },
            orderConfig,
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
      "preserves blank external reference as null",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                "ORD-1",
              "Order Number":
                "",
              "Ordered At":
                "2026-10-11T08:00:00Z",
              Currency:
                "USD",
            },
            orderConfig,
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
              .externalReference,
          ).toBeNull();
        }
      },
    );

    it(
      "requires order timestamp",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                "ORD-1",
              Currency:
                "USD",
            },
            orderConfig,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.code ===
                "REQUIRED_FIELD_MISSING" &&
              entry.field ===
                "orderedAt",
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects timezone-less order timestamp",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                "ORD-1",
              "Ordered At":
                "2026-10-11T08:00:00",
              Currency:
                "USD",
            },
            orderConfig,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.code ===
              "INVALID_TIMESTAMP",
          ),
        ).toBe(true);
      },
    );

    it(
      "requires order currency",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                "ORD-1",
              "Ordered At":
                "2026-10-11T08:00:00Z",
              Currency: "",
            },
            orderConfig,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );
      },
    );

    it(
      "maps unsupported order status to canonical unknown",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                "ORD-1",
              "Ordered At":
                "2026-10-11T08:00:00Z",
              Status:
                "fulfilled",
              Currency:
                "USD",
            },
            orderConfig,
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
            "unknown",
          );
        }
      },
    );

    it(
      "preserves blank optional money as null",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                "ORD-1",
              "Ordered At":
                "2026-10-11T08:00:00Z",
              Currency:
                "USD",
              Gross: "",
              Discount: " ",
              Net: "",
            },
            orderConfig,
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
            grossAmount:
              null,
            discountAmount:
              null,
            netAmount:
              null,
          });
        }
      },
    );

    it(
      "preserves explicit zero money",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                "ORD-1",
              "Ordered At":
                "2026-10-11T08:00:00Z",
              Currency:
                "USD",
              Gross:
                "0.00",
              Discount:
                "0",
              Net:
                "000.000",
            },
            orderConfig,
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
              .grossAmount,
          ).toBe("0");

          expect(
            result.canonical
              .discountAmount,
          ).toBe("0");

          expect(
            result.canonical
              .netAmount,
          ).toBe("0");
        }
      },
    );

    it(
      "quarantines negative order money",
      () => {
        const result =
          normalizeCsvOrderRow(
            {
              "Order ID":
                "ORD-1",
              "Ordered At":
                "2026-10-11T08:00:00Z",
              Currency:
                "USD",
              Net:
                "-1",
            },
            orderConfig,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.code ===
              "INVALID_MONEY",
          ),
        ).toBe(true);
      },
    );
  },
);

describe(
  "CSV order-item normalization",
  () => {
    it(
      "accepts explicit order item relationships",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                " LINE-1 ",
              "Order ID":
                " ORD-1 ",
              "Variant ID":
                " VAR-1 ",
              "Location ID":
                " LOC-1 ",
              Quantity:
                "2",
              "Unit Price":
                "19.99",
              Discount:
                "1.00",
              "Unit Cost":
                "8.50",
              Currency:
                "usd",
            },
            itemConfig,
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
            "order_item",
          externalId:
            "LINE-1",
          externalParentId:
            "ORD-1",
          adapterVersion:
            "csv-order-item-v1",
          canonical: {
            orderExternalId:
              "ORD-1",
            variantExternalId:
              "VAR-1",
            locationExternalId:
              "LOC-1",
            quantity:
              2,
            unitPriceAmount:
              "19.99",
            discountAmount:
              "1",
            unitCostAmount:
              "8.5",
            currency:
              "USD",
          },
          issues: [],
        });
      },
    );

    it(
      "requires explicit stable order-item identity",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID": "",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "VAR-1",
              Quantity:
                "1",
            },
            itemConfig,
            2,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.code ===
                "EXTERNAL_ID_MISSING",
          ),
        ).toBe(true);
      },
    );

    it(
      "requires parent order identity",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "LINE-1",
              "Order ID": "",
              "Variant ID":
                "VAR-1",
              Quantity:
                "1",
            },
            itemConfig,
            2,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.code ===
                "RELATIONSHIP_UNRESOLVED" &&
              entry.field ===
                "externalParentId",
          ),
        ).toBe(true);
      },
    );

    it(
      "uses stable SKU identity when explicit variant identity is absent",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "LINE-1",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "",
              SKU:
                "SKU-AbC",
              Quantity:
                "1",
            },
            itemConfig,
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
              .variantExternalId,
          ).toBe(
            "sku=SKU-AbC",
          );
        }
      },
    );

    it(
      "allows unknown location",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "LINE-1",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "VAR-1",
              "Location ID":
                "",
              Quantity:
                "1",
            },
            itemConfig,
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
              .locationExternalId,
          ).toBeNull();
        }
      },
    );

    it(
      "requires quantity",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "LINE-1",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "VAR-1",
              Quantity:
                "",
            },
            itemConfig,
            2,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.code ===
                "REQUIRED_FIELD_MISSING" &&
              entry.field ===
                "quantity",
          ),
        ).toBe(true);
      },
    );

    it(
      "preserves explicit zero quantity",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "LINE-1",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "VAR-1",
              Quantity:
                "0",
            },
            itemConfig,
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
              .quantity,
          ).toBe(0);
        }
      },
    );

    it(
      "quarantines fractional quantity",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "LINE-1",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "VAR-1",
              Quantity:
                "1.5",
            },
            itemConfig,
            2,
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

    it(
      "requires currency when item money is supplied",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "LINE-1",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "VAR-1",
              Quantity:
                "1",
              "Unit Price":
                "10",
              Currency:
                "",
            },
            itemConfig,
            2,
          );

        expect(
          result.issues.some(
            (entry) =>
              entry.code ===
                "INVALID_CURRENCY" &&
              entry.field ===
                "currency",
          ),
        ).toBe(true);
      },
    );

    it(
      "keeps item currency optional when no money is known",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "LINE-1",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "VAR-1",
              Quantity:
                "1",
              Currency:
                "",
            },
            itemConfig,
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
          ).toBeNull();
        }
      },
    );

    it(
      "does not use diagnostic row number as identity",
      () => {
        const result =
          normalizeCsvOrderItemRow(
            {
              "Line ID":
                "",
              "Order ID":
                "ORD-1",
              "Variant ID":
                "VAR-1",
              Quantity:
                "1",
            },
            itemConfig,
            99,
          );

        expect(
          result.externalId,
        ).toBeNull();
      },
    );

    it(
      "requires positive diagnostic row number",
      () => {
        expect(() =>
          normalizeCsvOrderItemRow(
            {},
            itemConfig,
            0,
          ),
        ).toThrow(
          "CSV row number must be a positive safe integer.",
        );
      },
    );
  },
);
