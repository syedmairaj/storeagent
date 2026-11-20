/**
 * Shopify-RO.2 Admin GraphQL API version pin.
 *
 * Selected from Shopify's publicly supported stable schedule as of
 * 2026-11-18. Official schema verification for RO.2 assumptions is
 * recorded in docs/SHOPIFY_RO2_TRANSPORT.md.
 *
 * This pin is independent of SHOPIFY_RO1_ADAPTER_VERSION (normalizer
 * rules). Changing the API version requires re-verifying transport
 * operations and RO.1 mapping assumptions before live sync.
 */
export const SHOPIFY_ADMIN_API_VERSION = "2026-10" as const;

export type ShopifyAdminApiVersion =
  typeof SHOPIFY_ADMIN_API_VERSION;

export const SHOPIFY_RO2_TRANSPORT_VERSION =
  "shopify-ro.2-v1" as const;

export type ShopifyRo2TransportVersion =
  typeof SHOPIFY_RO2_TRANSPORT_VERSION;

/**
 * Shopify-RO.3 nested pagination completeness contract version.
 *
 * Offline / deterministic only. Does not certify live-shop SyncRun
 * completeness by itself — see SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED.
 */
export const SHOPIFY_RO3_NESTED_PAGINATION_VERSION =
  "shopify-ro.3-v1" as const;

export type ShopifyRo3NestedPaginationVersion =
  typeof SHOPIFY_RO3_NESTED_PAGINATION_VERSION;

/**
 * Build the Admin GraphQL endpoint for a shop domain.
 *
 * Accepts bare `example.myshopify.com` or a full https URL host.
 * Does not perform DNS or network I/O.
 */
export function shopifyAdminGraphqlEndpoint(
  shopDomain: string,
  apiVersion: ShopifyAdminApiVersion = SHOPIFY_ADMIN_API_VERSION,
): string {
  const trimmed = shopDomain.trim().toLowerCase();

  if (!trimmed) {
    throw new Error(
      "Shopify shop domain must be a non-empty string.",
    );
  }

  const withoutProtocol = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  const host = withoutProtocol.split("/")[0] ?? "";

  if (!host || host.includes(" ") || !host.includes(".")) {
    throw new Error(
      "Shopify shop domain must look like example.myshopify.com.",
    );
  }

  return `https://${host}/admin/api/${apiVersion}/graphql.json`;
}
