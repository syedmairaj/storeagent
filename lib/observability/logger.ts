import type {
  ApplicationErrorCode,
  ApplicationErrorKind,
} from "@/lib/observability/app-error";

import {
  redactObservabilityValue,
} from "@/lib/observability/redact";

import type {
  ApplicationLogEvent,
  ApplicationLogLevel,
  ApplicationObservabilityContext,
} from "@/lib/observability/types";

export interface BuildApplicationLogEventInput {
  level:
    ApplicationLogLevel;

  eventType:
    string;

  code:
    ApplicationErrorCode | null;

  kind:
    ApplicationErrorKind | null;

  message:
    string;

  context:
    ApplicationObservabilityContext;

  metadata?:
    Record<string, unknown> | null;

  occurredAt:
    string;
}

function isUtcTimestamp(
  value:
    string,
): boolean {
  const timestamp =
    Date.parse(value);

  return (
    Number.isFinite(
      timestamp,
    ) &&
    value.endsWith("Z")
  );
}

export function buildApplicationLogEvent(
  input:
    BuildApplicationLogEventInput,
): ApplicationLogEvent {
  if (
    input.context.requestId
      .trim()
      .length === 0
  ) {
    throw new Error(
      "Application observability requestId must not be empty.",
    );
  }

  if (
    input.context.route
      .trim()
      .length === 0
  ) {
    throw new Error(
      "Application observability route must not be empty.",
    );
  }

  if (
    input.context.action
      .trim()
      .length === 0
  ) {
    throw new Error(
      "Application observability action must not be empty.",
    );
  }

  if (
    !isUtcTimestamp(
      input.occurredAt,
    )
  ) {
    throw new Error(
      "Application observability occurredAt must be an explicit UTC timestamp.",
    );
  }

  return {
    level:
      input.level,

    eventType:
      input.eventType,

    code:
      input.code,

    kind:
      input.kind,

    message:
      String(
        redactObservabilityValue(
          input.message,
        ),
      ),

    context:
      input.context,

    metadata:
      input.metadata
        ? (
            redactObservabilityValue(
              input.metadata,
            ) as Record<
              string,
              unknown
            >
          )
        : null,

    occurredAt:
      input.occurredAt,
  };
}

export function emitApplicationLogEvent(
  event:
    ApplicationLogEvent,

  emit:
    (
      serialized:
        string,
    ) => void =
      console.error,
): void {
  emit(
    JSON.stringify(
      event,
    ),
  );
}
