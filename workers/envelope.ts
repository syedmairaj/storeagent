import {
  assertWorkerExecutionScope,
} from "./scope";

import type {
  StoreAgentJobType,
  WorkerJobEnvelope,
  WorkerJobSubject,
} from "./types";

const JOB_TYPES:
  readonly StoreAgentJobType[] = [
    "provider_sync",
    "provider_reconciliation",
    "metrics_aggregation",
    "forecast_generation",
    "action_generation",
    "explanation_generation",
    "notification_delivery",
  ];

const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `Worker job ${field} must not be empty.`,
    );
  }

  return normalized;
}

export function isStoreAgentJobType(
  value: string,
): value is StoreAgentJobType {
  return (
    JOB_TYPES as readonly string[]
  ).includes(value);
}

export function validateWorkerJobSubject(
  subject: WorkerJobSubject,
): WorkerJobSubject {
  return {
    resourceType:
      requireNonEmpty(
        subject.resourceType,
        "subject resourceType",
      ),

    resourceId:
      requireNonEmpty(
        subject.resourceId,
        "subject resourceId",
      ),
  };
}

export function validateWorkerJobEnvelope(
  envelope: WorkerJobEnvelope,
): WorkerJobEnvelope {
  if (envelope.version !== 1) {
    throw new Error(
      `Unsupported worker job envelope version "${envelope.version}".`,
    );
  }

  if (
    !isStoreAgentJobType(
      envelope.jobType,
    )
  ) {
    throw new Error(
      `Unsupported StoreAgent job type "${String(envelope.jobType)}".`,
    );
  }

  const idempotencyKey =
    requireNonEmpty(
      envelope.idempotencyKey,
      "idempotencyKey",
    );

  const requestedAt =
    requireNonEmpty(
      envelope.requestedAt,
      "requestedAt",
    );

  if (
    !ISO_UTC_PATTERN.test(
      requestedAt,
    ) ||
    Number.isNaN(
      Date.parse(
        requestedAt,
      ),
    )
  ) {
    throw new Error(
      "Worker job requestedAt must be an explicit UTC ISO-8601 timestamp.",
    );
  }

  const subjects =
    envelope.subjects.map(
      validateWorkerJobSubject,
    );

  /**
   * Reuse M0.8.1 service-scope validation.
   *
   * No ownership claims are created here. The empty owned-reference
   * set deliberately means actual canonical ownership evidence must
   * be loaded and validated by execution code later.
   */
  assertWorkerExecutionScope({
    scope: {
      organizationId:
        envelope.organizationId,

      storeId:
        envelope.storeId,

      purpose:
        envelope.jobType,
    },

    ownedReferences: [],
  });

  return {
    version: 1,
    jobType:
      envelope.jobType,

    organizationId:
      envelope.organizationId.trim(),

    storeId:
      envelope.storeId === null
        ? null
        : envelope.storeId.trim(),

    idempotencyKey,
    subjects,
    requestedAt,
  };
}
