import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildWorkerTerminalFailureRecord,
  terminalFailureReasonForClass,
  workerFailureIsDeadWork,
} from "@/workers/failure";

describe("worker terminal failure and dead-work policy", () => {
  it("maps validation failure to terminal validation reason", () => {
    expect(
      terminalFailureReasonForClass(
        "validation",
        false,
      ),
    ).toBe(
      "validation_failed",
    );
  });

  it("maps authorization failure to terminal authorization reason", () => {
    expect(
      terminalFailureReasonForClass(
        "authorization",
        false,
      ),
    ).toBe(
      "authorization_failed",
    );
  });

  it("maps invariant violations explicitly", () => {
    expect(
      terminalFailureReasonForClass(
        "invariant_violation",
        false,
      ),
    ).toBe(
      "invariant_violation",
    );
  });

  it("maps unsupported work explicitly", () => {
    expect(
      terminalFailureReasonForClass(
        "unsupported",
        false,
      ),
    ).toBe(
      "unsupported",
    );
  });

  it("fails closed for unknown failures", () => {
    expect(
      terminalFailureReasonForClass(
        "unknown",
        false,
      ),
    ).toBe(
      "unknown_failure",
    );
  });

  it("maps exhausted retry budget to retry_exhausted", () => {
    expect(
      terminalFailureReasonForClass(
        "timeout",
        true,
      ),
    ).toBe(
      "retry_exhausted",
    );
  });

  it("does not allow retryable failures to become terminal early", () => {
    expect(() =>
      terminalFailureReasonForClass(
        "timeout",
        false,
      ),
    ).toThrow(
      'Retryable worker failure "timeout" cannot become terminal before retry exhaustion.',
    );
  });

  it("builds a durable terminal failure record", () => {
    const record =
      buildWorkerTerminalFailureRecord({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        attemptCount: 5,

        reason:
          "retry_exhausted",

        errorCode:
          "PROVIDER_TIMEOUT",

        errorMessage:
          "Provider request timed out after retry budget was exhausted.",

        failedAt:
          "2026-10-08T06:30:00Z",
      });

    expect(record).toEqual({
      idempotencyKey:
        "job-key-1",

      jobType:
        "provider_sync",

      organizationId:
        "org-a",

      storeId:
        "store-a",

      attemptCount: 5,

      reason:
        "retry_exhausted",

      errorCode:
        "PROVIDER_TIMEOUT",

      errorMessage:
        "Provider request timed out after retry budget was exhausted.",

      failedAt:
        "2026-10-08T06:30:00Z",
    });
  });

  it("treats terminal failure as dead work", () => {
    const record =
      buildWorkerTerminalFailureRecord({
        idempotencyKey:
          "job-key-1",

        jobType:
          "forecast_generation",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        attemptCount: 1,

        reason:
          "validation_failed",

        errorCode:
          "INVALID_FORECAST_INPUT",

        errorMessage:
          "Forecast input failed validation.",

        failedAt:
          "2026-10-08T06:30:00Z",
      });

    expect(
      workerFailureIsDeadWork(
        record,
      ),
    ).toBe(true);
  });

  it("rejects zero attempt count", () => {
    expect(() =>
      buildWorkerTerminalFailureRecord({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        attemptCount: 0,

        reason:
          "unknown_failure",

        errorCode:
          "UNKNOWN",

        errorMessage:
          "Unknown failure.",

        failedAt:
          "2026-10-08T06:30:00Z",
      }),
    ).toThrow(
      "Worker terminal failure attemptCount must be a positive safe integer.",
    );
  });

  it("rejects blank technical error code", () => {
    expect(() =>
      buildWorkerTerminalFailureRecord({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        attemptCount: 1,

        reason:
          "unknown_failure",

        errorCode: " ",

        errorMessage:
          "Unknown failure.",

        failedAt:
          "2026-10-08T06:30:00Z",
      }),
    ).toThrow(
      "Worker terminal failure errorCode must not be empty.",
    );
  });

  it("rejects blank technical error message", () => {
    expect(() =>
      buildWorkerTerminalFailureRecord({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        attemptCount: 1,

        reason:
          "unknown_failure",

        errorCode:
          "UNKNOWN",

        errorMessage: " ",

        failedAt:
          "2026-10-08T06:30:00Z",
      }),
    ).toThrow(
      "Worker terminal failure errorMessage must not be empty.",
    );
  });

  it("requires explicit UTC failure timestamp", () => {
    expect(() =>
      buildWorkerTerminalFailureRecord({
        idempotencyKey:
          "job-key-1",

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        attemptCount: 1,

        reason:
          "unknown_failure",

        errorCode:
          "UNKNOWN",

        errorMessage:
          "Unknown failure.",

        failedAt:
          "2026-10-08T10:30:00+04:00",
      }),
    ).toThrow(
      "Worker terminal failure failedAt must be an explicit UTC ISO-8601 timestamp.",
    );
  });
});
