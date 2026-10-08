import type {
  WorkerTelemetryContext,
  WorkerTelemetryEvent,
  WorkerTelemetryEventType,
  WorkerTelemetryLevel,
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
      `Worker telemetry ${field} must not be empty.`,
    );
  }

  return normalized;
}

function normalizeNullableString(
  value: string | null,
  field: string,
): string | null {
  if (value === null) {
    return null;
  }

  return requireNonEmpty(
    value,
    field,
  );
}

function normalizeAttemptCount(
  value: number | null,
): number | null {
  if (value === null) {
    return null;
  }

  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      "Worker telemetry attemptCount must be a non-negative safe integer.",
    );
  }

  return value;
}

function requireUtcTimestamp(
  value: string,
): string {
  const normalized =
    requireNonEmpty(
      value,
      "occurredAt",
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
      "Worker telemetry occurredAt must be an explicit UTC ISO-8601 timestamp.",
    );
  }

  return normalized;
}

export function validateWorkerTelemetryContext(
  context: WorkerTelemetryContext,
): WorkerTelemetryContext {
  return {
    idempotencyKey:
      requireNonEmpty(
        context.idempotencyKey,
        "idempotencyKey",
      ),

    jobType:
      context.jobType,

    organizationId:
      requireNonEmpty(
        context.organizationId,
        "organizationId",
      ),

    storeId:
      normalizeNullableString(
        context.storeId,
        "storeId",
      ),

    executionId:
      normalizeNullableString(
        context.executionId,
        "executionId",
      ),

    canonicalRunId:
      normalizeNullableString(
        context.canonicalRunId,
        "canonicalRunId",
      ),

    attemptCount:
      normalizeAttemptCount(
        context.attemptCount,
      ),
  };
}

export interface BuildWorkerTelemetryEventInput {
  level: WorkerTelemetryLevel;
  eventType: WorkerTelemetryEventType;

  context: WorkerTelemetryContext;

  code: string | null;
  message: string | null;

  occurredAt: string;
}

export function buildWorkerTelemetryEvent(
  input: BuildWorkerTelemetryEventInput,
): WorkerTelemetryEvent {
  return {
    level:
      input.level,

    eventType:
      input.eventType,

    context:
      validateWorkerTelemetryContext(
        input.context,
      ),

    code:
      normalizeNullableString(
        input.code,
        "code",
      ),

    message:
      normalizeNullableString(
        input.message,
        "message",
      ),

    occurredAt:
      requireUtcTimestamp(
        input.occurredAt,
      ),
  };
}
