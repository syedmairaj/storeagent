import type {
  WorkerJobLease,
  WorkerJobStatus,
  WorkerLeaseRecoveryDisposition,
} from "./types";

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
      `Worker lease ${field} must not be empty.`,
    );
  }

  return normalized;
}

function parseUtcTimestamp(
  value: string,
  field: string,
): number {
  const normalized =
    requireNonEmpty(
      value,
      field,
    );

  if (
    !ISO_UTC_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      `Worker lease ${field} must be an explicit UTC ISO-8601 timestamp.`,
    );
  }

  const timestamp =
    Date.parse(
      normalized,
    );

  if (
    Number.isNaN(
      timestamp,
    )
  ) {
    throw new Error(
      `Worker lease ${field} must be a valid timestamp.`,
    );
  }

  return timestamp;
}

export function validateWorkerJobLease(
  lease: WorkerJobLease,
): WorkerJobLease {
  const ownerId =
    requireNonEmpty(
      lease.ownerId,
      "ownerId",
    );

  const claimToken =
    requireNonEmpty(
      lease.claimToken,
      "claimToken",
    );

  const claimedAtMs =
    parseUtcTimestamp(
      lease.claimedAt,
      "claimedAt",
    );

  const expiresAtMs =
    parseUtcTimestamp(
      lease.expiresAt,
      "expiresAt",
    );

  if (
    expiresAtMs <=
    claimedAtMs
  ) {
    throw new Error(
      "Worker lease expiresAt must be later than claimedAt.",
    );
  }

  return {
    ownerId,
    claimToken,
    claimedAt:
      lease.claimedAt.trim(),
    expiresAt:
      lease.expiresAt.trim(),
  };
}

export function isWorkerLeaseExpired(
  lease: WorkerJobLease,
  now: string,
): boolean {
  const validLease =
    validateWorkerJobLease(
      lease,
    );

  const nowMs =
    parseUtcTimestamp(
      now,
      "now",
    );

  return (
    nowMs >=
    Date.parse(
      validLease.expiresAt,
    )
  );
}

export function assertWorkerLeaseOwnership(
  lease: WorkerJobLease,
  ownerId: string,
  claimToken: string,
): void {
  const validLease =
    validateWorkerJobLease(
      lease,
    );

  const expectedOwner =
    requireNonEmpty(
      ownerId,
      "ownerId",
    );

  const expectedToken =
    requireNonEmpty(
      claimToken,
      "claimToken",
    );

  if (
    validLease.ownerId !==
      expectedOwner ||
    validLease.claimToken !==
      expectedToken
  ) {
    throw new Error(
      "Worker lease ownership mismatch.",
    );
  }
}

/**
 * Decides what infrastructure recovery action is required after
 * a lease expires.
 *
 * claimed:
 *   no business execution has started, so work may safely return
 *   to queued.
 *
 * running:
 *   execution may have partially happened, so recovery must pass
 *   through retry_wait rather than pretending the attempt never ran.
 */
export function workerLeaseRecoveryDisposition(
  status: WorkerJobStatus,
  lease: WorkerJobLease,
  now: string,
): WorkerLeaseRecoveryDisposition {
  if (
    !isWorkerLeaseExpired(
      lease,
      now,
    )
  ) {
    return "none";
  }

  if (
    status === "claimed"
  ) {
    return "requeue";
  }

  if (
    status === "running"
  ) {
    return "retry_wait";
  }

  return "none";
}
