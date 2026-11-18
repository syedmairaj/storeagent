/**
 * Merchant-facing inventory evidence source labels.
 * Extensible for future connectors (Shopify) without implying a live link today.
 */

export type InventoryEvidenceSourceKind = "csv" | "shopify" | "unknown";

export function inventoryEvidenceSourceLabel(
  kind: InventoryEvidenceSourceKind,
): string {
  switch (kind) {
    case "csv":
      return "CSV import";
    case "shopify":
      return "Shopify";
    case "unknown":
      return "Unknown source";
  }
}

/**
 * CSV-only orgs must never be described as a connected live integration.
 */
export function inventoryEvidenceSourceDetail(
  kind: InventoryEvidenceSourceKind,
): string {
  switch (kind) {
    case "csv":
      return "Stock comes from merchant CSV uploads — not a live connected integration.";
    case "shopify":
      return "Stock comes from the Shopify integration when connected and authorized.";
    case "unknown":
      return "Stock source is not classified yet.";
  }
}
