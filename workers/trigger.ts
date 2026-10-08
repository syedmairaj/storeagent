import {
  buildWorkerIdempotencyKey,
} from "./idempotency";

import {
  assertWorkerExecutionScope,
} from "./scope";

import type {
  ResolvedWorkerTriggerScope,
  WorkerJobSubject,
  WorkerTrigger,
  WorkerTriggerRequest,
} from "./types";

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `Worker trigger ${field} must not be empty.`,
    );
  }

  return normalized;
}

function normalizeSubjects(
  subjects: readonly WorkerJobSubject[],
): readonly WorkerJobSubject[] {
  return subjects.map(
    (subject) => ({
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
    }),
  );
}

export function validateWorkerTrigger(
  trigger: WorkerTrigger,
): WorkerTrigger {
  const triggerKey =
    requireNonEmpty(
      trigger.triggerKey,
      "triggerKey",
    );

  if (
    trigger.kind ===
    "scheduled"
  ) {
    return {
      kind: "scheduled",
      triggerKey,
    };
  }

  return {
    kind: "event",
    triggerKey,

    sourceType:
      trigger.sourceType,

    sourceId:
      requireNonEmpty(
        trigger.sourceId,
        "event sourceId",
      ),
  };
}

export function validateWorkerTriggerRequest(
  request: WorkerTriggerRequest,
): WorkerTriggerRequest {
  return {
    jobType:
      request.jobType,

    trigger:
      validateWorkerTrigger(
        request.trigger,
      ),

    operationKey:
      requireNonEmpty(
        request.operationKey,
        "operationKey",
      ),

    subjects:
      normalizeSubjects(
        request.subjects,
      ),
  };
}

/**
 * Trigger data does not establish tenant ownership.
 *
 * Scope must already have been resolved from trusted scheduler
 * configuration, Integration ownership, or another trusted canonical
 * relationship before calling this function.
 */
export function buildTriggeredWorkerIdempotencyKey(
  request: WorkerTriggerRequest,
  resolvedScope: ResolvedWorkerTriggerScope,
): string {
  const validRequest =
    validateWorkerTriggerRequest(
      request,
    );

  assertWorkerExecutionScope({
    scope: {
      organizationId:
        resolvedScope.organizationId,

      storeId:
        resolvedScope.storeId,

      purpose:
        validRequest.jobType,
    },

    ownedReferences: [],
  });

  return buildWorkerIdempotencyKey({
    jobType:
      validRequest.jobType,

    organizationId:
      resolvedScope.organizationId,

    storeId:
      resolvedScope.storeId,

    operationKey:
      validRequest.operationKey,

    subjects:
      validRequest.subjects,
  });
}

/**
 * External trigger identifiers are routing/provenance only.
 *
 * They never establish organization ownership by themselves.
 */
export function triggerEstablishesTenantOwnership(
  trigger: WorkerTrigger,
): false {
  void trigger;

  return false;
}
