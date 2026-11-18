/**
 * Versioned Shopify Admin GraphQL-shaped fixtures for Shopify-RO.1.
 *
 * Offline only — no network, OAuth, SDK, or live API payloads.
 *
 * These shapes are NOT Admin API-version-certified. RO.2 must validate
 * against a pinned Shopify Admin API version before live sync.
 */

/**
 * Fixture pack version only — not a Shopify Admin API version pin.
 */
export const SHOPIFY_RO1_FIXTURE_VERSION = "shopify-ro.1-v1" as const;

export const SHOPIFY_RO1_FIXTURES_API_VERSION_CERTIFIED = false as const;

export const shopifyRo1ProductActive = {
  id: "gid://shopify/Product/1001",
  title: "Trail Bottle",
  vendor: "SnapStore",
  productType: "Drinkware",
  status: "ACTIVE",
  createdAt: "2026-10-01T08:00:00Z",
  updatedAt: "2026-10-08T09:15:00Z",
} as const;

export const shopifyRo1VariantWithSku = {
  id: "gid://shopify/ProductVariant/2001",
  sku: "TB-500",
  barcode: "012345678905",
  title: "500ml",
  price: "19.99",
  currency: "USD",
  createdAt: "2026-10-01T08:05:00Z",
  updatedAt: "2026-10-08T09:16:00Z",
  product: {
    id: "gid://shopify/Product/1001",
    status: "ACTIVE",
  },
  inventoryItem: {
    id: "gid://shopify/InventoryItem/3001",
  },
} as const;

export const shopifyRo1VariantWithoutSku = {
  id: "gid://shopify/ProductVariant/2002",
  sku: null,
  title: "Default Title",
  price: "0.00",
  currency: "USD",
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
    variant: {
      id: "gid://shopify/ProductVariant/2001",
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

export const shopifyRo1OrderLineItem = {
  id: "gid://shopify/LineItem/8001",
  quantity: 2,
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
  totalDiscountSet: {
    shopMoney: {
      amount: "0.00",
      currencyCode: "USD",
    },
  },
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
      variant: {
        id: "gid://shopify/ProductVariant/2001",
      },
    },
  },
  inventoryFloatMoneyQuantity: {
    updatedAt: "2026-10-11T12:00:00Z",
    quantities: [{ name: "available", quantity: 1.5 }],
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
