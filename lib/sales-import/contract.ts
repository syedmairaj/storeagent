/**
 * Merchant CSV Sales History Import V1 contract.
 *
 * Reuses M3 CSV order + order_item lanes and existing SyncRun idempotency.
 * Does not invent SKUs, returns, forecasts, or sales velocity.
 * Returns / net-sales-after-returns are explicitly deferred in V1.
 */

export const MERCHANT_SALES_IMPORT_ADAPTER_VERSION =
  "merchant-sales-import-v1";

export const MERCHANT_SALES_CSV_LOCATION_EXTERNAL_ID = "Main";

export const MERCHANT_SALES_CSV_MAX_BYTES = 1_000_000;
export const MERCHANT_SALES_CSV_MAX_ROWS = 5_000;

/**
 * Required merchant template columns (normalized header keys).
 *
 * - order_id: stable external order identity
 * - line_id: stable external order-line identity (unique within the store; include order id in the value when source systems reuse line numbers)
 * - sku: must already exist for the authorized store (no fabrication)
 * - quantity: sold units on the line (whole, positive)
 * - ordered_at: order timestamp (store-local or explicit-offset ISO)
 *
 * Optional:
 * - status (defaults to completed when blank)
 * - currency (defaults to store currency)
 * - unit_price
 *
 * Returns columns are not accepted in V1.
 */
export const MERCHANT_SALES_CSV_REQUIRED_FIELDS = [
  "order_id",
  "line_id",
  "sku",
  "quantity",
  "ordered_at",
] as const;

export const MERCHANT_SALES_CSV_OPTIONAL_FIELDS = [
  "status",
  "currency",
  "unit_price",
] as const;

export type MerchantSalesCsvRequiredField =
  (typeof MERCHANT_SALES_CSV_REQUIRED_FIELDS)[number];

export type MerchantSalesCsvOptionalField =
  (typeof MERCHANT_SALES_CSV_OPTIONAL_FIELDS)[number];

export type MerchantSalesCsvField =
  | MerchantSalesCsvRequiredField
  | MerchantSalesCsvOptionalField;

export const MERCHANT_SALES_CSV_FIELD_ALIASES: Record<
  MerchantSalesCsvField,
  readonly string[]
> = {
  order_id: [
    "order_id",
    "order",
    "order_number",
    "order_no",
    "external_order_id",
  ],
  line_id: [
    "line_id",
    "order_line_id",
    "line_item_id",
    "item_id",
    "line_number",
  ],
  sku: ["sku", "sku_code", "item_sku", "variant_sku"],
  quantity: [
    "quantity",
    "qty",
    "units",
    "sold_quantity",
    "sold_qty",
  ],
  ordered_at: [
    "ordered_at",
    "order_date",
    "ordered_date",
    "sold_at",
    "timestamp",
    "created_at",
  ],
  status: ["status", "order_status"],
  currency: ["currency", "currency_code"],
  unit_price: [
    "unit_price",
    "unit_price_amount",
    "price",
    "item_price",
  ],
};

/** Headers that indicate deferred returns — reject the file if present. */
export const MERCHANT_SALES_CSV_DEFERRED_RETURN_HEADERS = [
  "return_quantity",
  "returned_quantity",
  "returned_qty",
  "refund_quantity",
  "return_id",
  "net_units",
  "net_sales",
] as const;

export const MERCHANT_SALES_CSV_TEMPLATE = [
  "order_id,line_id,sku,quantity,ordered_at,status,currency,unit_price",
  "ORD-1001,ORD-1001-LINE-1,WIDGET-S,2,2026-10-01 14:30:00,completed,USD,12.50",
  "ORD-1001,ORD-1001-LINE-2,WIDGET-M,1,2026-10-01 14:30:00,completed,USD,18.00",
  "ORD-1002,ORD-1002-LINE-1,WIDGET-S,1,2026-10-02T09:15:00,completed,USD,12.50",
].join("\n");

export const MERCHANT_SALES_SUPPORTED_STATUSES = [
  "pending",
  "open",
  "completed",
  "cancelled",
  "canceled",
  "refunded",
  "partially_refunded",
  "unknown",
] as const;

/** Statuses that M5 sales aggregates treat as sold demand after recompute. */
export const MERCHANT_SALES_VELOCITY_ELIGIBLE_STATUSES = [
  "completed",
  "refunded",
  "partially_refunded",
] as const;

export type MerchantSalesImportRowError = {
  rowNumber: number;
  code: string;
  message: string;
  field: string | null;
};

export type MerchantSalesImportPreviewRow = {
  rowNumber: number;
  orderId: string;
  lineId: string;
  sku: string;
  quantity: number;
  orderedAtIso: string;
  orderStatus: string;
  currency: string;
  unitPrice: string | null;
  contributesToVelocity: boolean;
  importStatus: "ready" | "rejected";
  errors: readonly MerchantSalesImportRowError[];
};

export type MerchantSalesColumnMapping = Partial<
  Record<MerchantSalesCsvField, string>
>;
