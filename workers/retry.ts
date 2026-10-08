import type {
  WorkerFailureClass,
  WorkerRetryDecision,
  WorkerRetryPolicy,
} from "./types";

export const DEFAULT_WORKER_RETRY_POLICY:
  Readonly<WorkerRetryPolicy> = {
    maxAttempts: 5,
    baseDelaySeconds: 30,
    maxDelaySeconds: 30 * 60,
  };

const RETRYABLE_FAILURE_CLASSES:
  ReadonlySet<WorkerFailureClass> =
    new Set([
      "transient_dependency",
      "rate_limited",
      "timeout",
      "lease_expired",
    ]);

function requirePositiveSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `Worker retry ${field} must be a positive safe integer.`,
    );
  }

  return value;
}

export function validateWorkerRetryPolicy(
  policy: WorkerRetryPolicy,
): WorkerRetryPolicy {
  const maxAttempts =
    requirePositiveSafeInteger(
      policy.maxAttempts,
      "maxAttempts",
    );

  const baseDelaySeconds =
    requirePositiveSafeInteger(
      policy.baseDelaySeconds,
      "baseDelaySeconds",
    );

  const maxDelaySeconds =
    requirePositiveSafeInteger(
      policy.maxDelaySeconds,
      "maxDelaySeconds",
    );

  if (
    maxDelaySeconds <
    baseDelaySeconds
  ) {
    throw new Error(
      "Worker retry maxDelaySeconds must be greater than or equal to baseDelaySeconds.",
    );
  }

  return {
    maxAttempts,
    baseDelaySeconds,
    maxDelaySeconds,
  };
}

export function isRetryableWorkerFailure(
  failureClass: WorkerFailureClass,
): boolean {
  return (
    RETRYABLE_FAILURE_CLASSES.has(
      failureClass,
    )
  );
}

/**
 * attemptCount is the number of execution attempts that have
 * already started, including the failed attempt being evaluated.
 *
 * attemptCount = 1 therefore means attempt 1 just failed.
 */
export function workerRetryDelaySeconds(
  attemptCount: number,
  policy: WorkerRetryPolicy =
    DEFAULT_WORKER_RETRY_POLICY,
): number {
  const validPolicy =
    validateWorkerRetryPolicy(
      policy,
    );

  const validAttemptCount =
    requirePositiveSafeInteger(
      attemptCount,
      "attemptCount",
    );

  const exponent =
    validAttemptCount - 1;

  const calculated =
    validPolicy.baseDelaySeconds *
    2 ** exponent;

  return Math.min(
    calculated,
    validPolicy.maxDelaySeconds,
  );
}

export function decideWorkerRetry(
  failureClass: WorkerFailureClass,
  attemptCount: number,
  policy: WorkerRetryPolicy =
    DEFAULT_WORKER_RETRY_POLICY,
): WorkerRetryDecision {
  const validPolicy =
    validateWorkerRetryPolicy(
      policy,
    );

  const validAttemptCount =
    requirePositiveSafeInteger(
      attemptCount,
      "attemptCount",
    );

  if (
    !isRetryableWorkerFailure(
      failureClass,
    )
  ) {
    return {
      disposition: "fail",
      delaySeconds: null,
    };
  }

  if (
    validAttemptCount >=
    validPolicy.maxAttempts
  ) {
    return {
      disposition: "fail",
      delaySeconds: null,
    };
  }

  return {
    disposition: "retry",
    delaySeconds:
      workerRetryDelaySeconds(
        validAttemptCount,
        validPolicy,
      ),
  };
}
