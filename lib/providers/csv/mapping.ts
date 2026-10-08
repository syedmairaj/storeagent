import type {
  CsvAdapterConfig,
  CsvCanonicalField,
  CsvColumnMapping,
  CsvRow,
} from "../types";

function normalizeHeader(
  value: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      "CSV source column must not be empty.",
    );
  }

  return normalized;
}

export function validateCsvMappings(
  mappings: readonly CsvColumnMapping[],
): void {
  const canonicalFields =
    new Set<CsvCanonicalField>();

  const sourceColumns =
    new Set<string>();

  for (const mapping of mappings) {
    const sourceColumn =
      normalizeHeader(
        mapping.sourceColumn,
      );

    if (
      canonicalFields.has(
        mapping.canonicalField,
      )
    ) {
      throw new Error(
        `CSV canonical field "${mapping.canonicalField}" is mapped more than once.`,
      );
    }

    if (
      sourceColumns.has(
        sourceColumn,
      )
    ) {
      throw new Error(
        `CSV source column "${sourceColumn}" is mapped more than once.`,
      );
    }

    canonicalFields.add(
      mapping.canonicalField,
    );

    sourceColumns.add(
      sourceColumn,
    );
  }
}

export function csvSourceColumnForField(
  config: CsvAdapterConfig,
  field: CsvCanonicalField,
): string | null {
  validateCsvMappings(
    config.mappings,
  );

  const mapping =
    config.mappings.find(
      (entry) =>
        entry.canonicalField ===
        field,
    );

  return mapping
    ? normalizeHeader(
        mapping.sourceColumn,
      )
    : null;
}

export function readCsvMappedValue(
  row: CsvRow,
  config: CsvAdapterConfig,
  field: CsvCanonicalField,
): string | null {
  const sourceColumn =
    csvSourceColumnForField(
      config,
      field,
    );

  if (sourceColumn === null) {
    return null;
  }

  const value =
    row[sourceColumn];

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed
    ? trimmed
    : null;
}
