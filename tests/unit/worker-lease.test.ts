import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assertWorkerLeaseOwnership,
  isWorkerLeaseExpired,
  validateWorkerJobLease,
  workerLeaseRecoveryDisposition,
} from "@/workers/lease";

const lease = {
  ownerId:
    "worker-a",

  claimToken:
    "claim-token-a",

  claimedAt:
    "2026-10-08T04:00:00Z",

  expiresAt:
    "2026-10-08T04:05:00Z",
};

describe("worker claim and lease semantics", () => {
  it("accepts a valid lease", () => {
    expect(
      validateWorkerJobLease(
        lease,
      ),
    ).toEqual(
      lease,
    );
  });

  it("rejects empty worker owner identity", () => {
    expect(() =>
      validateWorkerJobLease({
        ...lease,
        ownerId: " ",
      }),
    ).toThrow(
      "Worker lease ownerId must not be empty.",
    );
  });

  it("rejects empty claim token", () => {
    expect(() =>
      validateWorkerJobLease({
        ...lease,
        claimToken: " ",
      }),
    ).toThrow(
      "Worker lease claimToken must not be empty.",
    );
  });

  it("requires explicit UTC lease timestamps", () => {
    expect(() =>
      validateWorkerJobLease({
        ...lease,
        expiresAt:
          "2026-10-08T08:05:00+04:00",
      }),
    ).toThrow(
      "Worker lease expiresAt must be an explicit UTC ISO-8601 timestamp.",
    );
  });

  it("requires expiry after claim time", () => {
    expect(() =>
      validateWorkerJobLease({
        ...lease,
        expiresAt:
          "2026-10-08T04:00:00Z",
      }),
    ).toThrow(
      "Worker lease expiresAt must be later than claimedAt.",
    );
  });

  it("treats the lease as active before expiry", () => {
    expect(
      isWorkerLeaseExpired(
        lease,
        "2026-10-08T04:04:59Z",
      ),
    ).toBe(false);
  });

  it("treats the lease as expired exactly at expiresAt", () => {
    expect(
      isWorkerLeaseExpired(
        lease,
        "2026-10-08T04:05:00Z",
      ),
    ).toBe(true);
  });

  it("accepts mutation only from the current lease owner and token", () => {
    expect(() =>
      assertWorkerLeaseOwnership(
        lease,
        "worker-a",
        "claim-token-a",
      ),
    ).not.toThrow();
  });

  it("rejects a stale or foreign worker owner", () => {
    expect(() =>
      assertWorkerLeaseOwnership(
        lease,
        "worker-b",
        "claim-token-a",
      ),
    ).toThrow(
      "Worker lease ownership mismatch.",
    );
  });

  it("rejects a stale claim token", () => {
    expect(() =>
      assertWorkerLeaseOwnership(
        lease,
        "worker-a",
        "old-token",
      ),
    ).toThrow(
      "Worker lease ownership mismatch.",
    );
  });

  it("requeues an expired claim that never started execution", () => {
    expect(
      workerLeaseRecoveryDisposition(
        "claimed",
        lease,
        "2026-10-08T04:06:00Z",
      ),
    ).toBe(
      "requeue",
    );
  });

  it("sends expired running work to retry_wait", () => {
    expect(
      workerLeaseRecoveryDisposition(
        "running",
        lease,
        "2026-10-08T04:06:00Z",
      ),
    ).toBe(
      "retry_wait",
    );
  });

  it("does nothing while a lease remains active", () => {
    expect(
      workerLeaseRecoveryDisposition(
        "running",
        lease,
        "2026-10-08T04:04:00Z",
      ),
    ).toBe(
      "none",
    );
  });

  it("does not recover terminal work merely because an old lease expired", () => {
    expect(
      workerLeaseRecoveryDisposition(
        "succeeded",
        lease,
        "2026-10-08T04:06:00Z",
      ),
    ).toBe(
      "none",
    );
  });
});
