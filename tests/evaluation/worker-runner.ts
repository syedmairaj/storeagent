import {
  assessWorkerEnqueue,
  assertWorkerMutationFence,
} from "@/workers/concurrency";

import {
  buildWorkerTerminalFailureRecord,
  terminalFailureReasonForClass,
  workerFailureIsDeadWork,
} from "@/workers/failure";

import {
  buildWorkerIdempotencyKey,
} from "@/workers/idempotency";

import {
  workerLeaseRecoveryDisposition,
} from "@/workers/lease";

import {
  canTransitionWorkerJob,
} from "@/workers/lifecycle";

import {
  assessPipelineStageReadiness,
  pipelineStageForJobType,
} from "@/workers/pipeline";

import {
  decideWorkerRetry,
} from "@/workers/retry";

import {
  assertWorkerExecutionScope,
} from "@/workers/scope";

import {
  syncRunStatusForWorkerOutcome,
  workerStatusMayDirectlyOwnSyncRunStatus,
} from "@/workers/sync-run";

import {
  triggerEstablishesTenantOwnership,
} from "@/workers/trigger";

import type {
  WorkerIdempotencyInput,
} from "@/workers/idempotency";

import type {
  BuildWorkerTerminalFailureInput,
} from "@/workers/failure";

import type {
  WorkerScopeValidationInput,
} from "@/workers/scope";

import type {
  SyncRunWorkerOutcome,
} from "@/workers/sync-run";

import type {
  ExistingWorkerJobIdentity,
  InventoryIntelligencePipelineStage,
  InventoryIntelligencePipelineState,
  StoreAgentJobType,
  WorkerFailureClass,
  WorkerJobLease,
  WorkerJobStatus,
  WorkerTrigger,
} from "@/workers/types";

type GuardResult =
  | {
      ok: true;
    }
  | {
      ok: false;
    };

function runGuard(
  callback: () => void,
): GuardResult {
  try {
    callback();

    return {
      ok: true,
    };
  } catch {
    return {
      ok: false,
    };
  }
}

export type WorkerEvaluationInput =
  | {
      operation:
        "idempotency_equal";

      input: {
        first:
          WorkerIdempotencyInput;

        second:
          WorkerIdempotencyInput;
      };
    }
  | {
      operation:
        "idempotency_distinct";

      input: {
        first:
          WorkerIdempotencyInput;

        second:
          WorkerIdempotencyInput;
      };
    }
  | {
      operation:
        "enqueue";

      input: {
        existing:
          ExistingWorkerJobIdentity | null;

        incomingIdempotencyKey:
          string;
      };
    }
  | {
      operation:
        "lifecycle_transition";

      input: {
        from:
          WorkerJobStatus;

        to:
          WorkerJobStatus;
      };
    }
  | {
      operation:
        "lease_recovery";

      input: {
        status:
          WorkerJobStatus;

        lease:
          WorkerJobLease;

        now:
          string;
      };
    }
  | {
      operation:
        "mutation_fence";

      input: {
        lease:
          WorkerJobLease;

        ownerId:
          string;

        claimToken:
          string;
      };
    }
  | {
      operation:
        "retry";

      input: {
        failureClass:
          WorkerFailureClass;

        attemptCount:
          number;
      };
    }
  | {
      operation:
        "terminal_failure_reason";

      input: {
        failureClass:
          WorkerFailureClass;

        retryExhausted:
          boolean;
      };
    }
  | {
      operation:
        "terminal_failure_record";

      input:
        BuildWorkerTerminalFailureInput;
    }
  | {
      operation:
        "dead_work";

      input:
        BuildWorkerTerminalFailureInput;
    }
  | {
      operation:
        "scope_guard";

      input:
        WorkerScopeValidationInput;
    }
  | {
      operation:
        "sync_run_outcome";

      input:
        SyncRunWorkerOutcome;
    }
  | {
      operation:
        "worker_status_owns_sync_run";

      input:
        WorkerJobStatus;
    }
  | {
      operation:
        "pipeline_stage";

      input:
        StoreAgentJobType;
    }
  | {
      operation:
        "pipeline_readiness";

      input: {
        stage:
          InventoryIntelligencePipelineStage;

        state:
          InventoryIntelligencePipelineState;
      };
    }
  | {
      operation:
        "trigger_establishes_tenant";

      input:
        WorkerTrigger;
    };

export function runWorkerEvaluationCase(
  evaluation:
    WorkerEvaluationInput,
): unknown {
  switch (
    evaluation.operation
  ) {
    case "idempotency_equal":
      return (
        buildWorkerIdempotencyKey(
          evaluation.input.first,
        ) ===
        buildWorkerIdempotencyKey(
          evaluation.input.second,
        )
      );

    case "idempotency_distinct":
      return (
        buildWorkerIdempotencyKey(
          evaluation.input.first,
        ) !==
        buildWorkerIdempotencyKey(
          evaluation.input.second,
        )
      );

    case "enqueue":
      return assessWorkerEnqueue(
        evaluation.input.existing,
        evaluation.input
          .incomingIdempotencyKey,
      );

    case "lifecycle_transition":
      return canTransitionWorkerJob(
        evaluation.input.from,
        evaluation.input.to,
      );

    case "lease_recovery":
      return workerLeaseRecoveryDisposition(
        evaluation.input.status,
        evaluation.input.lease,
        evaluation.input.now,
      );

    case "mutation_fence":
      return runGuard(() =>
        assertWorkerMutationFence(
          evaluation.input.lease,
          evaluation.input.ownerId,
          evaluation.input.claimToken,
        ),
      );

    case "retry":
      return decideWorkerRetry(
        evaluation.input.failureClass,
        evaluation.input.attemptCount,
      );

    case "terminal_failure_reason":
      return terminalFailureReasonForClass(
        evaluation.input.failureClass,
        evaluation.input.retryExhausted,
      );

    case "terminal_failure_record":
      return buildWorkerTerminalFailureRecord(
        evaluation.input,
      );

    case "dead_work":
      return workerFailureIsDeadWork(
        buildWorkerTerminalFailureRecord(
          evaluation.input,
        ),
      );

    case "scope_guard":
      return runGuard(() =>
        assertWorkerExecutionScope(
          evaluation.input,
        ),
      );

    case "sync_run_outcome":
      return syncRunStatusForWorkerOutcome(
        evaluation.input,
      );

    case "worker_status_owns_sync_run":
      return workerStatusMayDirectlyOwnSyncRunStatus(
        evaluation.input,
      );

    case "pipeline_stage":
      return pipelineStageForJobType(
        evaluation.input,
      );

    case "pipeline_readiness":
      return assessPipelineStageReadiness(
        evaluation.input.stage,
        evaluation.input.state,
      );

    case "trigger_establishes_tenant":
      return triggerEstablishesTenantOwnership(
        evaluation.input,
      );
  }
}
