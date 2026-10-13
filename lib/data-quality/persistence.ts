import "server-only";

import { buildDataQualityIssueKey } from "@/lib/data-quality/identity";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { DataQualitySeverity } from "@/lib/commerce-domain/types";

import type { DataQualityIssueSubject } from "@/lib/data-quality/types";

import type { DataQualityQualificationResult } from "@/lib/data-quality/qualification";

/**
 * M4.5 open-issue severity policy.
 *
 * Repeated detection may raise severity and must not downgrade it.
 * critical > high > medium > low > info.
 */
export const M4_5_SEVERITY_ORDER = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const satisfies readonly DataQualitySeverity[];

export const DATA_QUALITY_IGNORED_HISTORY_SQLSTATE = "SA003";

export const DATA_QUALITY_SUPERSEDED_HISTORY_SQLSTATE = "SA004";

export class DataQualityIgnoredHistoryError extends Error {
  readonly sqlState = DATA_QUALITY_IGNORED_HISTORY_SQLSTATE;

  constructor() {
    super(
      "data quality issue ignored history blocks a new open issue",
    );

    this.name = "DataQualityIgnoredHistoryError";
  }
}

export class DataQualitySupersededHistoryError extends Error {
  readonly sqlState = DATA_QUALITY_SUPERSEDED_HISTORY_SQLSTATE;

  constructor() {
    super(
      "data quality issue superseded history blocks a new open issue",
    );

    this.name = "DataQualitySupersededHistoryError";
  }
}

export type DataQualityDurableIssueCandidate = Extract<
  DataQualityQualificationResult,
  { disposition: "durable_issue" }
>;

export type PersistDataQualityIssueInput = {
  readonly organizationId: string;
  readonly storeId: string | null;
  readonly locationId: string | null;
  readonly variantId: string | null;
  readonly candidate: DataQualityDurableIssueCandidate;
  readonly detectedAt: string;
};

export type DataQualityPersistenceResult = {
  readonly disposition: "created" | "reconciled";
  readonly issueId: string;
  readonly issueKey: string;
  readonly occurrenceCount: number;
  readonly severity: DataQualitySeverity;
  readonly detectedAt: string;
  readonly lastDetectedAt: string;
};

type PersistenceClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export function reconcileOpenIssueSeverity(
  existing: DataQualitySeverity,
  incoming: DataQualitySeverity,
): DataQualitySeverity {
  const existingRank = severityRank(existing);
  const incomingRank = severityRank(incoming);

  return incomingRank > existingRank
    ? incoming
    : existing;
}

export function assertDataQualityCanonicalScope(
  input: PersistDataQualityIssueInput,
): void {
  const storeId = nullableUuid(
    input.storeId,
    "Store ID",
  );
  const locationId = nullableUuid(
    input.locationId,
    "Location ID",
  );
  const variantId = nullableUuid(
    input.variantId,
    "Variant ID",
  );

  if (locationId !== null && storeId === null) {
    throw new Error(
      "data quality issue canonical scope is invalid",
    );
  }

  if (variantId !== null && storeId === null) {
    throw new Error(
      "data quality issue canonical scope is invalid",
    );
  }

  const subject = input.candidate.subject;

  switch (subject.kind) {
    case "organization":
    case "provider":
      if (
        storeId !== null ||
        locationId !== null ||
        variantId !== null
      ) {
        throw new Error(
          "data quality issue canonical scope is invalid",
        );
      }
      return;

    case "store":
      if (
        storeId === null ||
        !sameUuid(storeId, subject.storeId) ||
        locationId !== null ||
        variantId !== null
      ) {
        throw new Error(
          "data quality issue canonical scope is invalid",
        );
      }
      return;

    case "location":
      if (
        storeId === null ||
        locationId === null ||
        !sameUuid(locationId, subject.locationId) ||
        variantId !== null
      ) {
        throw new Error(
          "data quality issue canonical scope is invalid",
        );
      }
      return;

    case "variant":
      if (
        storeId === null ||
        variantId === null ||
        !sameUuid(variantId, subject.variantId) ||
        locationId !== null
      ) {
        throw new Error(
          "data quality issue canonical scope is invalid",
        );
      }
      return;

    case "location_variant":
      if (
        storeId === null ||
        locationId === null ||
        variantId === null ||
        !sameUuid(locationId, subject.locationId) ||
        !sameUuid(variantId, subject.variantId)
      ) {
        throw new Error(
          "data quality issue canonical scope is invalid",
        );
      }
      return;
  }
}

export async function persistDataQualityIssue(
  input: PersistDataQualityIssueInput,
  client: PersistenceClient = createSupabaseAdminClient(),
): Promise<DataQualityPersistenceResult> {
  assertDataQualityCanonicalScope(input);

  const detectedAt = requiredTimestamp(input.detectedAt);
  const organizationId = requiredUuid(
    input.organizationId,
    "Organization ID",
  );
  const issueKey = buildDataQualityIssueKey({
    issueCode: input.candidate.issueCode,
    subject: input.candidate.subject,
  });
  const subject = subjectArguments(input.candidate.subject);

  const { data, error } = await client.rpc(
    "persist_data_quality_issue",
    {
      p_organization_id: organizationId,
      p_store_id: nullableUuid(input.storeId, "Store ID"),
      p_location_id: nullableUuid(
        input.locationId,
        "Location ID",
      ),
      p_variant_id: nullableUuid(
        input.variantId,
        "Variant ID",
      ),
      p_issue_code: input.candidate.issueCode,
      p_issue_key: issueKey,
      p_severity: input.candidate.severity,
      p_message: input.candidate.message,
      p_remediation_hint: input.candidate.remediationHint,
      p_source_context: input.candidate.sourceContext,
      p_detected_at: detectedAt,
      p_subject_kind: subject.kind,
      p_subject_store_id: subject.storeId,
      p_subject_location_id: subject.locationId,
      p_subject_variant_id: subject.variantId,
      p_integration_id: subject.integrationId,
      p_provider: subject.provider,
      p_resource_type: subject.resourceType,
      p_external_id: subject.externalId,
    },
  );

  if (error !== null) {
    if (error.code === DATA_QUALITY_IGNORED_HISTORY_SQLSTATE) {
      throw new DataQualityIgnoredHistoryError();
    }

    if (error.code === DATA_QUALITY_SUPERSEDED_HISTORY_SQLSTATE) {
      throw new DataQualitySupersededHistoryError();
    }

    throw new Error(
      `data quality issue persistence failed: ${error.message}`,
    );
  }

  return persistenceResult(data, issueKey);
}

function persistenceResult(
  data: unknown,
  issueKey: string,
): DataQualityPersistenceResult {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      "data quality issue persistence must return exactly one row",
    );
  }

  const row = data[0] as Record<string, unknown>;
  const disposition = row.disposition;
  const severity = row.severity;

  if (
    disposition !== "created" &&
    disposition !== "reconciled"
  ) {
    throw new Error(
      "data quality issue persistence returned an invalid disposition",
    );
  }

  if (!isSeverity(severity)) {
    throw new Error(
      "data quality issue persistence returned an invalid severity",
    );
  }

  if (
    typeof row.issue_id !== "string" ||
    typeof row.issue_key !== "string" ||
    row.issue_key !== issueKey ||
    typeof row.occurrence_count !== "number" ||
    typeof row.detected_at !== "string" ||
    typeof row.last_detected_at !== "string"
  ) {
    throw new Error(
      "data quality issue persistence returned an invalid row",
    );
  }

  return {
    disposition,
    issueId: row.issue_id,
    issueKey: row.issue_key,
    occurrenceCount: row.occurrence_count,
    severity,
    detectedAt: row.detected_at,
    lastDetectedAt: row.last_detected_at,
  };
}

function subjectArguments(
  subject: DataQualityIssueSubject,
): {
  kind: DataQualityIssueSubject["kind"];
  storeId: string | null;
  locationId: string | null;
  variantId: string | null;
  integrationId: string | null;
  provider: string | null;
  resourceType: string | null;
  externalId: string | null;
} {
  switch (subject.kind) {
    case "organization":
      return emptySubject("organization");
    case "store":
      return {
        ...emptySubject("store"),
        storeId: subject.storeId,
      };
    case "location":
      return {
        ...emptySubject("location"),
        locationId: subject.locationId,
      };
    case "variant":
      return {
        ...emptySubject("variant"),
        variantId: subject.variantId,
      };
    case "location_variant":
      return {
        ...emptySubject("location_variant"),
        locationId: subject.locationId,
        variantId: subject.variantId,
      };
    case "provider":
      return {
        ...emptySubject("provider"),
        integrationId: subject.integrationId,
        provider: subject.provider,
        resourceType: subject.resourceType,
        externalId: subject.externalId,
      };
  }
}

function emptySubject(
  kind: DataQualityIssueSubject["kind"],
) {
  return {
    kind,
    storeId: null,
    locationId: null,
    variantId: null,
    integrationId: null,
    provider: null,
    resourceType: null,
    externalId: null,
  };
}

function severityRank(severity: DataQualitySeverity): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
  }
}

function isSeverity(
  value: unknown,
): value is DataQualitySeverity {
  return (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "info"
  );
}

function requiredTimestamp(value: string): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error(
      "data quality issue detected_at is required",
    );
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      "data quality issue detected_at is required",
    );
  }

  return value;
}

function requiredUuid(value: string, label: string): string {
  const uuid = nullableUuid(value, label);

  if (uuid === null) {
    throw new Error(`${label} must not be blank.`);
  }

  return uuid;
}

function nullableUuid(
  value: string | null,
  label: string,
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new Error(
      "data quality issue canonical scope is invalid",
    );
  }

  return normalized;
}

function sameUuid(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
