import type {
  StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

const fixture = {
  fixtureId:
    "worker/worker-v1-matrix",

  fixtureVersion: 1,
} as const;

function approved(
  scenarioId: string,
  expected: unknown,
  rationale: string,
): StoreAgentGoldenOutput<unknown> {
  return {
    goldenSchemaVersion: 1,

    id:
      scenarioId,

    scenarioId,

    configurationVersion:
      "worker-config-v1",

    fixture,

    expected,

    review: {
      status:
        "approved",

      rationale,
    },
  };
}

export const workerV1Goldens:
  readonly StoreAgentGoldenOutput<unknown>[] = [
    approved(
      "worker/idempotency-subject-order-stable-v1",
      true,
      "Subject ordering must not change logical worker identity.",
    ),

    approved(
      "worker/idempotency-operation-change-v1",
      true,
      "A different logical operation must produce different job identity.",
    ),

    approved(
      "worker/idempotency-subject-change-v1",
      true,
      "A material canonical subject change must produce different job identity.",
    ),

    approved(
      "worker/enqueue-new-logical-job-v1",
      {
        disposition:
          "create",

        idempotencyKey:
          "job-key-1",
      },
      "An absent logical job may be created.",
    ),

    approved(
      "worker/enqueue-duplicate-active-v1",
      {
        disposition:
          "duplicate_active",

        idempotencyKey:
          "job-key-1",
      },
      "An active logical duplicate must not become a second execution record.",
    ),

    approved(
      "worker/enqueue-duplicate-terminal-v1",
      {
        disposition:
          "duplicate_terminal",

        idempotencyKey:
          "job-key-1",
      },
      "A terminal logical duplicate remains distinguishable from new work.",
    ),

    approved(
      "worker/lifecycle-queued-to-claimed-v1",
      true,
      "Queued work may be claimed.",
    ),

    approved(
      "worker/lifecycle-running-to-retry-wait-v1",
      true,
      "A started failed attempt may enter retry_wait.",
    ),

    approved(
      "worker/lifecycle-terminal-cannot-resurrect-v1",
      false,
      "Terminal successful work cannot silently return to queued.",
    ),

    approved(
      "worker/lease-active-no-recovery-v1",
      "none",
      "An active lease requires no recovery.",
    ),

    approved(
      "worker/lease-expired-claimed-requeues-v1",
      "requeue",
      "Expired claimed work may safely return to queued because business execution never started.",
    ),

    approved(
      "worker/lease-expired-running-retries-v1",
      "retry_wait",
      "Expired running work must recover through retry_wait because partial execution may have occurred.",
    ),

    approved(
      "worker/mutation-fence-valid-owner-v1",
      {
        ok: true,
      },
      "The current lease owner with the current claim token may mutate execution state.",
    ),

    approved(
      "worker/mutation-fence-stale-owner-v1",
      {
        ok: false,
      },
      "A stale or different worker owner must be fenced out.",
    ),

    approved(
      "worker/mutation-fence-stale-token-v1",
      {
        ok: false,
      },
      "A stale claim token must be fenced out.",
    ),

    approved(
      "worker/retry-transient-first-attempt-v1",
      {
        disposition:
          "retry",

        delaySeconds:
          30,
      },
      "The first transient dependency failure retries after the frozen base delay.",
    ),

    approved(
      "worker/retry-rate-limit-second-attempt-v1",
      {
        disposition:
          "retry",

        delaySeconds:
          60,
      },
      "Retry delay grows deterministically and rate limiting remains retryable.",
    ),

    approved(
      "worker/retry-timeout-fourth-attempt-v1",
      {
        disposition:
          "retry",

        delaySeconds:
          240,
      },
      "The fourth started attempt still has retry budget under maxAttempts five.",
    ),

    approved(
      "worker/retry-max-attempts-terminal-v1",
      {
        disposition:
          "fail",

        delaySeconds:
          null,
      },
      "Attempt five exhausts the frozen retry budget.",
    ),

    approved(
      "worker/retry-authorization-fails-immediately-v1",
      {
        disposition:
          "fail",

        delaySeconds:
          null,
      },
      "Authorization failures are not retryable.",
    ),

    approved(
      "worker/retry-validation-fails-immediately-v1",
      {
        disposition:
          "fail",

        delaySeconds:
          null,
      },
      "Validation failures are not retryable.",
    ),

    approved(
      "worker/failure-retry-exhausted-v1",
      "retry_exhausted",
      "A retryable class may become terminal only after retry exhaustion.",
    ),

    approved(
      "worker/failure-authorization-v1",
      "authorization_failed",
      "Authorization failure receives an explicit terminal reason.",
    ),

    approved(
      "worker/dead-work-record-v1",
      true,
      "Terminal failure remains durable dead work for operator/runtime visibility.",
    ),

    approved(
      "worker/scope-matching-owned-reference-v1",
      {
        ok: true,
      },
      "Canonical owned references matching trusted organization and store scope may execute.",
    ),

    approved(
      "worker/scope-cross-org-reference-denied-v1",
      {
        ok: false,
      },
      "A worker may not operate on a canonical reference owned by another organization.",
    ),

    approved(
      "worker/scope-cross-store-reference-denied-v1",
      {
        ok: false,
      },
      "A store-scoped worker may not operate on another store's canonical reference.",
    ),

    approved(
      "worker/sync-run-retry-wait-not-business-status-v1",
      false,
      "retry_wait is infrastructure state and must not directly own SyncRun business status.",
    ),

    approved(
      "worker/sync-run-completed-with-errors-v1",
      "completed_with_errors",
      "Canonical SyncRun preserves completed_with_errors as distinct from failed.",
    ),

    approved(
      "worker/sync-run-terminal-failure-v1",
      "failed",
      "Explicit terminal synchronization failure maps to failed SyncRun.",
    ),

    approved(
      "worker/pipeline-job-maps-forecast-v1",
      "forecast",
      "Forecast-generation jobs map to the deterministic forecast stage.",
    ),

    approved(
      "worker/pipeline-provider-sync-outside-numeric-pipeline-v1",
      null,
      "Provider synchronization is not a deterministic numeric-truth pipeline stage.",
    ),

    approved(
      "worker/pipeline-forecast-blocked-before-metrics-v1",
      {
        ready: false,
        reason:
          "METRICS_NOT_READY",
      },
      "Forecast cannot run before metrics are ready.",
    ),

    approved(
      "worker/pipeline-decision-blocked-before-forecast-v1",
      {
        ready: false,
        reason:
          "FORECAST_NOT_READY",
      },
      "Decision generation cannot run before deterministic forecast readiness.",
    ),

    approved(
      "worker/pipeline-ai-blocked-before-decision-v1",
      {
        ready: false,
        reason:
          "DECISION_NOT_READY",
      },
      "AI explanation cannot run before deterministic decision truth exists.",
    ),

    approved(
      "worker/pipeline-ai-ready-after-decision-v1",
      {
        ready: true,
        reason:
          null,
      },
      "AI explanation may begin only after deterministic decision readiness.",
    ),

    approved(
      "worker/scheduled-trigger-never-establishes-tenant-v1",
      false,
      "Scheduled trigger provenance never establishes tenant ownership.",
    ),

    approved(
      "worker/event-trigger-never-establishes-tenant-v1",
      false,
      "Event trigger identifiers never establish tenant ownership.",
    ),
  ];
