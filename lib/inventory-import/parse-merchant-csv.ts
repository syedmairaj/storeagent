import { createHash } from "node:crypto";

import {
  CsvStructuralError,
  parseCsv,
} from "@/lib/providers/csv/parser";

import {
  MERCHANT_CSV_FIELD_ALIASES,
  MERCHANT_CSV_MAX_BYTES,
  MERCHANT_CSV_MAX_ROWS,
  MERCHANT_CSV_OPTIONAL_FIELDS,
  MERCHANT_CSV_REQUIRED_FIELDS,
  type MerchantColumnMapping,
  type MerchantCsvField,
  type MerchantImportPreviewRow,
  type MerchantImportRowError,
} from "@/lib/inventory-import/contract";
import { normalizeMerchantHeader } from "@/lib/inventory-import/normalize-header";

export type MerchantCsvParseFailure = {
  ok: false;
  error: string;
  code: string;
};

export type MerchantCsvParseSuccess = {
  ok: true;
  contentHash: string;
  headers: readonly string[];
  mapping: Required<
    Pick<
      MerchantColumnMapping,
      (typeof MERCHANT_CSV_REQUIRED_FIELDS)[number]
    >
  > &
    MerchantColumnMapping;
  rows: readonly MerchantImportPreviewRow[];
  readyCount: number;
  rejectedCount: number;
};

export type MerchantCsvParseResult =
  | MerchantCsvParseFailure
  | MerchantCsvParseSuccess;

function contentHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function autoMapHeaders(
  headers: readonly string[],
  override?: MerchantColumnMapping,
): MerchantColumnMapping {
  const normalizedToOriginal = new Map<string, string>();
  for (const header of headers) {
    normalizedToOriginal.set(normalizeMerchantHeader(header), header);
  }

  const mapping: MerchantColumnMapping = {
    ...override,
  };

  for (const field of [
    ...MERCHANT_CSV_REQUIRED_FIELDS,
    ...MERCHANT_CSV_OPTIONAL_FIELDS,
  ] as MerchantCsvField[]) {
    if (mapping[field]) {
      continue;
    }

    for (const alias of MERCHANT_CSV_FIELD_ALIASES[field]) {
      const original = normalizedToOriginal.get(alias);
      if (original) {
        mapping[field] = original;
        break;
      }
    }
  }

  return mapping;
}

function readCell(
  row: Record<string, string | null | undefined>,
  column: string | undefined,
): string {
  if (!column) {
    return "";
  }
  return String(row[column] ?? "").trim();
}

function parseWholeQuantity(
  value: string,
  field: string,
  rowNumber: number,
  required: boolean,
):
  | { ok: true; value: number | null }
  | { ok: false; error: MerchantImportRowError } {
  if (!value) {
    if (required) {
      return {
        ok: false,
        error: {
          rowNumber,
          code: "REQUIRED_FIELD",
          message: `${field} is required.`,
          field,
        },
      };
    }
    return { ok: true, value: null };
  }

  if (!/^\d+$/.test(value)) {
    return {
      ok: false,
      error: {
        rowNumber,
        code: "INVALID_QUANTITY",
        message: `${field} must be a whole non-negative number.`,
        field,
      },
    };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return {
      ok: false,
      error: {
        rowNumber,
        code: "INVALID_QUANTITY",
        message: `${field} must be a whole non-negative number.`,
        field,
      },
    };
  }

  return { ok: true, value: parsed };
}

export function parseMerchantInventoryCsv(input: {
  source: string;
  mappingOverride?: MerchantColumnMapping;
}): MerchantCsvParseResult {
  const source = input.source;

  if (Buffer.byteLength(source, "utf8") > MERCHANT_CSV_MAX_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      error: `CSV must be ${MERCHANT_CSV_MAX_BYTES / 1_000_000} MB or smaller.`,
    };
  }

  let parsed;
  try {
    parsed = parseCsv(source);
  } catch (cause) {
    if (cause instanceof CsvStructuralError) {
      return {
        ok: false,
        code: cause.code,
        error:
          cause.rowNumber != null
            ? `Row ${cause.rowNumber}: ${cause.message}`
            : cause.message,
      };
    }

    return {
      ok: false,
      code: "CSV_PARSE_FAILED",
      error: "Unable to parse this CSV file.",
    };
  }

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      code: "CSV_EMPTY",
      error: "Add at least one inventory row below the header.",
    };
  }

  if (parsed.rows.length > MERCHANT_CSV_MAX_ROWS) {
    return {
      ok: false,
      code: "TOO_MANY_ROWS",
      error: `CSV may include at most ${MERCHANT_CSV_MAX_ROWS} data rows.`,
    };
  }

  const mapping = autoMapHeaders(parsed.headers, input.mappingOverride);

  for (const field of MERCHANT_CSV_REQUIRED_FIELDS) {
    if (!mapping[field]) {
      return {
        ok: false,
        code: "MAPPING_REQUIRED",
        error: `Map a column to ${field.replaceAll("_", " ")}.`,
      };
    }
  }

  const skuCounts = new Map<string, number[]>();
  const previewRows: MerchantImportPreviewRow[] = [];

  for (const entry of parsed.rows) {
    const errors: MerchantImportRowError[] = [];
    const sku = readCell(entry.row, mapping.sku);
    const productName = readCell(entry.row, mapping.product_name);
    const barcodeRaw = readCell(entry.row, mapping.barcode);

    if (!sku) {
      errors.push({
        rowNumber: entry.rowNumber,
        code: "REQUIRED_FIELD",
        message: "SKU is required.",
        field: "sku",
      });
    } else if (sku.length > 120) {
      errors.push({
        rowNumber: entry.rowNumber,
        code: "INVALID_SKU",
        message: "SKU must be 1–120 characters.",
        field: "sku",
      });
    }

    if (!productName) {
      errors.push({
        rowNumber: entry.rowNumber,
        code: "REQUIRED_FIELD",
        message: "Product name is required.",
        field: "product_name",
      });
    } else if (productName.length > 200) {
      errors.push({
        rowNumber: entry.rowNumber,
        code: "INVALID_PRODUCT_NAME",
        message: "Product name must be 1–200 characters.",
        field: "product_name",
      });
    }

    const available = parseWholeQuantity(
      readCell(entry.row, mapping.available_quantity),
      "available_quantity",
      entry.rowNumber,
      true,
    );
    const onHand = parseWholeQuantity(
      readCell(entry.row, mapping.on_hand_quantity),
      "on_hand_quantity",
      entry.rowNumber,
      false,
    );
    const committed = parseWholeQuantity(
      readCell(entry.row, mapping.committed_quantity),
      "committed_quantity",
      entry.rowNumber,
      false,
    );
    const incoming = parseWholeQuantity(
      readCell(entry.row, mapping.incoming_quantity),
      "incoming_quantity",
      entry.rowNumber,
      false,
    );

    if (!available.ok) {
      errors.push(available.error);
    }
    if (!onHand.ok) {
      errors.push(onHand.error);
    }
    if (!committed.ok) {
      errors.push(committed.error);
    }
    if (!incoming.ok) {
      errors.push(incoming.error);
    }

    if (sku) {
      const list = skuCounts.get(sku) ?? [];
      list.push(entry.rowNumber);
      skuCounts.set(sku, list);
    }

    previewRows.push({
      rowNumber: entry.rowNumber,
      sku,
      productName,
      availableQuantity: available.ok ? (available.value ?? 0) : 0,
      onHandQuantity: onHand.ok ? onHand.value : null,
      committedQuantity: committed.ok ? committed.value : null,
      incomingQuantity: incoming.ok ? incoming.value : null,
      barcode: barcodeRaw || null,
      status: errors.length > 0 ? "rejected" : "ready",
      errors,
    });
  }

  const duplicateRowNumbers = new Set<number>();
  for (const rowNumbers of skuCounts.values()) {
    if (rowNumbers.length > 1) {
      for (const rowNumber of rowNumbers) {
        duplicateRowNumbers.add(rowNumber);
      }
    }
  }

  const rows: MerchantImportPreviewRow[] = previewRows.map((row) => {
    if (!duplicateRowNumbers.has(row.rowNumber) || !row.sku) {
      return row;
    }

    return {
      ...row,
      status: "rejected",
      errors: [
        ...row.errors,
        {
          rowNumber: row.rowNumber,
          code: "DUPLICATE_SKU",
          message: `SKU "${row.sku}" appears more than once in this file.`,
          field: "sku",
        },
      ],
    };
  });

  const readyCount = rows.filter((row) => row.status === "ready").length;
  const rejectedCount = rows.length - readyCount;

  return {
    ok: true,
    contentHash: contentHash(source),
    headers: parsed.headers,
    mapping: mapping as MerchantCsvParseSuccess["mapping"],
    rows,
    readyCount,
    rejectedCount,
  };
}
