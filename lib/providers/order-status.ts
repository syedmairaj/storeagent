import type {
  OrderStatus,
} from "@/lib/commerce-domain/types";

const CANONICAL_ORDER_STATUSES:
  readonly OrderStatus[] = [
    "pending",
    "open",
    "completed",
    "cancelled",
    "refunded",
    "partially_refunded",
    "unknown",
  ];

const ORDER_STATUS_SET =
  new Set<string>(
    CANONICAL_ORDER_STATUSES,
  );

export function normalizeCanonicalOrderStatus(
  value: string | null | undefined,
): OrderStatus {
  if (value === null || value === undefined) {
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
    ORDER_STATUS_SET.has(
      normalized,
    )
  ) {
    return normalized as OrderStatus;
  }

  return "unknown";
}
