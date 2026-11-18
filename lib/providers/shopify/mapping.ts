import type {
  LocationStatus,
  OrderStatus,
  ProductStatus,
  ProductVariantStatus,
} from "@/lib/commerce-domain/types";

import {
  SHOPIFY_RO1_ADAPTER_VERSION,
} from "./version";

/**
 * Versioned Shopify Admin GraphQL resource mappings for RO.1.
 *
 * These maps are the only approved translations from Shopify vocabulary
 * into canonical StoreAgent semantics for this adapter version.
 */

export const SHOPIFY_RO1_RESOURCE_MAPPING = {
  adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,

  /**
   * Shopify Product.status → canonical ProductStatus.
   */
  productStatus: {
    ACTIVE: "active",
    DRAFT: "draft",
    ARCHIVED: "archived",
  } as const satisfies Readonly<
    Record<string, ProductStatus>
  >,

  /**
   * Shopify has no first-class variant lifecycle enum equivalent to
   * StoreAgent's. RO.1 derives variant status from product status when
   * the payload carries product.status; otherwise requires an explicit
   * variant status field.
   */
  variantStatusFromProductStatus: {
    active: "active",
    draft: "inactive",
    archived: "archived",
  } as const satisfies Readonly<
    Record<ProductStatus, ProductVariantStatus>
  >,

  /**
   * Shopify Location.isActive → canonical LocationStatus.
   */
  locationActive: {
    true: "active",
    false: "inactive",
  } as const satisfies Readonly<
    Record<"true" | "false", LocationStatus>
  >,

  /**
   * Shopify InventoryLevel.quantities[].name → candidate inventory field.
   *
   * Only these exact names are mapped. Unknown names are ignored for
   * acceptance but do not invent quantities. Missing names stay null.
   *
   * `incoming` is provider-observed only. It is not trusted M0.4
   * incoming-stock-v1 evidence and must not authorize ROQ or M7.
   */
  inventoryQuantityName: {
    on_hand: "onHandQuantity",
    available: "availableQuantity",
    committed: "committedQuantity",
    incoming: "incomingQuantity",
  } as const satisfies Readonly<
    Record<
      string,
      | "onHandQuantity"
      | "availableQuantity"
      | "committedQuantity"
      | "incomingQuantity"
    >
  >,

  /**
   * Known Shopify displayFinancialStatus enum values for RO.1.
   */
  knownFinancialStatuses: [
    "PENDING",
    "AUTHORIZED",
    "PARTIALLY_PAID",
    "PAID",
    "PARTIALLY_REFUNDED",
    "REFUNDED",
    "VOIDED",
  ] as const,

  /**
   * Known Shopify displayFulfillmentStatus enum values for RO.1.
   * null is permitted by Shopify when fulfillment is unset.
   */
  knownFulfillmentStatuses: [
    "UNFULFILLED",
    "PARTIALLY_FULFILLED",
    "FULFILLED",
    "RESTOCKED",
    "PENDING_FULFILLMENT",
    "OPEN",
    "IN_PROGRESS",
    "ON_HOLD",
    "SCHEDULED",
  ] as const,
} as const;

export type ShopifyRo1FinancialStatus =
  (typeof SHOPIFY_RO1_RESOURCE_MAPPING.knownFinancialStatuses)[number];

export type ShopifyRo1FulfillmentStatus =
  (typeof SHOPIFY_RO1_RESOURCE_MAPPING.knownFulfillmentStatuses)[number];

/**
 * Explicit order-status resolution for RO.1.
 *
 * Financial, fulfillment, and cancellation are separate Shopify concepts.
 * This function never guesses unsupported combinations into demand truth.
 *
 * Returns null when the combination is unsupported (caller quarantines).
 */
export function mapShopifyRo1OrderStatus(input: {
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  cancelledAt: string | null;
}): OrderStatus | null {
  if (input.cancelledAt !== null) {
    return "cancelled";
  }

  const financial =
    input.financialStatus;

  if (financial === null) {
    return null;
  }

  if (
    !(
      SHOPIFY_RO1_RESOURCE_MAPPING.knownFinancialStatuses as readonly string[]
    ).includes(financial)
  ) {
    return null;
  }

  const fulfillment =
    input.fulfillmentStatus;

  if (
    fulfillment !== null &&
    !(
      SHOPIFY_RO1_RESOURCE_MAPPING.knownFulfillmentStatuses as readonly string[]
    ).includes(fulfillment)
  ) {
    return null;
  }

  if (financial === "REFUNDED") {
    return "refunded";
  }

  if (financial === "PARTIALLY_REFUNDED") {
    return "partially_refunded";
  }

  if (financial === "VOIDED") {
    return "cancelled";
  }

  if (
    financial === "PENDING" ||
    financial === "AUTHORIZED" ||
    financial === "PARTIALLY_PAID"
  ) {
    return "pending";
  }

  if (financial === "PAID") {
    if (fulfillment === "FULFILLED") {
      return "completed";
    }

    if (
      fulfillment === null ||
      fulfillment === "UNFULFILLED" ||
      fulfillment === "PARTIALLY_FULFILLED" ||
      fulfillment === "PENDING_FULFILLMENT" ||
      fulfillment === "OPEN" ||
      fulfillment === "IN_PROGRESS" ||
      fulfillment === "ON_HOLD" ||
      fulfillment === "SCHEDULED"
    ) {
      return "open";
    }

    // RESTOCKED under PAID is ambiguous for demand — fail closed.
    return null;
  }

  return null;
}
