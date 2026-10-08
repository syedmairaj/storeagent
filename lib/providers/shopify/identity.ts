import type {
  ShopifyGid,
  ShopifyInventoryScope,
} from "./types";

const SHOPIFY_GID_PATTERN =
  /^gid:\/\/shopify\/([A-Za-z][A-Za-z0-9_]*)\/([^/?#\s]+)$/;

export function normalizeShopifyGid(
  value: string,
): ShopifyGid {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      "Shopify GID must not be empty.",
    );
  }

  if (
    !SHOPIFY_GID_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "Shopify identity must be a valid Shopify GID.",
    );
  }

  return normalized;
}

/**
 * Validates a Shopify GID against the expected GraphQL resource name.
 *
 * The ID remains opaque. We do not extract or interpret its final
 * numeric/string component as StoreAgent identity.
 */
export function normalizeShopifyResourceGid(
  value: string,
  expectedResource: string,
): ShopifyGid {
  const gid =
    normalizeShopifyGid(value);

  const match =
    gid.match(
      SHOPIFY_GID_PATTERN,
    );

  if (
    match?.[1] !==
    expectedResource
  ) {
    throw new Error(
      `Shopify GID must reference ${expectedResource}.`,
    );
  }

  return gid;
}

export function normalizeShopifyInventoryScope(
  variantGid: string,
  locationGid: string,
): ShopifyInventoryScope {
  return {
    variantGid:
      normalizeShopifyResourceGid(
        variantGid,
        "ProductVariant",
      ),

    locationGid:
      normalizeShopifyResourceGid(
        locationGid,
        "Location",
      ),
  };
}

/**
 * Deterministic inventory observation scope.
 *
 * This is not a ProviderBinding identity. ProductVariant and Location
 * each retain their own ProviderBinding. The pair identifies the scope
 * of an inventory observation.
 */
export function buildShopifyInventoryScopeKey(
  scope: ShopifyInventoryScope,
): string {
  const normalized =
    normalizeShopifyInventoryScope(
      scope.variantGid,
      scope.locationGid,
    );

  return JSON.stringify([
    normalized.variantGid,
    normalized.locationGid,
  ]);
}
