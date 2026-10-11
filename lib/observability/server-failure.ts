import "server-only";

import {
  isAppError,
} from "@/lib/observability/app-error";

import {
  buildApplicationLogEvent,
  emitApplicationLogEvent,
} from "@/lib/observability/logger";

import type {
  ApplicationObservabilityContext,
} from "@/lib/observability/types";

export interface LogServerFailureInput {
  eventType:
    string;

  error:
    unknown;

  context:
    ApplicationObservabilityContext;

  metadata?:
    Record<string, unknown> | null;
}

export function logServerFailure(
  input:
    LogServerFailureInput,
): void {
  const appError =
    isAppError(
      input.error,
    )
      ? input.error
      : null;

  const event =
    buildApplicationLogEvent({
      level:
        "error",

      eventType:
        input.eventType,

      code:
        appError?.code ??
        "INTERNAL_ERROR",

      kind:
        appError?.kind ??
        "programming",

      message:
        appError?.message ??
        "Unexpected application failure.",

      context:
        input.context,

      metadata:
        input.metadata ??
        null,

      occurredAt:
        new Date()
          .toISOString(),
    });

  emitApplicationLogEvent(
    event,
  );
}
