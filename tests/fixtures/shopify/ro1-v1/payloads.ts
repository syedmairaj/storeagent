/**
 * Versioned Shopify Admin GraphQL-shaped fixtures for Shopify-RO.1.2.
 *
 * Offline only — no network, OAuth, SDK, or live API payloads.
 *
 * Schema-shape certified against pinned Admin API 2026-10 field contracts
 * documented in docs/SHOPIFY_RO2_TRANSPORT.md. Residual limits:
 * - Nested first:N connections remain incomplete SyncRun input without
 *   independent nested pagination or explicit offline attestation.
 * - These are offline fixture packs, not live shop response captures.
 */

import {
  SHOPIFY_ADMIN_API_VERSION,
} from "@/lib/providers/shopify/api-version";

/**
 * Fixture pack version — tracks RO.1.2 adapter mapping identity.
 */
export const SHOPIFY_RO1_FIXTURE_VERSION = "shopify-ro.1.2-v1" as const;

/**
 * Offline fixture shapes are aligned to pinned Admin API 2026-10.
 * Nested connection completeness for SyncRun remains unattested.
 */
export const SHOPIFY_RO1_FIXTURES_API_VERSION_CERTIFIED = true as const;

export const SHOPIFY_RO1_FIXTURES_PINNED_ADMIN_API_VERSION =
  SHOPIFY_ADMIN_API_VERSION;

/**
 * Nested-page completeness is intentionally NOT certified for SyncRun.
 */
export const SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED =
  false as const;

/** Shop root currency used with RO.2 products query / variant normalization. */
export const shopifyRo1ShopCurrencyCode = "USD" as const;

export const shopifyRo1ProductActive = {
  id: "gid://shopify/Product/1001",
  title: "Trail Bottle",
  vendor: "SnapStore",
  productType: "Drinkware",
  status: "ACTIVE",
  createdAt: "2026-10-01T08:00:00Z",
  updatedAt: "2026-10-08T09:15:00Z",
} as const;

/**
 * ProductVariant has no currency field on 2026-10 — currency comes from
 * Shop.currencyCode (see shopifyRo1ShopCurrencyCode).
 */
export const shopifyRo1VariantWithSku = {
  id: "gid://shopify/ProductVariant/2001",
  sku: "TB-500",
  barcode: "012345678905",
  title: "500ml",
  price: "19.99",
  createdAt: "2026-10-01T08:05:00Z",
  updatedAt: "2026-10-08T09:16:00Z",
  product: {
    id: "gid://shopify/Product/1001",
    status: "ACTIVE",
  },
  inventoryItem: {
    id: "gid://shopify/InventoryItem/3001",
    unitCost: {
      amount: "8.50",
      currencyCode: "USD",
    },
  },
} as const;

export const shopifyRo1VariantWithoutSku = {
  id: "gid://shopify/ProductVariant/2002",
  sku: null,
  title: "Default Title",
  price: "0.00",
  product: {
    id: "gid://shopify/Product/1001",
    status: "ACTIVE",
  },
  inventoryItem: {
    id: "gid://shopify/InventoryItem/3002",
  },
} as const;

export const shopifyRo1LocationMain = {
  id: "gid://shopify/Location/4001",
  name: "Main Warehouse",
  isActive: true,
} as const;

/**
 * InventoryItem.variants connection (2026-10). Singular `variant` removed.
 */
export const shopifyRo1InventoryLevelComplete = {
  id: "gid://shopify/InventoryLevel/5001?inventory_item_id=3001&location_id=4001",
  updatedAt: "2026-10-11T12:00:00+04:00",
  quantities: [
    { name: "on_hand", quantity: 100 },
    { name: "available", quantity: 80 },
    { name: "committed", quantity: 20 },
    { name: "incoming", quantity: 40 },
  ],
  item: {
    id: "gid://shopify/InventoryItem/3001",
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/2001",
          },
        },
      ],
    },
  },
  location: {
    id: "gid://shopify/Location/4001",
  },
} as const;

export const shopifyRo1InventoryLevelZeroAvailable = {
  ...shopifyRo1InventoryLevelComplete,
  quantities: [
    { name: "on_hand", quantity: 0 },
    { name: "available", quantity: 0 },
    { name: "committed", quantity: 0 },
  ],
} as const;

export const shopifyRo1InventoryLevelMissingAvailable = {
  ...shopifyRo1InventoryLevelComplete,
  quantities: [
    { name: "on_hand", quantity: 12 },
    { name: "committed", quantity: 2 },
  ],
} as const;

export const shopifyRo1InventoryLevelNoQuantities = {
  ...shopifyRo1InventoryLevelComplete,
  quantities: [],
} as const;

export const shopifyRo1OrderPaidFulfilled = {
  id: "gid://shopify/Order/6001",
  name: "#1001",
  createdAt: "2026-10-10T10:00:00Z",
  updatedAt: "2026-10-10T18:00:00Z",
  processedAt: "2026-10-10T10:01:00Z",
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "FULFILLED",
  currencyCode: "USD",
  totalPriceSet: {
    shopMoney: {
      amount: "39.98",
      currencyCode: "USD",
    },
  },
  totalDiscountsSet: {
    shopMoney: {
      amount: "0.00",
      currencyCode: "USD",
    },
  },
  subtotalPriceSet: {
    shopMoney: {
      amount: "39.98",
      currencyCode: "USD",
    },
  },
} as const;

export const shopifyRo1OrderPaidUnfulfilled = {
  ...shopifyRo1OrderPaidFulfilled,
  id: "gid://shopify/Order/6002",
  name: "#1002",
  displayFulfillmentStatus: "UNFULFILLED",
} as const;

export const shopifyRo1OrderCancelled = {
  ...shopifyRo1OrderPaidFulfilled,
  id: "gid://shopify/Order/6003",
  name: "#1003",
  cancelledAt: "2026-10-11T09:00:00Z",
  displayFinancialStatus: "VOIDED",
  displayFulfillmentStatus: "UNFULFILLED",
} as const;

export const shopifyRo1OrderRefunded = {
  ...shopifyRo1OrderPaidFulfilled,
  id: "gid://shopify/Order/6004",
  name: "#1004",
  displayFinancialStatus: "REFUNDED",
  displayFulfillmentStatus: "RESTOCKED",
} as const;

export const shopifyRo1OrderUnknownFinancial = {
  ...shopifyRo1OrderPaidFulfilled,
  id: "gid://shopify/Order/6005",
  name: "#1005",
  displayFinancialStatus: "MAGIC_PROVIDER_STATUS",
} as const;

export const shopifyRo1OrderPaidRestockedAmbiguous = {
  ...shopifyRo1OrderPaidFulfilled,
  id: "gid://shopify/Order/6006",
  name: "#1006",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "RESTOCKED",
} as const;

export const shopifyRo1OrderExpiredFinancial = {
  ...shopifyRo1OrderPaidFulfilled,
  id: "gid://shopify/Order/6007",
  name: "#1007",
  displayFinancialStatus: "EXPIRED",
  displayFulfillmentStatus: "UNFULFILLED",
} as const;

export const shopifyRo1OrderFulfillmentNotRequired = {
  ...shopifyRo1OrderPaidFulfilled,
  id: "gid://shopify/Order/6008",
  name: "#1008",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "FULFILLMENT_NOT_REQUIRED",
} as const;

export const shopifyRo1OrderRequestDeclined = {
  ...shopifyRo1OrderPaidFulfilled,
  id: "gid://shopify/Order/6009",
  name: "#1009",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "REQUEST_DECLINED",
} as const;

export const shopifyRo1DraftOrderSkipped = {
  __typename: "DraftOrder",
  id: "gid://shopify/DraftOrder/7001",
  name: "#D1",
  createdAt: "2026-10-10T10:00:00Z",
  cancelledAt: null,
  displayFinancialStatus: "PENDING",
  displayFulfillmentStatus: null,
  currencyCode: "USD",
} as const;

/**
 * LineItem without invented location field (unsupported on 2026-10).
 * Location comes from fulfillment-order line associations.
 */
export const shopifyRo1OrderLineItem = {
  id: "gid://shopify/LineItem/8001",
  quantity: 2,
  variant: {
    id: "gid://shopify/ProductVariant/2001",
  },
  originalUnitPriceSet: {
    shopMoney: {
      amount: "19.99",
      currencyCode: "USD",
    },
  },
  totalDiscountSet: {
    shopMoney: {
      amount: "0.00",
      currencyCode: "USD",
    },
  },
} as const;

/**
 * Fulfillment orders connection with line→LineItem association (2026-10).
 * Nested pageInfo omitted (RO.2 bound) — incomplete SyncRun input unless attested.
 */
export const shopifyRo1OrderFulfillmentOrders = {
  edges: [
    {
      node: {
        id: "gid://shopify/FulfillmentOrder/9001",
        status: "CLOSED",
        assignedLocation: {
          location: {
            id: "gid://shopify/Location/4001",
          },
        },
        lineItems: {
          edges: [
            {
              node: {
                id: "gid://shopify/FulfillmentOrderLineItem/9101",
                lineItem: {
                  id: "gid://shopify/LineItem/8001",
                },
                remainingQuantity: 0,
                totalQuantity: 2,
              },
            },
          ],
        },
      },
    },
  ],
} as const;

/** Truncated nested FO page — must not be accepted as complete sync input. */
export const shopifyRo1OrderFulfillmentOrdersTruncated = {
  edges: shopifyRo1OrderFulfillmentOrders.edges,
  pageInfo: {
    hasNextPage: true,
    endCursor: "opaque-fo-cursor-1",
  },
} as const;

/** assignedLocation present without lineItems — must not infer line location. */
export const shopifyRo1FulfillmentOrderAssignedLocationOnly = {
  edges: [
    {
      node: {
        id: "gid://shopify/FulfillmentOrder/9002",
        status: "OPEN",
        assignedLocation: {
          location: {
            id: "gid://shopify/Location/4001",
          },
        },
      },
    },
  ],
} as const;

export const shopifyRo1Adversarial = {
  productMissingId: {
    title: "Broken Product",
    status: "ACTIVE",
  },
  productNumericId: {
    id: "1001",
    title: "Numeric ID Product",
    status: "ACTIVE",
  },
  inventoryMissingLocation: {
    updatedAt: "2026-10-11T12:00:00Z",
    quantities: [{ name: "available", quantity: 5 }],
    item: {
      id: "gid://shopify/InventoryItem/3001",
      variants: {
        edges: [
          {
            node: {
              id: "gid://shopify/ProductVariant/2001",
            },
          },
        ],
      },
    },
  },
  inventoryFloatMoneyQuantity: {
    updatedAt: "2026-10-11T12:00:00Z",
    quantities: [{ name: "available", quantity: 1.5 }],
    item: {
      id: "gid://shopify/InventoryItem/3001",
      variants: {
        edges: [
          {
            node: {
              id: "gid://shopify/ProductVariant/2001",
            },
          },
        ],
      },
    },
    location: {
      id: "gid://shopify/Location/4001",
    },
  },
  inventoryDeprecatedSingularVariant: {
    updatedAt: "2026-10-11T12:00:00Z",
    quantities: [{ name: "available", quantity: 5 }],
    item: {
      id: "gid://shopify/InventoryItem/3001",
      variant: {
        id: "gid://shopify/ProductVariant/2001",
      },
    },
    location: {
      id: "gid://shopify/Location/4001",
    },
  },
  inventoryMultipleVariants: {
    updatedAt: "2026-10-11T12:00:00Z",
    quantities: [{ name: "available", quantity: 5 }],
    item: {
      id: "gid://shopify/InventoryItem/3001",
      variants: {
        edges: [
          { node: { id: "gid://shopify/ProductVariant/2001" } },
          { node: { id: "gid://shopify/ProductVariant/2002" } },
        ],
      },
    },
    location: {
      id: "gid://shopify/Location/4001",
    },
  },
  variantWithFabricatedCurrency: {
    id: "gid://shopify/ProductVariant/2099",
    sku: "FAB-CUR",
    price: "10.00",
    currency: "USD",
    product: {
      id: "gid://shopify/Product/1001",
      status: "ACTIVE",
    },
  },
  orderLineItemWithInventedLocation: {
    id: "gid://shopify/LineItem/8099",
    quantity: 1,
    variant: {
      id: "gid://shopify/ProductVariant/2001",
    },
    location: {
      id: "gid://shopify/Location/4001",
    },
    originalUnitPriceSet: {
      shopMoney: {
        amount: "19.99",
        currencyCode: "USD",
      },
    },
  },
  orderFloatingMoney: {
    id: "gid://shopify/Order/6099",
    name: "#1099",
    createdAt: "2026-10-10T10:00:00Z",
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    currencyCode: "USD",
    totalPriceSet: {
      shopMoney: {
        amount: 19.99,
        currencyCode: "USD",
      },
    },
  },
  orderTimezoneLess: {
    id: "gid://shopify/Order/6098",
    name: "#1098",
    createdAt: "2026-10-10T10:00:00",
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    currencyCode: "USD",
  },
} as const;
