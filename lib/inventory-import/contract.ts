/**
 * Merchant CSV Inventory Import V1 contract.
 *
 * Reuses M3 CSV lanes (product → variant → inventory_snapshot).
 * Does not invent cost, price, supplier, lead time, sales, or forecasts.
 */

export const MERCHANT_INVENTORY_IMPORT_ADAPTER_VERSION =
  "merchant-inventory-import-v1";

export const MERCHANT_CSV_LOCATION_EXTERNAL_ID = "Main";

export const MERCHANT_CSV_MAX_BYTES = 1_000_000;
export const MERCHANT_CSV_MAX_ROWS = 2_000;

/**
 * Required merchant template columns (normalized header keys).
 *
 * - sku: durable merchant SKU / variant identity
 * - product_name: product + variant display title
 * - available_quantity: known available units (whole, non-negative)
 *
 * Optional:
 * - barcode
 * - on_hand_quantity
 * - committed_quantity
 * - incoming_quantity
 *
 * Empty optional quantity cells stay unknown (null), never zero.
 * available_quantity is required for V1 so merchants cannot import
 * observations with no known inventory semantics.
 */
export const MERCHANT_CSV_REQUIRED_FIELDS = [
  "sku",
  "product_name",
  "available_quantity",
] as const;

export const MERCHANT_CSV_OPTIONAL_FIELDS = [
  "barcode",
  "on_hand_quantity",
  "committed_quantity",
  "incoming_quantity",
] as const;

export type MerchantCsvRequiredField =
  (typeof MERCHANT_CSV_REQUIRED_FIELDS)[number];

export type MerchantCsvOptionalField =
  (typeof MERCHANT_CSV_OPTIONAL_FIELDS)[number];

export type MerchantCsvField =
  | MerchantCsvRequiredField
  | MerchantCsvOptionalField;

export const MERCHANT_CSV_FIELD_ALIASES: Record<
  MerchantCsvField,
  readonly string[]
> = {
  sku: ["sku", "sku_code", "item_sku", "variant_sku"],
  product_name: [
    "product_name",
    "product",
    "title",
    "name",
    "item_name",
  ],
  available_quantity: [
    "available_quantity",
    "available",
    "available_qty",
    "qty_available",
    "quantity",
    "qty",
  ],
  barcode: ["barcode", "ean", "upc"],
  on_hand_quantity: [
    "on_hand_quantity",
    "on_hand",
    "onhand",
    "on_hand_qty",
  ],
  committed_quantity: [
    "committed_quantity",
    "committed",
    "committed_qty",
  ],
  incoming_quantity: [
    "incoming_quantity",
    "incoming",
    "incoming_qty",
  ],
};

export const MERCHANT_CSV_TEMPLATE = [
  "sku,product_name,available_quantity,on_hand_quantity,committed_quantity,incoming_quantity,barcode",
  "WIDGET-S,Widget Small,20,25,5,10,0123456789012",
  "WIDGET-M,Widget Medium,8,10,2,,",
].join("\n");

export type MerchantImportRowError = {
  rowNumber: number;
  code: string;
  message: string;
  field: string | null;
};

export type MerchantImportPreviewRow = {
  rowNumber: number;
  sku: string;
  productName: string;
  availableQuantity: number;
  onHandQuantity: number | null;
  committedQuantity: number | null;
  incomingQuantity: number | null;
  barcode: string | null;
  status: "ready" | "rejected";
  errors: readonly MerchantImportRowError[];
};

export type MerchantColumnMapping = Partial<
  Record<MerchantCsvField, string>
>;

export type MerchantImportConflictPolicy =
  /**
   * Existing products/variants for the same CSV external identity
   * are reconciled through M3 csv_reconcile_* (update in place).
   * Inventory observations are append-only history; exact CSV
   * replays skip; contradictory quantities quarantine.
   */
  "reconcile_identity_append_inventory";
