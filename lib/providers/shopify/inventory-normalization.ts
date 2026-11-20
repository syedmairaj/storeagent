import type {
  ISODateTime,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import {
  normalizeOptionalProviderUnitQuantity,
} from "@/lib/providers/quantities";

import {
  normalizeProviderTimestamp,
} from "@/lib/providers/timestamps";

import type {
  ProviderNormalizationIssue,
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
  readShopifyConnectionNodes,
  readShopifyNestedObject,
  readShopifyPayloadObject,
  requireShopifyString,
} from "./payload";

import type {
  ShopifyInventoryObservationCandidate,
} from "./types";

import {
  SHOPIFY_RO1_ADAPTER_VERSION,
} from "./version";

type InventoryQuantityField =
  | "onHandQuantity"
  | "availableQuantity"
  | "committedQuantity"
  | "incomingQuantity";

interface ParsedQuantities {
  onHandQuantity: UnitQuantity | null;
  availableQuantity: UnitQuantity | null;
  committedQuantity: UnitQuantity | null;
  incomingQuantity: UnitQuantity | null;
}

export interface ShopifyInventoryObservationAccepted {
  disposition: "accepted";

  provider: "shopify";
  observationType: "inventory_snapshot";

  adapterVersion: string;

  variantExternalId: string;
  locationExternalId: string;
  inventoryItemExternalId: string;

  canonical: ShopifyInventoryObservationCandidate;

  issues: readonly [];
}

export interface ShopifyInventoryObservationQuarantined {
  disposition: "quarantined";

  provider: "shopify";
  observationType: "inventory_snapshot";

  adapterVersion: string;

  variantExternalId: string | null;
  locationExternalId: string | null;
  inventoryItemExternalId: string | null;

  canonical: null;

  issues: readonly ProviderNormalizationIssue[];
}

export type ShopifyInventoryObservationResult =
  | ShopifyInventoryObservationAccepted
  | ShopifyInventoryObservationQuarantined;

function readRequiredGid(
  record: Record<string, unknown>,
  field: string,
  expectedResource: string,
  issues: ProviderNormalizationIssue[],
  missingMessage: string,
  invalidMessage: string,
): string | null {
  const raw = requireShopifyString(
    record,
    field,
    issues,
    missingMessage,
  );

  if (raw === null) {
    return null;
  }

  try {
    return normalizeShopifyResourceGid(raw, expectedResource);
  } catch {
    issues.push(
      shopifyIssue(
        "EXTERNAL_ID_INVALID",
        invalidMessage,
        field,
      ),
    );

    return null;
  }
}

function parseQuantityEntries(
  quantities: unknown,
  issues: ProviderNormalizationIssue[],
): ParsedQuantities {
  const result: ParsedQuantities = {
    onHandQuantity: null,
    availableQuantity: null,
    committedQuantity: null,
    incomingQuantity: null,
  };

  if (quantities === null || quantities === undefined) {
    return result;
  }

  if (!Array.isArray(quantities)) {
    issues.push(
      shopifyIssue(
        "AMBIGUOUS_INVENTORY_SEMANTICS",
        "Shopify inventory quantities must be an array of named quantity objects.",
        "quantities",
      ),
    );

    return result;
  }

  const seen = new Set<InventoryQuantityField>();

  for (const entry of quantities) {
    if (!isShopifyRecord(entry)) {
      issues.push(
        shopifyIssue(
          "AMBIGUOUS_INVENTORY_SEMANTICS",
          "Shopify inventory quantity entries must be objects.",
          "quantities",
        ),
      );

      continue;
    }

    const name = entry.name;

    if (typeof name !== "string" || !name.trim()) {
      issues.push(
        shopifyIssue(
          "AMBIGUOUS_INVENTORY_SEMANTICS",
          "Shopify inventory quantity entries require a name.",
          "quantities",
        ),
      );

      continue;
    }

    const mappedField =
      SHOPIFY_RO1_RESOURCE_MAPPING.inventoryQuantityName[
        name as keyof typeof SHOPIFY_RO1_RESOURCE_MAPPING.inventoryQuantityName
      ];

    if (!mappedField) {
      continue;
    }

    if (seen.has(mappedField)) {
      issues.push(
        shopifyIssue(
          "AMBIGUOUS_INVENTORY_SEMANTICS",
          `Shopify inventory quantity "${name}" was supplied more than once.`,
          "quantities",
        ),
      );

      continue;
    }

    seen.add(mappedField);

    try {
      result[mappedField] = normalizeOptionalProviderUnitQuantity(
        entry.quantity,
      );
    } catch {
      issues.push(
        shopifyIssue(
          "INVALID_QUANTITY",
          `Shopify inventory quantity "${name}" must be a non-negative whole-unit value.`,
          "quantities",
        ),
      );
    }
  }

  return result;
}

/**
 * Normalize a Shopify Admin GraphQL InventoryLevel node.
 *
 * Requires InventoryItem, ProductVariant, and Location GIDs.
 * Missing quantity names remain null — never coerced to zero.
 */
export function normalizeShopifyInventoryLevelPayload(
  payload: unknown,
): ShopifyInventoryObservationResult {
  const issues: ProviderNormalizationIssue[] = [];

  const record = readShopifyPayloadObject(payload, issues);

  let inventoryItemExternalId: string | null = null;
  let variantExternalId: string | null = null;
  let locationExternalId: string | null = null;
  let observedAt: ISODateTime | null = null;
  let quantities: ParsedQuantities = {
    onHandQuantity: null,
    availableQuantity: null,
    committedQuantity: null,
    incomingQuantity: null,
  };

  if (record) {
    const item = readShopifyNestedObject(
      record,
      "item",
      issues,
      true,
      "Shopify inventory level requires inventory item relationship.",
    );

    if (item) {
      inventoryItemExternalId = readRequiredGid(
        item,
        "id",
        "InventoryItem",
        issues,
        "Shopify inventory item id is required.",
        "Shopify inventory item id must be a valid InventoryItem GID.",
      );

      // Admin API 2026-10: InventoryItem.variant (singular) is deprecated.
      // Require the supported variants connection with explicit cardinality.
      if (item.variant !== null && item.variant !== undefined) {
        issues.push(
          shopifyIssue(
            "RELATIONSHIP_UNRESOLVED",
            "InventoryItem.variant (singular) is deprecated on Admin API 2026-10; use the variants connection.",
            "item.variant",
          ),
        );
      }

      const variantNodes = readShopifyConnectionNodes(item, "variants");

      if (variantNodes === null) {
        issues.push(
          shopifyIssue(
            "RELATIONSHIP_UNRESOLVED",
            "Shopify inventory item requires a ProductVariant via the variants connection.",
            "item.variants",
          ),
        );
      } else if (variantNodes.length === 0) {
        issues.push(
          shopifyIssue(
            "RELATIONSHIP_UNRESOLVED",
            "Shopify inventory item variants connection is empty.",
            "item.variants",
          ),
        );
      } else if (variantNodes.length > 1) {
        issues.push(
          shopifyIssue(
            "AMBIGUOUS_INVENTORY_SEMANTICS",
            "Shopify inventory item variants connection returned multiple ProductVariant nodes — cardinality is ambiguous for RO.1.2.",
            "item.variants",
          ),
        );
      } else if (!isShopifyRecord(variantNodes[0])) {
        issues.push(
          shopifyIssue(
            "RELATIONSHIP_UNRESOLVED",
            "Shopify inventory item variants connection node must be an object.",
            "item.variants",
          ),
        );
      } else {
        variantExternalId = readRequiredGid(
          variantNodes[0],
          "id",
          "ProductVariant",
          issues,
          "Shopify inventory variant id is required.",
          "Shopify inventory variant id must be a valid ProductVariant GID.",
        );
      }
    }

    const location = readShopifyNestedObject(
      record,
      "location",
      issues,
      true,
      "Shopify inventory level requires a Location relationship.",
    );

    if (location) {
      locationExternalId = readRequiredGid(
        location,
        "id",
        "Location",
        issues,
        "Shopify inventory location id is required.",
        "Shopify inventory location id must be a valid Location GID.",
      );
    }

    const updatedAtRaw = requireShopifyString(
      record,
      "updatedAt",
      issues,
      "Shopify inventory level updatedAt is required as observation time.",
    );

    if (updatedAtRaw !== null) {
      try {
        observedAt = normalizeProviderTimestamp(
          updatedAtRaw,
        ).value as ISODateTime;
      } catch {
        issues.push(
          shopifyIssue(
            "INVALID_TIMESTAMP",
            "Shopify inventory updatedAt must be a valid date-time with an explicit timezone.",
            "updatedAt",
          ),
        );
      }
    }

    quantities = parseQuantityEntries(record.quantities, issues);
  }

  const allUnknown =
    quantities.onHandQuantity === null &&
    quantities.availableQuantity === null &&
    quantities.committedQuantity === null &&
    quantities.incomingQuantity === null;

  const quantityIssueAlreadyPresent = issues.some(
    (entry) =>
      entry.code === "INVALID_QUANTITY" ||
      entry.code === "AMBIGUOUS_INVENTORY_SEMANTICS",
  );

  if (allUnknown && !quantityIssueAlreadyPresent) {
    issues.push(
      shopifyIssue(
        "AMBIGUOUS_INVENTORY_SEMANTICS",
        "Shopify inventory observation must contain at least one known inventory quantity.",
        "quantities",
      ),
    );
  }

  if (
    issues.length > 0 ||
    inventoryItemExternalId === null ||
    variantExternalId === null ||
    locationExternalId === null ||
    observedAt === null
  ) {
    return {
      disposition: "quarantined",
      provider: "shopify",
      observationType: "inventory_snapshot",
      adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
      variantExternalId,
      locationExternalId,
      inventoryItemExternalId,
      canonical: null,
      issues,
    };
  }

  return {
    disposition: "accepted",
    provider: "shopify",
    observationType: "inventory_snapshot",
    adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
    variantExternalId,
    locationExternalId,
    inventoryItemExternalId,
    canonical: {
      variantExternalId,
      locationExternalId,
      inventoryItemExternalId,
      observedAt,
      onHandQuantity: quantities.onHandQuantity,
      availableQuantity: quantities.availableQuantity,
      committedQuantity: quantities.committedQuantity,
      // Provider-observed only — not M0.4 trusted incoming / ROQ / M7.
      incomingQuantity: quantities.incomingQuantity,
      incomingQuantityTrust: "provider_observed",
      provenance: {
        adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
        sourceIds: {
          inventoryItemGid: inventoryItemExternalId,
          variantGid: variantExternalId,
          locationGid: locationExternalId,
        },
        sourceTimestamps: {
          observedAt,
        },
      },
    },
    issues: [],
  };
}
