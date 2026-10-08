import type {
  StoreAgentEvaluationFixture,
} from "@/tests/evaluation/fixture";

import type {
  WorkerEvaluationInput,
} from "@/tests/evaluation/worker-runner";

export interface WorkerV1FixtureCase {
  readonly id: string;

  readonly evaluation:
    WorkerEvaluationInput;
}

const lease = {
  ownerId:
    "worker-a",

  claimToken:
    "claim-a",

  claimedAt:
    "2026-10-08T10:00:00.000Z",

  expiresAt:
    "2026-10-08T10:05:00.000Z",
} as const;

const baseJob = {
  jobType:
    "forecast_generation" as const,

  organizationId:
    "org-a",

  storeId:
    "store-a",

  operationKey:
    "forecast-run-1",

  subjects: [
    {
      resourceType:
        "product_variant",

      resourceId:
        "variant-a",
    },

    {
      resourceType:
        "location",

      resourceId:
        "location-a",
    },
  ],
};

export const workerV1Fixture:
  StoreAgentEvaluationFixture<{
    cases:
      readonly WorkerV1FixtureCase[];
  }> = {
    fixtureSchemaVersion: 1,

    id:
      "worker/worker-v1-matrix",

    domain:
      "worker",

    fixtureVersion: 1,

    description:
      "Deterministic worker, retry, concurrency, scope and pipeline evaluation inputs.",

    input: {
      cases: [
        {
          id:
            "worker/idempotency-subject-order-stable-v1",

          evaluation: {
            operation:
              "idempotency_equal",

            input: {
              first:
                baseJob,

              second: {
                ...baseJob,

                subjects: [
                  baseJob.subjects[1],
                  baseJob.subjects[0],
                ],
              },
            },
          },
        },

        {
          id:
            "worker/idempotency-operation-change-v1",

          evaluation: {
            operation:
              "idempotency_distinct",

            input: {
              first:
                baseJob,

              second: {
                ...baseJob,

                operationKey:
                  "forecast-run-2",
              },
            },
          },
        },

        {
          id:
            "worker/idempotency-subject-change-v1",

          evaluation: {
            operation:
              "idempotency_distinct",

            input: {
              first:
                baseJob,

              second: {
                ...baseJob,

                subjects: [
                  {
                    resourceType:
                      "product_variant",

                    resourceId:
                      "variant-b",
                  },
                ],
              },
            },
          },
        },

        {
          id:
            "worker/enqueue-new-logical-job-v1",

          evaluation: {
            operation:
              "enqueue",

            input: {
              existing:
                null,

              incomingIdempotencyKey:
                "job-key-1",
            },
          },
        },

        {
          id:
            "worker/enqueue-duplicate-active-v1",

          evaluation: {
            operation:
              "enqueue",

            input: {
              existing: {
                idempotencyKey:
                  "job-key-1",

                status:
                  "running",
              },

              incomingIdempotencyKey:
                "job-key-1",
            },
          },
        },

        {
          id:
            "worker/enqueue-duplicate-terminal-v1",

          evaluation: {
            operation:
              "enqueue",

            input: {
              existing: {
                idempotencyKey:
                  "job-key-1",

                status:
                  "succeeded",
              },

              incomingIdempotencyKey:
                "job-key-1",
            },
          },
        },

        {
          id:
            "worker/lifecycle-queued-to-claimed-v1",

          evaluation: {
            operation:
              "lifecycle_transition",

            input: {
              from:
                "queued",

              to:
                "claimed",
            },
          },
        },

        {
          id:
            "worker/lifecycle-running-to-retry-wait-v1",

          evaluation: {
            operation:
              "lifecycle_transition",

            input: {
              from:
                "running",

              to:
                "retry_wait",
            },
          },
        },

        {
          id:
            "worker/lifecycle-terminal-cannot-resurrect-v1",

          evaluation: {
            operation:
              "lifecycle_transition",

            input: {
              from:
                "succeeded",

              to:
                "queued",
            },
          },
        },

        {
          id:
            "worker/lease-active-no-recovery-v1",

          evaluation: {
            operation:
              "lease_recovery",

            input: {
              status:
                "running",

              lease,

              now:
                "2026-10-08T10:04:59.000Z",
            },
          },
        },

        {
          id:
            "worker/lease-expired-claimed-requeues-v1",

          evaluation: {
            operation:
              "lease_recovery",

            input: {
              status:
                "claimed",

              lease,

              now:
                "2026-10-08T10:05:00.000Z",
            },
          },
        },

        {
          id:
            "worker/lease-expired-running-retries-v1",

          evaluation: {
            operation:
              "lease_recovery",

            input: {
              status:
                "running",

              lease,

              now:
                "2026-10-08T10:05:00.000Z",
            },
          },
        },

        {
          id:
            "worker/mutation-fence-valid-owner-v1",

          evaluation: {
            operation:
              "mutation_fence",

            input: {
              lease,

              ownerId:
                "worker-a",

              claimToken:
                "claim-a",
            },
          },
        },

        {
          id:
            "worker/mutation-fence-stale-owner-v1",

          evaluation: {
            operation:
              "mutation_fence",

            input: {
              lease,

              ownerId:
                "worker-b",

              claimToken:
                "claim-a",
            },
          },
        },

        {
          id:
            "worker/mutation-fence-stale-token-v1",

          evaluation: {
            operation:
              "mutation_fence",

            input: {
              lease,

              ownerId:
                "worker-a",

              claimToken:
                "claim-old",
            },
          },
        },

        {
          id:
            "worker/retry-transient-first-attempt-v1",

          evaluation: {
            operation:
              "retry",

            input: {
              failureClass:
                "transient_dependency",

              attemptCount:
                1,
            },
          },
        },

        {
          id:
            "worker/retry-rate-limit-second-attempt-v1",

          evaluation: {
            operation:
              "retry",

            input: {
              failureClass:
                "rate_limited",

              attemptCount:
                2,
            },
          },
        },

        {
          id:
            "worker/retry-timeout-fourth-attempt-v1",

          evaluation: {
            operation:
              "retry",

            input: {
              failureClass:
                "timeout",

              attemptCount:
                4,
            },
          },
        },

        {
          id:
            "worker/retry-max-attempts-terminal-v1",

          evaluation: {
            operation:
              "retry",

            input: {
              failureClass:
                "transient_dependency",

              attemptCount:
                5,
            },
          },
        },

        {
          id:
            "worker/retry-authorization-fails-immediately-v1",

          evaluation: {
            operation:
              "retry",

            input: {
              failureClass:
                "authorization",

              attemptCount:
                1,
            },
          },
        },

        {
          id:
            "worker/retry-validation-fails-immediately-v1",

          evaluation: {
            operation:
              "retry",

            input: {
              failureClass:
                "validation",

              attemptCount:
                1,
            },
          },
        },

        {
          id:
            "worker/failure-retry-exhausted-v1",

          evaluation: {
            operation:
              "terminal_failure_reason",

            input: {
              failureClass:
                "timeout",

              retryExhausted:
                true,
            },
          },
        },

        {
          id:
            "worker/failure-authorization-v1",

          evaluation: {
            operation:
              "terminal_failure_reason",

            input: {
              failureClass:
                "authorization",

              retryExhausted:
                false,
            },
          },
        },

        {
          id:
            "worker/dead-work-record-v1",

          evaluation: {
            operation:
              "dead_work",

            input: {
              idempotencyKey:
                "job-key-1",

              jobType:
                "provider_sync",

              organizationId:
                "org-a",

              storeId:
                "store-a",

              attemptCount:
                5,

              reason:
                "retry_exhausted",

              errorCode:
                "PROVIDER_TIMEOUT",

              errorMessage:
                "Provider request timed out.",

              failedAt:
                "2026-10-08T10:30:00.000Z",
            },
          },
        },

        {
          id:
            "worker/scope-matching-owned-reference-v1",

          evaluation: {
            operation:
              "scope_guard",

            input: {
              scope: {
                organizationId:
                  "org-a",

                storeId:
                  "store-a",

                purpose:
                  "forecast_generation",
              },

              ownedReferences: [
                {
                  resourceType:
                    "product_variant",

                  resourceId:
                    "variant-a",

                  organizationId:
                    "org-a",

                  storeId:
                    "store-a",
                },
              ],
            },
          },
        },

        {
          id:
            "worker/scope-cross-org-reference-denied-v1",

          evaluation: {
            operation:
              "scope_guard",

            input: {
              scope: {
                organizationId:
                  "org-a",

                storeId:
                  "store-a",

                purpose:
                  "forecast_generation",
              },

              ownedReferences: [
                {
                  resourceType:
                    "product_variant",

                  resourceId:
                    "variant-b",

                  organizationId:
                    "org-b",

                  storeId:
                    "store-b",
                },
              ],
            },
          },
        },

        {
          id:
            "worker/scope-cross-store-reference-denied-v1",

          evaluation: {
            operation:
              "scope_guard",

            input: {
              scope: {
                organizationId:
                  "org-a",

                storeId:
                  "store-a",

                purpose:
                  "forecast_generation",
              },

              ownedReferences: [
                {
                  resourceType:
                    "product_variant",

                  resourceId:
                    "variant-b",

                  organizationId:
                    "org-a",

                  storeId:
                    "store-b",
                },
              ],
            },
          },
        },

        {
          id:
            "worker/sync-run-retry-wait-not-business-status-v1",

          evaluation: {
            operation:
              "worker_status_owns_sync_run",

            input:
              "retry_wait",
          },
        },

        {
          id:
            "worker/sync-run-completed-with-errors-v1",

          evaluation: {
            operation:
              "sync_run_outcome",

            input: {
              kind:
                "completed",

              completedWithErrors:
                true,
            },
          },
        },

        {
          id:
            "worker/sync-run-terminal-failure-v1",

          evaluation: {
            operation:
              "sync_run_outcome",

            input: {
              kind:
                "terminal_failure",

              failureClass:
                "authorization",
            },
          },
        },

        {
          id:
            "worker/pipeline-job-maps-forecast-v1",

          evaluation: {
            operation:
              "pipeline_stage",

            input:
              "forecast_generation",
          },
        },

        {
          id:
            "worker/pipeline-provider-sync-outside-numeric-pipeline-v1",

          evaluation: {
            operation:
              "pipeline_stage",

            input:
              "provider_sync",
          },
        },

        {
          id:
            "worker/pipeline-forecast-blocked-before-metrics-v1",

          evaluation: {
            operation:
              "pipeline_readiness",

            input: {
              stage:
                "forecast",

              state: {
                canonicalDataReady:
                  true,

                metricsReady:
                  false,

                forecastReady:
                  false,

                decisionReady:
                  false,
              },
            },
          },
        },

        {
          id:
            "worker/pipeline-decision-blocked-before-forecast-v1",

          evaluation: {
            operation:
              "pipeline_readiness",

            input: {
              stage:
                "decision",

              state: {
                canonicalDataReady:
                  true,

                metricsReady:
                  true,

                forecastReady:
                  false,

                decisionReady:
                  false,
              },
            },
          },
        },

        {
          id:
            "worker/pipeline-ai-blocked-before-decision-v1",

          evaluation: {
            operation:
              "pipeline_readiness",

            input: {
              stage:
                "ai_explanation",

              state: {
                canonicalDataReady:
                  true,

                metricsReady:
                  true,

                forecastReady:
                  true,

                decisionReady:
                  false,
              },
            },
          },
        },

        {
          id:
            "worker/pipeline-ai-ready-after-decision-v1",

          evaluation: {
            operation:
              "pipeline_readiness",

            input: {
              stage:
                "ai_explanation",

              state: {
                canonicalDataReady:
                  true,

                metricsReady:
                  true,

                forecastReady:
                  true,

                decisionReady:
                  true,
              },
            },
          },
        },

        {
          id:
            "worker/scheduled-trigger-never-establishes-tenant-v1",

          evaluation: {
            operation:
              "trigger_establishes_tenant",

            input: {
              kind:
                "scheduled",

              triggerKey:
                "weekly-forecast",
            },
          },
        },

        {
          id:
            "worker/event-trigger-never-establishes-tenant-v1",

          evaluation: {
            operation:
              "trigger_establishes_tenant",

            input: {
              kind:
                "event",

              triggerKey:
                "provider-webhook",

              sourceType:
                "integration",

              sourceId:
                "integration-a",
            },
          },
        },
      ],
    },
  };
