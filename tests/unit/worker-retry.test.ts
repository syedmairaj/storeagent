import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DEFAULT_WORKER_RETRY_POLICY,
  decideWorkerRetry,
  isRetryableWorkerFailure,
  validateWorkerRetryPolicy,
  workerRetryDelaySeconds,
} from "@/workers/retry";

describe("worker retry and backoff policy", () => {
  it("freezes the V1 default retry policy", () => {
    expect(
      DEFAULT_WORKER_RETRY_POLICY,
    ).toEqual({
      maxAttempts: 5,
      baseDelaySeconds: 30,
      maxDelaySeconds: 1800,
    });
  });

  it("classifies transient infrastructure failures as retryable", () => {
    for (
      const failureClass of [
        "transient_dependency",
        "rate_limited",
        "timeout",
        "lease_expired",
      ] as const
    ) {
      expect(
        isRetryableWorkerFailure(
          failureClass,
        ),
      ).toBe(true);
    }
  });

  it("fails closed for deterministic or unsafe failure classes", () => {
    for (
      const failureClass of [
        "validation",
        "authorization",
        "invariant_violation",
        "unsupported",
        "unknown",
      ] as const
    ) {
      expect(
        isRetryableWorkerFailure(
          failureClass,
        ),
      ).toBe(false);
    }
  });

  it("uses deterministic exponential backoff", () => {
    expect(
      workerRetryDelaySeconds(1),
    ).toBe(30);

    expect(
      workerRetryDelaySeconds(2),
    ).toBe(60);

    expect(
      workerRetryDelaySeconds(3),
    ).toBe(120);

    expect(
      workerRetryDelaySeconds(4),
    ).toBe(240);
  });

  it("caps exponential backoff at the configured maximum", () => {
    expect(
      workerRetryDelaySeconds(
        10,
      ),
    ).toBe(1800);
  });

  it("permits another attempt after the first retryable failure", () => {
    expect(
      decideWorkerRetry(
        "timeout",
        1,
      ),
    ).toEqual({
      disposition:
        "retry",
      delaySeconds: 30,
    });
  });

  it("permits retry while attempt count remains below max attempts", () => {
    expect(
      decideWorkerRetry(
        "rate_limited",
        4,
      ),
    ).toEqual({
      disposition:
        "retry",
      delaySeconds: 240,
    });
  });

  it("fails terminally when the maximum attempt count is reached", () => {
    expect(
      decideWorkerRetry(
        "timeout",
        5,
      ),
    ).toEqual({
      disposition:
        "fail",
      delaySeconds: null,
    });
  });

  it("does not retry validation failures", () => {
    expect(
      decideWorkerRetry(
        "validation",
        1,
      ),
    ).toEqual({
      disposition:
        "fail",
      delaySeconds: null,
    });
  });

  it("does not retry authorization failures", () => {
    expect(
      decideWorkerRetry(
        "authorization",
        1,
      ),
    ).toEqual({
      disposition:
        "fail",
      delaySeconds: null,
    });
  });

  it("does not retry invariant violations", () => {
    expect(
      decideWorkerRetry(
        "invariant_violation",
        1,
      ),
    ).toEqual({
      disposition:
        "fail",
      delaySeconds: null,
    });
  });

  it("fails closed for unknown failure classification", () => {
    expect(
      decideWorkerRetry(
        "unknown",
        1,
      ),
    ).toEqual({
      disposition:
        "fail",
      delaySeconds: null,
    });
  });

  it("rejects zero attempt count", () => {
    expect(() =>
      decideWorkerRetry(
        "timeout",
        0,
      ),
    ).toThrow(
      "Worker retry attemptCount must be a positive safe integer.",
    );
  });

  it("rejects invalid retry policy values", () => {
    expect(() =>
      validateWorkerRetryPolicy({
        maxAttempts: 0,
        baseDelaySeconds: 30,
        maxDelaySeconds: 1800,
      }),
    ).toThrow(
      "Worker retry maxAttempts must be a positive safe integer.",
    );
  });

  it("rejects maximum delay below base delay", () => {
    expect(() =>
      validateWorkerRetryPolicy({
        maxAttempts: 5,
        baseDelaySeconds: 60,
        maxDelaySeconds: 30,
      }),
    ).toThrow(
      "Worker retry maxDelaySeconds must be greater than or equal to baseDelaySeconds.",
    );
  });
});
