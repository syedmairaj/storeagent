import type {
  CurrencyCode,
  DecimalString,
  ISODateTime,
  OrderStatus,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import {
  normalizeProviderCurrencyCode,
} from "@/lib/providers/money";

import {
  normalizeProviderUnitQuantity,
} from "@/lib/providers/quantities";

import {
  acceptedProviderRecord,
  quarantinedProviderRecord,
  skippedProviderRecord,
} from "@/lib/providers/results";

import {
  normalizeOptionalProviderTimestamp,
  normalizeProviderTimestamp,
} from "@/lib/providers/timestamps";

import type {
  ProviderNormalizationIssue,
  ProviderNormalizationResult,
} from "@/lib/providers/types";

import {
  normalizeShopifyResourceGid,
} from "./identity";

import {
  shopifyIssue,
} from "./issues";

import {
  mapShopifyRo1OrderStatus,
} from "./mapping";

import {
  readOptionalNonNegativeShopifyMoney,
  readShopifyShopMoney,
} from "./money";

import {
  isShopifyRecord,
  readOptionalShopifyString,
  readShopifyNestedObject,
  readShopifyPayloadObject,
  requireShopifyString,
} from "./payload";

import type {
  ShopifyOrderCandidate,
  ShopifyOrderItemCandidate,
} from "./types";

import {
  SHOPIFY_RO1_ADAPTER_VERSION,
} from "./version";

function readOrderGid(
  record: Record<string, unknown>,
  issues: ProviderNormalizationIssue[],
): string | null {
  const rawId = requireShopifyString(
    record,
    "id",
    issues,
    "Shopify order id is required.",
  );

  if (rawId === null) {
    return null;
  }

  try {
    return normalizeShopifyResourceGid(rawId, "Order");
  } catch {
    issues.push(
      shopifyIssue(
        "EXTERNAL_ID_INVALID",
        "Shopify order id must be a valid Order GID.",
        "id",
      ),
    );

    return null;
  }
}

function readOrderedAt(
  record: Record<string, unknown>,
  issues: ProviderNormalizationIssue[],
): ISODateTime | null {
  const raw = requireShopifyString(
    record,
    "createdAt",
    issues,
    "Shopify order createdAt is required as orderedAt.",
  );

  if (raw === null) {
    return null;
  }

  try {
    return normalizeProviderTimestamp(raw).value as ISODateTime;
  } catch {
    issues.push(
      shopifyIssue(
        "INVALID_TIMESTAMP",
        "Shopify order createdAt must be a valid date-time with an explicit timezone.",
        "createdAt",
      ),
    );

    return null;
  }
}

function readCancelledAt(
  record: Record<string, unknown>,
  issues: ProviderNormalizationIssue[],
): ISODateTime | null {
  const raw = record.cancelledAt;

  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw !== "string") {
    issues.push(
      shopifyIssue(
        "INVALID_TIMESTAMP",
        "Shopify order cancelledAt must be a string date-time or null.",
        "cancelledAt",
      ),
    );

    return null;
  }

  try {
    const normalized = normalizeOptionalProviderTimestamp(raw);

    return normalized?.value as ISODateTime | null ?? null;
  } catch {
    issues.push(
      shopifyIssue(
        "INVALID_TIMESTAMP",
        "Shopify order cancelledAt must be a valid date-time with an explicit timezone.",
        "cancelledAt",
      ),
    );

    return null;
  }
}

function readCurrency(
  record: Record<string, unknown>,
  issues: ProviderNormalizationIssue[],
  moneyCurrency: CurrencyCode | null,
): CurrencyCode | null {
  const raw =
    readOptionalShopifyString(record, "currencyCode") ??
    moneyCurrency;

  if (raw === null) {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        "Shopify order currency is required.",
        "currencyCode",
      ),
    );

    return null;
  }

  try {
    return normalizeProviderCurrencyCode(raw);
  } catch {
    issues.push(
      shopifyIssue(
        "INVALID_CURRENCY",
        "Shopify order currency must be a three-letter code.",
        "currencyCode",
      ),
    );

    return null;
  }
}

/**
 * Normalize a Shopify Admin GraphQL Order node.
 *
 * Returns/refunds are not invented. Unsupported status combinations quarantine.
 */
export function normalizeShopifyOrderPayload(
  payload: unknown,
): ProviderNormalizationResult<ShopifyOrderCandidate> {
  const issues: ProviderNormalizationIssue[] = [];

  const record = readShopifyPayloadObject(payload, issues);

  let externalId: string | null = null;

  if (record) {
    externalId = readOrderGid(record, issues);
  }

  const identity = {
    provider: "shopify" as const,
    resourceType: "order" as const,
    externalId,
    externalParentId: null,
    adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
  };

  if (!record) {
    return quarantinedProviderRecord(identity, issues);
  }

  // Draft orders belong to a different Shopify resource and are out of scope.
  if (record.__typename === "DraftOrder") {
    return skippedProviderRecord(identity, [
      shopifyIssue(
        "UNSUPPORTED_RESOURCE",
        "Shopify DraftOrder payloads are outside RO.1 order ingestion scope.",
        "__typename",
      ),
    ]);
  }

  const orderedAt = readOrderedAt(record, issues);
  const cancelledAt = readCancelledAt(record, issues);

  const financialStatus = readOptionalShopifyString(
    record,
    "displayFinancialStatus",
  );

  const fulfillmentStatus = readOptionalShopifyString(
    record,
    "displayFulfillmentStatus",
  );

  let status: OrderStatus | null = null;

  if (financialStatus === null && cancelledAt === null) {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        "Shopify order displayFinancialStatus is required when the order is not cancelled.",
        "displayFinancialStatus",
      ),
    );
  } else {
    status = mapShopifyRo1OrderStatus({
      financialStatus,
      fulfillmentStatus,
      cancelledAt,
    });

    if (status === null) {
      issues.push(
        shopifyIssue(
          "UNSUPPORTED_STATUS",
          `Shopify order status combination financial="${financialStatus ?? ""}" fulfillment="${fulfillmentStatus ?? ""}" is not supported by ${SHOPIFY_RO1_ADAPTER_VERSION}.`,
          "displayFinancialStatus",
        ),
      );
    }
  }

  const totalMoney = readOptionalNonNegativeShopifyMoney(
    record.totalPriceSet,
    "totalPriceSet",
    issues,
  );

  const discountMoney = readOptionalNonNegativeShopifyMoney(
    record.totalDiscountsSet,
    "totalDiscountsSet",
    issues,
  );

  const netMoney = readOptionalNonNegativeShopifyMoney(
    record.subtotalPriceSet,
    "subtotalPriceSet",
    issues,
  );

  const currency = readCurrency(
    record,
    issues,
    totalMoney?.currency ?? null,
  );

  const updatedAt = readOptionalShopifyString(record, "updatedAt");
  const processedAt = readOptionalShopifyString(record, "processedAt");

  if (
    issues.length > 0 ||
    externalId === null ||
    orderedAt === null ||
    currency === null ||
    status === null
  ) {
    return quarantinedProviderRecord(identity, issues);
  }

  const sourceTimestamps: Record<string, string> = {
    orderedAt,
  };

  if (cancelledAt) {
    sourceTimestamps.cancelledAt = cancelledAt;
  }

  if (updatedAt) {
    sourceTimestamps.updatedAt = updatedAt;
  }

  if (processedAt) {
    sourceTimestamps.processedAt = processedAt;
  }

  return acceptedProviderRecord(
    {
      ...identity,
      externalId,
    },
    {
      externalReference:
        readOptionalShopifyString(record, "name") ??
        readOptionalShopifyString(record, "legacyResourceId"),
      status,
      orderedAt,
      currency,
      grossAmount: totalMoney?.amount ?? null,
      discountAmount: discountMoney?.amount ?? null,
      netAmount: netMoney?.amount ?? null,
      financialStatus,
      fulfillmentStatus,
      cancelledAt,
      provenance: {
        adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
        sourceIds: {
          orderGid: externalId,
        },
        sourceTimestamps,
      },
    },
  );
}

/**
 * Normalize a Shopify Admin GraphQL Order line item node.
 *
 * Requires parent order GID and variant GID. Does not invent refunds/returns.
 */
export function normalizeShopifyOrderLineItemPayload(
  payload: unknown,
  orderExternalId: string,
): ProviderNormalizationResult<ShopifyOrderItemCandidate> {
  const issues: ProviderNormalizationIssue[] = [];

  let normalizedOrderId: string | null = null;

  try {
    normalizedOrderId = normalizeShopifyResourceGid(
      orderExternalId,
      "Order",
    );
  } catch {
    issues.push(
      shopifyIssue(
        "EXTERNAL_ID_INVALID",
        "Shopify order line item parent order id must be a valid Order GID.",
        "orderExternalId",
      ),
    );
  }

  const record = readShopifyPayloadObject(payload, issues);

  let externalId: string | null = null;
  let variantExternalId: string | null = null;
  let locationExternalId: string | null = null;
  let quantity: UnitQuantity | null = null;
  let unitPriceAmount: DecimalString | null = null;
  let discountAmount: DecimalString | null = null;
  let currency: CurrencyCode | null = null;

  if (record) {
    const rawId = requireShopifyString(
      record,
      "id",
      issues,
      "Shopify order line item id is required.",
    );

    if (rawId !== null) {
      try {
        externalId = normalizeShopifyResourceGid(rawId, "LineItem");
      } catch {
        issues.push(
          shopifyIssue(
            "EXTERNAL_ID_INVALID",
            "Shopify order line item id must be a valid LineItem GID.",
            "id",
          ),
        );
      }
    }

    const variant = readShopifyNestedObject(
      record,
      "variant",
      issues,
      true,
      "Shopify order line item requires a ProductVariant relationship.",
    );

    if (variant) {
      const rawVariantId = requireShopifyString(
        variant,
        "id",
        issues,
        "Shopify order line item variant.id is required.",
      );

      if (rawVariantId !== null) {
        try {
          variantExternalId = normalizeShopifyResourceGid(
            rawVariantId,
            "ProductVariant",
          );
        } catch {
          issues.push(
            shopifyIssue(
              "EXTERNAL_ID_INVALID",
              "Shopify order line item variant.id must be a valid ProductVariant GID.",
              "variant.id",
            ),
          );
        }
      }
    }

    const location = record.location;

    if (location !== null && location !== undefined) {
      if (!isShopifyRecord(location)) {
        issues.push(
          shopifyIssue(
            "EXTERNAL_ID_INVALID",
            "Shopify order line item location must be an object when present.",
            "location",
          ),
        );
      } else {
        const rawLocationId = readOptionalShopifyString(location, "id");

        if (rawLocationId !== null) {
          try {
            locationExternalId = normalizeShopifyResourceGid(
              rawLocationId,
              "Location",
            );
          } catch {
            issues.push(
              shopifyIssue(
                "EXTERNAL_ID_INVALID",
                "Shopify order line item location.id must be a valid Location GID.",
                "location.id",
              ),
            );
          }
        }
      }
    }

    if (record.quantity === null || record.quantity === undefined) {
      issues.push(
        shopifyIssue(
          "REQUIRED_FIELD_MISSING",
          "Shopify order line item quantity is required.",
          "quantity",
        ),
      );
    } else {
      try {
        quantity = normalizeProviderUnitQuantity(record.quantity);
      } catch {
        issues.push(
          shopifyIssue(
            "INVALID_QUANTITY",
            "Shopify order line item quantity must be a non-negative whole-unit value.",
            "quantity",
          ),
        );
      }
    }

    const originalUnitPrice = readShopifyShopMoney(
      record.originalUnitPriceSet,
      "originalUnitPriceSet",
      issues,
    );

    if (originalUnitPrice) {
      if (originalUnitPrice.amount.startsWith("-")) {
        issues.push(
          shopifyIssue(
            "INVALID_MONEY",
            "Shopify order line item unit price must not be negative.",
            "originalUnitPriceSet",
          ),
        );
      } else {
        unitPriceAmount = originalUnitPrice.amount;
        currency = originalUnitPrice.currency;
      }
    }

    const discountMoney = readOptionalNonNegativeShopifyMoney(
      record.totalDiscountSet,
      "totalDiscountSet",
      issues,
    );

    if (discountMoney) {
      discountAmount = discountMoney.amount;

      if (currency === null) {
        currency = discountMoney.currency;
      }
    }
  }

  const identity = {
    provider: "shopify" as const,
    resourceType: "order_item" as const,
    externalId,
    externalParentId: normalizedOrderId,
    adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
  };

  if (
    issues.length > 0 ||
    externalId === null ||
    normalizedOrderId === null ||
    variantExternalId === null ||
    quantity === null
  ) {
    return quarantinedProviderRecord(identity, issues);
  }

  return acceptedProviderRecord(
    {
      ...identity,
      externalId,
    },
    {
      orderExternalId: normalizedOrderId,
      variantExternalId,
      locationExternalId,
      quantity,
      unitPriceAmount,
      discountAmount,
      unitCostAmount: null,
      currency,
      provenance: {
        adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
        sourceIds: {
          orderGid: normalizedOrderId,
          lineItemGid: externalId,
          variantGid: variantExternalId,
          ...(locationExternalId
            ? { locationGid: locationExternalId }
            : {}),
        },
        sourceTimestamps: {},
      },
    },
  );
}
