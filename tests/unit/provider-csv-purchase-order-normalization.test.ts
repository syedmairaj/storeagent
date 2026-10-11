import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeCsvPurchaseOrderItemRow,
  normalizeCsvPurchaseOrderRow,
} from "@/lib/providers/csv/purchase-order-normalization";

import type {
  CsvAdapterConfig,
} from "@/lib/providers/types";

const poConfig:
  CsvAdapterConfig = {
    resourceType:
      "purchase_order",
    adapterVersion:
      "csv-po-v1",
    mappings: [
      {
        canonicalField:
          "externalId",
        sourceColumn:
          "PO ID",
      },
      {
        canonicalField:
          "supplierExternalId",
        sourceColumn:
          "Supplier ID",
      },
      {
        canonicalField:
          "externalReference",
        sourceColumn:
          "PO Number",
      },
      {
        canonicalField:
          "status",
        sourceColumn:
          "Status",
      },
      {
        canonicalField:
          "orderedAt",
        sourceColumn:
          "Ordered At",
      },
      {
        canonicalField:
          "expectedAt",
        sourceColumn:
          "Expected At",
      },
      {
        canonicalField:
          "receivedAt",
        sourceColumn:
          "Received At",
      },
      {
        canonicalField:
          "currency",
        sourceColumn:
          "Currency",
      },
    ],
  };

const itemConfig:
  CsvAdapterConfig = {
    resourceType:
      "purchase_order_item",
    adapterVersion:
      "csv-po-item-v1",
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
          "PO ID",
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
          "destinationLocationExternalId",
        sourceColumn:
          "Destination",
      },
      {
        canonicalField:
          "orderedQuantity",
        sourceColumn:
          "Ordered Qty",
      },
      {
        canonicalField:
          "receivedQuantity",
        sourceColumn:
          "Received Qty",
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
  "CSV purchase-order normalization",
  () => {
    it(
      "accepts PO with optional supplier and dates",
      () => {
        const result =
          normalizeCsvPurchaseOrderRow(
            {
              "PO ID":
                "PO-1",
              "Supplier ID":
                "SUP-1",
              "PO Number":
                "PO-1001",
              Status:
                "confirmed",
              "Ordered At":
                "2026-10-10T10:00:00Z",
              "Expected At":
                "2026-10-20T10:00:00Z",
              "Received At":
                "",
              Currency:
                "usd",
            },
            poConfig,
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
          ).toMatchObject({
            supplierExternalId:
              "SUP-1",
            externalReference:
              "PO-1001",
            status:
              "confirmed",
            orderedAt:
              "2026-10-10T10:00:00.000Z",
            expectedAt:
              "2026-10-20T10:00:00.000Z",
            receivedAt:
              null,
            currency:
              "USD",
          });
        }
      },
    );

    it(
      "allows unknown supplier dates and currency",
      () => {
        const result =
          normalizeCsvPurchaseOrderRow(
            {
              "PO ID":
                "PO-1",
              "Supplier ID":
                "",
              "Ordered At":
                "",
              "Expected At":
                "",
              "Received At":
                "",
              Currency:
                "",
            },
            poConfig,
          );

        expect(
          result.disposition,
        ).toBe("accepted");
      },
    );

    it(
      "maps unsupported status to unknown",
      () => {
        const result =
          normalizeCsvPurchaseOrderRow(
            {
              "PO ID":
                "PO-1",
              Status:
                "in_transit",
            },
            poConfig,
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
              .status,
          ).toBe(
            "unknown",
          );
        }
      },
    );

    it(
      "does not use external reference as PO identity",
      () => {
        const result =
          normalizeCsvPurchaseOrderRow(
            {
              "PO ID":
                "",
              "PO Number":
                "PO-1001",
            },
            poConfig,
          );

        expect(
          result.externalId,
        ).toBeNull();
      },
    );

    it(
      "rejects timezone-less optional dates when supplied",
      () => {
        const result =
          normalizeCsvPurchaseOrderRow(
            {
              "PO ID":
                "PO-1",
              "Expected At":
                "2026-10-20T10:00:00",
            },
            poConfig,
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
  },
);

describe(
  "CSV purchase-order-item normalization",
  () => {
    it(
      "accepts explicit PO-item relationships and quantities",
      () => {
        const result =
          normalizeCsvPurchaseOrderItemRow(
            {
              "Line ID":
                "POL-1",
              "PO ID":
                "PO-1",
              "Variant ID":
                "VAR-1",
              Destination:
                "LOC-1",
              "Ordered Qty":
                "10",
              "Received Qty":
                "4",
              "Unit Cost":
                "7.50",
              Currency:
                "usd",
            },
            itemConfig,
            2,
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
            purchaseOrderExternalId:
              "PO-1",
            variantExternalId:
              "VAR-1",
            destinationLocationExternalId:
              "LOC-1",
            orderedQuantity:
              10,
            receivedQuantity:
              4,
            unitCostAmount:
              "7.5",
            currency:
              "USD",
          });
        }
      },
    );

    it(
      "requires ordered quantity",
      () => {
        const result =
          normalizeCsvPurchaseOrderItemRow(
            {
              "Line ID":
                "POL-1",
              "PO ID":
                "PO-1",
              "Variant ID":
                "VAR-1",
              "Ordered Qty":
                "",
            },
            itemConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );
      },
    );

    it(
      "keeps received quantity optional",
      () => {
        const result =
          normalizeCsvPurchaseOrderItemRow(
            {
              "Line ID":
                "POL-1",
              "PO ID":
                "PO-1",
              "Variant ID":
                "VAR-1",
              "Ordered Qty":
                "10",
              "Received Qty":
                "",
            },
            itemConfig,
            2,
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
              .receivedQuantity,
          ).toBeNull();
        }
      },
    );

    it(
      "does not calculate or reject received greater than ordered",
      () => {
        const result =
          normalizeCsvPurchaseOrderItemRow(
            {
              "Line ID":
                "POL-1",
              "PO ID":
                "PO-1",
              "Variant ID":
                "VAR-1",
              "Ordered Qty":
                "10",
              "Received Qty":
                "11",
            },
            itemConfig,
            2,
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
              .receivedQuantity,
          ).toBe(11);
        }
      },
    );

    it(
      "allows unknown destination location",
      () => {
        const result =
          normalizeCsvPurchaseOrderItemRow(
            {
              "Line ID":
                "POL-1",
              "PO ID":
                "PO-1",
              "Variant ID":
                "VAR-1",
              Destination:
                "",
              "Ordered Qty":
                "1",
            },
            itemConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe("accepted");
      },
    );

    it(
      "uses SKU fallback for variant relationship",
      () => {
        const result =
          normalizeCsvPurchaseOrderItemRow(
            {
              "Line ID":
                "POL-1",
              "PO ID":
                "PO-1",
              "Variant ID":
                "",
              SKU:
                "SKU-AbC",
              "Ordered Qty":
                "1",
            },
            itemConfig,
            2,
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
              .variantExternalId,
          ).toBe(
            "sku=SKU-AbC",
          );
        }
      },
    );

    it(
      "requires currency when unit cost is known",
      () => {
        const result =
          normalizeCsvPurchaseOrderItemRow(
            {
              "Line ID":
                "POL-1",
              "PO ID":
                "PO-1",
              "Variant ID":
                "VAR-1",
              "Ordered Qty":
                "1",
              "Unit Cost":
                "5",
              Currency:
                "",
            },
            itemConfig,
            2,
          );

        expect(
          result.disposition,
        ).toBe(
          "quarantined",
        );
      },
    );

    it(
      "requires positive diagnostic row number",
      () => {
        expect(() =>
          normalizeCsvPurchaseOrderItemRow(
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
