import type {
  ApplicationErrorCode,
  ApplicationErrorKind,
} from "@/lib/observability/app-error";

export type ApplicationLogLevel =
  | "info"
  | "warn"
  | "error";

export interface ApplicationObservabilityContext {
  requestId:
    string;

  route:
    string;

  action:
    string;

  userId:
    string | null;

  organizationId:
    string | null;

  storeId:
    string | null;
}

export interface ApplicationLogEvent {
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

  metadata:
    Record<string, unknown> | null;

  occurredAt:
    string;
}
