import {
  DATA_QUALITY_IDENTITY_VERSION,
  DATA_QUALITY_PROVIDER_RESOURCE_TYPES,
  DATA_QUALITY_PROVIDER_TYPES,
  DATA_QUALITY_SUBJECT_KINDS,
} from "@/lib/data-quality/types";

import type {
  DataQualityIssueIdentityInput,
  DataQualityIssueIdentityTuple,
  DataQualitySubjectKind,
} from "@/lib/data-quality/types";

const INVALID_SCOPE =
  "Data quality issue identity scope is invalid.";

export function buildDataQualityIssueIdentity(
  input: DataQualityIssueIdentityInput,
): DataQualityIssueIdentityTuple {
  const record = asRecord(
    input,
    "Data quality issue identity",
  );

  assertExactKeys(
    record,
    ["issueCode", "subject"],
  );

  const issueCode = requiredText(
    record.issueCode,
    "Issue code",
  );

  const subject = asRecord(
    record.subject,
    "Data quality issue subject",
  );

  const kind = subjectKind(subject);

  switch (kind) {
    case "organization":
      assertExactKeys(subject, ["kind"]);
      return [
        DATA_QUALITY_IDENTITY_VERSION,
        issueCode,
        kind,
      ];

    case "store":
      assertExactKeys(
        subject,
        ["kind", "storeId"],
      );
      return [
        DATA_QUALITY_IDENTITY_VERSION,
        issueCode,
        kind,
        requiredText(
          subject.storeId,
          "Store ID",
        ),
      ];

    case "location":
      assertExactKeys(
        subject,
        ["kind", "locationId"],
      );
      return [
        DATA_QUALITY_IDENTITY_VERSION,
        issueCode,
        kind,
        requiredText(
          subject.locationId,
          "Location ID",
        ),
      ];

    case "variant":
      assertExactKeys(
        subject,
        ["kind", "variantId"],
      );
      return [
        DATA_QUALITY_IDENTITY_VERSION,
        issueCode,
        kind,
        requiredText(
          subject.variantId,
          "Variant ID",
        ),
      ];

    case "location_variant":
      assertExactKeys(
        subject,
        [
          "kind",
          "locationId",
          "variantId",
        ],
      );
      return [
        DATA_QUALITY_IDENTITY_VERSION,
        issueCode,
        kind,
        requiredText(
          subject.locationId,
          "Location ID",
        ),
        requiredText(
          subject.variantId,
          "Variant ID",
        ),
      ];

    case "provider":
      assertExactKeys(
        subject,
        [
          "kind",
          "integrationId",
          "provider",
          "resourceType",
          "externalId",
        ],
      );
      return providerIdentity(
        issueCode,
        subject,
      );
  }
}

export function buildDataQualityIssueKey(
  input: DataQualityIssueIdentityInput,
): string {
  return JSON.stringify(
    buildDataQualityIssueIdentity(input),
  );
}

function providerIdentity(
  issueCode: string,
  subject: Record<string, unknown>,
): DataQualityIssueIdentityTuple {
  return [
    DATA_QUALITY_IDENTITY_VERSION,
    issueCode,
    "provider",
    requiredText(
      subject.integrationId,
      "Integration ID",
    ),
    exactToken(
      subject.provider,
      DATA_QUALITY_PROVIDER_TYPES,
      "Provider type",
    ),
    exactToken(
      subject.resourceType,
      DATA_QUALITY_PROVIDER_RESOURCE_TYPES,
      "Provider resource type",
    ),
    requiredText(
      subject.externalId,
      "Provider external ID",
    ),
  ];
}

function subjectKind(
  subject: Record<string, unknown>,
): DataQualitySubjectKind {
  const kind = subject.kind;

  if (
    typeof kind !== "string" ||
    !isSubjectKind(kind)
  ) {
    throw new Error(INVALID_SCOPE);
  }

  return kind;
}

function isSubjectKind(
  value: string,
): value is DataQualitySubjectKind {
  return includes(
    DATA_QUALITY_SUBJECT_KINDS,
    value,
  );
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
    throw new Error(INVALID_SCOPE);
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

function exactToken(
  value: unknown,
  allowed: readonly string[],
  label: string,
): string {
  if (
    typeof value !== "string" ||
    !includes(allowed, value)
  ) {
    throw new Error(
      `${label} is not a stable provider identity.`,
    );
  }

  return value;
}

function includes(
  allowed: readonly string[],
  value: string,
): boolean {
  return allowed.includes(value);
}
