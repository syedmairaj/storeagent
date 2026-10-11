import type {
  ISODateTime,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import {
  buildCompositeExternalId,
  normalizeExternalId,
} from "@/lib/providers/external-identity";

import {
  normalizeOptionalProviderUnitQuantity,
} from "@/lib/providers/quantities";

import {
  normalizeProviderTimestamp,
} from "@/lib/providers/timestamps";

import {
  readCsvMappedValue,
} from "@/lib/providers/csv/mapping";

import type {
  CsvInventoryAdapterConfig,
  CsvRow,
  ProviderNormalizationIssue,
} from "@/lib/providers/types";

export interface CsvInventoryObservationCandidate {
  variantExternalId: string;
  locationExternalId: string;

  observedAt: ISODateTime;

  onHandQuantity:
    UnitQuantity | null;

  availableQuantity:
    UnitQuantity | null;

  committedQuantity:
    UnitQuantity | null;

  incomingQuantity:
    UnitQuantity | null;
}

export interface CsvInventoryObservationAccepted {
  disposition: "accepted";

  provider: "csv";
  observationType:
    "inventory_snapshot";

  adapterVersion: string;

  variantExternalId: string;
  locationExternalId: string;

  canonical:
    CsvInventoryObservationCandidate;

  issues: readonly [];
}

export interface CsvInventoryObservationQuarantined {
  disposition: "quarantined";

  provider: "csv";
  observationType:
    "inventory_snapshot";

  adapterVersion: string;

  variantExternalId:
    string | null;

  locationExternalId:
    string | null;

  canonical: null;

  issues:
    readonly ProviderNormalizationIssue[];
}

export type CsvInventoryObservationResult =
  | CsvInventoryObservationAccepted
  | CsvInventoryObservationQuarantined;

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

function validateConfig(
  config:
    CsvInventoryAdapterConfig,
): void {
  if (
    config.observationType !==
    "inventory_snapshot"
  ) {
    throw new Error(
      'CSV inventory observation type must be "inventory_snapshot".',
    );
  }

  if (
    !config.adapterVersion.trim()
  ) {
    throw new Error(
      "CSV inventory adapter version must not be blank.",
    );
  }
}

function normalizeVariantReference(
  row: CsvRow,
  config:
    CsvInventoryAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const explicit =
    readCsvMappedValue(
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
          "CSV inventory variant external identity is invalid.",
          "variantExternalId",
        ),
      );

      return null;
    }
  }

  const sku =
    readCsvMappedValue(
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
          "CSV inventory variant SKU identity is invalid.",
          "sku",
        ),
      );

      return null;
    }
  }

  issues.push(
    issue(
      "RELATIONSHIP_UNRESOLVED",
      "CSV inventory requires a stable variant external identity or SKU.",
      "variantExternalId",
    ),
  );

  return null;
}

function normalizeLocationReference(
  row: CsvRow,
  config:
    CsvInventoryAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): string | null {
  const raw =
    readCsvMappedValue(
      row,
      config,
      "locationExternalId",
    );

  if (raw === null) {
    issues.push(
      issue(
        "RELATIONSHIP_UNRESOLVED",
        "CSV inventory requires a stable location external identity.",
        "locationExternalId",
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
        "CSV inventory location external identity is invalid.",
        "locationExternalId",
      ),
    );

    return null;
  }
}

function normalizeObservedAt(
  row: CsvRow,
  config:
    CsvInventoryAdapterConfig,
  issues:
    ProviderNormalizationIssue[],
): ISODateTime | null {
  const raw =
    readCsvMappedValue(
      row,
      config,
      "observedAt",
    );

  if (raw === null) {
    issues.push(
      issue(
        "REQUIRED_FIELD_MISSING",
        "CSV inventory observed timestamp is required.",
        "observedAt",
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
        "CSV inventory observed timestamp must be a valid date-time with an explicit timezone.",
        "observedAt",
      ),
    );

    return null;
  }
}

function normalizeQuantity(
  row: CsvRow,
  config:
    CsvInventoryAdapterConfig,
  field:
    | "onHandQuantity"
    | "availableQuantity"
    | "committedQuantity"
    | "incomingQuantity",
  issues:
    ProviderNormalizationIssue[],
): UnitQuantity | null {
  const raw =
    readCsvMappedValue(
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

export function normalizeCsvInventoryObservation(
  row: CsvRow,
  config:
    CsvInventoryAdapterConfig,
  rowNumber: number,
): CsvInventoryObservationResult {
  validateConfig(config);

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

  const variantExternalId =
    normalizeVariantReference(
      row,
      config,
      issues,
    );

  const locationExternalId =
    normalizeLocationReference(
      row,
      config,
      issues,
    );

  const observedAt =
    normalizeObservedAt(
      row,
      config,
      issues,
    );

  const onHandQuantity =
    normalizeQuantity(
      row,
      config,
      "onHandQuantity",
      issues,
    );

  const availableQuantity =
    normalizeQuantity(
      row,
      config,
      "availableQuantity",
      issues,
    );

  const committedQuantity =
    normalizeQuantity(
      row,
      config,
      "committedQuantity",
      issues,
    );

  const incomingQuantity =
    normalizeQuantity(
      row,
      config,
      "incomingQuantity",
      issues,
    );

  const allQuantitiesUnknown =
    onHandQuantity === null &&
    availableQuantity === null &&
    committedQuantity === null &&
    incomingQuantity === null;

  const quantityIssueAlreadyPresent =
    issues.some(
      (entry) =>
        entry.code ===
        "INVALID_QUANTITY",
    );

  if (
    allQuantitiesUnknown &&
    !quantityIssueAlreadyPresent
  ) {
    issues.push(
      issue(
        "AMBIGUOUS_INVENTORY_SEMANTICS",
        "CSV inventory observation must contain at least one known inventory quantity.",
        "inventory",
      ),
    );
  }

  if (
    issues.length > 0 ||
    variantExternalId === null ||
    locationExternalId === null ||
    observedAt === null
  ) {
    return {
      disposition:
        "quarantined",

      provider: "csv",

      observationType:
        "inventory_snapshot",

      adapterVersion:
        config.adapterVersion,

      variantExternalId,
      locationExternalId,

      canonical: null,

      issues,
    };
  }

  return {
    disposition:
      "accepted",

    provider: "csv",

    observationType:
      "inventory_snapshot",

    adapterVersion:
      config.adapterVersion,

    variantExternalId,
    locationExternalId,

    canonical: {
      variantExternalId,
      locationExternalId,
      observedAt,

      onHandQuantity,
      availableQuantity,
      committedQuantity,
      incomingQuantity,
    },

    issues: [],
  };
}
