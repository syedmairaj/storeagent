import type {
  CurrencyCode,
  DecimalString,
  ISODateTime,
  PurchaseOrderStatus,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import {
  buildCompositeExternalId,
  normalizeExternalId,
} from "@/lib/providers/external-identity";

import {
  normalizeProviderCurrencyCode,
  normalizeProviderMoneyInput,
} from "@/lib/providers/money";

import {
  normalizeCanonicalPurchaseOrderStatus,
} from "@/lib/providers/purchase-order-status";

import {
  normalizeOptionalProviderUnitQuantity,
  normalizeProviderUnitQuantity,
} from "@/lib/providers/quantities";

import {
  acceptedProviderRecord,
  quarantinedProviderRecord,
} from "@/lib/providers/results";

import {
  normalizeOptionalProviderTimestamp,
} from "@/lib/providers/timestamps";

import {
  readCsvMappedValue,
} from "@/lib/providers/csv/mapping";

import type {
  CsvAdapterConfig,
  CsvCanonicalField,
  CsvRow,
  ProviderNormalizationIssue,
  ProviderNormalizationResult,
} from "@/lib/providers/types";

export interface CsvPurchaseOrderCandidate {
  supplierExternalId:
    string | null;

  externalReference:
    string | null;

  status:
    PurchaseOrderStatus;

  orderedAt:
    ISODateTime | null;

  expectedAt:
    ISODateTime | null;

  receivedAt:
    ISODateTime | null;

  currency:
    CurrencyCode | null;
}

export interface CsvPurchaseOrderItemCandidate {
  purchaseOrderExternalId:
    string;

  variantExternalId:
    string;

  destinationLocationExternalId:
    string | null;

  orderedQuantity:
    UnitQuantity;

  receivedQuantity:
    UnitQuantity | null;

  unitCostAmount:
    DecimalString | null;

  currency:
    CurrencyCode | null;
}

function issue(
  code:
    ProviderNormalizationIssue["code"],
  message: string,
  field: string | null,
): ProviderNormalizationIssue {
  return {
    code,
    message,
    field,
  };
}

function mapped(
  row: CsvRow,
  config: CsvAdapterConfig,
  field: CsvCanonicalField,
): string | null {
  return readCsvMappedValue(
    row,
    config,
    field,
  );
}

function requireAdapter(
  config: CsvAdapterConfig,
  resourceType:
    | "purchase_order"
    | "purchase_order_item",
): void {
  if (
    config.resourceType !==
    resourceType
  ) {
    throw new Error(
      `CSV adapter resource type must be "${resourceType}".`,
    );
  }

  if (
    !config.adapterVersion.trim()
  ) {
    throw new Error(
      "CSV adapter version must not be blank.",
    );
  }
}

function requiredExternalId(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
  label: string,
): string | null {
  const raw =
    mapped(
      row,
      config,
      "externalId",
    );

  if (raw === null) {
    issues.push(
      issue(
        "EXTERNAL_ID_MISSING",
        `CSV ${label} requires a stable external identity.`,
        "externalId",
      ),
    );

    return null;
  }

  try {
    return normalizeExternalId(
      raw,
    );
  } catch {
    issues.push(
      issue(
        "EXTERNAL_ID_INVALID",
        `CSV ${label} external identity is invalid.`,
        "externalId",
      ),
    );

    return null;
  }
}

function optionalExternalRelationship(
  row: CsvRow,
  config: CsvAdapterConfig,
  field:
    | "supplierExternalId"
    | "destinationLocationExternalId",
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const raw =
    mapped(
      row,
      config,
      field,
    );

  if (raw === null) {
    return null;
  }

  try {
    return normalizeExternalId(
      raw,
    );
  } catch {
    issues.push(
      issue(
        "EXTERNAL_ID_INVALID",
        `CSV ${field} is invalid.`,
        field,
      ),
    );

    return null;
  }
}

function requiredParentOrder(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const raw =
    mapped(
      row,
      config,
      "externalParentId",
    );

  if (raw === null) {
    issues.push(
      issue(
        "RELATIONSHIP_UNRESOLVED",
        "CSV purchase-order item requires parent purchase-order identity.",
        "externalParentId",
      ),
    );

    return null;
  }

  try {
    return normalizeExternalId(
      raw,
    );
  } catch {
    issues.push(
      issue(
        "EXTERNAL_ID_INVALID",
        "CSV purchase-order parent identity is invalid.",
        "externalParentId",
      ),
    );

    return null;
  }
}

function requiredVariant(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const explicit =
    mapped(
      row,
      config,
      "variantExternalId",
    );

  if (explicit !== null) {
    try {
      return normalizeExternalId(
        explicit,
      );
    } catch {
      issues.push(
        issue(
          "EXTERNAL_ID_INVALID",
          "CSV purchase-order-item variant identity is invalid.",
          "variantExternalId",
        ),
      );

      return null;
    }
  }

  const sku =
    mapped(
      row,
      config,
      "sku",
    );

  if (sku !== null) {
    try {
      return buildCompositeExternalId([
        {
          name: "sku",
          value: sku,
        },
      ]);
    } catch {
      issues.push(
        issue(
          "EXTERNAL_ID_INVALID",
          "CSV purchase-order-item SKU identity is invalid.",
          "sku",
        ),
      );

      return null;
    }
  }

  issues.push(
    issue(
      "RELATIONSHIP_UNRESOLVED",
      "CSV purchase-order item requires a stable variant external identity or SKU.",
      "variantExternalId",
    ),
  );

  return null;
}

function optionalTimestamp(
  row: CsvRow,
  config: CsvAdapterConfig,
  field:
    | "orderedAt"
    | "expectedAt"
    | "receivedAt",
  issues:
    ProviderNormalizationIssue[],
): ISODateTime | null {
  const raw =
    mapped(
      row,
      config,
      field,
    );

  try {
    const normalized =
      normalizeOptionalProviderTimestamp(
        raw,
      );

    return normalized
      ? normalized.value as ISODateTime
      : null;
  } catch {
    issues.push(
      issue(
        "INVALID_TIMESTAMP",
        `CSV ${field} must be a valid date-time with an explicit timezone.`,
        field,
      ),
    );

    return null;
  }
}

function optionalCurrency(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): CurrencyCode | null {
  const raw =
    mapped(
      row,
      config,
      "currency",
    );

  if (raw === null) {
    return null;
  }

  try {
    return normalizeProviderCurrencyCode(
      raw,
    );
  } catch {
    issues.push(
      issue(
        "INVALID_CURRENCY",
        "CSV currency must be a three-letter code.",
        "currency",
      ),
    );

    return null;
  }
}

function optionalMoney(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): DecimalString | null {
  const raw =
    mapped(
      row,
      config,
      "unitCostAmount",
    );

  if (raw === null) {
    return null;
  }

  try {
    const value =
      normalizeProviderMoneyInput(
        raw,
      );

    if (
      value.startsWith("-")
    ) {
      issues.push(
        issue(
          "INVALID_MONEY",
          "CSV unitCostAmount must not be negative.",
          "unitCostAmount",
        ),
      );

      return null;
    }

    return value;
  } catch {
    issues.push(
      issue(
        "INVALID_MONEY",
        "CSV unitCostAmount must be an exact non-negative decimal string.",
        "unitCostAmount",
      ),
    );

    return null;
  }
}

export function normalizeCsvPurchaseOrderRow(
  row: CsvRow,
  config: CsvAdapterConfig,
): ProviderNormalizationResult<CsvPurchaseOrderCandidate> {
  requireAdapter(
    config,
    "purchase_order",
  );

  const issues:
    ProviderNormalizationIssue[] =
      [];

  const externalId =
    requiredExternalId(
      row,
      config,
      issues,
      "purchase order",
    );

  const supplierExternalId =
    optionalExternalRelationship(
      row,
      config,
      "supplierExternalId",
      issues,
    );

  const orderedAt =
    optionalTimestamp(
      row,
      config,
      "orderedAt",
      issues,
    );

  const expectedAt =
    optionalTimestamp(
      row,
      config,
      "expectedAt",
      issues,
    );

  const receivedAt =
    optionalTimestamp(
      row,
      config,
      "receivedAt",
      issues,
    );

  const currency =
    optionalCurrency(
      row,
      config,
      issues,
    );

  const identity = {
    provider:
      "csv" as const,

    resourceType:
      "purchase_order" as const,

    externalId,

    externalParentId:
      supplierExternalId,

    adapterVersion:
      config.adapterVersion,
  };

  if (
    issues.length > 0 ||
    externalId === null
  ) {
    return quarantinedProviderRecord(
      identity,
      issues,
    );
  }

  return acceptedProviderRecord(
    {
      ...identity,
      externalId,
    },
    {
      supplierExternalId,

      externalReference:
        mapped(
          row,
          config,
          "externalReference",
        ),

      status:
        normalizeCanonicalPurchaseOrderStatus(
          mapped(
            row,
            config,
            "status",
          ),
        ),

      orderedAt,
      expectedAt,
      receivedAt,
      currency,
    },
  );
}

export function normalizeCsvPurchaseOrderItemRow(
  row: CsvRow,
  config: CsvAdapterConfig,
  rowNumber: number,
): ProviderNormalizationResult<CsvPurchaseOrderItemCandidate> {
  requireAdapter(
    config,
    "purchase_order_item",
  );

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

  const issues:
    ProviderNormalizationIssue[] =
      [];

  const externalId =
    requiredExternalId(
      row,
      config,
      issues,
      "purchase-order item",
    );

  const externalParentId =
    requiredParentOrder(
      row,
      config,
      issues,
    );

  const variantExternalId =
    requiredVariant(
      row,
      config,
      issues,
    );

  const destinationLocationExternalId =
    optionalExternalRelationship(
      row,
      config,
      "destinationLocationExternalId",
      issues,
    );

  const rawOrdered =
    mapped(
      row,
      config,
      "orderedQuantity",
    );

  let orderedQuantity:
    UnitQuantity | null =
      null;

  if (rawOrdered === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV purchase-order-item ordered quantity is required.",
        "orderedQuantity",
      ),
    );
  } else {
    try {
      orderedQuantity =
        normalizeProviderUnitQuantity(
          rawOrdered,
        );
    } catch {
      issues.push(
        issue(
          "INVALID_QUANTITY",
          "CSV orderedQuantity must be a non-negative whole-unit value.",
          "orderedQuantity",
        ),
      );
    }
  }

  const rawReceived =
    mapped(
      row,
      config,
      "receivedQuantity",
    );

  let receivedQuantity:
    UnitQuantity | null =
      null;

  try {
    receivedQuantity =
      normalizeOptionalProviderUnitQuantity(
        rawReceived,
      );
  } catch {
    issues.push(
      issue(
        "INVALID_QUANTITY",
        "CSV receivedQuantity must be a non-negative whole-unit value.",
        "receivedQuantity",
      ),
    );
  }

  const unitCostAmount =
    optionalMoney(
      row,
      config,
      issues,
    );

  const currency =
    optionalCurrency(
      row,
      config,
      issues,
    );

  if (
    unitCostAmount !== null &&
    currency === null
  ) {
    const hasCurrencyIssue =
      issues.some(
        (entry) =>
          entry.field ===
            "currency",
      );

    if (!hasCurrencyIssue) {
      issues.push(
        issue(
          "INVALID_CURRENCY",
          "CSV purchase-order-item currency is required when unit cost is supplied.",
          "currency",
        ),
      );
    }
  }

  const identity = {
    provider:
      "csv" as const,

    resourceType:
      "purchase_order_item" as const,

    externalId,

    externalParentId,

    adapterVersion:
      config.adapterVersion,
  };

  if (
    issues.length > 0 ||
    externalId === null ||
    externalParentId === null ||
    variantExternalId === null ||
    orderedQuantity === null
  ) {
    return quarantinedProviderRecord(
      identity,
      issues,
    );
  }

  return acceptedProviderRecord(
    {
      ...identity,
      externalId,
    },
    {
      purchaseOrderExternalId:
        externalParentId,

      variantExternalId,

      destinationLocationExternalId,

      orderedQuantity,
      receivedQuantity,

      unitCostAmount,
      currency,
    },
  );
}
