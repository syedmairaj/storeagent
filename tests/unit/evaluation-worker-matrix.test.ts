import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateEvaluationFixture,
} from "@/tests/evaluation/fixture";

import {
  validateEvaluationScenario,
} from "@/tests/evaluation/scenario";

import {
  validateGoldenOutput,
} from "@/tests/evaluation/golden";

import {
  runWorkerEvaluationCase,
} from "@/tests/evaluation/worker-runner";

import {
  workerV1Fixture,
} from "@/tests/fixtures/worker/worker-v1-matrix";

import {
  workerV1Goldens,
} from "@/tests/golden/worker/worker-v1-matrix";

import {
  WORKER_V1_SCENARIOS,
} from "@/tests/evaluation/worker-scenarios";

describe(
  "StoreAgent worker-v1 evaluation matrix",
  () => {
    const fixture =
      validateEvaluationFixture(
        workerV1Fixture,
      );

    const goldens =
      workerV1Goldens.map(
        validateGoldenOutput,
      );

    const scenarios =
      WORKER_V1_SCENARIOS.map(
        validateEvaluationScenario,
      );

    const goldenByScenarioId =
      new Map(
        goldens.map(
          (golden) => [
            golden.scenarioId,
            golden,
          ],
        ),
      );

    for (
      const scenario
      of scenarios
    ) {
      it(
        scenario.id,
        () => {
          const golden =
            goldenByScenarioId.get(
              scenario.id,
            );

          expect(
            golden,
          ).toBeDefined();

          expect(
            runWorkerEvaluationCase(
              scenario.input,
            ),
          ).toEqual(
            golden?.expected,
          );
        },
      );
    }

    it(
      "links every scenario to exactly one fixture input and approved golden",
      () => {
        expect(
          scenarios,
        ).toHaveLength(
          fixture.input.cases
            .length,
        );

        expect(
          goldens,
        ).toHaveLength(
          scenarios.length,
        );

        expect(
          new Set(
            scenarios.map(
              (scenario) =>
                scenario.id,
            ),
          ).size,
        ).toBe(
          scenarios.length,
        );

        for (
          const golden
          of goldens
        ) {
          expect(
            golden.fixture,
          ).toEqual({
            fixtureId:
              fixture.id,

            fixtureVersion:
              fixture.fixtureVersion,
          });

          expect(
            golden.review.status,
          ).toBe(
            "approved",
          );
        }
      },
    );

    it(
      "keeps expected outputs out of worker fixture inputs",
      () => {
        for (
          const fixtureCase
          of fixture.input.cases
        ) {
          expect(
            Object.prototype
              .hasOwnProperty.call(
                fixtureCase.evaluation,
                "expected",
              ),
          ).toBe(false);
        }
      },
    );

    it(
      "covers idempotency concurrency lease retry and tenant fencing",
      () => {
        const ids =
          new Set(
            scenarios.map(
              (scenario) =>
                scenario.id,
            ),
          );

        for (
          const id of [
            "worker/idempotency-subject-order-stable-v1",
            "worker/enqueue-duplicate-active-v1",
            "worker/lease-expired-running-retries-v1",
            "worker/mutation-fence-stale-owner-v1",
            "worker/retry-max-attempts-terminal-v1",
            "worker/scope-cross-org-reference-denied-v1",
          ]
        ) {
          expect(
            ids.has(id),
            `Missing ${id}`,
          ).toBe(true);
        }
      },
    );

    it(
      "covers SyncRun separation deterministic pipeline ordering and trigger ownership",
      () => {
        const ids =
          new Set(
            scenarios.map(
              (scenario) =>
                scenario.id,
            ),
          );

        for (
          const id of [
            "worker/sync-run-retry-wait-not-business-status-v1",
            "worker/sync-run-completed-with-errors-v1",
            "worker/pipeline-forecast-blocked-before-metrics-v1",
            "worker/pipeline-decision-blocked-before-forecast-v1",
            "worker/pipeline-ai-blocked-before-decision-v1",
            "worker/event-trigger-never-establishes-tenant-v1",
          ]
        ) {
          expect(
            ids.has(id),
            `Missing ${id}`,
          ).toBe(true);
        }
      },
    );
  },
);
