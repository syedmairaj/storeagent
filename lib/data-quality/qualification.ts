import {
  buildDataQualityIssueIdentity,
} from "@/lib/data-quality/identity";

import {
  DATA_QUALITY_PROVIDER_RESOURCE_TYPES,
  DATA_QUALITY_PROVIDER_TYPES,
} from "@/lib/data-quality/types";

import { quarantineMayRequireDurableDataQualityIssue } from "@/lib/providers/reconciliation";

import type {
  DataQualitySeverity,
  JsonValue,
  ProviderResourceType,
  ProviderType,
} from "@/lib/commerce-domain/types";

import type { DataQualityIssueSubject } from "@/lib/data-quality/types";

import type {
  ProviderNormalizationIssueCode,
  ProviderReconciliationContext,
  ProviderReconciliationReasonCode,
} from "@/lib/providers/types";

export type DataQualityNegativeInventoryQuantityField =
  | "on_hand"
  | "available"
  | "committed"
  | "incoming";

export type DataQualityObservation =
  | {
      readonly kind: "provider_reconciliation";
      readonly integrationId: string;
      readonly reconciliation: ProviderReconciliationContext;
    }
  | {
      readonly kind: "negative_inventory";
      readonly locationId: string;
      readonly variantId: string;
      readonly quantityField: DataQualityNegativeInventoryQuantityField;
      readonly quantity: number;
    };

export type DataQualityQualificationResult =
  | {
      readonly disposition: "durable_issue";
      readonly issueCode: string;
      readonly severity: DataQualitySeverity;
      readonly subject: DataQualityIssueSubject;
      readonly message: string;
      readonly remediationHint: string | null;
      readonly sourceContext: JsonValue | null;
    }
  | {
      readonly disposition: "transient_only";
      readonly reasonCode: string;
    };

/**
 * M4.4 severity policy.
 *
 * Domain and provider docs name these conditions but do not
 * assign DataQualitySeverity. This table is the minimum
 * deterministic mapping used by qualification:
 *
 * - BINDING_CONFLICT is critical because it would attach one
 *   provider identity to the wrong canonical entity.
 * - IDENTITY_AMBIGUOUS, RELATIONSHIP_UNRESOLVED,
 *   AMBIGUOUS_INVENTORY_SEMANTICS, and NEGATIVE_INVENTORY are
 *   high because they block safe canonical truth without
 *   being a binding overwrite.
 *
 * AI does not choose severity.
 */
export const M4_4_DATA_QUALITY_SEVERITY_POLICY = {
  BINDING_CONFLICT: "critical",
  IDENTITY_AMBIGUOUS: "high",
  RELATIONSHIP_UNRESOLVED: "high",
  AMBIGUOUS_INVENTORY_SEMANTICS: "high",
  NEGATIVE_INVENTORY: "high",
} as const satisfies Record<
  string,
  DataQualitySeverity
>;

const PROVIDER_REASON_CODES = [
  "NORMALIZATION_QUARANTINED",
  "DUPLICATE_CONFLICT",
  "HISTORY_CONFLICT",
  "BINDING_CONFLICT",
  "IDENTITY_AMBIGUOUS",
  "RELATIONSHIP_UNRESOLVED",
  "PROVIDER_INCONSISTENCY",
] as const satisfies readonly ProviderReconciliationReasonCode[];

type MissingReasonCode = Exclude<
  ProviderReconciliationReasonCode,
  (typeof PROVIDER_REASON_CODES)[number]
>;

export type ProviderReconciliationReasonsCovered =
  MissingReasonCode extends never ? true : never;

export const providerReconciliationReasonsCovered: ProviderReconciliationReasonsCovered =
  true;

const NORMALIZATION_ISSUE_CODES = [
  "EXTERNAL_ID_MISSING",
  "EXTERNAL_ID_INVALID",
  "REQUIRED_FIELD_MISSING",
  "INVALID_TIMESTAMP",
  "AMBIGUOUS_TIMESTAMP",
  "INVALID_QUANTITY",
  "INVALID_MONEY",
  "INVALID_CURRENCY",
  "UNSUPPORTED_CURRENCY",
  "UNSUPPORTED_STATUS",
  "AMBIGUOUS_INVENTORY_SEMANTICS",
  "RELATIONSHIP_UNRESOLVED",
  "UNSUPPORTED_RESOURCE",
] as const satisfies readonly ProviderNormalizationIssueCode[];

type MissingNormalizationIssueCode = Exclude<
  ProviderNormalizationIssueCode,
  (typeof NORMALIZATION_ISSUE_CODES)[number]
>;

export type NormalizationIssueCodesCovered =
  MissingNormalizationIssueCode extends never
    ? true
    : never;

export const normalizationIssueCodesCovered: NormalizationIssueCodesCovered =
  true;

const DURABLE_REASON_PRECEDENCE = [
  "BINDING_CONFLICT",
  "IDENTITY_AMBIGUOUS",
  "RELATIONSHIP_UNRESOLVED",
] as const;

const NEGATIVE_INVENTORY_FIELDS = [
  "on_hand",
  "available",
  "committed",
  "incoming",
] as const satisfies readonly DataQualityNegativeInventoryQuantityField[];

const PROVIDER_SOURCE_CONTEXT_KEYS = [
  "provenance",
  "adapterVersion",
  "reasonCode",
  "issueCodes",
  "externalParentId",
] as const;

export function qualifyDataQualityObservation(
  observation: DataQualityObservation,
): DataQualityQualificationResult {
  switch (observation.kind) {
    case "provider_reconciliation":
      return qualifyProviderReconciliation(
        observation,
      );

    case "negative_inventory":
      return qualifyNegativeInventory(
        observation,
      );

    default:
      throw new Error(
        "Data quality observation is not supported.",
      );
  }
}

function qualifyProviderReconciliation(
  observation: Extract<
    DataQualityObservation,
    { kind: "provider_reconciliation" }
  >,
): DataQualityQualificationResult {
  const reconciliation =
    reconciliationContext(
      observation.reconciliation,
    );

  const issueCode =
    durableProviderIssueCode(
      reconciliation,
    );

  if (issueCode === null) {
    return {
      disposition: "transient_only",
      reasonCode: reconciliation.reasonCode,
    };
  }

  if (reconciliation.externalId === null) {
    throw new Error(
      "Provider external ID must not be blank.",
    );
  }

  const subject: DataQualityIssueSubject = {
    kind: "provider",
    integrationId: observation.integrationId,
    provider: reconciliation.provider,
    resourceType: reconciliation.resourceType,
    externalId: reconciliation.externalId,
  };

  const identity =
    buildDataQualityIssueIdentity({
      issueCode,
      subject,
    });

  const copy =
    providerIssueCopy(issueCode);

  return {
    disposition: "durable_issue",
    issueCode,
    severity:
      M4_4_DATA_QUALITY_SEVERITY_POLICY[
        issueCode
      ],
    subject: {
      kind: "provider",
      integrationId: tupleText(
        identity,
        3,
        "Integration ID",
      ),
      provider: reconciliation.provider,
      resourceType:
        reconciliation.resourceType,
      externalId: tupleText(
        identity,
        6,
        "Provider external ID",
      ),
    },
    message: copy.message,
    remediationHint: copy.remediationHint,
    sourceContext:
      providerSourceContext(
        reconciliation,
      ),
  };
}

function qualifyNegativeInventory(
  observation: Extract<
    DataQualityObservation,
    { kind: "negative_inventory" }
  >,
): DataQualityQualificationResult {
  const quantityField =
    negativeInventoryField(
      observation.quantityField,
    );

  if (
    typeof observation.quantity !==
      "number" ||
    !Number.isSafeInteger(
      observation.quantity,
    ) ||
    observation.quantity >= 0
  ) {
    throw new Error(
      "Negative inventory observation requires a negative whole-unit quantity.",
    );
  }

  const issueCode = "NEGATIVE_INVENTORY";

  const subject: DataQualityIssueSubject = {
    kind: "location_variant",
    locationId: observation.locationId,
    variantId: observation.variantId,
  };

  const identity =
    buildDataQualityIssueIdentity({
      issueCode,
      subject,
    });

  return {
    disposition: "durable_issue",
    issueCode,
    severity:
      M4_4_DATA_QUALITY_SEVERITY_POLICY.NEGATIVE_INVENTORY,
    subject: {
      kind: "location_variant",
      locationId: tupleText(
        identity,
        3,
        "Location ID",
      ),
      variantId: tupleText(
        identity,
        4,
        "Variant ID",
      ),
    },
    message:
      "Observed inventory quantity is negative.",
    remediationHint:
      "Correct the observed inventory quantity before using it for recommendations.",
    sourceContext: {
      provenance:
        "negative_inventory_observation",
      quantityField,
      // Evidence of the defect only. This does not
      // replace the canonical inventory balance.
      observedQuantity:
        observation.quantity,
    },
  };
}

function durableProviderIssueCode(
  reconciliation: ProviderReconciliationContext,
):
  | "BINDING_CONFLICT"
  | "IDENTITY_AMBIGUOUS"
  | "RELATIONSHIP_UNRESOLVED"
  | "AMBIGUOUS_INVENTORY_SEMANTICS"
  | null {
  if (
    !quarantineMayRequireDurableDataQualityIssue(
      reconciliation,
    )
  ) {
    return null;
  }

  for (const reasonCode of DURABLE_REASON_PRECEDENCE) {
    if (
      reconciliation.reasonCode ===
      reasonCode
    ) {
      return reasonCode;
    }
  }

  if (
    reconciliation.issues.some(
      (issue) =>
        issue.code ===
        "RELATIONSHIP_UNRESOLVED",
    )
  ) {
    return "RELATIONSHIP_UNRESOLVED";
  }

  if (
    reconciliation.issues.some(
      (issue) =>
        issue.code ===
        "AMBIGUOUS_INVENTORY_SEMANTICS",
    )
  ) {
    return "AMBIGUOUS_INVENTORY_SEMANTICS";
  }

  throw new Error(
    "Provider reconciliation mapping is ambiguous.",
  );
}

function reconciliationContext(
  value: ProviderReconciliationContext,
): ProviderReconciliationContext {
  const record = asRecord(
    value,
    "Provider reconciliation",
  );

  assertExactKeys(
    record,
    [
      "provider",
      "resourceType",
      "externalId",
      "externalParentId",
      "adapterVersion",
      "reasonCode",
      "issues",
    ],
  );

  return {
    provider: exactToken(
      record.provider,
      DATA_QUALITY_PROVIDER_TYPES,
      "Provider type",
    ) as ProviderType,
    resourceType: exactToken(
      record.resourceType,
      DATA_QUALITY_PROVIDER_RESOURCE_TYPES,
      "Provider resource type",
    ) as ProviderResourceType,
    externalId: nullableIdentityText(
      record.externalId,
      "Provider external ID",
    ),
    externalParentId:
      nullableIdentityText(
        record.externalParentId,
        "Provider external parent ID",
      ),
    adapterVersion: requiredText(
      record.adapterVersion,
      "Adapter version",
    ),
    reasonCode: exactToken(
      record.reasonCode,
      PROVIDER_REASON_CODES,
      "Provider reconciliation reason",
    ) as ProviderReconciliationReasonCode,
    issues: normalizationIssues(
      record.issues,
    ),
  };
}

function normalizationIssues(
  value: unknown,
): ProviderReconciliationContext["issues"] {
  if (!Array.isArray(value)) {
    throw new Error(
      "Provider reconciliation issues must be an array.",
    );
  }

  return value.map((issue) => {
    const record = asRecord(
      issue,
      "Provider normalization issue",
    );

    assertExactKeys(
      record,
      ["code", "message", "field"],
    );

    return {
      code: exactToken(
        record.code,
        NORMALIZATION_ISSUE_CODES,
        "Provider normalization issue code",
      ) as ProviderNormalizationIssueCode,
      message: requiredText(
        record.message,
        "Provider normalization issue message",
      ),
      field: nullableIdentityText(
        record.field,
        "Provider normalization issue field",
      ),
    };
  });
}

function providerSourceContext(
  reconciliation: ProviderReconciliationContext,
): JsonValue {
  const issueCodes: string[] = [];

  for (const issue of reconciliation.issues) {
    if (!issueCodes.includes(issue.code)) {
      issueCodes.push(issue.code);
    }
  }

  const sourceContext: Record<
    string,
    JsonValue
  > = {
    provenance: "provider_reconciliation",
    adapterVersion:
      reconciliation.adapterVersion,
    reasonCode: reconciliation.reasonCode,
    issueCodes,
    externalParentId:
      reconciliation.externalParentId,
  };

  assertExactKeys(
    sourceContext,
    PROVIDER_SOURCE_CONTEXT_KEYS,
  );

  return sourceContext;
}

function providerIssueCopy(
  issueCode:
    | "BINDING_CONFLICT"
    | "IDENTITY_AMBIGUOUS"
    | "RELATIONSHIP_UNRESOLVED"
    | "AMBIGUOUS_INVENTORY_SEMANTICS",
): {
  message: string;
  remediationHint: string;
} {
  switch (issueCode) {
    case "BINDING_CONFLICT":
      return {
        message:
          "Provider binding conflicts with an existing canonical mapping.",
        remediationHint:
          "Reconcile the provider binding before accepting this record.",
      };

    case "IDENTITY_AMBIGUOUS":
      return {
        message:
          "Provider identity is ambiguous and cannot be bound safely.",
        remediationHint:
          "Provide a single stable provider identity for this record.",
      };

    case "RELATIONSHIP_UNRESOLVED":
      return {
        message:
          "Provider record relationship could not be resolved to canonical data.",
        remediationHint:
          "Resolve the missing canonical relationship and retry synchronization.",
      };

    case "AMBIGUOUS_INVENTORY_SEMANTICS":
      return {
        message:
          "Provider inventory semantics are ambiguous.",
        remediationHint:
          "Map each inventory column to one canonical quantity.",
      };
  }
}

function negativeInventoryField(
  value: unknown,
): DataQualityNegativeInventoryQuantityField {
  return exactToken(
    value,
    NEGATIVE_INVENTORY_FIELDS,
    "Negative inventory quantity field",
  ) as DataQualityNegativeInventoryQuantityField;
}

function asRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be an object.`,
    );
  }

  return value as Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const actual = Object.keys(record).sort();
  const expected = [...allowed].sort();

  if (
    actual.length !== expected.length ||
    actual.some(
      (key, index) =>
        key !== expected[index],
    )
  ) {
    throw new Error(
      "Data quality observation scope is invalid.",
    );
  }
}

function requiredText(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${label} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(
      `${label} must not be blank.`,
    );
  }

  return normalized;
}

function nullableIdentityText(
  value: unknown,
  label: string,
): string | null {
  if (value === null) {
    return null;
  }

  return requiredText(value, label);
}

function exactToken(
  value: unknown,
  allowed: readonly string[],
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !allowed.includes(value)
  ) {
    throw new Error(
      `${label} is not a stable data-quality vocabulary value.`,
    );
  }

  return value;
}

function tupleText(
  identity: readonly string[],
  index: number,
  label: string,
): string {
  const value = identity[index];

  if (
    typeof value !== "string" ||
    value.length === 0
  ) {
    throw new Error(
      `${label} must not be blank.`,
    );
  }

  return value;
}
