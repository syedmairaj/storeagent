import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { DataQualityIssueStatus } from "@/lib/commerce-domain/types";

export const DATA_QUALITY_ILLEGAL_TRANSITION_SQLSTATE = "SA005";

export const DATA_QUALITY_ISSUE_NOT_IN_ORGANIZATION_SQLSTATE = "SA006";

export const DATA_QUALITY_LIFECYCLE_BEFORE_DETECTION_SQLSTATE = "SA007";

export type DataQualityLifecycleTransition =
  | "resolve"
  | "ignore"
  | "supersede";

export class DataQualityIllegalLifecycleTransitionError extends Error {
  readonly sqlState = DATA_QUALITY_ILLEGAL_TRANSITION_SQLSTATE;

  constructor() {
    super(
      "data quality issue lifecycle transition is illegal",
    );

    this.name = "DataQualityIllegalLifecycleTransitionError";
  }
}

export class DataQualityIssueNotInOrganizationError extends Error {
  readonly sqlState =
    DATA_QUALITY_ISSUE_NOT_IN_ORGANIZATION_SQLSTATE;

  constructor() {
    super(
      "data quality issue is not in the trusted organization",
    );

    this.name = "DataQualityIssueNotInOrganizationError";
  }
}

export class DataQualityLifecycleBeforeDetectionError extends Error {
  readonly sqlState =
    DATA_QUALITY_LIFECYCLE_BEFORE_DETECTION_SQLSTATE;

  constructor() {
    super(
      "lifecycle timestamp precedes issue detection",
    );

    this.name = "DataQualityLifecycleBeforeDetectionError";
  }
}

export type DataQualityLifecycleResult = {
  readonly issueId: string;
  readonly previousStatus: "open";
  readonly status: "resolved" | "ignored" | "superseded";
  readonly resolvedAt: string | null;
};

export type TransitionDataQualityIssueInput = {
  readonly organizationId: string;
  readonly issueId: string;
  readonly transition: DataQualityLifecycleTransition;
  readonly occurredAt: string;
};

type LifecycleClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

/**
 * M4.6 lifecycle matrix.
 *
 * Only OPEN may resolve, ignore, or supersede.
 * RESOLVED, IGNORED, and SUPERSEDED do not transition further.
 */
export function dataQualityLifecycleTarget(
  current: DataQualityIssueStatus,
  transition: DataQualityLifecycleTransition,
): "resolved" | "ignored" | "superseded" {
  if (current !== "open") {
    throw new DataQualityIllegalLifecycleTransitionError();
  }

  switch (transition) {
    case "resolve":
      return "resolved";
    case "ignore":
      return "ignored";
    case "supersede":
      return "superseded";
  }
}

export async function transitionDataQualityIssue(
  input: TransitionDataQualityIssueInput,
  client: LifecycleClient = createSupabaseAdminClient(),
): Promise<DataQualityLifecycleResult> {
  const organizationId = requiredUuid(
    input.organizationId,
    "Organization ID",
  );
  const issueId = requiredUuid(
    input.issueId,
    "Issue ID",
  );
  const occurredAt = requiredTimestamp(input.occurredAt);

  if (
    input.transition !== "resolve" &&
    input.transition !== "ignore" &&
    input.transition !== "supersede"
  ) {
    throw new Error(
      "data quality issue transition is not supported",
    );
  }

  const { data, error } = await client.rpc(
    "transition_data_quality_issue",
    {
      p_organization_id: organizationId,
      p_issue_id: issueId,
      p_transition: input.transition,
      p_occurred_at: occurredAt,
    },
  );

  if (error !== null) {
    if (
      error.code === DATA_QUALITY_ILLEGAL_TRANSITION_SQLSTATE
    ) {
      throw new DataQualityIllegalLifecycleTransitionError();
    }

    if (
      error.code ===
      DATA_QUALITY_ISSUE_NOT_IN_ORGANIZATION_SQLSTATE
    ) {
      throw new DataQualityIssueNotInOrganizationError();
    }

    if (
      error.code ===
      DATA_QUALITY_LIFECYCLE_BEFORE_DETECTION_SQLSTATE
    ) {
      throw new DataQualityLifecycleBeforeDetectionError();
    }

    throw new Error(
      `data quality issue lifecycle failed: ${error.message}`,
    );
  }

  return lifecycleResult(data, issueId, input.transition);
}

function lifecycleResult(
  data: unknown,
  issueId: string,
  transition: DataQualityLifecycleTransition,
): DataQualityLifecycleResult {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      "data quality issue lifecycle must return exactly one row",
    );
  }

  const row = data[0] as Record<string, unknown>;
  const status = dataQualityLifecycleTarget(
    "open",
    transition,
  );

  if (
    row.issue_id !== issueId ||
    row.previous_status !== "open" ||
    row.status !== status
  ) {
    throw new Error(
      "data quality issue lifecycle returned an invalid row",
    );
  }

  if (status === "resolved") {
    if (typeof row.resolved_at !== "string") {
      throw new Error(
        "data quality issue lifecycle returned an invalid row",
      );
    }

    return {
      issueId,
      previousStatus: "open",
      status,
      resolvedAt: row.resolved_at,
    };
  }

  if (row.resolved_at !== null) {
    throw new Error(
      "data quality issue lifecycle returned an invalid row",
    );
  }

  return {
    issueId,
    previousStatus: "open",
    status,
    resolvedAt: null,
  };
}

function requiredTimestamp(value: string): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error(
      "data quality issue occurred_at is required",
    );
  }

  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(
      "data quality issue occurred_at is required",
    );
  }

  return value;
}

function requiredUuid(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new Error(`${label} must not be blank.`);
  }

  return normalized;
}
