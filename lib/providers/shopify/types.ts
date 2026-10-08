import type {
  ProviderResourceType,
} from "@/lib/commerce-domain/types";

/**
 * Shopify-specific types stay inside lib/providers/shopify.
 *
 * These are boundary types, not canonical StoreAgent domain types.
 */

export type ShopifyGid = string;

export interface ShopifyResourceIdentity {
  resourceType: ProviderResourceType;
  gid: ShopifyGid;
}

export interface ShopifyInventoryScope {
  /**
   * Canonical Shopify variant GID.
   */
  variantGid: ShopifyGid;

  /**
   * Canonical Shopify location GID.
   *
   * Inventory must never lose its location dimension.
   */
  locationGid: ShopifyGid;
}

export interface ShopifySyncPage {
  /**
   * Shopify pagination cursor is opaque transport provenance.
   *
   * It is never provider-resource identity.
   */
  cursorAfter: string | null;
  hasNextPage: boolean;
}
