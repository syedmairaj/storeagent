import type {
  StoreAgentJobType,
  WorkerFailureClass,
  WorkerTerminalFailureReason,
  WorkerTerminalFailureRecord,
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
      `Worker terminal failure ${field} must not be empty.`,
    );
  }

  return normalized;
}

function requirePositiveSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `Worker terminal failure ${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function requireUtcTimestamp(
  value: string,
  field: string,
): string {
  const normalized =
    requireNonEmpty(
      value,
      field,
    );

  if (
    !ISO_UTC_PATTERN.test(
      normalized,
    ) ||
    Number.isNaN(
      Date.parse(
        normalized,
      ),
    )
  ) {
    throw new Error(
      `Worker terminal failure ${field} must be an explicit UTC ISO-8601 timestamp.`,
    );
  }

  return normalized;
}

export function terminalFailureReasonForClass(
  failureClass: WorkerFailureClass,
  retryExhausted: boolean,
): WorkerTerminalFailureReason {
  if (retryExhausted) {
    return "retry_exhausted";
  }

  switch (failureClass) {
    case "validation":
      return "validation_failed";

    case "authorization":
      return "authorization_failed";

    case "invariant_violation":
      return "invariant_violation";

    case "unsupported":
      return "unsupported";

    case "unknown":
      return "unknown_failure";

    case "transient_dependency":
    case "rate_limited":
    case "timeout":
    case "lease_expired":
      /**
       * A retryable failure must only become terminal when the
       * retry budget is exhausted.
       */
      throw new Error(
        `Retryable worker failure "${failureClass}" cannot become terminal before retry exhaustion.`,
      );
  }
}

export interface BuildWorkerTerminalFailureInput {
  idempotencyKey: string;
  jobType: StoreAgentJobType;

  organizationId: string;
  storeId: string | null;

  attemptCount: number;

  reason: WorkerTerminalFailureReason;

  errorCode: string;
  errorMessage: string;

  failedAt: string;
}

export function buildWorkerTerminalFailureRecord(
  input: BuildWorkerTerminalFailureInput,
): WorkerTerminalFailureRecord {
  return {
    idempotencyKey:
      requireNonEmpty(
        input.idempotencyKey,
        "idempotencyKey",
      ),

    jobType:
      input.jobType,

    organizationId:
      requireNonEmpty(
        input.organizationId,
        "organizationId",
      ),

    storeId:
      input.storeId === null
        ? null
        : requireNonEmpty(
            input.storeId,
            "storeId",
          ),

    attemptCount:
      requirePositiveSafeInteger(
        input.attemptCount,
        "attemptCount",
      ),

    reason:
      input.reason,

    errorCode:
      requireNonEmpty(
        input.errorCode,
        "errorCode",
      ),

    errorMessage:
      requireNonEmpty(
        input.errorMessage,
        "errorMessage",
      ),

    failedAt:
      requireUtcTimestamp(
        input.failedAt,
        "failedAt",
      ),
  };
}

/**
 * Terminal failure records are dead work that must remain
 * observable until explicitly resolved by future operator/runtime
 * workflow.
 */
export function workerFailureIsDeadWork(
  record: WorkerTerminalFailureRecord,
): boolean {
  return record.reason.length > 0;
}
