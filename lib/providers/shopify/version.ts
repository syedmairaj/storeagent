/**
 * Shopify-RO.1.2 offline Admin GraphQL normalizer version.
 *
 * RO.1.2 aligns offline normalization with pinned Admin API 2026-10
 * field shapes (fulfillment-order line locations, Shop.currencyCode,
 * InventoryItem.variants connection, conservative status quarantine).
 *
 * Changing rules that alter canonical output requires a version bump.
 */
export const SHOPIFY_RO1_ADAPTER_VERSION =
  "shopify-ro.1.2-v1" as const;

export type ShopifyRo1AdapterVersion =
  typeof SHOPIFY_RO1_ADAPTER_VERSION;
