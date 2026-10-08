import {
  buildCompositeExternalId,
  normalizeExternalId,
} from "../external-identity";

import type {
  CsvAdapterConfig,
  CsvRow,
} from "../types";

import {
  readCsvMappedValue,
} from "./mapping";

export function resolveCsvExternalId(
  row: CsvRow,
  config: CsvAdapterConfig,
  rowNumber: number,
): string {
  const mappedExternalId =
    readCsvMappedValue(
      row,
      config,
      "externalId",
    );

  if (mappedExternalId !== null) {
    return normalizeExternalId(
      mappedExternalId,
    );
  }

  const sku =
    readCsvMappedValue(
      row,
      config,
      "sku",
    );

  if (sku !== null) {
    return buildCompositeExternalId([
      {
        name: "sku",
        value: sku,
      },
    ]);
  }

  if (
    !Number.isSafeInteger(rowNumber) ||
    rowNumber < 1
  ) {
    throw new Error(
      "CSV row number must be a positive safe integer.",
    );
  }

  throw new Error(
    `CSV row ${rowNumber} has no stable external identity.`,
  );
}
