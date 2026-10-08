import type {
  OrderStatus,
  PurchaseOrderStatus,
} from "@/lib/commerce-domain/types";

/**
 * Shopify-specific status mapping must be explicit.
 *
 * M0.7 deliberately does not guess Shopify financial,
 * fulfillment, or other provider states into canonical demand truth.
 */
export function mapShopifyOrderStatus(
  providerStatus: string | null | undefined,
  explicitMapping:
    Readonly<Record<string, OrderStatus>>,
): OrderStatus {
  if (
    providerStatus === null ||
    providerStatus === undefined
  ) {
    return "unknown";
  }

  const normalized =
    providerStatus.trim();

  if (!normalized) {
    return "unknown";
  }

  return (
    explicitMapping[normalized] ??
    "unknown"
  );
}

/**
 * Same rule for purchase-order vocabulary:
 * only an explicit provider mapping may produce a canonical state.
 */
export function mapShopifyPurchaseOrderStatus(
  providerStatus: string | null | undefined,
  explicitMapping:
    Readonly<
      Record<
        string,
        PurchaseOrderStatus
      >
    >,
): PurchaseOrderStatus {
  if (
    providerStatus === null ||
    providerStatus === undefined
  ) {
    return "unknown";
  }

  const normalized =
    providerStatus.trim();

  if (!normalized) {
    return "unknown";
  }

  return (
    explicitMapping[normalized] ??
    "unknown"
  );
}
