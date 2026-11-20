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
  assessShopifyConnectionCompleteness,
  refuseIncompleteNestedSyncInput,
  type ShopifyNestedCompletenessAttestation,
} from "./nested-completeness";

import {
  isShopifyRecord,
  readOptionalShopifyString,
  readShopifyConnectionNodes,
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

export type ShopifyOrderLineLocationResolution = {
  /**
   * LineItem GID → Location GID when an unambiguous FO line association exists.
   */
  locationsByLineItemGid: ReadonlyMap<string, string>;
  issues: readonly ProviderNormalizationIssue[];
  /**
   * True only when nested FO/line associations are acceptable as complete
   * offline sync input (explicit attestation or closed pageInfo+attestation).
   */
  acceptableAsCompleteSyncInput: boolean;
};

/**
 * Resolve sales/fulfillment location per LineItem from fulfillment-order
 * line associations (Admin API 2026-10).
 *
 * Never infers location from assignedLocation alone without a line link.
 * Never reads LineItem.location (unsupported on 2026-10).
 */
export function resolveShopifyOrderLineItemLocations(input: {
  fulfillmentOrders: unknown;
  /**
   * Required when treating FO children as complete sync input.
   * Default fails closed (incomplete/unattested nested pages).
   */
  nestedCompletenessAttestation?: ShopifyNestedCompletenessAttestation | null;
}): ShopifyOrderLineLocationResolution {
  const issues: ProviderNormalizationIssue[] = [];
  const locationsByLineItemGid = new Map<string, string>();
  const ambiguousLineItems = new Set<string>();
  const attestation = input.nestedCompletenessAttestation ?? null;

  let foNodes: unknown[] | null = null;
  let acceptableAsCompleteSyncInput = false;

  if (Array.isArray(input.fulfillmentOrders)) {
    foNodes = input.fulfillmentOrders;
    acceptableAsCompleteSyncInput =
      attestation?.nestedChildrenComplete === true;
  } else if (isShopifyRecord(input.fulfillmentOrders)) {
    const foCompleteness = assessShopifyConnectionCompleteness(
      input.fulfillmentOrders,
      attestation,
    );
    acceptableAsCompleteSyncInput =
      foCompleteness.acceptableAsCompleteSyncInput;

    const foIssue = refuseIncompleteNestedSyncInput(
      foCompleteness,
      "fulfillmentOrders",
    );
    if (foIssue) {
      issues.push(foIssue);
    }

    foNodes = readShopifyConnectionNodes(
      { fulfillmentOrders: input.fulfillmentOrders },
      "fulfillmentOrders",
    );
  }

  if (foNodes === null) {
    return {
      locationsByLineItemGid,
      issues,
      acceptableAsCompleteSyncInput: false,
    };
  }

  for (const foNode of foNodes) {
    if (!isShopifyRecord(foNode)) {
      issues.push(
        shopifyIssue(
          "RELATIONSHIP_UNRESOLVED",
          "Shopify fulfillment order nodes must be objects.",
          "fulfillmentOrders",
        ),
      );
      continue;
    }

    let locationGid: string | null = null;
    const assignedLocation = foNode.assignedLocation;

    if (isShopifyRecord(assignedLocation)) {
      const location = isShopifyRecord(assignedLocation.location)
        ? assignedLocation.location
        : null;
      const rawLocationId = location
        ? readOptionalShopifyString(location, "id")
        : null;

      if (rawLocationId !== null) {
        try {
          locationGid = normalizeShopifyResourceGid(rawLocationId, "Location");
        } catch {
          issues.push(
            shopifyIssue(
              "EXTERNAL_ID_INVALID",
              "Shopify fulfillment order assignedLocation.location.id must be a Location GID.",
              "assignedLocation.location.id",
            ),
          );
        }
      }
    }

    // assignedLocation alone never stamps every line — require FO lineItems.
    const foLineNodes = Array.isArray(foNode.lineItems)
      ? foNode.lineItems
      : readShopifyConnectionNodes(foNode, "lineItems");

    if (foLineNodes === null) {
      if (locationGid !== null) {
        issues.push(
          shopifyIssue(
            "RELATIONSHIP_UNRESOLVED",
            "Shopify fulfillment order has assignedLocation but no lineItems association — location is not inferred for sales lines.",
            "fulfillmentOrders.lineItems",
          ),
        );
      }
      continue;
    }

    if (isShopifyRecord(foNode.lineItems)) {
      const lineCompleteness = assessShopifyConnectionCompleteness(
        foNode.lineItems,
        attestation,
      );

      if (!lineCompleteness.acceptableAsCompleteSyncInput) {
        acceptableAsCompleteSyncInput = false;
        const lineIssue = refuseIncompleteNestedSyncInput(
          lineCompleteness,
          "fulfillmentOrders.lineItems",
        );
        if (lineIssue) {
          issues.push(lineIssue);
        }
      }
    }

    for (const foLine of foLineNodes) {
      if (!isShopifyRecord(foLine)) {
        issues.push(
          shopifyIssue(
            "RELATIONSHIP_UNRESOLVED",
            "Shopify fulfillment order line items must be objects.",
            "fulfillmentOrders.lineItems",
          ),
        );
        continue;
      }

      const lineItem = readShopifyNestedObject(
        foLine,
        "lineItem",
        issues,
        true,
        "Shopify fulfillment order line requires lineItem.id association.",
      );

      if (!lineItem) {
        continue;
      }

      const rawLineItemId = requireShopifyString(
        lineItem,
        "id",
        issues,
        "Shopify fulfillment order lineItem.id is required.",
      );

      if (rawLineItemId === null) {
        continue;
      }

      let lineItemGid: string;

      try {
        lineItemGid = normalizeShopifyResourceGid(rawLineItemId, "LineItem");
      } catch {
        issues.push(
          shopifyIssue(
            "EXTERNAL_ID_INVALID",
            "Shopify fulfillment order lineItem.id must be a LineItem GID.",
            "lineItem.id",
          ),
        );
        continue;
      }

      if (locationGid === null) {
        issues.push(
          shopifyIssue(
            "RELATIONSHIP_UNRESOLVED",
            "Shopify fulfillment order line association lacks assignedLocation.location.",
            "assignedLocation.location.id",
          ),
        );
        continue;
      }

      if (ambiguousLineItems.has(lineItemGid)) {
        continue;
      }

      const existing = locationsByLineItemGid.get(lineItemGid);

      if (existing !== undefined && existing !== locationGid) {
        issues.push(
          shopifyIssue(
            "RELATIONSHIP_UNRESOLVED",
            "Shopify LineItem maps to multiple fulfillment-order locations — location provenance is ambiguous.",
            "fulfillmentOrders",
          ),
        );
        locationsByLineItemGid.delete(lineItemGid);
        ambiguousLineItems.add(lineItemGid);
        continue;
      }

      locationsByLineItemGid.set(lineItemGid, locationGid);
    }
  }

  return {
    locationsByLineItemGid,
    issues,
    acceptableAsCompleteSyncInput,
  };
}

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
 * Normalize a Shopify Admin GraphQL Order line item node (Admin API 2026-10).
 *
 * Requires parent order GID and variant GID. Does not invent refunds/returns.
 * LineItem.location is unsupported — pass location via fulfillment-order
 * resolution (`resolvedLocationExternalId`).
 */
export function normalizeShopifyOrderLineItemPayload(
  payload: unknown,
  orderExternalId: string,
  options?: {
    /**
     * Location GID resolved from fulfillment-order line associations only.
     * Never invent from assignedLocation alone.
     */
    resolvedLocationExternalId?: string | null;
  },
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

    // Admin API 2026-10: LineItem has no location field. Reject invented shapes.
    if (record.location !== null && record.location !== undefined) {
      issues.push(
        shopifyIssue(
          "RELATIONSHIP_UNRESOLVED",
          "Shopify LineItem.location is unsupported on Admin API 2026-10; resolve location via fulfillment-order line associations.",
          "location",
        ),
      );
    }

    const resolvedLocation = options?.resolvedLocationExternalId ?? null;

    if (resolvedLocation !== null && resolvedLocation !== undefined) {
      try {
        locationExternalId = normalizeShopifyResourceGid(
          resolvedLocation,
          "Location",
        );
      } catch {
        issues.push(
          shopifyIssue(
            "EXTERNAL_ID_INVALID",
            "Resolved Shopify order line location must be a valid Location GID.",
            "resolvedLocationExternalId",
          ),
        );
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
