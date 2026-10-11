import type {
  CurrencyCode,
  DecimalString,
  ProductStatus,
  ProductVariantStatus,
} from "@/lib/commerce-domain/types";

import {
  normalizeExternalId,
  normalizeOptionalExternalId,
} from "@/lib/providers/external-identity";

import {
  normalizeProviderCurrencyCode,
  normalizeProviderMoneyInput,
} from "@/lib/providers/money";

import {
  acceptedProviderRecord,
  quarantinedProviderRecord,
} from "@/lib/providers/results";

import {
  resolveCsvExternalId,
} from "@/lib/providers/csv/identity";

import {
  readCsvMappedValue,
} from "@/lib/providers/csv/mapping";

import type {
  CsvAdapterConfig,
  CsvRow,
  ProviderNormalizationIssue,
  ProviderNormalizationResult,
} from "@/lib/providers/types";

export interface CsvProductCandidate {
  title: string;
  brand: string | null;
  category: string | null;
  status: ProductStatus;
}

export interface CsvProductVariantCandidate {
  sku: string;
  barcode: string | null;
  title: string | null;
  status: ProductVariantStatus;
  costAmount: DecimalString | null;
  sellingPriceAmount: DecimalString | null;
  currency: CurrencyCode | null;
}

const PRODUCT_STATUSES =
  new Set<ProductStatus>([
    "active",
    "draft",
    "archived",
  ]);

const PRODUCT_VARIANT_STATUSES =
  new Set<ProductVariantStatus>([
    "active",
    "inactive",
    "archived",
  ]);

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
    "product" |
    "product_variant",
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

function optionalMappedValue(
  row: CsvRow,
  config: CsvAdapterConfig,
  field:
    | "brand"
    | "category"
    | "barcode"
    | "title"
    | "costAmount"
    | "sellingPriceAmount"
    | "currency"
    | "externalParentId",
): string | null {
  return readCsvMappedValue(
    row,
    config,
    field,
  );
}

function normalizeProductStatus(
  raw: string | null,
  issues:
    ProviderNormalizationIssue[],
): ProductStatus | null {
  if (raw === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV product status is required.",
        "status",
      ),
    );

    return null;
  }

  const normalized =
    raw.trim().toLowerCase();

  if (
    PRODUCT_STATUSES.has(
      normalized as ProductStatus,
    )
  ) {
    return normalized as ProductStatus;
  }

  issues.push(
    issue(
      "UNSUPPORTED_STATUS",
      `CSV product status "${raw}" is not supported.`,
      "status",
    ),
  );

  return null;
}

function normalizeVariantStatus(
  raw: string | null,
  issues:
    ProviderNormalizationIssue[],
): ProductVariantStatus | null {
  if (raw === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV product-variant status is required.",
        "status",
      ),
    );

    return null;
  }

  const normalized =
    raw.trim().toLowerCase();

  if (
    PRODUCT_VARIANT_STATUSES.has(
      normalized as ProductVariantStatus,
    )
  ) {
    return normalized as ProductVariantStatus;
  }

  issues.push(
    issue(
      "UNSUPPORTED_STATUS",
      `CSV product-variant status "${raw}" is not supported.`,
      "status",
    ),
  );

  return null;
}

function normalizeOptionalMoney(
  raw: string | null,
  field:
    "costAmount" |
    "sellingPriceAmount",
  issues:
    ProviderNormalizationIssue[],
): DecimalString | null {
  if (raw === null) {
    return null;
  }

  try {
    const amount =
      normalizeProviderMoneyInput(
        raw,
      );

    if (
      amount.startsWith("-")
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

    return amount;
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

function normalizeOptionalCurrency(
  raw: string | null,
  issues:
    ProviderNormalizationIssue[],
): CurrencyCode | null {
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

function productIdentity(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const raw =
    readCsvMappedValue(
      row,
      config,
      "externalId",
    );

  if (raw === null) {
    issues.push(
      issue(
        "EXTERNAL_ID_MISSING",
        "CSV product requires a stable external identity.",
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
        "CSV product external identity is invalid.",
        "externalId",
      ),
    );

    return null;
  }
}

function variantIdentity(
  row: CsvRow,
  config: CsvAdapterConfig,
  rowNumber: number,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  try {
    return resolveCsvExternalId(
      row,
      config,
      rowNumber,
    );
  } catch {
    issues.push(
      issue(
        "EXTERNAL_ID_MISSING",
        "CSV product variant requires a stable external identity or stable SKU.",
        "externalId",
      ),
    );

    return null;
  }
}

function variantParentIdentity(
  row: CsvRow,
  config: CsvAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const raw =
    optionalMappedValue(
      row,
      config,
      "externalParentId",
    );

  if (raw === null) {
    issues.push(
      issue(
        "RELATIONSHIP_UNRESOLVED",
        "CSV product variant requires a stable parent product external identity.",
        "externalParentId",
      ),
    );

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
        "CSV product-variant parent external identity is invalid.",
        "externalParentId",
      ),
    );

    return null;
  }
}

export function normalizeCsvProductRow(
  row: CsvRow,
  config: CsvAdapterConfig,
): ProviderNormalizationResult<CsvProductCandidate> {
  requireAdapter(
    config,
    "product",
  );

  const issues:
    ProviderNormalizationIssue[] =
      [];

  const externalId =
    productIdentity(
      row,
      config,
      issues,
    );

  const title =
    readCsvMappedValue(
      row,
      config,
      "title",
    );

  if (title === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV product title is required.",
        "title",
      ),
    );
  }

  const status =
    normalizeProductStatus(
      readCsvMappedValue(
        row,
        config,
        "status",
      ),
      issues,
    );

  const identity = {
    provider:
      "csv" as const,
    resourceType:
      "product" as const,
    externalId,
    externalParentId:
      null,
    adapterVersion:
      config.adapterVersion,
  };

  if (
    issues.length > 0 ||
    externalId === null ||
    title === null ||
    status === null
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
      title,
      brand:
        optionalMappedValue(
          row,
          config,
          "brand",
        ),
      category:
        optionalMappedValue(
          row,
          config,
          "category",
        ),
      status,
    },
  );
}

export function normalizeCsvProductVariantRow(
  row: CsvRow,
  config: CsvAdapterConfig,
  rowNumber: number,
): ProviderNormalizationResult<CsvProductVariantCandidate> {
  requireAdapter(
    config,
    "product_variant",
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
    variantIdentity(
      row,
      config,
      rowNumber,
      issues,
    );

  const externalParentId =
    variantParentIdentity(
      row,
      config,
      issues,
    );

  const sku =
    readCsvMappedValue(
      row,
      config,
      "sku",
    );

  if (sku === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV product-variant SKU is required.",
        "sku",
      ),
    );
  }

  const status =
    normalizeVariantStatus(
      readCsvMappedValue(
        row,
        config,
        "status",
      ),
      issues,
    );

  const rawCost =
    optionalMappedValue(
      row,
      config,
      "costAmount",
    );

  const rawSellingPrice =
    optionalMappedValue(
      row,
      config,
      "sellingPriceAmount",
    );

  const rawCurrency =
    optionalMappedValue(
      row,
      config,
      "currency",
    );

  const costAmount =
    normalizeOptionalMoney(
      rawCost,
      "costAmount",
      issues,
    );

  const sellingPriceAmount =
    normalizeOptionalMoney(
      rawSellingPrice,
      "sellingPriceAmount",
      issues,
    );

  const currency =
    normalizeOptionalCurrency(
      rawCurrency,
      issues,
    );

  if (
    (
      rawCost !== null ||
      rawSellingPrice !== null
    ) &&
    rawCurrency === null
  ) {
    issues.push(
      issue(
        "INVALID_CURRENCY",
        "CSV currency is required when variant money is supplied.",
        "currency",
      ),
    );
  }

  const identity = {
    provider:
      "csv" as const,
    resourceType:
      "product_variant" as const,
    externalId,
    externalParentId,
    adapterVersion:
      config.adapterVersion,
  };

  if (
    issues.length > 0 ||
    externalId === null ||
    externalParentId === null ||
    sku === null ||
    status === null
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
      sku,
      barcode:
        optionalMappedValue(
          row,
          config,
          "barcode",
        ),
      title:
        optionalMappedValue(
          row,
          config,
          "title",
        ),
      status,
      costAmount,
      sellingPriceAmount,
      currency,
    },
  );
}
