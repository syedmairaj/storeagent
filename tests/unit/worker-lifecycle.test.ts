import {
  describe,
  expect,
  it,
} from "vitest";

import {
  allowedWorkerJobTransitions,
  assertWorkerJobTransition,
  canTransitionWorkerJob,
  isWorkerJobTerminalStatus,
} from "@/workers/lifecycle";

describe("worker job lifecycle", () => {
  it("allows queued jobs to be claimed", () => {
    expect(
      canTransitionWorkerJob(
        "queued",
        "claimed",
      ),
    ).toBe(true);
  });

  it("allows claimed jobs to begin running", () => {
    expect(
      canTransitionWorkerJob(
        "claimed",
        "running",
      ),
    ).toBe(true);
  });

  it("allows a safely abandoned claim to return to queued", () => {
    expect(
      canTransitionWorkerJob(
        "claimed",
        "queued",
      ),
    ).toBe(true);
  });

  it("allows running work to enter retry wait", () => {
    expect(
      canTransitionWorkerJob(
        "running",
        "retry_wait",
      ),
    ).toBe(true);
  });

  it("allows retry-wait work to become queued again", () => {
    expect(
      canTransitionWorkerJob(
        "retry_wait",
        "queued",
      ),
    ).toBe(true);
  });

  it("allows running work to succeed", () => {
    expect(
      canTransitionWorkerJob(
        "running",
        "succeeded",
      ),
    ).toBe(true);
  });

  it("allows running work to fail terminally", () => {
    expect(
      canTransitionWorkerJob(
        "running",
        "failed",
      ),
    ).toBe(true);
  });

  it("allows cancellation from non-terminal lifecycle states", () => {
    for (
      const status of [
        "queued",
        "claimed",
        "running",
        "retry_wait",
      ] as const
    ) {
      expect(
        canTransitionWorkerJob(
          status,
          "cancelled",
        ),
      ).toBe(true);
    }
  });

  it("treats succeeded, failed, and cancelled as terminal", () => {
    expect(
      isWorkerJobTerminalStatus(
        "succeeded",
      ),
    ).toBe(true);

    expect(
      isWorkerJobTerminalStatus(
        "failed",
      ),
    ).toBe(true);

    expect(
      isWorkerJobTerminalStatus(
        "cancelled",
      ),
    ).toBe(true);
  });

  it("does not treat retry_wait as terminal", () => {
    expect(
      isWorkerJobTerminalStatus(
        "retry_wait",
      ),
    ).toBe(false);
  });

  it("forbids transitions out of terminal states", () => {
    for (
      const status of [
        "succeeded",
        "failed",
        "cancelled",
      ] as const
    ) {
      expect(
        allowedWorkerJobTransitions(
          status,
        ),
      ).toEqual([]);
    }
  });

  it("forbids skipping directly from queued to running", () => {
    expect(
      canTransitionWorkerJob(
        "queued",
        "running",
      ),
    ).toBe(false);
  });

  it("forbids retry_wait directly from queued", () => {
    expect(
      canTransitionWorkerJob(
        "queued",
        "retry_wait",
      ),
    ).toBe(false);
  });

  it("fails closed on invalid transitions", () => {
    expect(() =>
      assertWorkerJobTransition(
        "succeeded",
        "queued",
      ),
    ).toThrow(
      "Invalid worker job transition: succeeded -> queued.",
    );
  });
});
