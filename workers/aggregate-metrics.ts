import type {
  ClaimedMetricRecompute,
  MetricRecomputeExecutor,
  MetricRecomputeQueue,
  MetricRecomputeQueueStats,
} from "@/lib/persistence/metric-recompute-queue";

import {
  buildWorkerIdempotencyKey,
} from "./idempotency";

import {
  buildWorkerTelemetryEvent,
} from "./observability";

import {
  DEFAULT_WORKER_RETRY_POLICY,
  validateWorkerRetryPolicy,
  workerRetryDelaySeconds,
} from "./retry";

import {
  assertWorkerExecutionScope,
} from "./scope";

import type {
  WorkerTelemetryEvent,
  WorkerTelemetryEventType,
  WorkerTelemetryLevel,
} from "./types";

/**
 * M5.6C metric recompute tick.
 *
 * Order: consume source events, recover expired leases, claim, then for
 * each claim start -> frozen M5.5 recompute -> complete or fail.
 *
 * Durable correctness lives in PostgreSQL: the claim lock, lease tokens,
 * lease expiry at the database clock, and generation checks. Timers here
 * only bound how long this process waits. A killed process leaves leases
 * that expire and are recovered by a later tick.
 *
 * This stage stops at persisted metrics. It does not call forecast,
 * decision, AI explanation, or SyncRun orchestration.
 */

export const METRIC_RECOMPUTE_JOB_TYPE =
  "metrics_aggregation" as const;

export const METRIC_RECOMPUTE_PURPOSE =
  "metrics_aggregation.sku_daily_metric_recompute";

export interface MetricRecomputeWorkerSettings {
  maxActive: number;
  claimLimit: number;
  leaseSeconds: number;
  itemDeadlineMs: number;
  tickBudgetMs: number;
  completionReserveMs: number;
  consumeBatchSize: number;
  maxConsumeBatches: number;
}

/**
 * M5.7 Phase 5B F2 containment defaults: single-flight commits.
 * Optional env overrides (METRIC_RECOMPUTE_MAX_ACTIVE /
 * METRIC_RECOMPUTE_CLAIM_LIMIT) are resolved by
 * readMetricRecomputeWorkerConfig; absent env keeps these 1/1 values.
 */
export const METRIC_RECOMPUTE_WORKER_SETTINGS:
  Readonly<MetricRecomputeWorkerSettings> =
    Object.freeze({
      maxActive: 1,
      claimLimit: 1,
      leaseSeconds: 120,
      itemDeadlineMs: 40_000,
      tickBudgetMs: 45_000,
      completionReserveMs: 2_000,
      consumeBatchSize: 500,
      maxConsumeBatches: 4,
    });

export function validateMetricRecomputeWorkerSettings(
  settings: MetricRecomputeWorkerSettings,
): MetricRecomputeWorkerSettings {
  const integer = (
    value: number,
    min: number,
    max: number,
    field: string,
  ): void => {
    if (
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    ) {
      throw new Error(
        `Metric recompute ${field} must be an integer from ${min} to ${max}.`,
      );
    }
  };

  integer(settings.maxActive, 1, 4, "maxActive");
  integer(settings.claimLimit, 1, 4, "claimLimit");
  integer(settings.leaseSeconds, 30, 900, "leaseSeconds");
  integer(settings.itemDeadlineMs, 1_000, 300_000, "itemDeadlineMs");
  integer(settings.tickBudgetMs, 1_000, 300_000, "tickBudgetMs");
  integer(settings.completionReserveMs, 0, 60_000, "completionReserveMs");
  integer(settings.consumeBatchSize, 1, 5_000, "consumeBatchSize");
  integer(settings.maxConsumeBatches, 0, 50, "maxConsumeBatches");

  /**
   * The lease must outlive the item deadline plus completion, so a
   * healthy worker never finishes against an expired lease.
   */
  if (
    settings.itemDeadlineMs + settings.completionReserveMs >=
    settings.leaseSeconds * 1_000
  ) {
    throw new Error(
      "Metric recompute lease must exceed the item deadline plus completion reserve.",
    );
  }

  return settings;
}

export interface MetricRecomputeTickDependencies {
  queue: MetricRecomputeQueue;
  execute: MetricRecomputeExecutor;

  /**
   * Infrastructure worker identity for this tick. Not tenant identity.
   */
  ownerId: string;

  /**
   * Milliseconds since epoch. Used for the local budget and telemetry
   * timestamps only, never for lease decisions.
   */
  now: () => number;

  emit: (event: WorkerTelemetryEvent) => void;

  settings?: MetricRecomputeWorkerSettings;
}

export interface MetricRecomputeTickResult {
  consumedEvents: number;
  recoveredRequeued: number;
  recoveredRetryScheduled: number;
  recoveredFailed: number;
  claimed: number;
  started: number;
  succeeded: number;
  superseded: number;
  deferred: number;
  retryScheduled: number;
  failed: number;
  fenced: number;
  queueErrors: number;
  rounds: number;
  stoppedReason: "drained" | "budget" | "queue_error";
  durationMs: number;
  stats: MetricRecomputeQueueStats | null;
}

function emptyResult(): MetricRecomputeTickResult {
  return {
    consumedEvents: 0,
    recoveredRequeued: 0,
    recoveredRetryScheduled: 0,
    recoveredFailed: 0,
    claimed: 0,
    started: 0,
    succeeded: 0,
    superseded: 0,
    deferred: 0,
    retryScheduled: 0,
    failed: 0,
    fenced: 0,
    queueErrors: 0,
    rounds: 0,
    stoppedReason: "drained",
    durationMs: 0,
    stats: null,
  };
}

export function metricRecomputeIdempotencyKey(
  claim: ClaimedMetricRecompute,
): string {
  /**
   * The generation is part of the logical identity, so a newly dirtied
   * generation is new work rather than a duplicate terminal job.
   */
  return buildWorkerIdempotencyKey({
    jobType: METRIC_RECOMPUTE_JOB_TYPE,
    organizationId: claim.organizationId,
    storeId: claim.storeId,
    operationKey: [
      "sku_daily_metric",
      claim.algorithmVersion,
      claim.metricDate,
      "generation",
      String(claim.claimedGeneration),
    ].join(":"),
    subjects: [
      {
        resourceType: "location",
        resourceId: claim.locationId,
      },
      {
        resourceType: "product_variant",
        resourceId: claim.variantId,
      },
    ],
  });
}

export async function runMetricRecomputeTick(
  deps: MetricRecomputeTickDependencies,
): Promise<MetricRecomputeTickResult> {
  const settings =
    validateMetricRecomputeWorkerSettings(
      deps.settings ??
        METRIC_RECOMPUTE_WORKER_SETTINGS,
    );
  const retryPolicy =
    validateWorkerRetryPolicy(
      DEFAULT_WORKER_RETRY_POLICY,
    );
  const startedAt =
    deps.now();
  const elapsed = () =>
    deps.now() - startedAt;
  const result =
    emptyResult();

  const emit = (
    level: WorkerTelemetryLevel,
    eventType: WorkerTelemetryEventType,
    claim: ClaimedMetricRecompute,
    attemptCount: number | null,
    code: string | null,
    message: string | null,
    executeDurationMs: number | null = null,
  ): void => {
    deps.emit(
      buildWorkerTelemetryEvent({
        level,
        eventType,
        context: {
          idempotencyKey:
            metricRecomputeIdempotencyKey(claim),
          jobType: METRIC_RECOMPUTE_JOB_TYPE,
          organizationId: claim.organizationId,
          storeId: claim.storeId,
          executionId: deps.ownerId,
          canonicalRunId: null,
          attemptCount,
        },
        code,
        message,
        occurredAt: new Date(deps.now()).toISOString(),
        executeDurationMs,
      }),
    );
  };

  // 1. Bounded consumption. M5.6B locks events with SKIP LOCKED and
  //    upserts requests in one transaction per call.
  for (
    let batch = 0;
    batch < settings.maxConsumeBatches;
    batch += 1
  ) {
    if (elapsed() >= settings.tickBudgetMs) {
      break;
    }

    try {
      const consumed =
        await deps.queue.consume(
          settings.consumeBatchSize,
        );
      result.consumedEvents += consumed;

      if (consumed < settings.consumeBatchSize) {
        break;
      }
    } catch {
      result.queueErrors += 1;
      break;
    }
  }

  const executeClaim = async (
    claim: ClaimedMetricRecompute,
  ): Promise<void> => {
    emit("info", "job_claimed", claim, claim.attemptCount, null, null);

    try {
      assertWorkerExecutionScope({
        scope: {
          organizationId: claim.organizationId,
          storeId: claim.storeId,
          purpose: METRIC_RECOMPUTE_PURPOSE,
        },
        ownedReferences: [
          {
            resourceType: "location",
            resourceId: claim.locationId,
            organizationId: claim.organizationId,
            storeId: claim.storeId,
          },
          {
            resourceType: "product_variant",
            resourceId: claim.variantId,
            organizationId: claim.organizationId,
            storeId: claim.storeId,
          },
        ],
      });
    } catch {
      // The claim stays leased and will expire into recovery.
      emit("error", "scope_denied", claim, claim.attemptCount, "SCOPE_DENIED", null);
      result.queueErrors += 1;
      return;
    }

    const started =
      await deps.queue.start(
        claim,
        settings.leaseSeconds,
      );

    if (started === null) {
      result.fenced += 1;
      emit("warn", "lease_expired", claim, claim.attemptCount, "LEASE_FENCED", "start was fenced");
      return;
    }

    result.started += 1;
    emit("info", "job_started", claim, started.attemptCount, null, null);

    const executeStartedAt =
      deps.now();
    const outcome =
      await deps.execute(
        claim,
        settings.itemDeadlineMs,
      );
    const executeDurationMs =
      Math.max(0, deps.now() - executeStartedAt);

    if (outcome.ok) {
      const completion =
        await deps.queue.complete(claim);

      switch (completion) {
        case "succeeded":
          result.succeeded += 1;
          emit(
            "info",
            "job_succeeded",
            claim,
            started.attemptCount,
            null,
            null,
            executeDurationMs,
          );
          return;

        case "superseded":
          result.superseded += 1;
          emit(
            "info",
            "job_cancelled",
            claim,
            started.attemptCount,
            "GENERATION_SUPERSEDED",
            "newer generation queued",
            executeDurationMs,
          );
          return;

        case "deferred":
          result.deferred += 1;
          emit(
            "info",
            "job_retry_scheduled",
            claim,
            started.attemptCount,
            "UNCONSUMED_SOURCE_EVENT",
            "relevant source event not yet consumed",
            executeDurationMs,
          );
          return;

        case "fenced":
          result.fenced += 1;
          emit(
            "warn",
            "lease_expired",
            claim,
            started.attemptCount,
            "LEASE_FENCED",
            "completion was fenced",
            executeDurationMs,
          );
          return;
      }
    }

    const delaySeconds =
      workerRetryDelaySeconds(
        Math.max(started.attemptCount, 1),
        retryPolicy,
      );
    const failureOutcome =
      await deps.queue.fail(
        claim,
        outcome.failure,
        delaySeconds,
        retryPolicy.maxAttempts,
      );

    switch (failureOutcome) {
      case "retry_scheduled":
        result.retryScheduled += 1;
        emit(
          "warn",
          "job_retry_scheduled",
          claim,
          started.attemptCount,
          outcome.failure.code,
          outcome.failure.message,
          executeDurationMs,
        );
        return;

      case "failed":
        result.failed += 1;
        emit(
          "error",
          "job_failed",
          claim,
          started.attemptCount,
          outcome.failure.code,
          outcome.failure.message,
          executeDurationMs,
        );
        return;

      case "superseded":
        result.superseded += 1;
        emit(
          "info",
          "job_cancelled",
          claim,
          started.attemptCount,
          "GENERATION_SUPERSEDED",
          "newer generation queued",
          executeDurationMs,
        );
        return;

      case "fenced":
        result.fenced += 1;
        emit(
          "warn",
          "lease_expired",
          claim,
          started.attemptCount,
          "LEASE_FENCED",
          "failure report was fenced",
          executeDurationMs,
        );
        return;
    }
  };

  // 2. Rounds: recover, claim, execute. A round starts only when a full
  //    item deadline plus completion still fits in the tick budget.
  result.stoppedReason = "budget";

  while (
    elapsed() +
      settings.itemDeadlineMs +
      settings.completionReserveMs <=
    settings.tickBudgetMs
  ) {
    let claims: ClaimedMetricRecompute[];

    try {
      const recovered =
        await deps.queue.recover({
          maxAttempts: retryPolicy.maxAttempts,
          baseDelaySeconds: retryPolicy.baseDelaySeconds,
          maxDelaySeconds: retryPolicy.maxDelaySeconds,
        });
      result.recoveredRequeued += recovered.requeued;
      result.recoveredRetryScheduled += recovered.retryScheduled;
      result.recoveredFailed += recovered.failed;

      claims =
        await deps.queue.claim({
          ownerId: deps.ownerId,
          limit: settings.claimLimit,
          leaseSeconds: settings.leaseSeconds,
          maxActive: settings.maxActive,
        });
    } catch {
      result.queueErrors += 1;
      result.stoppedReason = "queue_error";
      break;
    }

    if (claims.length === 0) {
      result.stoppedReason = "drained";
      break;
    }

    result.rounds += 1;
    result.claimed += claims.length;

    const settled =
      await Promise.allSettled(
        claims.map(executeClaim),
      );

    for (const item of settled) {
      if (item.status === "rejected") {
        // A queue RPC failed mid-item. The lease expires into recovery.
        result.queueErrors += 1;
      }
    }
  }

  try {
    result.stats =
      await deps.queue.stats();
  } catch {
    result.queueErrors += 1;
  }

  result.durationMs =
    elapsed();

  return result;
}
