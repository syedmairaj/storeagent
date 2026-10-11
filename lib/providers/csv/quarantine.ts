import type {
  ProviderResourceType,
  ProviderType,
} from "@/lib/commerce-domain/types";

import type {
  ProviderNormalizationIssue,
  ProviderReconciliationContext,
  ProviderReconciliationReasonCode,
} from "@/lib/providers/types";

interface CsvQuarantineBase {
  rowNumber: number;

  provider: ProviderType;

  adapterVersion: string;

  reasonCode: ProviderReconciliationReasonCode;

  issues: readonly ProviderNormalizationIssue[];
}

export interface CsvResourceQuarantineEnvelope extends CsvQuarantineBase {
  subjectType: "resource";

  resourceType: ProviderResourceType;

  externalId: string | null;

  externalParentId: string | null;
}

export interface CsvInventoryQuarantineEnvelope extends CsvQuarantineBase {
  subjectType: "observation";

  observationType: "inventory_snapshot";

  variantExternalId: string | null;

  locationExternalId: string | null;
}

export interface CsvSupplierProductQuarantineEnvelope extends CsvQuarantineBase {
  subjectType: "relationship";

  relationshipType: "supplier_product";

  supplierExternalId: string | null;

  variantExternalId: string | null;
}

export type CsvQuarantineEnvelope =
  | CsvResourceQuarantineEnvelope
  | CsvInventoryQuarantineEnvelope
  | CsvSupplierProductQuarantineEnvelope;

function requireRowNumber(rowNumber: number): number {
  if (!Number.isSafeInteger(rowNumber) || rowNumber <= 0) {
    throw new Error("CSV row number must be a positive safe integer.");
  }

  return rowNumber;
}

function requireAdapterVersion(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("CSV quarantine adapterVersion must not be blank.");
  }

  return normalized;
}

function baseEnvelope(
  rowNumber: number,
  provider: ProviderType,
  adapterVersion: string,
  reasonCode: ProviderReconciliationReasonCode,
  issues: readonly ProviderNormalizationIssue[],
): CsvQuarantineBase {
  return {
    rowNumber: requireRowNumber(rowNumber),

    provider,

    adapterVersion: requireAdapterVersion(adapterVersion),

    reasonCode,

    issues: [...issues],
  };
}

export function buildCsvQuarantineEnvelope(
  rowNumber: number,
  context: ProviderReconciliationContext,
): CsvResourceQuarantineEnvelope {
  return {
    ...baseEnvelope(
      rowNumber,
      context.provider,
      context.adapterVersion,
      context.reasonCode,
      context.issues,
    ),

    subjectType: "resource",

    resourceType: context.resourceType,

    externalId: context.externalId,

    externalParentId: context.externalParentId,
  };
}

export function buildCsvInventoryQuarantineEnvelope(input: {
  rowNumber: number;
  adapterVersion: string;

  variantExternalId: string | null;

  locationExternalId: string | null;

  reasonCode: ProviderReconciliationReasonCode;

  issues: readonly ProviderNormalizationIssue[];
}): CsvInventoryQuarantineEnvelope {
  return {
    ...baseEnvelope(
      input.rowNumber,
      "csv",
      input.adapterVersion,
      input.reasonCode,
      input.issues,
    ),

    subjectType: "observation",

    observationType: "inventory_snapshot",

    variantExternalId: input.variantExternalId,

    locationExternalId: input.locationExternalId,
  };
}

export function buildCsvSupplierProductQuarantineEnvelope(input: {
  rowNumber: number;
  adapterVersion: string;

  supplierExternalId: string | null;

  variantExternalId: string | null;

  reasonCode: ProviderReconciliationReasonCode;

  issues: readonly ProviderNormalizationIssue[];
}): CsvSupplierProductQuarantineEnvelope {
  return {
    ...baseEnvelope(
      input.rowNumber,
      "csv",
      input.adapterVersion,
      input.reasonCode,
      input.issues,
    ),

    subjectType: "relationship",

    relationshipType: "supplier_product",

    supplierExternalId: input.supplierExternalId,

    variantExternalId: input.variantExternalId,
  };
}
