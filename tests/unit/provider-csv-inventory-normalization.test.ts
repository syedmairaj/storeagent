import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeCsvInventoryObservation,
} from "@/lib/providers/csv/inventory-normalization";

import type {
  CsvInventoryAdapterConfig,
} from "@/lib/providers/types";

const inventoryConfig:
  CsvInventoryAdapterConfig = {
    observationType:
      "inventory_snapshot",

    adapterVersion:
      "csv-inventory-v1",

    mappings: [
      {
        canonicalField:
          "variantExternalId",
        sourceColumn:
          "Variant ID",
      },
      {
        canonicalField:
          "locationExternalId",
        sourceColumn:
          "Location ID",
      },
      {
        canonicalField:
          "sku",
        sourceColumn:
          "SKU",
      },
      {
        canonicalField:
          "observedAt",
        sourceColumn:
          "Observed At",
      },
      {
        canonicalField:
          "onHandQuantity",
        sourceColumn:
          "On Hand",
      },
      {
        canonicalField:
          "availableQuantity",
        sourceColumn:
          "Available",
      },
      {
        canonicalField:
          "committedQuantity",
        sourceColumn:
          "Committed",
      },
      {
        canonicalField:
          "incomingQuantity",
        sourceColumn:
          "Incoming",
      },
    ],
  };

describe(
  "CSV inventory observation normalization",
  () => {
    it(
      "accepts explicit variant and location scope",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                " VAR-1 ",
              "Location ID":
                " LOC-1 ",
              "Observed At":
                "2026-10-11T12:00:00+04:00",
              "On Hand":
                "100",
              Available:
                "80",
              Committed:
                "20",
              Incoming:
                "40",
            },
            inventoryConfig,
            2,
          );

        expect(
          result,
        ).toEqual({
          disposition:
            "accepted",

          provider:
            "csv",

          observationType:
            "inventory_snapshot",

          adapterVersion:
            "csv-inventory-v1",

          variantExternalId:
            "VAR-1",

          locationExternalId:
            "LOC-1",

          canonical: {
            variantExternalId:
              "VAR-1",

            locationExternalId:
              "LOC-1",

            observedAt:
              "2026-10-11T08:00:00.000Z",

            onHandQuantity:
              100,

            availableQuantity:
              80,

            committedQuantity:
              20,

            incomingQuantity:
              40,
          },

          issues: [],
        });
      },
    );

    it(
      "uses stable SKU composite identity when explicit variant identity is absent",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "",
              "Location ID":
                "LOC-1",
              SKU:
                "SKU-AbC",
              "Observed At":
                "2026-10-11T08:00:00Z",
              Available:
                "5",
            },
            inventoryConfig,
            3,
          );

        expect(
          result.disposition,
        ).toBe(
          "accepted",
        );

        expect(
          result.variantExternalId,
        ).toBe(
          "sku=SKU-AbC",
        );
      },
    );

    it(
      "requires stable variant identity",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "",
              SKU: "",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              Available:
                "5",
            },
            inventoryConfig,
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
                "variantExternalId",
          ),
        ).toBe(true);
      },
    );

    it(
      "requires stable location identity",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "",
              "Observed At":
                "2026-10-11T08:00:00Z",
              Available:
                "5",
            },
            inventoryConfig,
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
                "locationExternalId",
          ),
        ).toBe(true);
      },
    );

    it(
      "requires observed timestamp",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "",
              Available:
                "5",
            },
            inventoryConfig,
            2,
          );

        expect(
          result.issues.some(
            (issue) =>
              issue.code ===
                "REQUIRED_FIELD_MISSING" &&
              issue.field ===
                "observedAt",
          ),
        ).toBe(true);
      },
    );

    it(
      "requires explicit timezone on observed timestamp",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00",
              Available:
                "5",
            },
            inventoryConfig,
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
              "INVALID_TIMESTAMP",
          ),
        ).toBe(true);
      },
    );

    it(
      "normalizes timezone offset to UTC",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T12:30:00+04:00",
              Available:
                "5",
            },
            inventoryConfig,
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
              .observedAt,
          ).toBe(
            "2026-10-11T08:30:00.000Z",
          );
        }
      },
    );

    it(
      "preserves blank quantities as unknown",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              "On Hand":
                "",
              Available:
                "12",
              Committed:
                " ",
              Incoming:
                "",
            },
            inventoryConfig,
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
            onHandQuantity:
              null,
            availableQuantity:
              12,
            committedQuantity:
              null,
            incomingQuantity:
              null,
          });
        }
      },
    );

    it(
      "preserves known zero independently for every inventory semantic",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              "On Hand":
                "0",
              Available:
                "0",
              Committed:
                "0",
              Incoming:
                "0",
            },
            inventoryConfig,
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
            onHandQuantity:
              0,
            availableQuantity:
              0,
            committedQuantity:
              0,
            incomingQuantity:
              0,
          });
        }
      },
    );

    it(
      "quarantines observation with no known inventory evidence",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              "On Hand":
                "",
              Available:
                "",
              Committed:
                "",
              Incoming:
                "",
            },
            inventoryConfig,
            2,
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
            "AMBIGUOUS_INVENTORY_SEMANTICS",

          message:
            "CSV inventory observation must contain at least one known inventory quantity.",

          field:
            "inventory",
        });
      },
    );

    it(
      "quarantines negative quantity",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              Available:
                "-1",
            },
            inventoryConfig,
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
                "INVALID_QUANTITY" &&
              issue.field ===
                "availableQuantity",
          ),
        ).toBe(true);
      },
    );

    it(
      "quarantines fractional quantity",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              Incoming:
                "1.5",
            },
            inventoryConfig,
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
              "INVALID_QUANTITY",
          ),
        ).toBe(true);
      },
    );

    it(
      "does not infer available from on-hand and committed",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              "On Hand":
                "100",
              Committed:
                "20",
            },
            inventoryConfig,
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
              .availableQuantity,
          ).toBeNull();
        }
      },
    );

    it(
      "does not infer committed from on-hand and available",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              "On Hand":
                "100",
              Available:
                "80",
            },
            inventoryConfig,
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
              .committedQuantity,
          ).toBeNull();
        }
      },
    );

    it(
      "preserves source identity case",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VaR-AbC",
              "Location ID":
                "LoC-XyZ",
              "Observed At":
                "2026-10-11T08:00:00Z",
              Available:
                "1",
            },
            inventoryConfig,
            2,
          );

        expect(
          result.variantExternalId,
        ).toBe(
          "VaR-AbC",
        );

        expect(
          result.locationExternalId,
        ).toBe(
          "LoC-XyZ",
        );
      },
    );

    it(
      "does not put diagnostic row number into canonical observation",
      () => {
        const result =
          normalizeCsvInventoryObservation(
            {
              "Variant ID":
                "VAR-1",
              "Location ID":
                "LOC-1",
              "Observed At":
                "2026-10-11T08:00:00Z",
              Available:
                "1",
            },
            inventoryConfig,
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
      "requires positive diagnostic row number",
      () => {
        expect(() =>
          normalizeCsvInventoryObservation(
            {},
            inventoryConfig,
            0,
          ),
        ).toThrow(
          "CSV row number must be a positive safe integer.",
        );
      },
    );
  },
);
