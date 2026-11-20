/**
 * Typed, minimal read-only Shopify Admin GraphQL operations for RO.2 / RO.3.
 *
 * These documents are transport contracts only. They do not normalize,
 * bind, or persist. Field selection is intentionally minimal and aligned
 * with pinned Admin API version SHOPIFY_ADMIN_API_VERSION (2026-10).
 *
 * RO.3 adds nested `pageInfo { hasNextPage endCursor }` on required child
 * connections plus separate parent-scoped continuation queries so nested
 * pagination can be proven offline before SyncRun acceptance.
 *
 * Mutations are forbidden.
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

/**
 * Nested connection continuation operations introduced by Shopify-RO.3.
 */
export type ShopifyRo3NestedContinuationOperation =
  | "productVariants"
  | "inventoryItemVariants"
  | "inventoryItemLevels"
  | "orderLineItems"
  | "orderFulfillmentOrders"
  | "fulfillmentOrderLineItems";

export interface ShopifyRo3NestedContinuationDefinition {
  readonly kind: ShopifyRo3NestedContinuationOperation;
  readonly name: string;
  readonly document: string;
  readonly parentRootField: string;
  readonly connectionField: string;
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

const VARIANT_NODE_FIELDS = `
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
`;

const INVENTORY_ITEM_VARIANT_ID_FIELDS = `
  id
`;

const INVENTORY_LEVEL_NODE_FIELDS = `
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
          ${INVENTORY_ITEM_VARIANT_ID_FIELDS}
        }
      }
      ${PAGE_INFO_FIELDS}
    }
  }
`;

const ORDER_LINE_ITEM_NODE_FIELDS = `
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
`;

const FULFILLMENT_ORDER_LINE_ITEM_NODE_FIELDS = `
  id
  lineItem {
    id
  }
  remainingQuantity
  totalQuantity
`;

const FULFILLMENT_ORDER_NODE_FIELDS = `
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
        ${FULFILLMENT_ORDER_LINE_ITEM_NODE_FIELDS}
      }
    }
    ${PAGE_INFO_FIELDS}
  }
`;

/**
 * Products with nested variants (catalog sync surface).
 *
 * Variant.price is the shop-currency Money scalar (decimal string).
 * Currency is not on ProductVariant — callers must join Shop.currencyCode
 * (queried once separately or via shop on this operation).
 *
 * Nested variants expose pageInfo so RO.3 can detect truncation and continue.
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
              ${VARIANT_NODE_FIELDS}
            }
          }
          ${PAGE_INFO_FIELDS}
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
 * Nested variants / inventoryLevels expose pageInfo for RO.3.
 * inventoryItem.variants remains first:1 — cardinality >1 fails closed.
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
              ${INVENTORY_ITEM_VARIANT_ID_FIELDS}
            }
          }
          ${PAGE_INFO_FIELDS}
        }
        inventoryLevels(first: 50) {
          edges {
            node {
              ${INVENTORY_LEVEL_NODE_FIELDS}
            }
          }
          ${PAGE_INFO_FIELDS}
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
 *
 * Nested lineItems / fulfillmentOrders / FO.lineItems expose pageInfo.
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
              ${ORDER_LINE_ITEM_NODE_FIELDS}
            }
          }
          ${PAGE_INFO_FIELDS}
        }
        fulfillmentOrders(first: 20) {
          edges {
            node {
              ${FULFILLMENT_ORDER_NODE_FIELDS}
            }
          }
          ${PAGE_INFO_FIELDS}
        }
      }
    }
    ${PAGE_INFO_FIELDS}
  }
}
`.trim();

/**
 * RO.3 continuation: remaining Product.variants pages.
 */
export const SHOPIFY_RO3_PRODUCT_VARIANTS_QUERY = `
query StoreAgentRo3ProductVariants($id: ID!, $first: Int!, $after: String) {
  product(id: $id) {
    id
    variants(first: $first, after: $after) {
      edges {
        node {
          ${VARIANT_NODE_FIELDS}
        }
      }
      ${PAGE_INFO_FIELDS}
    }
  }
}
`.trim();

/**
 * RO.3 continuation / cardinality check: InventoryItem.variants.
 * Kept at first:1 — hasNextPage=true means cardinality >1 (fail closed).
 */
export const SHOPIFY_RO3_INVENTORY_ITEM_VARIANTS_QUERY = `
query StoreAgentRo3InventoryItemVariants($id: ID!, $first: Int!, $after: String) {
  inventoryItem(id: $id) {
    id
    variants(first: $first, after: $after) {
      edges {
        node {
          ${INVENTORY_ITEM_VARIANT_ID_FIELDS}
        }
      }
      ${PAGE_INFO_FIELDS}
    }
  }
}
`.trim();

/**
 * RO.3 continuation: remaining InventoryItem.inventoryLevels pages.
 */
export const SHOPIFY_RO3_INVENTORY_ITEM_LEVELS_QUERY = `
query StoreAgentRo3InventoryItemLevels($id: ID!, $first: Int!, $after: String) {
  inventoryItem(id: $id) {
    id
    inventoryLevels(first: $first, after: $after) {
      edges {
        node {
          ${INVENTORY_LEVEL_NODE_FIELDS}
        }
      }
      ${PAGE_INFO_FIELDS}
    }
  }
}
`.trim();

/**
 * RO.3 continuation: remaining Order.lineItems pages.
 */
export const SHOPIFY_RO3_ORDER_LINE_ITEMS_QUERY = `
query StoreAgentRo3OrderLineItems($id: ID!, $first: Int!, $after: String) {
  order(id: $id) {
    id
    lineItems(first: $first, after: $after) {
      edges {
        node {
          ${ORDER_LINE_ITEM_NODE_FIELDS}
        }
      }
      ${PAGE_INFO_FIELDS}
    }
  }
}
`.trim();

/**
 * RO.3 continuation: remaining Order.fulfillmentOrders pages.
 */
export const SHOPIFY_RO3_ORDER_FULFILLMENT_ORDERS_QUERY = `
query StoreAgentRo3OrderFulfillmentOrders($id: ID!, $first: Int!, $after: String) {
  order(id: $id) {
    id
    fulfillmentOrders(first: $first, after: $after) {
      edges {
        node {
          ${FULFILLMENT_ORDER_NODE_FIELDS}
        }
      }
      ${PAGE_INFO_FIELDS}
    }
  }
}
`.trim();

/**
 * RO.3 continuation: remaining FulfillmentOrder.lineItems pages.
 */
export const SHOPIFY_RO3_FULFILLMENT_ORDER_LINE_ITEMS_QUERY = `
query StoreAgentRo3FulfillmentOrderLineItems($id: ID!, $first: Int!, $after: String) {
  fulfillmentOrder(id: $id) {
    id
    lineItems(first: $first, after: $after) {
      edges {
        node {
          ${FULFILLMENT_ORDER_LINE_ITEM_NODE_FIELDS}
        }
      }
      ${PAGE_INFO_FIELDS}
    }
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

export const SHOPIFY_RO3_NESTED_CONTINUATIONS = {
  productVariants: {
    kind: "productVariants",
    name: "StoreAgentRo3ProductVariants",
    document: SHOPIFY_RO3_PRODUCT_VARIANTS_QUERY,
    parentRootField: "product",
    connectionField: "variants",
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
  inventoryItemVariants: {
    kind: "inventoryItemVariants",
    name: "StoreAgentRo3InventoryItemVariants",
    document: SHOPIFY_RO3_INVENTORY_ITEM_VARIANTS_QUERY,
    parentRootField: "inventoryItem",
    connectionField: "variants",
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
  inventoryItemLevels: {
    kind: "inventoryItemLevels",
    name: "StoreAgentRo3InventoryItemLevels",
    document: SHOPIFY_RO3_INVENTORY_ITEM_LEVELS_QUERY,
    parentRootField: "inventoryItem",
    connectionField: "inventoryLevels",
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
  orderLineItems: {
    kind: "orderLineItems",
    name: "StoreAgentRo3OrderLineItems",
    document: SHOPIFY_RO3_ORDER_LINE_ITEMS_QUERY,
    parentRootField: "order",
    connectionField: "lineItems",
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
  orderFulfillmentOrders: {
    kind: "orderFulfillmentOrders",
    name: "StoreAgentRo3OrderFulfillmentOrders",
    document: SHOPIFY_RO3_ORDER_FULFILLMENT_ORDERS_QUERY,
    parentRootField: "order",
    connectionField: "fulfillmentOrders",
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
  fulfillmentOrderLineItems: {
    kind: "fulfillmentOrderLineItems",
    name: "StoreAgentRo3FulfillmentOrderLineItems",
    document: SHOPIFY_RO3_FULFILLMENT_ORDER_LINE_ITEMS_QUERY,
    parentRootField: "fulfillmentOrder",
    connectionField: "lineItems",
    apiVersion: SHOPIFY_ADMIN_API_VERSION,
    transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    readOnly: true,
  },
} as const satisfies Record<
  ShopifyRo3NestedContinuationOperation,
  ShopifyRo3NestedContinuationDefinition
>;

export function shopifyRo2Operation(
  resource: ShopifyRo2ResourceOperation,
): ShopifyRo2OperationDefinition {
  return SHOPIFY_RO2_OPERATIONS[resource];
}

export function shopifyRo3NestedContinuation(
  kind: ShopifyRo3NestedContinuationOperation,
): ShopifyRo3NestedContinuationDefinition {
  return SHOPIFY_RO3_NESTED_CONTINUATIONS[kind];
}
