import type {
  PurchaseOrderStatus,
} from "@/lib/commerce-domain/types";

const CANONICAL_PURCHASE_ORDER_STATUSES:
  readonly PurchaseOrderStatus[] = [
    "draft",
    "submitted",
    "confirmed",
    "partially_received",
    "received",
    "cancelled",
    "unknown",
  ];

const PURCHASE_ORDER_STATUS_SET =
  new Set<string>(
    CANONICAL_PURCHASE_ORDER_STATUSES,
  );

/**
 * Generic canonical PO-status normalization.
 *
 * This function maps vocabulary only.
 *
 * It deliberately does NOT calculate trusted incoming
 * inventory. That responsibility remains in M0.4
 * incoming-stock-v1.
 */
export function normalizeCanonicalPurchaseOrderStatus(
  value: string | null | undefined,
): PurchaseOrderStatus {
  if (
    value === null ||
    value === undefined
  ) {
    return "unknown";
  }

  const normalized =
    value.trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (normalized === "canceled") {
    return "cancelled";
  }

  if (
    PURCHASE_ORDER_STATUS_SET.has(
      normalized,
    )
  ) {
    return normalized as PurchaseOrderStatus;
  }

  return "unknown";
}
