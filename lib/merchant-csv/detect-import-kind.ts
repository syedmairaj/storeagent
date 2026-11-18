import { normalizeMerchantHeader } from "@/lib/inventory-import/normalize-header";

/**
 * Lightweight header-shape detection so merchants are not left debugging
 * mapping errors after uploading the wrong StoreAgent CSV template.
 * Non-destructive — parse/preview never mutates durable rows on mismatch.
 */

export type MerchantCsvImportKind = "inventory" | "sales" | "unknown";

const SALES_MARKERS = [
  "order_id",
  "line_id",
  "ordered_at",
  "order_date",
  "sold_at",
] as const;

const INVENTORY_MARKERS = [
  "available_quantity",
  "product_name",
  "on_hand_quantity",
  "committed_quantity",
  "incoming_quantity",
] as const;

function normalizedHeaderSet(
  headers: readonly string[],
): ReadonlySet<string> {
  return new Set(headers.map((header) => normalizeMerchantHeader(header)));
}

function countMarkers(
  headers: ReadonlySet<string>,
  markers: readonly string[],
): number {
  let count = 0;
  for (const marker of markers) {
    if (headers.has(marker)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Infer whether headers look like inventory vs sales history templates.
 * Ambiguous / custom headers return "unknown" (fall through to normal mapping).
 */
export function detectMerchantCsvImportKind(
  headers: readonly string[],
): MerchantCsvImportKind {
  const normalized = normalizedHeaderSet(headers);
  const salesScore = countMarkers(normalized, SALES_MARKERS);
  const inventoryScore = countMarkers(normalized, INVENTORY_MARKERS);

  const looksLikeSales =
    (normalized.has("order_id") &&
      (normalized.has("line_id") || normalized.has("ordered_at"))) ||
    salesScore >= 3;
  const looksLikeInventory =
    normalized.has("available_quantity") ||
    (normalized.has("product_name") &&
      normalized.has("sku") &&
      !normalized.has("order_id")) ||
    inventoryScore >= 2;

  if (looksLikeSales && !looksLikeInventory) {
    return "sales";
  }
  if (looksLikeInventory && !looksLikeSales) {
    return "inventory";
  }
  if (looksLikeSales && looksLikeInventory) {
    // Prefer the stronger marker set; ties stay unknown.
    if (salesScore > inventoryScore) {
      return "sales";
    }
    if (inventoryScore > salesScore) {
      return "inventory";
    }
  }
  return "unknown";
}

export type WrongMerchantCsvKindResult = {
  code: "WRONG_CSV_KIND";
  error: string;
  detected: MerchantCsvImportKind;
};

/**
 * When the file clearly belongs to the other importer, return a clear error.
 * Unknown shapes return null so existing mapping/validation still runs.
 */
export function rejectIfWrongMerchantCsvKind(
  expected: Exclude<MerchantCsvImportKind, "unknown">,
  headers: readonly string[],
): WrongMerchantCsvKindResult | null {
  const detected = detectMerchantCsvImportKind(headers);
  if (detected === "unknown" || detected === expected) {
    return null;
  }

  if (expected === "inventory" && detected === "sales") {
    return {
      code: "WRONG_CSV_KIND",
      detected,
      error:
        "This looks like a sales history CSV (order_id / line_id / ordered_at). Open Import sales history instead — this inventory importer will not invent orders from stock columns.",
    };
  }

  return {
    code: "WRONG_CSV_KIND",
    detected,
    error:
      "This looks like an inventory CSV (SKU / available quantity). Open Import inventory instead — this sales importer will not invent stock from sold lines.",
  };
}
