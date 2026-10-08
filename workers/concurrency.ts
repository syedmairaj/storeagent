import {
  assertWorkerLeaseOwnership,
} from "./lease";

import {
  isWorkerJobTerminalStatus,
} from "./lifecycle";

import type {
  ExistingWorkerJobIdentity,
  WorkerEnqueueAssessment,
  WorkerJobLease,
} from "./types";

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `Worker concurrency ${field} must not be empty.`,
    );
  }

  return normalized;
}

/**
 * Classifies enqueue behavior after persistence has looked up an
 * existing job by the UNIQUE logical idempotency key.
 *
 * This helper does not replace the required database/queue uniqueness
 * constraint. It only freezes StoreAgent's semantics.
 */
export function assessWorkerEnqueue(
  existing: ExistingWorkerJobIdentity | null,
  incomingIdempotencyKey: string,
): WorkerEnqueueAssessment {
  const incomingKey =
    requireNonEmpty(
      incomingIdempotencyKey,
      "incoming idempotencyKey",
    );

  if (existing === null) {
    return {
      disposition: "create",
      idempotencyKey:
        incomingKey,
    };
  }

  const existingKey =
    requireNonEmpty(
      existing.idempotencyKey,
      "existing idempotencyKey",
    );

  if (
    existingKey !==
    incomingKey
  ) {
    throw new Error(
      "Existing worker job does not match the incoming logical idempotency identity.",
    );
  }

  if (
    isWorkerJobTerminalStatus(
      existing.status,
    )
  ) {
    return {
      disposition:
        "duplicate_terminal",
      idempotencyKey:
        incomingKey,
    };
  }

  return {
    disposition:
      "duplicate_active",
    idempotencyKey:
      incomingKey,
  };
}

/**
 * Mutation fence for leased execution.
 *
 * Any worker attempting to mutate execution state must still own the
 * exact active lease identity.
 */
export function assertWorkerMutationFence(
  lease: WorkerJobLease,
  ownerId: string,
  claimToken: string,
): void {
  assertWorkerLeaseOwnership(
    lease,
    ownerId,
    claimToken,
  );
}
