import type {
  CurrencyCode,
  DecimalString,
  ProductStatus,
  ProductVariantStatus,
} from "@/lib/commerce-domain/types";

import {
  acceptedProviderRecord,
  quarantinedProviderRecord,
  skippedProviderRecord,
} from "@/lib/providers/results";

import {
  normalizeProviderCurrencyCode,
  normalizeProviderMoneyInput,
} from "@/lib/providers/money";

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
  SHOPIFY_RO1_RESOURCE_MAPPING,
} from "./mapping";

import {
  isShopifyRecord,
  readOptionalShopifyString,
  readShopifyNestedObject,
  readShopifyPayloadObject,
  requireShopifyString,
} from "./payload";

import type {
  ShopifyProductCandidate,
  ShopifyProductVariantCandidate,
} from "./types";

import {
  SHOPIFY_RO1_ADAPTER_VERSION,
} from "./version";

function normalizeProductStatus(
  raw: string | null,
  issues: ProviderNormalizationIssue[],
): ProductStatus | null {
  if (raw === null) {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        "Shopify product status is required.",
        "status",
      ),
    );

    return null;
  }

  const mapped =
    SHOPIFY_RO1_RESOURCE_MAPPING.productStatus[
      raw as keyof typeof SHOPIFY_RO1_RESOURCE_MAPPING.productStatus
    ];

  if (!mapped) {
    issues.push(
      shopifyIssue(
        "UNSUPPORTED_STATUS",
        `Shopify product status "${raw}" is not supported by ${SHOPIFY_RO1_ADAPTER_VERSION}.`,
        "status",
      ),
    );

    return null;
  }

  return mapped;
}

function normalizeVariantMoney(
  raw: unknown,
  field: "price" | "compareAtPrice",
  issues: ProviderNormalizationIssue[],
): DecimalString | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw !== "string") {
    issues.push(
      shopifyIssue(
        "INVALID_MONEY",
        `Shopify variant ${field} must be an exact decimal string.`,
        field,
      ),
    );

    return null;
  }

  try {
    const amount = normalizeProviderMoneyInput(raw);

    if (amount.startsWith("-")) {
      issues.push(
        shopifyIssue(
          "INVALID_MONEY",
          `Shopify variant ${field} must not be negative.`,
          field,
        ),
      );

      return null;
    }

    return amount;
  } catch {
    issues.push(
      shopifyIssue(
        "INVALID_MONEY",
        `Shopify variant ${field} must be a plain decimal string.`,
        field,
      ),
    );

    return null;
  }
}

function normalizeOptionalCurrency(
  raw: string | null,
  issues: ProviderNormalizationIssue[],
): CurrencyCode | null {
  if (raw === null) {
    return null;
  }

  try {
    return normalizeProviderCurrencyCode(raw);
  } catch {
    issues.push(
      shopifyIssue(
        "INVALID_CURRENCY",
        "Shopify variant currency must be a three-letter code.",
        "currency",
      ),
    );

    return null;
  }
}

function readInventoryItemGid(
  record: Record<string, unknown>,
  issues: ProviderNormalizationIssue[],
): string | null {
  const inventoryItem = readShopifyNestedObject(
    record,
    "inventoryItem",
    issues,
    false,
    "Shopify variant inventoryItem must be an object when present.",
  );

  if (inventoryItem === null) {
    return null;
  }

  const rawId = requireShopifyString(
    inventoryItem,
    "id",
    issues,
    "Shopify inventoryItem.id is required when inventoryItem is present.",
  );

  if (rawId === null) {
    return null;
  }

  try {
    return normalizeShopifyResourceGid(rawId, "InventoryItem");
  } catch {
    issues.push(
      shopifyIssue(
        "EXTERNAL_ID_INVALID",
        "Shopify inventoryItem.id must be a valid InventoryItem GID.",
        "inventoryItem.id",
      ),
    );

    return null;
  }
}

/**
 * Normalize a Shopify Admin GraphQL Product node into a canonical candidate.
 */
export function normalizeShopifyProductPayload(
  payload: unknown,
): ProviderNormalizationResult<ShopifyProductCandidate> {
  const issues: ProviderNormalizationIssue[] = [];

  const record = readShopifyPayloadObject(payload, issues);

  let externalId: string | null = null;

  if (record) {
    const rawId = requireShopifyString(
      record,
      "id",
      issues,
      "Shopify product id is required.",
    );

    if (rawId !== null) {
      try {
        externalId = normalizeShopifyResourceGid(rawId, "Product");
      } catch {
        issues.push(
          shopifyIssue(
            "EXTERNAL_ID_INVALID",
            "Shopify product id must be a valid Product GID.",
            "id",
          ),
        );
      }
    }
  }

  const identity = {
    provider: "shopify" as const,
    resourceType: "product" as const,
    externalId,
    externalParentId: null,
    adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
  };

  if (!record) {
    return quarantinedProviderRecord(identity, issues);
  }

  const title = requireShopifyString(
    record,
    "title",
    issues,
    "Shopify product title is required.",
  );

  const status = normalizeProductStatus(
    readOptionalShopifyString(record, "status"),
    issues,
  );

  const createdAt = readOptionalShopifyString(record, "createdAt");
  const updatedAt = readOptionalShopifyString(record, "updatedAt");

  if (issues.length > 0 || externalId === null || title === null || status === null) {
    return quarantinedProviderRecord(identity, issues);
  }

  const sourceTimestamps: Record<string, string> = {};

  if (createdAt) {
    sourceTimestamps.createdAt = createdAt;
  }

  if (updatedAt) {
    sourceTimestamps.updatedAt = updatedAt;
  }

  return acceptedProviderRecord(
    {
      ...identity,
      externalId,
    },
    {
      title,
      brand: readOptionalShopifyString(record, "vendor"),
      category: readOptionalShopifyString(record, "productType"),
      status,
      provenance: {
        adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
        sourceIds: {
          productGid: externalId,
        },
        sourceTimestamps,
      },
    },
  );
}

/**
 * Normalize a Shopify Admin GraphQL ProductVariant node.
 *
 * Requires product parent GID. SKU-less variants are intentionally skipped
 * (valid Shopify data outside StoreAgent V1 SKU scope).
 */
export function normalizeShopifyProductVariantPayload(
  payload: unknown,
): ProviderNormalizationResult<ShopifyProductVariantCandidate> {
  const issues: ProviderNormalizationIssue[] = [];

  const record = readShopifyPayloadObject(payload, issues);

  let externalId: string | null = null;
  let externalParentId: string | null = null;

  if (record) {
    const rawId = requireShopifyString(
      record,
      "id",
      issues,
      "Shopify product variant id is required.",
    );

    if (rawId !== null) {
      try {
        externalId = normalizeShopifyResourceGid(rawId, "ProductVariant");
      } catch {
        issues.push(
          shopifyIssue(
            "EXTERNAL_ID_INVALID",
            "Shopify product variant id must be a valid ProductVariant GID.",
            "id",
          ),
        );
      }
    }

    const product = readShopifyNestedObject(
      record,
      "product",
      issues,
      true,
      "Shopify product variant requires a parent product relationship.",
    );

    if (product) {
      const rawParentId = requireShopifyString(
        product,
        "id",
        issues,
        "Shopify product variant product.id is required.",
      );

      if (rawParentId !== null) {
        try {
          externalParentId = normalizeShopifyResourceGid(
            rawParentId,
            "Product",
          );
        } catch {
          issues.push(
            shopifyIssue(
              "EXTERNAL_ID_INVALID",
              "Shopify product variant product.id must be a valid Product GID.",
              "product.id",
            ),
          );
        }
      }
    }
  }

  const identity = {
    provider: "shopify" as const,
    resourceType: "product_variant" as const,
    externalId,
    externalParentId,
    adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
  };

  if (!record) {
    return quarantinedProviderRecord(identity, issues);
  }

  const sku = readOptionalShopifyString(record, "sku");

  if (sku === null) {
    return skippedProviderRecord(identity, [
      shopifyIssue(
        "UNSUPPORTED_RESOURCE",
        "Shopify product variants without SKU are outside StoreAgent V1 ingestion scope.",
        "sku",
      ),
    ]);
  }

  let status: ProductVariantStatus | null = null;

  const product = isShopifyRecord(record.product)
    ? record.product
    : null;

  const productStatusRaw = product
    ? readOptionalShopifyString(product, "status")
    : null;

  if (productStatusRaw !== null) {
    const productStatus = normalizeProductStatus(productStatusRaw, issues);

    if (productStatus !== null) {
      status =
        SHOPIFY_RO1_RESOURCE_MAPPING.variantStatusFromProductStatus[
          productStatus
        ];
    }
  } else {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        "Shopify product variant requires product.status for RO.1 status mapping.",
        "product.status",
      ),
    );
  }

  const sellingPriceAmount = normalizeVariantMoney(
    record.price,
    "price",
    issues,
  );

  const currency = normalizeOptionalCurrency(
    readOptionalShopifyString(record, "currency") ??
      readOptionalShopifyString(record, "priceCurrencyCode"),
    issues,
  );

  if (sellingPriceAmount !== null && currency === null) {
    const alreadyInvalid = issues.some(
      (entry) =>
        entry.field === "currency" &&
        entry.code === "INVALID_CURRENCY",
    );

    if (!alreadyInvalid) {
      issues.push(
        shopifyIssue(
          "INVALID_CURRENCY",
          "Shopify variant currency is required when price is supplied.",
          "currency",
        ),
      );
    }
  }

  const inventoryItemExternalId = readInventoryItemGid(record, issues);

  const createdAt = readOptionalShopifyString(record, "createdAt");
  const updatedAt = readOptionalShopifyString(record, "updatedAt");

  if (
    issues.length > 0 ||
    externalId === null ||
    externalParentId === null ||
    status === null
  ) {
    return quarantinedProviderRecord(identity, issues);
  }

  const sourceIds: Record<string, string> = {
    variantGid: externalId,
    productGid: externalParentId,
  };

  if (inventoryItemExternalId) {
    sourceIds.inventoryItemGid = inventoryItemExternalId;
  }

  const sourceTimestamps: Record<string, string> = {};

  if (createdAt) {
    sourceTimestamps.createdAt = createdAt;
  }

  if (updatedAt) {
    sourceTimestamps.updatedAt = updatedAt;
  }

  return acceptedProviderRecord(
    {
      ...identity,
      externalId,
    },
    {
      sku,
      barcode: readOptionalShopifyString(record, "barcode"),
      title: readOptionalShopifyString(record, "title"),
      status,
      costAmount: null,
      sellingPriceAmount,
      currency,
      inventoryItemExternalId,
      provenance: {
        adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
        sourceIds,
        sourceTimestamps,
      },
    },
  );
}
