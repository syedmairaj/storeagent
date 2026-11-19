/**
 * Typed, minimal read-only Shopify Admin GraphQL operations for RO.2.
 *
 * These documents are transport contracts only. They do not normalize,
 * bind, or persist. Field selection is intentionally minimal and aligned
 * with pinned Admin API version SHOPIFY_ADMIN_API_VERSION (2026-10).
 *
 * Mutations are forbidden in RO.2.
 */

import {
  SHOPIFY_ADMIN_API_VERSION,
  SHOPIFY_RO2_TRANSPORT_VERSION,
} from "./api-version";

export const SHOPIFY_RO2_INVENTORY_QUANTITY_NAMES = [
  "on_hand",
  "available",
  "committed",
  "incoming",
] as const;

export type ShopifyRo2InventoryQuantityName =
  (typeof SHOPIFY_RO2_INVENTORY_QUANTITY_NAMES)[number];

export type ShopifyRo2ResourceOperation =
  | "products"
  | "locations"
  | "inventoryItems"
  | "orders";

export interface ShopifyRo2OperationDefinition {
  readonly resource: ShopifyRo2ResourceOperation;
  readonly name: string;
  readonly document: string;
  readonly apiVersion: typeof SHOPIFY_ADMIN_API_VERSION;
  readonly transportVersion: typeof SHOPIFY_RO2_TRANSPORT_VERSION;
  readonly readOnly: true;
}

const PAGE_INFO_FIELDS = `
  pageInfo {
    hasNextPage
    endCursor
  }
`;

/**
 * Products with nested variants (catalog sync surface).
 *
 * Variant.price is the shop-currency Money scalar (decimal string).
 * Currency is not on ProductVariant — callers must join Shop.currencyCode
 * (queried once separately or via shop on this operation).
 */
export const SHOPIFY_RO2_PRODUCTS_QUERY = `
query StoreAgentRo2Products($first: Int!, $after: String) {
  shop {
    currencyCode
  }
  products(first: $first, after: $after) {
    edges {
      cursor
      node {
        id
        title
        vendor
        productType
        status
        createdAt
        updatedAt
        variants(first: 100) {
          edges {
            node {
              id
              sku
              barcode
              title
              price
              createdAt
              updatedAt
              inventoryItem {
                id
                unitCost {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
    ${PAGE_INFO_FIELDS}
  }
}
`.trim();

export const SHOPIFY_RO2_LOCATIONS_QUERY = `
query StoreAgentRo2Locations($first: Int!, $after: String) {
  locations(first: $first, after: $after) {
    edges {
      cursor
      node {
        id
        name
        isActive
      }
    }
    ${PAGE_INFO_FIELDS}
  }
}
`.trim();

/**
 * Inventory items with per-location levels.
 *
 * InventoryLevel.quantities requires explicit names on 2026-10.
 */
export const SHOPIFY_RO2_INVENTORY_ITEMS_QUERY = `
query StoreAgentRo2InventoryItems($first: Int!, $after: String) {
  inventoryItems(first: $first, after: $after) {
    edges {
      cursor
      node {
        id
        sku
        tracked
        variants(first: 1) {
          edges {
            node {
              id
            }
          }
        }
        inventoryLevels(first: 50) {
          edges {
            node {
              id
              updatedAt
              location {
                id
              }
              quantities(names: ["on_hand", "available", "committed", "incoming"]) {
                name
                quantity
              }
              item {
                id
                variants(first: 1) {
                  edges {
                    node {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    ${PAGE_INFO_FIELDS}
  }
}
`.trim();

/**
 * Orders with line items and fulfillment-order location assignment.
 *
 * LineItem has no location field on Admin API 2026-10. Location for
 * demand/fulfillment provenance comes from
 * Order.fulfillmentOrders[].assignedLocation + lineItems linkage.
 */
export const SHOPIFY_RO2_ORDERS_QUERY = `
query StoreAgentRo2Orders($first: Int!, $after: String) {
  orders(first: $first, after: $after) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        updatedAt
        processedAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        currencyCode
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 100) {
          edges {
            node {
              id
              quantity
              variant {
                id
              }
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              totalDiscountSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        fulfillmentOrders(first: 20) {
          edges {
            node {
              id
              status
              assignedLocation {
                location {
                  id
                }
              }
              lineItems(first: 100) {
                edges {
                  node {
                    id
                    lineItem {
                      id
                    }
                    remainingQuantity
                    totalQuantity
                  }
                }
              }
            }
          }
        }
      }
    }
    ${PAGE_INFO_FIELDS}
  }
}
`.trim();

export const SHOPIFY_RO2_OPERATIONS = {
  products: {
    resource: "products",
    name: "StoreAgentRo2Products",
    document: SHOPIFY_RO2_PRODUCTS_QUERY,
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
  locations: {
    resource: "locations",
    name: "StoreAgentRo2Locations",
    document: SHOPIFY_RO2_LOCATIONS_QUERY,
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
  inventoryItems: {
    resource: "inventoryItems",
    name: "StoreAgentRo2InventoryItems",
    document: SHOPIFY_RO2_INVENTORY_ITEMS_QUERY,
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
  orders: {
    resource: "orders",
    name: "StoreAgentRo2Orders",
    document: SHOPIFY_RO2_ORDERS_QUERY,
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
} as const satisfies Record<
  ShopifyRo2ResourceOperation,
  ShopifyRo2OperationDefinition
>;

export function shopifyRo2Operation(
  resource: ShopifyRo2ResourceOperation,
): ShopifyRo2OperationDefinition {
  return SHOPIFY_RO2_OPERATIONS[resource];
}
