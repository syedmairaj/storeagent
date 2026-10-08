import type {
  StoreAgentEvaluationRisk,
  StoreAgentEvaluationScenario,
} from "@/tests/evaluation/types";

import {
  workerV1Fixture,
} from "@/tests/fixtures/worker/worker-v1-matrix";

import {
  workerV1Goldens,
} from "@/tests/golden/worker/worker-v1-matrix";

import type {
  WorkerEvaluationInput,
} from "@/tests/evaluation/worker-runner";

const critical = new Set([
  "worker/idempotency-subject-order-stable-v1",
  "worker/enqueue-duplicate-active-v1",
  "worker/lifecycle-terminal-cannot-resurrect-v1",
  "worker/lease-expired-running-retries-v1",
  "worker/mutation-fence-stale-owner-v1",
  "worker/mutation-fence-stale-token-v1",
  "worker/retry-max-attempts-terminal-v1",
  "worker/retry-authorization-fails-immediately-v1",
  "worker/scope-cross-org-reference-denied-v1",
  "worker/scope-cross-store-reference-denied-v1",
  "worker/sync-run-retry-wait-not-business-status-v1",
  "worker/pipeline-ai-blocked-before-decision-v1",
  "worker/scheduled-trigger-never-establishes-tenant-v1",
  "worker/event-trigger-never-establishes-tenant-v1",
]);

const high = new Set([
  "worker/idempotency-operation-change-v1",
  "worker/idempotency-subject-change-v1",
  "worker/enqueue-duplicate-terminal-v1",
  "worker/lease-expired-claimed-requeues-v1",
  "worker/retry-transient-first-attempt-v1",
  "worker/retry-rate-limit-second-attempt-v1",
  "worker/retry-validation-fails-immediately-v1",
  "worker/failure-retry-exhausted-v1",
  "worker/dead-work-record-v1",
  "worker/sync-run-completed-with-errors-v1",
  "worker/pipeline-forecast-blocked-before-metrics-v1",
  "worker/pipeline-decision-blocked-before-forecast-v1",
]);

function riskFor(
  id: string,
): StoreAgentEvaluationRisk {
  if (
    critical.has(id)
  ) {
    return "critical";
  }

  if (
    high.has(id)
  ) {
    return "high";
  }

  return "medium";
}

function titleFromId(
  id: string,
): string {
  return id
    .split("/", 2)[1]
    .replace(/-v1$/, "")
    .split("-")
    .map(
      (part) =>
        part.charAt(0)
          .toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

const goldenByScenarioId =
  new Map(
    workerV1Goldens.map(
      (golden) => [
        golden.scenarioId,
        golden,
      ],
    ),
  );

export const WORKER_V1_SCENARIOS:
  readonly StoreAgentEvaluationScenario<
    WorkerEvaluationInput,
    unknown
  >[] =
  workerV1Fixture.input.cases.map(
    (fixtureCase) => {
      const golden =
        goldenByScenarioId.get(
          fixtureCase.id,
        );

      if (!golden) {
        throw new Error(
          `Missing approved worker golden for "${fixtureCase.id}".`,
        );
      }

      return {
        schemaVersion: 1,

        id:
          fixtureCase.id,

        title:
          titleFromId(
            fixtureCase.id,
          ),

        domain:
          "worker",

        risk:
          riskFor(
            fixtureCase.id,
          ),

        configurationVersion:
          golden.configurationVersion,

        input:
          fixtureCase.evaluation,

        expected:
          golden.expected,

        protects: [
          golden.review.rationale,
        ],
      };
    },
  );
