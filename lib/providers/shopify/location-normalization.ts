import type {
  LocationStatus,
} from "@/lib/commerce-domain/types";

import {
  acceptedProviderRecord,
  quarantinedProviderRecord,
} from "@/lib/providers/results";

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
  readShopifyPayloadObject,
  requireShopifyString,
} from "./payload";

import type {
  ShopifyLocationCandidate,
} from "./types";

import {
  SHOPIFY_RO1_ADAPTER_VERSION,
} from "./version";

function normalizeLocationStatus(
  isActive: unknown,
  issues: ProviderNormalizationIssue[],
): LocationStatus | null {
  if (typeof isActive !== "boolean") {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        "Shopify location isActive boolean is required.",
        "isActive",
      ),
    );

    return null;
  }

  return isActive ? "active" : "inactive";
}

/**
 * Normalize a Shopify Admin GraphQL Location node.
 */
export function normalizeShopifyLocationPayload(
  payload: unknown,
): ProviderNormalizationResult<ShopifyLocationCandidate> {
  const issues: ProviderNormalizationIssue[] = [];

  const record = readShopifyPayloadObject(payload, issues);

  let externalId: string | null = null;

  if (record) {
    const rawId = requireShopifyString(
      record,
      "id",
      issues,
      "Shopify location id is required.",
    );

    if (rawId !== null) {
      try {
        externalId = normalizeShopifyResourceGid(rawId, "Location");
      } catch {
        issues.push(
          shopifyIssue(
            "EXTERNAL_ID_INVALID",
            "Shopify location id must be a valid Location GID.",
            "id",
          ),
        );
      }
    }
  }

  const identity = {
    provider: "shopify" as const,
    resourceType: "location" as const,
    externalId,
    externalParentId: null,
    adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
  };

  if (!record) {
    return quarantinedProviderRecord(identity, issues);
  }

  const name = requireShopifyString(
    record,
    "name",
    issues,
    "Shopify location name is required.",
  );

  const status = normalizeLocationStatus(record.isActive, issues);

  if (
    issues.length > 0 ||
    externalId === null ||
    name === null ||
    status === null
  ) {
    return quarantinedProviderRecord(identity, issues);
  }

  return acceptedProviderRecord(
    {
      ...identity,
      externalId,
    },
    {
      name,
      status,
      code: null,
      provenance: {
        adapterVersion: SHOPIFY_RO1_ADAPTER_VERSION,
        sourceIds: {
          locationGid: externalId,
        },
        sourceTimestamps: {},
      },
    },
  );
}
