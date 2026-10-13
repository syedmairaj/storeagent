import type {
  ProviderResourceType,
  ProviderType,
} from "@/lib/commerce-domain/types";

export const DATA_QUALITY_IDENTITY_VERSION =
  "dq-v1" as const;

export type DataQualityIdentityVersion =
  typeof DATA_QUALITY_IDENTITY_VERSION;

export const DATA_QUALITY_SUBJECT_KINDS = [
  "organization",
  "store",
  "location",
  "variant",
  "location_variant",
  "provider",
] as const;

export type DataQualitySubjectKind =
  (typeof DATA_QUALITY_SUBJECT_KINDS)[number];

export const DATA_QUALITY_PROVIDER_TYPES = [
  "csv",
  "shopify",
  "woocommerce",
  "square",
  "lightspeed",
  "other",
] as const satisfies readonly ProviderType[];

type MissingProviderType = Exclude<
  ProviderType,
  (typeof DATA_QUALITY_PROVIDER_TYPES)[number]
>;

export type DataQualityProviderTypesCovered =
  MissingProviderType extends never ? true : never;

export const dataQualityProviderTypesCovered: DataQualityProviderTypesCovered =
  true;

export const DATA_QUALITY_PROVIDER_RESOURCE_TYPES = [
  "store",
  "location",
  "product",
  "product_variant",
  "order",
  "order_item",
  "return_refund",
  "supplier",
  "purchase_order",
  "purchase_order_item",
] as const satisfies readonly ProviderResourceType[];

type MissingProviderResourceType = Exclude<
  ProviderResourceType,
  (typeof DATA_QUALITY_PROVIDER_RESOURCE_TYPES)[number]
>;

export type DataQualityProviderResourceTypesCovered =
  MissingProviderResourceType extends never
    ? true
    : never;

export const dataQualityProviderResourceTypesCovered: DataQualityProviderResourceTypesCovered =
  true;

export type DataQualityOrganizationSubject = {
  readonly kind: "organization";
};

export type DataQualityStoreSubject = {
  readonly kind: "store";
  readonly storeId: string;
};

export type DataQualityLocationSubject = {
  readonly kind: "location";
  readonly locationId: string;
};

export type DataQualityVariantSubject = {
  readonly kind: "variant";
  readonly variantId: string;
};

export type DataQualityLocationVariantSubject = {
  readonly kind: "location_variant";
  readonly locationId: string;
  readonly variantId: string;
};

export type DataQualityProviderSubject = {
  readonly kind: "provider";
  readonly integrationId: string;
  readonly provider: ProviderType;
  readonly resourceType: ProviderResourceType;
  readonly externalId: string;
};

export type DataQualityIssueSubject =
  | DataQualityOrganizationSubject
  | DataQualityStoreSubject
  | DataQualityLocationSubject
  | DataQualityVariantSubject
  | DataQualityLocationVariantSubject
  | DataQualityProviderSubject;

/**
 * Identity input for one durable issue inside an already
 * resolved tenant. Organization ownership stays outside
 * this tuple.
 */
export type DataQualityIssueIdentityInput = {
  readonly issueCode: string;
  readonly subject: DataQualityIssueSubject;
};

export type DataQualityIssueIdentityTuple =
  readonly [
    DataQualityIdentityVersion,
    ...string[],
  ];
