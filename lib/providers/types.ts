import type {
  ProviderResourceType,
  ProviderType,
} from "@/lib/commerce-domain/types";

/**
 * Raw provider records are untrusted at this boundary.
 *
 * Provider/resource-specific adapters must validate payload
 * shape before producing a canonical candidate.
 */
export interface ProviderSourceRecord {
  provider: ProviderType;
  resourceType: ProviderResourceType;

  /**
   * Source identity before canonical binding.
   *
   * null means the source did not provide a trustworthy
   * external identity.
   */
  externalId: string | null;

  externalParentId: string | null;

  /**
   * Raw provider payload.
   *
   * This must remain unknown until validated by a
   * provider/resource-specific normalizer.
   */
  payload: unknown;
}

export type ProviderNormalizationDisposition =
  | "accepted"
  | "quarantined"
  | "skipped";

export type ProviderNormalizationIssueCode =
  | "EXTERNAL_ID_MISSING"
  | "EXTERNAL_ID_INVALID"
  | "REQUIRED_FIELD_MISSING"
  | "INVALID_TIMESTAMP"
  | "AMBIGUOUS_TIMESTAMP"
  | "INVALID_QUANTITY"
  | "INVALID_MONEY"
  | "INVALID_CURRENCY"
  | "UNSUPPORTED_CURRENCY"
  | "UNSUPPORTED_STATUS"
  | "AMBIGUOUS_INVENTORY_SEMANTICS"
  | "RELATIONSHIP_UNRESOLVED"
  | "UNSUPPORTED_RESOURCE";

export interface ProviderNormalizationIssue {
  code: ProviderNormalizationIssueCode;

  /**
   * Stable technical description for audit/debugging.
   *
   * Merchant-facing wording belongs elsewhere.
   */
  message: string;

  field: string | null;
}

export interface ProviderNormalizationAccepted<TCanonical> {
  disposition: "accepted";

  provider: ProviderType;
  resourceType: ProviderResourceType;

  externalId: string;
  externalParentId: string | null;

  adapterVersion: string;

  canonical: TCanonical;

  issues: readonly [];
}

export interface ProviderNormalizationQuarantined {
  disposition: "quarantined";

  provider: ProviderType;
  resourceType: ProviderResourceType;

  externalId: string | null;
  externalParentId: string | null;

  adapterVersion: string;

  canonical: null;

  issues: readonly ProviderNormalizationIssue[];
}

export interface ProviderNormalizationSkipped {
  disposition: "skipped";

  provider: ProviderType;
  resourceType: ProviderResourceType;

  externalId: string | null;
  externalParentId: string | null;

  adapterVersion: string;

  canonical: null;

  issues: readonly ProviderNormalizationIssue[];
}

export type ProviderNormalizationResult<TCanonical> =
  | ProviderNormalizationAccepted<TCanonical>
  | ProviderNormalizationQuarantined
  | ProviderNormalizationSkipped;

/**
 * One normalizer handles one provider + one canonical
 * resource type.
 *
 * Transport/API fetching is deliberately excluded.
 */
export interface ProviderResourceNormalizer<TCanonical> {
  readonly provider: ProviderType;
  readonly resourceType: ProviderResourceType;
  readonly adapterVersion: string;

  normalize(
    source: ProviderSourceRecord,
  ): ProviderNormalizationResult<TCanonical>;
}

export interface NormalizedExternalIdentity {
  externalId: string;
  externalParentId: string | null;
}

export interface CompositeExternalIdentityPart {
  name: string;
  value: string;
}

export interface NormalizedProviderTimestamp {
  /**
   * Canonical UTC ISO-8601 timestamp.
   */
  value: string;

  /**
   * Original trimmed provider timestamp retained for
   * deterministic audit/debug provenance.
   */
  sourceValue: string;
}

export interface NormalizedProviderMoney {
  amount: string;
  currency: string;
}

export interface ProviderInventoryQuantityInput {
  /**
   * Each field represents a provider quantity only when the
   * provider contract explicitly guarantees that semantic.
   *
   * Missing / null means unknown.
   */
  onHand?: unknown;
  available?: unknown;
  committed?: unknown;
  incoming?: unknown;
}

export interface NormalizedProviderInventoryQuantities {
  onHandQuantity: number | null;
  availableQuantity: number | null;
  committedQuantity: number | null;
  incomingQuantity: number | null;
}

export interface ProviderStatusMapping<TCanonicalStatus extends string> {
  externalStatus: string;
  canonicalStatus: TCanonicalStatus;
}

export interface ProviderBindingIdentity {
  organizationId: string;
  integrationId: string;
  provider: ProviderType;
  resourceType: ProviderResourceType;
  externalId: string;
}

export type ProviderBindingReplayDisposition =
  | "create"
  | "idempotent"
  | "conflict";

export interface ProviderBindingReplayResult {
  disposition: ProviderBindingReplayDisposition;
  bindingKey: string;
}

export type ProviderReconciliationReasonCode =
  | "NORMALIZATION_QUARANTINED"
  | "BINDING_CONFLICT"
  | "IDENTITY_AMBIGUOUS"
  | "RELATIONSHIP_UNRESOLVED"
  | "PROVIDER_INCONSISTENCY";

export interface ProviderReconciliationContext {
  provider: ProviderType;
  resourceType: ProviderResourceType;
  externalId: string | null;
  externalParentId: string | null;
  adapterVersion: string;
  reasonCode: ProviderReconciliationReasonCode;
  issues: readonly ProviderNormalizationIssue[];
}

export type ProviderSyncRecordDisposition =
  | "accepted"
  | "skipped"
  | "quarantined"
  | "failed";

export type CsvCanonicalField =
  | "externalId"
  | "externalParentId"
  | "sku"
  | "title"
  | "barcode"
  | "orderedAt"
  | "status"
  | "quantity"
  | "currency"
  | "amount"
  | "onHandQuantity"
  | "availableQuantity"
  | "committedQuantity"
  | "incomingQuantity";

export interface CsvColumnMapping {
  canonicalField: CsvCanonicalField;
  sourceColumn: string;
}

export interface CsvAdapterConfig {
  resourceType: ProviderResourceType;
  adapterVersion: string;
  mappings: readonly CsvColumnMapping[];
}

export type CsvRow = Readonly<Record<string, string | null | undefined>>;
