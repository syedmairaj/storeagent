/**
 * Shopify-RO.1 offline Admin GraphQL normalizer version.
 *
 * Changing rules that alter canonical output requires a version bump.
 */
export const SHOPIFY_RO1_ADAPTER_VERSION =
  "shopify-ro.1-v1" as const;

export type ShopifyRo1AdapterVersion =
  typeof SHOPIFY_RO1_ADAPTER_VERSION;
