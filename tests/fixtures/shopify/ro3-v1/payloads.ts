/**
 * Offline Shopify-RO.3 nested pagination fixtures.
 *
 * Mocked GraphQL shapes only — no network, OAuth, or live shop captures.
 * Does not flip SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED.
 */

import {
  SHOPIFY_ADMIN_API_VERSION,
  SHOPIFY_RO3_NESTED_PAGINATION_VERSION,
} from "@/lib/providers/shopify/api-version";

export const SHOPIFY_RO3_FIXTURE_VERSION =
  SHOPIFY_RO3_NESTED_PAGINATION_VERSION;

export const SHOPIFY_RO3_FIXTURES_PINNED_ADMIN_API_VERSION =
  SHOPIFY_ADMIN_API_VERSION;

/** Capability flag: offline nested pagination implemented — not live cert. */
export const SHOPIFY_RO3_OFFLINE_NESTED_PAGINATION_IMPLEMENTED =
  true as const;

/** Global SyncRun nested completeness remains uncertified for live shops. */
export const SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED =
  false as const;

export function closedConnection(
  nodes: readonly unknown[],
): Record<string, unknown> {
  return {
    edges: nodes.map((node) => ({ node })),
    pageInfo: {
      hasNextPage: false,
      endCursor: null,
    },
  };
}

export function openConnection(
  nodes: readonly unknown[],
  endCursor: string,
): Record<string, unknown> {
  return {
    edges: nodes.map((node) => ({ node })),
    pageInfo: {
      hasNextPage: true,
      endCursor,
    },
  };
}

/** Connection without pageInfo — must never prove completeness. */
export function connectionWithoutPageInfo(
  nodes: readonly unknown[],
): Record<string, unknown> {
  return {
    edges: nodes.map((node) => ({ node })),
  };
}

export const ro3Variant = (id: string, sku = `SKU-${id}`) => ({
  id: `gid://shopify/ProductVariant/${id}`,
  sku,
  barcode: null,
  title: `Variant ${id}`,
  price: "10.00",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  inventoryItem: {
    id: `gid://shopify/InventoryItem/${id}`,
    unitCost: { amount: "4.00", currencyCode: "USD" },
  },
});

export const ro3ProductSinglePage = {
  id: "gid://shopify/Product/100",
  title: "Single-page product",
  vendor: "SnapStore",
  productType: "Test",
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  variants: closedConnection([
    ro3Variant("2001"),
    ro3Variant("2002"),
  ]),
} as const;

export const ro3ProductMultiPageFirst = {
  id: "gid://shopify/Product/101",
  title: "Multi-page product",
  vendor: "SnapStore",
  productType: "Test",
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  variants: openConnection([ro3Variant("2101")], "var-cursor-1"),
} as const;

export const ro3ProductMultiPageSecond = closedConnection([
  ro3Variant("2102"),
]);

export const ro3ProductExactBoundaryFirst = {
  id: "gid://shopify/Product/102",
  title: "Exact-boundary product",
  vendor: "SnapStore",
  productType: "Test",
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  variants: openConnection(
    Array.from({ length: 2 }, (_, i) => ro3Variant(String(2200 + i))),
    "var-exact-1",
  ),
} as const;

export const ro3ProductEmptyGenuine = {
  id: "gid://shopify/Product/103",
  title: "Empty variants product",
  vendor: "SnapStore",
  productType: "Test",
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  variants: closedConnection([]),
} as const;

export const ro3ProductMissingVariants = {
  id: "gid://shopify/Product/104",
  title: "Missing variants field",
  vendor: "SnapStore",
  productType: "Test",
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
} as const;

export const ro3ProductNoPageInfo = {
  id: "gid://shopify/Product/105",
  title: "No nested pageInfo",
  vendor: "SnapStore",
  productType: "Test",
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  variants: connectionWithoutPageInfo([ro3Variant("2301")]),
} as const;

export const ro3InventoryLevel = (
  levelId: string,
  locationId: string,
  itemId: string,
  variantId: string,
) => ({
  id: `gid://shopify/InventoryLevel/${levelId}`,
  updatedAt: "2026-10-08T00:00:00Z",
  location: { id: `gid://shopify/Location/${locationId}` },
  quantities: [
    { name: "on_hand", quantity: 5 },
    { name: "available", quantity: 4 },
    { name: "committed", quantity: 1 },
    { name: "incoming", quantity: 0 },
  ],
  item: {
    id: `gid://shopify/InventoryItem/${itemId}`,
    variants: closedConnection([
      { id: `gid://shopify/ProductVariant/${variantId}` },
    ]),
  },
});

export const ro3InventoryItemComplete = {
  id: "gid://shopify/InventoryItem/3001",
  sku: "INV-3001",
  tracked: true,
  variants: closedConnection([
    { id: "gid://shopify/ProductVariant/2001" },
  ]),
  inventoryLevels: closedConnection([
    ro3InventoryLevel("5001", "4001", "3001", "2001"),
  ]),
} as const;

export const ro3InventoryItemMultiLevelFirst = {
  id: "gid://shopify/InventoryItem/3002",
  sku: "INV-3002",
  tracked: true,
  variants: closedConnection([
    { id: "gid://shopify/ProductVariant/2002" },
  ]),
  inventoryLevels: openConnection(
    [ro3InventoryLevel("5101", "4001", "3002", "2002")],
    "level-cursor-1",
  ),
} as const;

export const ro3InventoryItemMultiLevelSecond = closedConnection([
  ro3InventoryLevel("5102", "4002", "3002", "2002"),
]);

export const ro3InventoryItemCardinalityViolation = {
  id: "gid://shopify/InventoryItem/3003",
  sku: "INV-3003",
  tracked: true,
  variants: openConnection(
    [{ id: "gid://shopify/ProductVariant/2003" }],
    "more-variants",
  ),
  inventoryLevels: closedConnection([
    ro3InventoryLevel("5201", "4001", "3003", "2003"),
  ]),
} as const;

export const ro3OrderLineItem = (id: string, variantId: string) => ({
  id: `gid://shopify/LineItem/${id}`,
  quantity: 1,
  variant: { id: `gid://shopify/ProductVariant/${variantId}` },
  originalUnitPriceSet: {
    shopMoney: { amount: "19.99", currencyCode: "USD" },
  },
  totalDiscountSet: {
    shopMoney: { amount: "0.00", currencyCode: "USD" },
  },
});

export const ro3FoLineItem = (
  foLineId: string,
  lineItemId: string,
) => ({
  id: `gid://shopify/FulfillmentOrderLineItem/${foLineId}`,
  lineItem: { id: `gid://shopify/LineItem/${lineItemId}` },
  remainingQuantity: 1,
  totalQuantity: 1,
});

export const ro3FulfillmentOrder = (
  foId: string,
  locationId: string,
  lineItems: ReturnType<typeof closedConnection> | ReturnType<typeof openConnection>,
) => ({
  id: `gid://shopify/FulfillmentOrder/${foId}`,
  status: "OPEN",
  assignedLocation: {
    location: { id: `gid://shopify/Location/${locationId}` },
  },
  lineItems,
});

export const ro3OrderComplete = {
  id: "gid://shopify/Order/6001",
  name: "#1001",
  createdAt: "2026-10-08T10:00:00Z",
  updatedAt: "2026-10-08T10:00:00Z",
  processedAt: "2026-10-08T10:00:00Z",
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  currencyCode: "USD",
  totalPriceSet: {
    shopMoney: { amount: "19.99", currencyCode: "USD" },
  },
  totalDiscountsSet: {
    shopMoney: { amount: "0.00", currencyCode: "USD" },
  },
  subtotalPriceSet: {
    shopMoney: { amount: "19.99", currencyCode: "USD" },
  },
  lineItems: closedConnection([ro3OrderLineItem("8001", "2001")]),
  fulfillmentOrders: closedConnection([
    ro3FulfillmentOrder(
      "7001",
      "4001",
      closedConnection([ro3FoLineItem("9001", "8001")]),
    ),
  ]),
} as const;

export const ro3OrderMultiPageLinesFirst = {
  ...ro3OrderComplete,
  id: "gid://shopify/Order/6002",
  name: "#1002",
  lineItems: openConnection(
    [ro3OrderLineItem("8101", "2001")],
    "line-cursor-1",
  ),
  fulfillmentOrders: closedConnection([
    ro3FulfillmentOrder(
      "7101",
      "4001",
      closedConnection([ro3FoLineItem("9101", "8101")]),
    ),
  ]),
} as const;

export const ro3OrderMultiPageLinesSecond = closedConnection([
  ro3OrderLineItem("8102", "2002"),
]);

export const ro3OrderFoLineItemsMultiFirst = {
  ...ro3OrderComplete,
  id: "gid://shopify/Order/6003",
  name: "#1003",
  lineItems: closedConnection([
    ro3OrderLineItem("8201", "2001"),
    ro3OrderLineItem("8202", "2002"),
  ]),
  fulfillmentOrders: closedConnection([
    ro3FulfillmentOrder(
      "7201",
      "4001",
      openConnection([ro3FoLineItem("9201", "8201")], "fo-line-cursor-1"),
    ),
  ]),
} as const;

export const ro3FoLineItemsSecondPage = closedConnection([
  ro3FoLineItem("9202", "8202"),
]);

export const ro3TwoParentsIndependent = [
  {
    ...ro3ProductMultiPageFirst,
    id: "gid://shopify/Product/201",
    variants: openConnection([ro3Variant("2401")], "p201-c1"),
  },
  {
    ...ro3ProductMultiPageFirst,
    id: "gid://shopify/Product/202",
    variants: openConnection([ro3Variant("2501")], "p202-c1"),
  },
] as const;
