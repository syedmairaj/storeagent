import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildWorkerTelemetryEvent,
  validateWorkerTelemetryContext,
} from "@/workers/observability";

describe("worker observability contract", () => {
  it("accepts a complete worker telemetry context", () => {
    expect(
      validateWorkerTelemetryContext({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        executionId:
          "execution-1",

        canonicalRunId:
          "sync-run-1",

        attemptCount: 1,
      }),
    ).toEqual({
      idempotencyKey:
        "job-key-1",

      jobType:
        "provider_sync",

      organizationId:
        "org-a",

      storeId:
        "store-a",

      executionId:
        "execution-1",

      canonicalRunId:
        "sync-run-1",

      attemptCount: 1,
    });
  });

  it("supports organization-scoped telemetry", () => {
    const context =
      validateWorkerTelemetryContext({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_reconciliation",

        organizationId:
          "org-a",

        storeId: null,

        executionId: null,

        canonicalRunId: null,

        attemptCount: null,
      });

    expect(
      context.storeId,
    ).toBeNull();

    expect(
      context.executionId,
    ).toBeNull();
  });

  it("allows zero attempts before execution starts", () => {
    expect(
      validateWorkerTelemetryContext({
        idempotencyKey:
          "job-key-1",

        jobType:
          "forecast_generation",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        executionId: null,

        canonicalRunId:
          "forecast-run-1",

        attemptCount: 0,
      }).attemptCount,
    ).toBe(0);
  });

  it("rejects negative attempt count", () => {
    expect(() =>
      validateWorkerTelemetryContext({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        executionId: null,

        canonicalRunId: null,

        attemptCount: -1,
      }),
    ).toThrow(
      "Worker telemetry attemptCount must be a non-negative safe integer.",
    );
  });

  it("rejects blank logical job identity", () => {
    expect(() =>
      validateWorkerTelemetryContext({
        idempotencyKey: " ",

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        executionId: null,

        canonicalRunId: null,

        attemptCount: null,
      }),
    ).toThrow(
      "Worker telemetry idempotencyKey must not be empty.",
    );
  });

  it("rejects blank tenant identity", () => {
    expect(() =>
      validateWorkerTelemetryContext({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_sync",

        organizationId: " ",

        storeId: null,

        executionId: null,

        canonicalRunId: null,

        attemptCount: null,
      }),
    ).toThrow(
      "Worker telemetry organizationId must not be empty.",
    );
  });

  it("builds structured success telemetry", () => {
    expect(
      buildWorkerTelemetryEvent({
        level: "info",

        eventType:
          "job_succeeded",

        context: {
          idempotencyKey:
            "job-key-1",

          jobType:
            "forecast_generation",

          organizationId:
            "org-a",

          storeId:
            "store-a",

          executionId:
            "execution-1",

          canonicalRunId:
            "forecast-run-1",

          attemptCount: 1,
        },

        code: null,

        message:
          "Forecast generation completed.",

        occurredAt:
          "2026-10-08T07:00:00Z",
      }),
    ).toEqual({
      level: "info",

      eventType:
        "job_succeeded",

      context: {
        idempotencyKey:
          "job-key-1",

        jobType:
          "forecast_generation",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        executionId:
          "execution-1",

        canonicalRunId:
          "forecast-run-1",

        attemptCount: 1,
      },

      code: null,

      message:
        "Forecast generation completed.",

      occurredAt:
        "2026-10-08T07:00:00Z",
    });
  });

  it("builds structured failure telemetry", () => {
    const event =
      buildWorkerTelemetryEvent({
        level: "error",

        eventType:
          "job_failed",

        context: {
          idempotencyKey:
            "job-key-1",

          jobType:
            "provider_sync",

          organizationId:
            "org-a",

          storeId:
            "store-a",

          executionId:
            "execution-2",

          canonicalRunId:
            "sync-run-1",

          attemptCount: 5,
        },

        code:
          "PROVIDER_TIMEOUT",

        message:
          "Provider request timed out after retry exhaustion.",

        occurredAt:
          "2026-10-08T07:00:00.123Z",
      });

    expect(event.level).toBe(
      "error",
    );

    expect(event.code).toBe(
      "PROVIDER_TIMEOUT",
    );
  });

  it("requires explicit UTC telemetry time", () => {
    expect(() =>
      buildWorkerTelemetryEvent({
        level: "info",

        eventType:
          "job_started",

        context: {
          idempotencyKey:
            "job-key-1",

          jobType:
            "provider_sync",

          organizationId:
            "org-a",

          storeId: null,

          executionId:
            "execution-1",

          canonicalRunId: null,

          attemptCount: 1,
        },

        code: null,
        message: null,

        occurredAt:
          "2026-10-08T11:00:00+04:00",
      }),
    ).toThrow(
      "Worker telemetry occurredAt must be an explicit UTC ISO-8601 timestamp.",
    );
  });

  it("rejects blank diagnostic codes when supplied", () => {
    expect(() =>
      buildWorkerTelemetryEvent({
        level: "error",

        eventType:
          "job_failed",

        context: {
          idempotencyKey:
            "job-key-1",

          jobType:
            "provider_sync",

          organizationId:
            "org-a",

          storeId: null,

          executionId: null,

          canonicalRunId: null,

          attemptCount: 1,
        },

        code: " ",
        message: null,

        occurredAt:
          "2026-10-08T07:00:00Z",
      }),
    ).toThrow(
      "Worker telemetry code must not be empty.",
    );
  });
});
