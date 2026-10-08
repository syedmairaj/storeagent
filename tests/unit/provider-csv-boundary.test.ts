import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveCsvExternalId,
} from "@/lib/providers/csv/identity";

import {
  csvSourceColumnForField,
  readCsvMappedValue,
  validateCsvMappings,
} from "@/lib/providers/csv/mapping";

import type {
  CsvAdapterConfig,
} from "@/lib/providers/types";

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
        sourceColumn: "ID",
      },
      {
        canonicalField: "sku",
        sourceColumn: "SKU",
      },
      {
        canonicalField:
          "availableQuantity",
        sourceColumn:
          "Available Stock",
      },
    ],
  };

describe("CSV provider boundary", () => {
  it("uses explicit merchant column mapping", () => {
    expect(
      csvSourceColumnForField(
        variantConfig,
        "availableQuantity",
      ),
    ).toBe(
      "Available Stock",
    );
  });

  it("does not infer unmapped canonical fields from similar column names", () => {
    expect(
      csvSourceColumnForField(
        variantConfig,
        "onHandQuantity",
      ),
    ).toBeNull();
  });

  it("trims mapped cell values", () => {
    expect(
      readCsvMappedValue(
        {
          ID: "  abc-123 ",
        },
        variantConfig,
        "externalId",
      ),
    ).toBe(
      "abc-123",
    );
  });

  it("preserves blank mapped cells as unknown", () => {
    expect(
      readCsvMappedValue(
        {
          "Available Stock":
            "   ",
        },
        variantConfig,
        "availableQuantity",
      ),
    ).toBeNull();
  });

  it("rejects duplicate canonical-field mappings", () => {
    expect(() =>
      validateCsvMappings([
        {
          canonicalField:
            "sku",
          sourceColumn: "SKU",
        },
        {
          canonicalField:
            "sku",
          sourceColumn:
            "Product SKU",
        },
      ]),
    ).toThrow(
      'CSV canonical field "sku" is mapped more than once.',
    );
  });

  it("rejects duplicate source-column mappings", () => {
    expect(() =>
      validateCsvMappings([
        {
          canonicalField:
            "sku",
          sourceColumn: "Value",
        },
        {
          canonicalField:
            "barcode",
          sourceColumn: "Value",
        },
      ]),
    ).toThrow(
      'CSV source column "Value" is mapped more than once.',
    );
  });

  it("uses mapped external identity when present", () => {
    expect(
      resolveCsvExternalId(
        {
          ID: "  row-1 ",
          SKU: "SKU-1",
        },
        variantConfig,
        2,
      ),
    ).toBe("row-1");
  });

  it("uses deterministic SKU composite identity when external ID is absent", () => {
    expect(
      resolveCsvExternalId(
        {
          ID: "",
          SKU: "SKU-AbC",
        },
        variantConfig,
        2,
      ),
    ).toBe(
      "sku=SKU-AbC",
    );
  });

  it("does not use mutable row number as durable external identity", () => {
    expect(() =>
      resolveCsvExternalId(
        {
          ID: "",
          SKU: "",
        },
        variantConfig,
        99,
      ),
    ).toThrow(
      "CSV row 99 has no stable external identity.",
    );
  });

  it("preserves external identity case", () => {
    expect(
      resolveCsvExternalId(
        {
          ID: "AbC-123",
        },
        variantConfig,
        1,
      ),
    ).toBe(
      "AbC-123",
    );
  });

  it("requires positive row number for identity errors", () => {
    expect(() =>
      resolveCsvExternalId(
        {},
        variantConfig,
        0,
      ),
    ).toThrow(
      "CSV row number must be a positive safe integer.",
    );
  });
});
