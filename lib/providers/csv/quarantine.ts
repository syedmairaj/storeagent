import type {
  ProviderResourceType,
  ProviderType,
} from "@/lib/commerce-domain/types";

import type {
  ProviderNormalizationIssue,
  ProviderReconciliationContext,
  ProviderReconciliationReasonCode,
} from "@/lib/providers/types";

export interface CsvQuarantineEnvelope {
  rowNumber: number;

  provider: ProviderType;
  resourceType:
    ProviderResourceType;

  externalId:
    string | null;

  externalParentId:
    string | null;

  adapterVersion: string;

  reasonCode:
    ProviderReconciliationReasonCode;

  issues:
    readonly ProviderNormalizationIssue[];
}

function requireRowNumber(
  rowNumber: number,
): number {
  if (
    !Number.isSafeInteger(
      rowNumber,
    ) ||
    rowNumber <= 0
  ) {
    throw new Error(
      "CSV row number must be a positive safe integer.",
    );
  }

  return rowNumber;
}

function requireAdapterVersion(
  value: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      "CSV quarantine adapterVersion must not be blank.",
    );
  }

  return normalized;
}

export function buildCsvQuarantineEnvelope(
  rowNumber: number,
  context:
    ProviderReconciliationContext,
): CsvQuarantineEnvelope {
  const row =
    requireRowNumber(
      rowNumber,
    );

  const adapterVersion =
    requireAdapterVersion(
      context.adapterVersion,
    );

  return {
    rowNumber:
      row,

    provider:
      context.provider,

    resourceType:
      context.resourceType,

    externalId:
      context.externalId,

    externalParentId:
      context.externalParentId,

    adapterVersion,

    reasonCode:
      context.reasonCode,

    issues:
      [...context.issues],
  };
}
