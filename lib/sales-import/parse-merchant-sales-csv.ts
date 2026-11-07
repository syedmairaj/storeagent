import { createHash } from "node:crypto";

import { normalizeMerchantHeader } from "@/lib/inventory-import/normalize-header";
import { CsvStructuralError, parseCsv } from "@/lib/providers/csv/parser";
import { normalizeCanonicalOrderStatus } from "@/lib/providers/order-status";

import {
  MERCHANT_SALES_CSV_DEFERRED_RETURN_HEADERS,
  MERCHANT_SALES_CSV_FIELD_ALIASES,
  MERCHANT_SALES_CSV_MAX_BYTES,
  MERCHANT_SALES_CSV_MAX_ROWS,
  MERCHANT_SALES_CSV_OPTIONAL_FIELDS,
  MERCHANT_SALES_CSV_REQUIRED_FIELDS,
  MERCHANT_SALES_SUPPORTED_STATUSES,
  MERCHANT_SALES_VELOCITY_ELIGIBLE_STATUSES,
  type MerchantSalesColumnMapping,
  type MerchantSalesCsvField,
  type MerchantSalesImportPreviewRow,
  type MerchantSalesImportRowError,
} from "@/lib/sales-import/contract";
import { interpretMerchantSalesTimestamp } from "@/lib/sales-import/interpret-timestamp";

export type MerchantSalesCsvParseResult =
  | { ok: false; error: string; code: string }
  | {
      ok: true;
      contentHash: string;
      headers: readonly string[];
      mapping: MerchantSalesColumnMapping;
      rows: readonly MerchantSalesImportPreviewRow[];
      readyCount: number;
      rejectedCount: number;
      velocityEligibleCount: number;
    };

function contentHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function autoMapHeaders(
  headers: readonly string[],
  override?: MerchantSalesColumnMapping,
): MerchantSalesColumnMapping {
  const normalizedToOriginal = new Map<string, string>();
  for (const header of headers) {
    normalizedToOriginal.set(normalizeMerchantHeader(header), header);
  }

  const mapping: MerchantSalesColumnMapping = { ...override };

  for (const field of [
    ...MERCHANT_SALES_CSV_REQUIRED_FIELDS,
    ...MERCHANT_SALES_CSV_OPTIONAL_FIELDS,
  ] as MerchantSalesCsvField[]) {
    if (mapping[field]) {
      continue;
    }
    for (const alias of MERCHANT_SALES_CSV_FIELD_ALIASES[field]) {
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

function isSupportedStatus(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  return (MERCHANT_SALES_SUPPORTED_STATUSES as readonly string[]).includes(
    normalized,
  );
}

export function parseMerchantSalesCsv(input: {
  source: string;
  storeTimezone: string;
  storeCurrency: string;
  knownSkus: ReadonlySet<string>;
  mappingOverride?: MerchantSalesColumnMapping;
}): MerchantSalesCsvParseResult {
  if (Buffer.byteLength(input.source, "utf8") > MERCHANT_SALES_CSV_MAX_BYTES) {
    return {
      ok: false,
      code: "CSV_TOO_LARGE",
      error: "CSV must be 1 MB or smaller.",
    };
  }

  let parsed;
  try {
    parsed = parseCsv(input.source);
  } catch (cause) {
    if (cause instanceof CsvStructuralError) {
      return { ok: false, code: cause.code, error: cause.message };
    }
    return {
      ok: false,
      code: "CSV_PARSE_FAILED",
      error: "Unable to read this CSV file.",
    };
  }

  if (parsed.headers.length === 0) {
    return {
      ok: false,
      code: "CSV_EMPTY",
      error: "CSV has no header row.",
    };
  }

  const normalizedHeaders = parsed.headers.map((header) =>
    normalizeMerchantHeader(header),
  );
  for (const deferred of MERCHANT_SALES_CSV_DEFERRED_RETURN_HEADERS) {
    if (normalizedHeaders.includes(deferred)) {
      return {
        ok: false,
        code: "RETURNS_DEFERRED",
        error:
          "This file includes return/net-sales columns. Returns are not imported in Sales History V1 — remove those columns and import sold line quantities only.",
      };
    }
  }

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      code: "CSV_EMPTY",
      error: "Add at least one sales line below the header.",
    };
  }

  if (parsed.rows.length > MERCHANT_SALES_CSV_MAX_ROWS) {
    return {
      ok: false,
      code: "CSV_TOO_MANY_ROWS",
      error: `CSV may include at most ${MERCHANT_SALES_CSV_MAX_ROWS} data rows.`,
    };
  }

  const mapping = autoMapHeaders(parsed.headers, input.mappingOverride);
  for (const field of MERCHANT_SALES_CSV_REQUIRED_FIELDS) {
    if (!mapping[field]) {
      return {
        ok: false,
        code: "MAPPING_INCOMPLETE",
        error: `Map a column for ${field.replaceAll("_", " ")} before previewing.`,
      };
    }
  }

  const seenLineIds = new Map<string, number>();
  const orderHeaders = new Map<
    string,
    { orderedAtRaw: string; statusRaw: string; currencyRaw: string; rowNumber: number }
  >();
  const rows: MerchantSalesImportPreviewRow[] = [];

  for (const parsedRow of parsed.rows) {
    const rowNumber = parsedRow.rowNumber;
    const errors: MerchantSalesImportRowError[] = [];
    const cells = parsedRow.row as Record<string, string | null | undefined>;

    const orderId = readCell(cells, mapping.order_id);
    const lineId = readCell(cells, mapping.line_id);
    const sku = readCell(cells, mapping.sku);
    const quantityRaw = readCell(cells, mapping.quantity);
    const orderedAtRaw = readCell(cells, mapping.ordered_at);
    const statusRaw = readCell(cells, mapping.status);
    const currencyRaw = readCell(cells, mapping.currency);
    const unitPriceRaw = readCell(cells, mapping.unit_price);

    if (!orderId) {
      errors.push({
        rowNumber,
        code: "REQUIRED_FIELD",
        message: "order_id is required.",
        field: "order_id",
      });
    } else {
      const headerKey = `${orderedAtRaw}|${statusRaw || "completed"}|${(currencyRaw || input.storeCurrency).trim().toUpperCase()}`;
      const priorHeader = orderHeaders.get(orderId);
      if (!priorHeader) {
        orderHeaders.set(orderId, {
          orderedAtRaw,
          statusRaw: statusRaw || "completed",
          currencyRaw: (currencyRaw || input.storeCurrency).trim().toUpperCase(),
          rowNumber,
        });
      } else {
        const priorKey = `${priorHeader.orderedAtRaw}|${priorHeader.statusRaw}|${priorHeader.currencyRaw}`;
        if (priorKey !== headerKey) {
          errors.push({
            rowNumber,
            code: "ORDER_HEADER_CONFLICT",
            message: `order_id "${orderId}" conflicts with row ${priorHeader.rowNumber} on ordered_at, status, or currency.`,
            field: "order_id",
          });
        }
      }
    }
    if (!lineId) {
      errors.push({
        rowNumber,
        code: "REQUIRED_FIELD",
        message: "line_id is required.",
        field: "line_id",
      });
    } else {
      const prior = seenLineIds.get(lineId);
      if (prior !== undefined) {
        errors.push({
          rowNumber,
          code: "DUPLICATE_LINE_ID",
          message: `line_id "${lineId}" duplicates row ${prior}. Use a store-unique line id (for example order_id + line number).`,
          field: "line_id",
        });
      } else {
        seenLineIds.set(lineId, rowNumber);
      }
    }

    if (!sku) {
      errors.push({
        rowNumber,
        code: "REQUIRED_FIELD",
        message: "sku is required.",
        field: "sku",
      });
    } else if (!input.knownSkus.has(sku)) {
      errors.push({
        rowNumber,
        code: "UNKNOWN_SKU",
        message: `SKU "${sku}" is not in this store. Import inventory for the SKU first — StoreAgent will not invent product mappings.`,
        field: "sku",
      });
    }

    let quantity = 0;
    if (!quantityRaw) {
      errors.push({
        rowNumber,
        code: "REQUIRED_FIELD",
        message: "quantity is required.",
        field: "quantity",
      });
    } else if (!/^\d+$/.test(quantityRaw) || Number(quantityRaw) <= 0) {
      errors.push({
        rowNumber,
        code: "INVALID_QUANTITY",
        message: "quantity must be a positive whole number.",
        field: "quantity",
      });
    } else {
      quantity = Number(quantityRaw);
    }

    let orderedAtIso = "";
    if (!orderedAtRaw) {
      errors.push({
        rowNumber,
        code: "REQUIRED_FIELD",
        message: "ordered_at is required.",
        field: "ordered_at",
      });
    } else {
      try {
        orderedAtIso = interpretMerchantSalesTimestamp(
          orderedAtRaw,
          input.storeTimezone,
        );
      } catch (cause) {
        errors.push({
          rowNumber,
          code: "INVALID_TIMESTAMP",
          message:
            cause instanceof Error
              ? cause.message
              : "ordered_at is invalid.",
          field: "ordered_at",
        });
      }
    }

    if (statusRaw && !isSupportedStatus(statusRaw)) {
      errors.push({
        rowNumber,
        code: "INVALID_STATUS",
        message: `Unsupported order status "${statusRaw}".`,
        field: "status",
      });
    }

    const orderStatus = normalizeCanonicalOrderStatus(
      statusRaw || "completed",
    );
    const currency = (currencyRaw || input.storeCurrency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      errors.push({
        rowNumber,
        code: "INVALID_CURRENCY",
        message: "currency must be a 3-letter code.",
        field: "currency",
      });
    }

    let unitPrice: string | null = null;
    if (unitPriceRaw) {
      if (!/^\d+(\.\d{1,4})?$/.test(unitPriceRaw)) {
        errors.push({
          rowNumber,
          code: "INVALID_MONEY",
          message: "unit_price must be a non-negative decimal amount.",
          field: "unit_price",
        });
      } else {
        unitPrice = unitPriceRaw;
      }
    }

    const contributesToVelocity = (
      MERCHANT_SALES_VELOCITY_ELIGIBLE_STATUSES as readonly string[]
    ).includes(orderStatus);

    const importStatus = errors.length === 0 ? "ready" : "rejected";

    rows.push({
      rowNumber,
      orderId,
      lineId,
      sku,
      quantity,
      orderedAtIso,
      orderStatus,
      currency,
      unitPrice,
      contributesToVelocity,
      importStatus,
      errors,
    });
  }

  const readyCount = rows.filter((row) => row.importStatus === "ready").length;
  const rejectedCount = rows.length - readyCount;
  const velocityEligibleCount = rows.filter(
    (row) => row.importStatus === "ready" && row.contributesToVelocity,
  ).length;

  return {
    ok: true,
    contentHash: contentHash(input.source),
    headers: parsed.headers,
    mapping,
    rows,
    readyCount,
    rejectedCount,
    velocityEligibleCount,
  };
}
