import type {
  WorkerJobStatus,
  WorkerJobTerminalStatus,
} from "./types";

const ALLOWED_TRANSITIONS:
  Readonly<
    Record<
      WorkerJobStatus,
      readonly WorkerJobStatus[]
    >
  > = {
    queued: [
      "claimed",
      "cancelled",
    ],

    claimed: [
      "queued",
      "running",
      "cancelled",
    ],

    running: [
      "retry_wait",
      "succeeded",
      "failed",
      "cancelled",
    ],

    retry_wait: [
      "queued",
      "cancelled",
    ],

    succeeded: [],
    failed: [],
    cancelled: [],
  };

export function isWorkerJobTerminalStatus(
  status: WorkerJobStatus,
): status is WorkerJobTerminalStatus {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function canTransitionWorkerJob(
  from: WorkerJobStatus,
  to: WorkerJobStatus,
): boolean {
  return ALLOWED_TRANSITIONS[
    from
  ].includes(to);
}

export function assertWorkerJobTransition(
  from: WorkerJobStatus,
  to: WorkerJobStatus,
): void {
  if (
    !canTransitionWorkerJob(
      from,
      to,
    )
  ) {
    throw new Error(
      `Invalid worker job transition: ${from} -> ${to}.`,
    );
  }
}

/**
 * Returns the allowed next infrastructure states.
 *
 * A copy is returned so callers cannot mutate the frozen transition map.
 */
export function allowedWorkerJobTransitions(
  status: WorkerJobStatus,
): WorkerJobStatus[] {
  return [
    ...ALLOWED_TRANSITIONS[
      status
    ],
  ];
}
