import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  StoreAgentEvaluationDomain,
} from "@/tests/evaluation/types";

import {
  metricsV1Fixture,
} from "@/tests/fixtures/metrics/metrics-v1-matrix";

import {
  forecastV1Fixture,
} from "@/tests/fixtures/forecast/forecast-v1-matrix";

import {
  decisionV1Fixture,
} from "@/tests/fixtures/decision/decision-v1-matrix";

import {
  tenancyV1Fixture,
} from "@/tests/fixtures/tenancy/cross-tenant-v1-matrix";

import {
  workerV1Fixture,
} from "@/tests/fixtures/worker/worker-v1-matrix";

import {
  aiNumericMutationV1Fixture,
} from "@/tests/fixtures/ai/ai-numeric-mutation-v1";

import {
  metricsV1Goldens,
} from "@/tests/golden/metrics/metrics-v1-matrix";

import {
  forecastV1Goldens,
} from "@/tests/golden/forecast/forecast-v1-matrix";

import {
  decisionV1Goldens,
} from "@/tests/golden/decision/decision-v1-matrix";

import {
  tenancyV1Goldens,
} from "@/tests/golden/tenancy/cross-tenant-v1-matrix";

import {
  workerV1Goldens,
} from "@/tests/golden/worker/worker-v1-matrix";

import {
  aiNumericMutationV1Goldens,
} from "@/tests/golden/ai/ai-numeric-mutation-v1";

import {
  METRICS_V1_SCENARIOS,
} from "@/tests/evaluation/metrics-scenarios";

import {
  FORECAST_V1_SCENARIOS,
} from "@/tests/evaluation/forecast-scenarios";

import {
  DECISION_V1_SCENARIOS,
} from "@/tests/evaluation/decision-scenarios";

import {
  CROSS_TENANT_V1_SCENARIOS,
} from "@/tests/evaluation/tenancy-scenarios";

import {
  WORKER_V1_SCENARIOS,
} from "@/tests/evaluation/worker-scenarios";

import {
  AI_NUMERIC_MUTATION_V1_SCENARIOS,
} from "@/tests/evaluation/ai-numeric-mutation-scenarios";

interface FixtureCase {
  readonly id: string;
}

interface FixtureLike {
  readonly id: string;

  readonly domain:
    StoreAgentEvaluationDomain;

  readonly fixtureVersion:
    number;

  readonly input: {
    readonly cases:
      readonly FixtureCase[];
  };
}

interface ScenarioLike {
  readonly id: string;

  readonly domain:
    StoreAgentEvaluationDomain;

  readonly configurationVersion:
    string;

  readonly expected:
    unknown;

  readonly protects:
    readonly string[];

  readonly risk:
    string;
}

interface GoldenLike {
  readonly id: string;

  readonly scenarioId:
    string;

  readonly configurationVersion:
    string;

  readonly fixture:
    {
      readonly fixtureId:
        string;

      readonly fixtureVersion:
        number;
    } | null;

  readonly expected:
    unknown;

  readonly review: {
    readonly status:
      string;

    readonly rationale:
      string;
  };
}

interface EvaluationBundle {
  readonly domain:
    StoreAgentEvaluationDomain;

  readonly fixture:
    FixtureLike;

  readonly scenarios:
    readonly ScenarioLike[];

  readonly goldens:
    readonly GoldenLike[];
}

const bundles:
  readonly EvaluationBundle[] = [
    {
      domain:
        "metrics",

      fixture:
        metricsV1Fixture,

      scenarios:
        METRICS_V1_SCENARIOS,

      goldens:
        metricsV1Goldens,
    },

    {
      domain:
        "forecast",

      fixture:
        forecastV1Fixture,

      scenarios:
        FORECAST_V1_SCENARIOS,

      goldens:
        forecastV1Goldens,
    },

    {
      domain:
        "decision",

      fixture:
        decisionV1Fixture,

      scenarios:
        DECISION_V1_SCENARIOS,

      goldens:
        decisionV1Goldens,
    },

    {
      domain:
        "tenancy",

      fixture:
        tenancyV1Fixture,

      scenarios:
        CROSS_TENANT_V1_SCENARIOS,

      goldens:
        tenancyV1Goldens,
    },

    {
      domain:
        "worker",

      fixture:
        workerV1Fixture,

      scenarios:
        WORKER_V1_SCENARIOS,

      goldens:
        workerV1Goldens,
    },

    {
      domain:
        "ai",

      fixture:
        aiNumericMutationV1Fixture,

      scenarios:
        AI_NUMERIC_MUTATION_V1_SCENARIOS,

      goldens:
        aiNumericMutationV1Goldens,
    },
  ];

function stableSerialize(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(
      value,
    );
  }

  if (
    Array.isArray(value)
  ) {
    return `[${value
      .map(
        stableSerialize,
      )
      .join(",")}]`;
  }

  return `{${Object.entries(
    value as Record<
      string,
      unknown
    >,
  )
    .sort(
      ([left], [right]) =>
        left.localeCompare(
          right,
        ),
    )
    .map(
      ([key, item]) =>
        `${JSON.stringify(
          key,
        )}:${stableSerialize(
          item,
        )}`,
    )
    .join(",")}}`;
}

describe(
  "StoreAgent global evaluation invariants",
  () => {
    it(
      "covers every frozen V1 evaluation domain exactly once",
      () => {
        expect(
          bundles.map(
            (bundle) =>
              bundle.domain,
          ),
        ).toEqual([
          "metrics",
          "forecast",
          "decision",
          "tenancy",
          "worker",
          "ai",
        ]);
      },
    );

    it(
      "keeps fixture domain aligned with bundle domain",
      () => {
        for (
          const bundle
          of bundles
        ) {
          expect(
            bundle.fixture.domain,
          ).toBe(
            bundle.domain,
          );
        }
      },
    );

    it(
      "keeps scenario domain aligned with bundle domain",
      () => {
        for (
          const bundle
          of bundles
        ) {
          for (
            const scenario
            of bundle.scenarios
          ) {
            expect(
              scenario.domain,
            ).toBe(
              bundle.domain,
            );
          }
        }
      },
    );

    it(
      "requires fixture scenario and golden counts to match per domain",
      () => {
        for (
          const bundle
          of bundles
        ) {
          expect(
            bundle.scenarios,
          ).toHaveLength(
            bundle.fixture.input
              .cases.length,
          );

          expect(
            bundle.goldens,
          ).toHaveLength(
            bundle.scenarios
              .length,
          );
        }
      },
    );

    it(
      "requires globally unique scenario IDs",
      () => {
        const ids =
          bundles.flatMap(
            (bundle) =>
              bundle.scenarios.map(
                (scenario) =>
                  scenario.id,
              ),
          );

        expect(
          new Set(ids).size,
        ).toBe(
          ids.length,
        );
      },
    );

    it(
      "requires globally unique golden IDs",
      () => {
        const ids =
          bundles.flatMap(
            (bundle) =>
              bundle.goldens.map(
                (golden) =>
                  golden.id,
              ),
          );

        expect(
          new Set(ids).size,
        ).toBe(
          ids.length,
        );
      },
    );

    it(
      "requires every fixture case to map to exactly one scenario",
      () => {
        for (
          const bundle
          of bundles
        ) {
          const scenarioIds =
            new Set(
              bundle.scenarios.map(
                (scenario) =>
                  scenario.id,
              ),
            );

          for (
            const fixtureCase
            of bundle.fixture.input
              .cases
          ) {
            expect(
              scenarioIds.has(
                fixtureCase.id,
              ),
              `Missing scenario for ${fixtureCase.id}`,
            ).toBe(true);
          }
        }
      },
    );

    it(
      "requires every scenario to map to exactly one approved golden",
      () => {
        for (
          const bundle
          of bundles
        ) {
          const goldenByScenarioId =
            new Map(
              bundle.goldens.map(
                (golden) => [
                  golden.scenarioId,
                  golden,
                ],
              ),
            );

          for (
            const scenario
            of bundle.scenarios
          ) {
            const golden =
              goldenByScenarioId.get(
                scenario.id,
              );

            expect(
              golden,
              `Missing golden for ${scenario.id}`,
            ).toBeDefined();

            expect(
              golden?.review.status,
            ).toBe(
              "approved",
            );
          }
        }
      },
    );

    it(
      "requires scenario and golden configuration identity to match",
      () => {
        for (
          const bundle
          of bundles
        ) {
          const goldenByScenarioId =
            new Map(
              bundle.goldens.map(
                (golden) => [
                  golden.scenarioId,
                  golden,
                ],
              ),
            );

          for (
            const scenario
            of bundle.scenarios
          ) {
            expect(
              goldenByScenarioId.get(
                scenario.id,
              )?.configurationVersion,
            ).toBe(
              scenario.configurationVersion,
            );
          }
        }
      },
    );

    it(
      "requires scenario expected truth to equal approved golden truth",
      () => {
        for (
          const bundle
          of bundles
        ) {
          const goldenByScenarioId =
            new Map(
              bundle.goldens.map(
                (golden) => [
                  golden.scenarioId,
                  golden,
                ],
              ),
            );

          for (
            const scenario
            of bundle.scenarios
          ) {
            const golden =
              goldenByScenarioId.get(
                scenario.id,
              );

            expect(
              stableSerialize(
                scenario.expected,
              ),
            ).toBe(
              stableSerialize(
                golden?.expected,
              ),
            );
          }
        }
      },
    );

    it(
      "requires golden fixture identity and version to match source fixture",
      () => {
        for (
          const bundle
          of bundles
        ) {
          for (
            const golden
            of bundle.goldens
          ) {
            expect(
              golden.fixture,
            ).toEqual({
              fixtureId:
                bundle.fixture.id,

              fixtureVersion:
                bundle.fixture
                  .fixtureVersion,
            });
          }
        }
      },
    );

    it(
      "requires non-empty scenario protection and golden review rationale",
      () => {
        for (
          const bundle
          of bundles
        ) {
          for (
            const scenario
            of bundle.scenarios
          ) {
            expect(
              scenario.protects
                .length,
            ).toBeGreaterThan(
              0,
            );

            for (
              const invariant
              of scenario.protects
            ) {
              expect(
                invariant.trim()
                  .length,
              ).toBeGreaterThan(
                0,
              );
            }
          }

          for (
            const golden
            of bundle.goldens
          ) {
            expect(
              golden.review
                .rationale.trim()
                .length,
            ).toBeGreaterThan(
              0,
            );
          }
        }
      },
    );

    it(
      "requires all AI mutation violations to remain critical",
      () => {
        for (
          const scenario
          of AI_NUMERIC_MUTATION_V1_SCENARIOS
        ) {
          if (
            scenario.expected
              .status ===
            "violation"
          ) {
            expect(
              scenario.risk,
            ).toBe(
              "critical",
            );
          }
        }
      },
    );
  },
);
