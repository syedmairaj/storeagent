import type {
  CurrencyCode,
  DecimalString,
  ISODateTime,
  OrderStatus,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import {
  buildCompositeExternalId,
  normalizeExternalId,
  normalizeOptionalExternalId,
} from "@/lib/providers/external-identity";

import {
  normalizeProviderCurrencyCode,
  normalizeProviderMoneyInput,
} from "@/lib/providers/money";

import {
  normalizeCanonicalOrderStatus,
} from "@/lib/providers/order-status";

import {
  normalizeProviderUnitQuantity,
} from "@/lib/providers/quantities";

import {
  acceptedProviderRecord,
  quarantinedProviderRecord,
} from "@/lib/providers/results";

import {
  normalizeProviderTimestamp,
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

export interface CsvOrderCandidate {
  externalReference: string | null;
  status: OrderStatus;
  orderedAt: ISODateTime;
  currency: CurrencyCode;

  grossAmount: DecimalString | null;
  discountAmount: DecimalString | null;
  netAmount: DecimalString | null;
}

export interface CsvOrderItemCandidate {
  orderExternalId: string;
  variantExternalId: string;
  locationExternalId: string | null;

  quantity: UnitQuantity;

  unitPriceAmount: DecimalString | null;
  discountAmount: DecimalString | null;
  unitCostAmount: DecimalString | null;

  currency: CurrencyCode | null;
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

function requireAdapter(
  config: CsvAdapterConfig,
  resourceType:
    | "order"
    | "order_item",
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

function requiredExternalId(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
  resourceLabel: string,
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
        `CSV ${resourceLabel} requires a stable external identity.`,
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
        `CSV ${resourceLabel} external identity is invalid.`,
        "externalId",
      ),
    );

    return null;
  }
}

function requiredOrderParentId(
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
        "CSV order item requires a stable parent order external identity.",
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
        "CSV order-item parent order identity is invalid.",
        "externalParentId",
      ),
    );

    return null;
  }
}

function requiredVariantId(
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
          "CSV order-item variant external identity is invalid.",
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
          "CSV order-item SKU identity is invalid.",
          "sku",
        ),
      );

      return null;
    }
  }

  issues.push(
    issue(
      "RELATIONSHIP_UNRESOLVED",
      "CSV order item requires a stable variant external identity or SKU.",
      "variantExternalId",
    ),
  );

  return null;
}

function optionalLocationId(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const raw =
    mapped(
      row,
      config,
      "locationExternalId",
    );

  if (raw === null) {
    return null;
  }

  try {
    return normalizeOptionalExternalId(
      raw,
    );
  } catch {
    issues.push(
      issue(
        "EXTERNAL_ID_INVALID",
        "CSV order-item location external identity is invalid.",
        "locationExternalId",
      ),
    );

    return null;
  }
}

function requiredOrderedAt(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): ISODateTime | null {
  const raw =
    mapped(
      row,
      config,
      "orderedAt",
    );

  if (raw === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV order orderedAt is required.",
        "orderedAt",
      ),
    );

    return null;
  }

  try {
    return normalizeProviderTimestamp(
      raw,
    ).value as ISODateTime;
  } catch {
    issues.push(
      issue(
        "INVALID_TIMESTAMP",
        "CSV order orderedAt must be a valid date-time with an explicit timezone.",
        "orderedAt",
      ),
    );

    return null;
  }
}

function requiredCurrency(
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
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV order currency is required.",
        "currency",
      ),
    );

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
        "CSV order currency must be a three-letter code.",
        "currency",
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
        "CSV order-item currency must be a three-letter code.",
        "currency",
      ),
    );

    return null;
  }
}

function optionalMoney(
  row: CsvRow,
  config: CsvAdapterConfig,
  field:
    | "grossAmount"
    | "discountAmount"
    | "netAmount"
    | "unitPriceAmount"
    | "unitCostAmount",
  issues:
    ProviderNormalizationIssue[],
): DecimalString | null {
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
    const normalized =
      normalizeProviderMoneyInput(
        raw,
      );

    if (
      normalized.startsWith("-")
    ) {
      issues.push(
        issue(
          "INVALID_MONEY",
          `CSV ${field} must not be negative.`,
          field,
        ),
      );

      return null;
    }

    return normalized;
  } catch {
    issues.push(
      issue(
        "INVALID_MONEY",
        `CSV ${field} must be an exact non-negative decimal string.`,
        field,
      ),
    );

    return null;
  }
}

export function normalizeCsvOrderRow(
  row: CsvRow,
  config: CsvAdapterConfig,
): ProviderNormalizationResult<CsvOrderCandidate> {
  requireAdapter(
    config,
    "order",
  );

  const issues:
    ProviderNormalizationIssue[] =
      [];

  const externalId =
    requiredExternalId(
      row,
      config,
      issues,
      "order",
    );

  const orderedAt =
    requiredOrderedAt(
      row,
      config,
      issues,
    );

  const currency =
    requiredCurrency(
      row,
      config,
      issues,
    );

  const grossAmount =
    optionalMoney(
      row,
      config,
      "grossAmount",
      issues,
    );

  const discountAmount =
    optionalMoney(
      row,
      config,
      "discountAmount",
      issues,
    );

  const netAmount =
    optionalMoney(
      row,
      config,
      "netAmount",
      issues,
    );

  const identity = {
    provider:
      "csv" as const,

    resourceType:
      "order" as const,

    externalId,

    externalParentId:
      null,

    adapterVersion:
      config.adapterVersion,
  };

  if (
    issues.length > 0 ||
    externalId === null ||
    orderedAt === null ||
    currency === null
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
      externalReference:
        mapped(
          row,
          config,
          "externalReference",
        ),

      status:
        normalizeCanonicalOrderStatus(
          mapped(
            row,
            config,
            "status",
          ),
        ),

      orderedAt,
      currency,

      grossAmount,
      discountAmount,
      netAmount,
    },
  );
}

export function normalizeCsvOrderItemRow(
  row: CsvRow,
  config: CsvAdapterConfig,
  rowNumber: number,
): ProviderNormalizationResult<CsvOrderItemCandidate> {
  requireAdapter(
    config,
    "order_item",
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
      "order item",
    );

  const externalParentId =
    requiredOrderParentId(
      row,
      config,
      issues,
    );

  const variantExternalId =
    requiredVariantId(
      row,
      config,
      issues,
    );

  const locationExternalId =
    optionalLocationId(
      row,
      config,
      issues,
    );

  const rawQuantity =
    mapped(
      row,
      config,
      "quantity",
    );

  let quantity:
    UnitQuantity | null =
      null;

  if (rawQuantity === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV order-item quantity is required.",
        "quantity",
      ),
    );
  } else {
    try {
      quantity =
        normalizeProviderUnitQuantity(
          rawQuantity,
        );
    } catch {
      issues.push(
        issue(
          "INVALID_QUANTITY",
          "CSV order-item quantity must be a non-negative whole-unit value.",
          "quantity",
        ),
      );
    }
  }

  const rawUnitPrice =
    mapped(
      row,
      config,
      "unitPriceAmount",
    );

  const rawDiscount =
    mapped(
      row,
      config,
      "discountAmount",
    );

  const rawUnitCost =
    mapped(
      row,
      config,
      "unitCostAmount",
    );

  const unitPriceAmount =
    optionalMoney(
      row,
      config,
      "unitPriceAmount",
      issues,
    );

  const discountAmount =
    optionalMoney(
      row,
      config,
      "discountAmount",
      issues,
    );

  const unitCostAmount =
    optionalMoney(
      row,
      config,
      "unitCostAmount",
      issues,
    );

  const currency =
    optionalCurrency(
      row,
      config,
      issues,
    );

  if (
    (
      rawUnitPrice !== null ||
      rawDiscount !== null ||
      rawUnitCost !== null
    ) &&
    currency === null
  ) {
    const alreadyInvalid =
      issues.some(
        (entry) =>
          entry.field ===
            "currency" &&
          entry.code ===
            "INVALID_CURRENCY",
      );

    if (!alreadyInvalid) {
      issues.push(
        issue(
          "INVALID_CURRENCY",
          "CSV order-item currency is required when item money is supplied.",
          "currency",
        ),
      );
    }
  }

  const identity = {
    provider:
      "csv" as const,

    resourceType:
      "order_item" as const,

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
    quantity === null
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
      orderExternalId:
        externalParentId,

      variantExternalId,

      locationExternalId,

      quantity,

      unitPriceAmount,
      discountAmount,
      unitCostAmount,

      currency,
    },
  );
}
