import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assessWorkerEnqueue,
  assertWorkerMutationFence,
} from "@/workers/concurrency";

const lease = {
  ownerId:
    "worker-new",

  claimToken:
    "claim-new",

  claimedAt:
    "2026-10-08T06:30:00Z",

  expiresAt:
    "2026-10-08T06:35:00Z",
};

describe("worker concurrency and duplicate-execution protection", () => {
  it("creates work when no logical job exists", () => {
    expect(
      assessWorkerEnqueue(
        null,
        "job-key-1",
      ),
    ).toEqual({
      disposition:
        "create",

      idempotencyKey:
        "job-key-1",
    });
  });

  it("classifies duplicate queued work as active duplicate", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",

          status:
            "queued",
        },
        "job-key-1",
      ),
    ).toEqual({
      disposition:
        "duplicate_active",

      idempotencyKey:
        "job-key-1",
    });
  });

  it("classifies duplicate claimed work as active duplicate", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",

          status:
            "claimed",
        },
        "job-key-1",
      ).disposition,
    ).toBe(
      "duplicate_active",
    );
  });

  it("classifies duplicate running work as active duplicate", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",

          status:
            "running",
        },
        "job-key-1",
      ).disposition,
    ).toBe(
      "duplicate_active",
    );
  });

  it("classifies retry-wait work as an active logical job", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",

          status:
            "retry_wait",
        },
        "job-key-1",
      ).disposition,
    ).toBe(
      "duplicate_active",
    );
  });

  it("classifies duplicate succeeded work as terminal duplicate", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",

          status:
            "succeeded",
        },
        "job-key-1",
      ).disposition,
    ).toBe(
      "duplicate_terminal",
    );
  });

  it("classifies duplicate failed work as terminal duplicate", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",

          status:
            "failed",
        },
        "job-key-1",
      ).disposition,
    ).toBe(
      "duplicate_terminal",
    );
  });

  it("classifies duplicate cancelled work as terminal duplicate", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",

          status:
            "cancelled",
        },
        "job-key-1",
      ).disposition,
    ).toBe(
      "duplicate_terminal",
    );
  });

  it("does not silently compare an unrelated existing job", () => {
    expect(() =>
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-existing",

          status:
            "queued",
        },
        "job-key-incoming",
      ),
    ).toThrow(
      "Existing worker job does not match the incoming logical idempotency identity.",
    );
  });

  it("rejects blank incoming logical identity", () => {
    expect(() =>
      assessWorkerEnqueue(
        null,
        " ",
      ),
    ).toThrow(
      "Worker concurrency incoming idempotencyKey must not be empty.",
    );
  });

  it("allows mutation by the current lease owner", () => {
    expect(() =>
      assertWorkerMutationFence(
        lease,
        "worker-new",
        "claim-new",
      ),
    ).not.toThrow();
  });

  it("fences a stale worker owner", () => {
    expect(() =>
      assertWorkerMutationFence(
        lease,
        "worker-old",
        "claim-new",
      ),
    ).toThrow(
      "Worker lease ownership mismatch.",
    );
  });

  it("fences a stale claim token after reclaim", () => {
    expect(() =>
      assertWorkerMutationFence(
        lease,
        "worker-new",
        "claim-old",
      ),
    ).toThrow(
      "Worker lease ownership mismatch.",
    );
  });
});
