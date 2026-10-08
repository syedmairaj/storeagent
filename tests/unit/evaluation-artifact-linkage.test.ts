import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateEvaluationFixture,
  type StoreAgentEvaluationFixture,
} from "@/tests/evaluation/fixture";

import {
  validateGoldenOutput,
  type StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

import {
  validateEvaluationScenario,
} from "@/tests/evaluation/scenario";

import type {
  StoreAgentEvaluationScenario,
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

interface LinkedEvaluationInput {
  readonly operation: string;
  readonly input: unknown;
}

interface LinkedFixtureCase {
  readonly id: string;

  readonly evaluation:
    LinkedEvaluationInput;
}

type LinkedFixture =
  StoreAgentEvaluationFixture<{
    cases:
      readonly LinkedFixtureCase[];
  }>;

type LinkedScenario =
  StoreAgentEvaluationScenario<
    LinkedEvaluationInput,
    unknown
  >;

interface Bundle {
  readonly name: string;

  readonly fixture:
    LinkedFixture;

  readonly scenarios:
    readonly LinkedScenario[];

  readonly goldens:
    readonly StoreAgentGoldenOutput<unknown>[];
}

function assertBundle(
  bundle: Bundle,
): void {
  const fixture =
    validateEvaluationFixture(
      bundle.fixture,
    );

  const goldens =
    bundle.goldens.map(
      validateGoldenOutput,
    );

  const scenarios =
    bundle.scenarios.map(
      validateEvaluationScenario,
    );

  const fixtureCaseById =
    new Map(
      fixture.input.cases.map(
        (fixtureCase) => [
          fixtureCase.id,
          fixtureCase,
        ],
      ),
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

  expect(
    scenarios,
  ).toHaveLength(
    fixture.input.cases.length,
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
    const fixtureCase
    of fixture.input.cases
  ) {
    expect(
      Object.prototype.hasOwnProperty.call(
        fixtureCase.evaluation,
        "expected",
      ),
    ).toBe(false);
  }

  for (
    const scenario
    of scenarios
  ) {
    const fixtureCase =
      fixtureCaseById.get(
        scenario.id,
      );

    expect(
      fixtureCase,
      `${bundle.name}: fixture missing for ${scenario.id}`,
    ).toBeDefined();

    const golden =
      goldenByScenarioId.get(
        scenario.id,
      );

    expect(
      golden,
      `${bundle.name}: golden missing for ${scenario.id}`,
    ).toBeDefined();

    if (
      !fixtureCase ||
      !golden
    ) {
      continue;
    }

    expect(
      scenario.input,
    ).toEqual(
      fixtureCase.evaluation,
    );

    expect(
      scenario.expected,
    ).toEqual(
      golden.expected,
    );

    expect(
      scenario.configurationVersion,
    ).toBe(
      golden.configurationVersion,
    );

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

    expect(
      golden.review.rationale
        .trim().length,
    ).toBeGreaterThan(0);
  }
}

describe(
  "StoreAgent evaluation artifact linkage",
  () => {
    const bundles:
      readonly Bundle[] = [
        {
          name:
            "metrics",

          fixture:
            metricsV1Fixture,

          scenarios:
            METRICS_V1_SCENARIOS,

          goldens:
            metricsV1Goldens,
        },

        {
          name:
            "forecast",

          fixture:
            forecastV1Fixture,

          scenarios:
            FORECAST_V1_SCENARIOS,

          goldens:
            forecastV1Goldens,
        },

        {
          name:
            "decision",

          fixture:
            decisionV1Fixture,

          scenarios:
            DECISION_V1_SCENARIOS,

          goldens:
            decisionV1Goldens,
        },

        {
          name:
            "tenancy",

          fixture:
            tenancyV1Fixture,

          scenarios:
            CROSS_TENANT_V1_SCENARIOS,

          goldens:
            tenancyV1Goldens,
        },
      ];

    for (
      const bundle
      of bundles
    ) {
      it(
        `${bundle.name} links fixture -> scenario -> approved golden`,
        () => {
          assertBundle(
            bundle,
          );
        },
      );
    }
  },
);
