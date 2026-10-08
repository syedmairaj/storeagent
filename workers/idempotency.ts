import type {
  StoreAgentJobType,
  WorkerJobSubject,
} from "./types";

export const WORKER_IDEMPOTENCY_VERSION =
  "storeagent-job-v1";

export interface WorkerIdempotencyInput {
  jobType: StoreAgentJobType;

  organizationId: string;
  storeId: string | null;

  /**
   * Stable logical execution identifier supplied by the
   * orchestration layer.
   *
   * Examples:
   * - canonical run ID
   * - deterministic sync request/window key
   * - metric date/window
   *
   * It must not be:
   * - random queue delivery ID
   * - worker attempt ID
   * - lease ID
   * - requestedAt timestamp
   */
  operationKey: string;

  /**
   * Canonical subject references involved in this logical job.
   *
   * Subjects are normalized and sorted so caller order does not
   * change logical job identity.
   */
  subjects: readonly WorkerJobSubject[];
}

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `Worker idempotency ${field} must not be empty.`,
    );
  }

  return normalized;
}

function normalizeSubject(
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

function canonicalSubjects(
  subjects: readonly WorkerJobSubject[],
): WorkerJobSubject[] {
  return subjects
    .map(normalizeSubject)
    .sort(
      (left, right) => {
        const typeComparison =
          left.resourceType.localeCompare(
            right.resourceType,
          );

        if (typeComparison !== 0) {
          return typeComparison;
        }

        return left.resourceId.localeCompare(
          right.resourceId,
        );
      },
    );
}

/**
 * Builds the logical StoreAgent background-job idempotency key.
 *
 * JSON-array serialization avoids delimiter collisions.
 *
 * The result deliberately preserves case in canonical identifiers.
 */
export function buildWorkerIdempotencyKey(
  input: WorkerIdempotencyInput,
): string {
  const organizationId =
    requireNonEmpty(
      input.organizationId,
      "organizationId",
    );

  const storeId =
    input.storeId === null
      ? null
      : requireNonEmpty(
          input.storeId,
          "storeId",
        );

  const operationKey =
    requireNonEmpty(
      input.operationKey,
      "operationKey",
    );

  const subjects =
    canonicalSubjects(
      input.subjects,
    );

  return JSON.stringify([
    WORKER_IDEMPOTENCY_VERSION,
    input.jobType,
    organizationId,
    storeId,
    operationKey,
    subjects.map(
      (subject) => [
        subject.resourceType,
        subject.resourceId,
      ],
    ),
  ]);
}
