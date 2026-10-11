import type {
  CurrencyCode,
  DecimalString,
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
  normalizeOptionalProviderUnitQuantity,
} from "@/lib/providers/quantities";

import {
  acceptedProviderRecord,
  quarantinedProviderRecord,
} from "@/lib/providers/results";

import {
  readCsvMappedValue,
} from "@/lib/providers/csv/mapping";

import type {
  CsvAdapterConfig,
  CsvCanonicalField,
  CsvRow,
  CsvSupplierProductAdapterConfig,
  ProviderNormalizationIssue,
  ProviderNormalizationResult,
} from "@/lib/providers/types";

export interface CsvSupplierCandidate {
  name: string;

  defaultLeadTimeDays:
    UnitQuantity | null;

  currency:
    CurrencyCode | null;

  email: string | null;
  phone: string | null;
}

export interface CsvSupplierProductCandidate {
  supplierExternalId: string;
  variantExternalId: string;

  supplierSku: string | null;

  unitCostAmount:
    DecimalString | null;

  currency:
    CurrencyCode | null;

  leadTimeDays:
    UnitQuantity | null;

  minimumOrderQuantity:
    UnitQuantity | null;

  packSize:
    UnitQuantity | null;

  preferred: boolean;
}

export interface CsvSupplierProductAccepted {
  disposition: "accepted";
  provider: "csv";
  relationshipType:
    "supplier_product";
  adapterVersion: string;

  supplierExternalId: string;
  variantExternalId: string;

  canonical:
    CsvSupplierProductCandidate;

  issues: readonly [];
}

export interface CsvSupplierProductQuarantined {
  disposition: "quarantined";
  provider: "csv";
  relationshipType:
    "supplier_product";
  adapterVersion: string;

  supplierExternalId:
    string | null;

  variantExternalId:
    string | null;

  canonical: null;

  issues:
    readonly ProviderNormalizationIssue[];
}

export type CsvSupplierProductResult =
  | CsvSupplierProductAccepted
  | CsvSupplierProductQuarantined;

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
  config:
    | CsvAdapterConfig
    | CsvSupplierProductAdapterConfig,
  field: CsvCanonicalField,
): string | null {
  return readCsvMappedValue(
    row,
    config,
    field,
  );
}

function requireSupplierConfig(
  config: CsvAdapterConfig,
): void {
  if (
    config.resourceType !==
    "supplier"
  ) {
    throw new Error(
      'CSV adapter resource type must be "supplier".',
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

function requireRelationshipConfig(
  config:
    CsvSupplierProductAdapterConfig,
): void {
  if (
    config.relationshipType !==
    "supplier_product"
  ) {
    throw new Error(
      'CSV supplier-product relationship type must be "supplier_product".',
    );
  }

  if (
    !config.adapterVersion.trim()
  ) {
    throw new Error(
      "CSV supplier-product adapter version must not be blank.",
    );
  }
}

function normalizeOptionalCurrency(
  row: CsvRow,
  config:
    | CsvAdapterConfig
    | CsvSupplierProductAdapterConfig,
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

function normalizeOptionalNonNegativeInteger(
  row: CsvRow,
  config:
    | CsvAdapterConfig
    | CsvSupplierProductAdapterConfig,
  field:
    | "defaultLeadTimeDays"
    | "leadTimeDays",
  issues:
    ProviderNormalizationIssue[],
): UnitQuantity | null {
  const raw =
    mapped(
      row,
      config,
      field,
    );

  try {
    return normalizeOptionalProviderUnitQuantity(
      raw,
    );
  } catch {
    issues.push(
      issue(
        "INVALID_QUANTITY",
        `CSV ${field} must be a non-negative whole-unit value.`,
        field,
      ),
    );

    return null;
  }
}

function normalizeOptionalPositiveInteger(
  row: CsvRow,
  config:
    CsvSupplierProductAdapterConfig,
  field:
    | "minimumOrderQuantity"
    | "packSize",
  issues:
    ProviderNormalizationIssue[],
): UnitQuantity | null {
  const raw =
    mapped(
      row,
      config,
      field,
    );

  let value:
    UnitQuantity | null;

  try {
    value =
      normalizeOptionalProviderUnitQuantity(
        raw,
      );
  } catch {
    issues.push(
      issue(
        "INVALID_QUANTITY",
        `CSV ${field} must be a positive whole-unit value.`,
        field,
      ),
    );

    return null;
  }

  if (value === 0) {
    issues.push(
      issue(
        "INVALID_QUANTITY",
        `CSV ${field} must be greater than zero when supplied.`,
        field,
      ),
    );

    return null;
  }

  return value;
}

function normalizeOptionalMoney(
  row: CsvRow,
  config:
    CsvSupplierProductAdapterConfig,
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

function normalizePreferred(
  row: CsvRow,
  config:
    CsvSupplierProductAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): boolean {
  const raw =
    mapped(
      row,
      config,
      "preferred",
    );

  if (raw === null) {
    return false;
  }

  const normalized =
    raw.trim().toLowerCase();

  if (
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "1"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "no" ||
    normalized === "0"
  ) {
    return false;
  }

  issues.push(
    issue(
      "REQUIRED_FIELD_MISSING",
      'CSV preferred must be one of true/false, yes/no, or 1/0 when supplied.',
      "preferred",
    ),
  );

  return false;
}

function supplierRelationshipIdentity(
  row: CsvRow,
  config:
    CsvSupplierProductAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const raw =
    mapped(
      row,
      config,
      "supplierExternalId",
    );

  if (raw === null) {
    issues.push(
      issue(
        "RELATIONSHIP_UNRESOLVED",
        "CSV supplier-product relationship requires supplier external identity.",
        "supplierExternalId",
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
        "CSV supplier external identity is invalid.",
        "supplierExternalId",
      ),
    );

    return null;
  }
}

function variantRelationshipIdentity(
  row: CsvRow,
  config:
    CsvSupplierProductAdapterConfig,
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
          "CSV supplier-product variant external identity is invalid.",
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
          "CSV supplier-product SKU identity is invalid.",
          "sku",
        ),
      );

      return null;
    }
  }

  issues.push(
    issue(
      "RELATIONSHIP_UNRESOLVED",
      "CSV supplier-product relationship requires a stable variant external identity or SKU.",
      "variantExternalId",
    ),
  );

  return null;
}

export function normalizeCsvSupplierRow(
  row: CsvRow,
  config: CsvAdapterConfig,
): ProviderNormalizationResult<CsvSupplierCandidate> {
  requireSupplierConfig(
    config,
  );

  const issues:
    ProviderNormalizationIssue[] =
      [];

  const rawExternalId =
    mapped(
      row,
      config,
      "externalId",
    );

  let externalId:
    string | null =
      null;

  if (rawExternalId === null) {
    issues.push(
      issue(
        "EXTERNAL_ID_MISSING",
        "CSV supplier requires a stable external identity.",
        "externalId",
      ),
    );
  } else {
    try {
      externalId =
        normalizeExternalId(
          rawExternalId,
        );
    } catch {
      issues.push(
        issue(
          "EXTERNAL_ID_INVALID",
          "CSV supplier external identity is invalid.",
          "externalId",
        ),
      );
    }
  }

  const name =
    mapped(
      row,
      config,
      "title",
    );

  if (name === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV supplier name is required.",
        "title",
      ),
    );
  }

  const defaultLeadTimeDays =
    normalizeOptionalNonNegativeInteger(
      row,
      config,
      "defaultLeadTimeDays",
      issues,
    );

  const currency =
    normalizeOptionalCurrency(
      row,
      config,
      issues,
    );

  const identity = {
    provider:
      "csv" as const,

    resourceType:
      "supplier" as const,

    externalId,

    externalParentId:
      null,

    adapterVersion:
      config.adapterVersion,
  };

  if (
    issues.length > 0 ||
    externalId === null ||
    name === null
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
      name,

      defaultLeadTimeDays,
      currency,

      email:
        mapped(
          row,
          config,
          "email",
        ),

      phone:
        mapped(
          row,
          config,
          "phone",
        ),
    },
  );
}

export function normalizeCsvSupplierProductRow(
  row: CsvRow,
  config:
    CsvSupplierProductAdapterConfig,
): CsvSupplierProductResult {
  requireRelationshipConfig(
    config,
  );

  const issues:
    ProviderNormalizationIssue[] =
      [];

  const supplierExternalId =
    supplierRelationshipIdentity(
      row,
      config,
      issues,
    );

  const variantExternalId =
    variantRelationshipIdentity(
      row,
      config,
      issues,
    );

  const unitCostAmount =
    normalizeOptionalMoney(
      row,
      config,
      issues,
    );

  const currency =
    normalizeOptionalCurrency(
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
          "CSV supplier-product currency is required when unit cost is supplied.",
          "currency",
        ),
      );
    }
  }

  const leadTimeDays =
    normalizeOptionalNonNegativeInteger(
      row,
      config,
      "leadTimeDays",
      issues,
    );

  const minimumOrderQuantity =
    normalizeOptionalPositiveInteger(
      row,
      config,
      "minimumOrderQuantity",
      issues,
    );

  const packSize =
    normalizeOptionalPositiveInteger(
      row,
      config,
      "packSize",
      issues,
    );

  const preferred =
    normalizePreferred(
      row,
      config,
      issues,
    );

  if (
    issues.length > 0 ||
    supplierExternalId === null ||
    variantExternalId === null
  ) {
    return {
      disposition:
        "quarantined",

      provider:
        "csv",

      relationshipType:
        "supplier_product",

      adapterVersion:
        config.adapterVersion,

      supplierExternalId,
      variantExternalId,

      canonical: null,

      issues,
    };
  }

  return {
    disposition:
      "accepted",

    provider:
      "csv",

    relationshipType:
      "supplier_product",

    adapterVersion:
      config.adapterVersion,

    supplierExternalId,
    variantExternalId,

    canonical: {
      supplierExternalId,
      variantExternalId,

      supplierSku:
        mapped(
          row,
          config,
          "supplierSku",
        ),

      unitCostAmount,
      currency,
      leadTimeDays,
      minimumOrderQuantity,
      packSize,
      preferred,
    },

    issues: [],
  };
}
