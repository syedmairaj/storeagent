import type {
  CurrencyCode,
  DecimalString,
  ISODateTime,
  LocationStatus,
  OrderStatus,
  ProductStatus,
  ProductVariantStatus,
  ProviderResourceType,
  UnitQuantity,
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

/**
 * Provenance retained on RO.1 candidates for later binding/SyncRun layers.
 *
 * Credentials and tokens must never appear here.
 */
export interface ShopifyRo1Provenance {
  adapterVersion: string;
  sourceIds: Readonly<Record<string, string>>;
  sourceTimestamps: Readonly<Record<string, string>>;
}

export interface ShopifyProductCandidate {
  title: string;
  brand: string | null;
  category: string | null;
  status: ProductStatus;
  provenance: ShopifyRo1Provenance;
}

export interface ShopifyProductVariantCandidate {
  sku: string;
  barcode: string | null;
  title: string | null;
  status: ProductVariantStatus;
  costAmount: DecimalString | null;
  sellingPriceAmount: DecimalString | null;
  currency: CurrencyCode | null;
  inventoryItemExternalId: string | null;
  provenance: ShopifyRo1Provenance;
}

export interface ShopifyLocationCandidate {
  name: string;
  status: LocationStatus;
  code: string | null;
  provenance: ShopifyRo1Provenance;
}

/**
 * Trust discriminant for Shopify inventory incoming.
 *
 * Provider-observed only. Never treat as M0.4 trusted incoming,
 * ROQ input, or M7 authorization evidence.
 */
export type ShopifyIncomingQuantityTrust =
  "provider_observed";

export interface ShopifyInventoryObservationCandidate {
  variantExternalId: string;
  locationExternalId: string;
  inventoryItemExternalId: string;

  observedAt: ISODateTime;

  onHandQuantity: UnitQuantity | null;
  availableQuantity: UnitQuantity | null;
  committedQuantity: UnitQuantity | null;

  /**
   * Shopify InventoryLevel "incoming" observation when present.
   *
   * Missing remains null. Known zero remains 0.
   * Trust is always provider_observed — not M0.4 trusted incoming.
   */
  incomingQuantity: UnitQuantity | null;
  incomingQuantityTrust: ShopifyIncomingQuantityTrust;

  provenance: ShopifyRo1Provenance;
}

export interface ShopifyOrderCandidate {
  externalReference: string | null;
  status: OrderStatus;
  orderedAt: ISODateTime;
  currency: CurrencyCode;

  grossAmount: DecimalString | null;
  discountAmount: DecimalString | null;
  netAmount: DecimalString | null;

  /**
   * Provider financial/fulfillment provenance retained inside the
   * Shopify adapter boundary for future persistence. Not canonical
   * OrderStatus vocabulary.
   */
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  cancelledAt: ISODateTime | null;

  provenance: ShopifyRo1Provenance;
}

export interface ShopifyOrderItemCandidate {
  orderExternalId: string;
  variantExternalId: string;
  locationExternalId: string | null;

  quantity: UnitQuantity;

  unitPriceAmount: DecimalString | null;
  discountAmount: DecimalString | null;
  unitCostAmount: DecimalString | null;

  currency: CurrencyCode | null;

  provenance: ShopifyRo1Provenance;
}
