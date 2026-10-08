import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assessEvaluationRegression,
  assertEvaluationArtifactAlignment,
  assertNoEvaluationRegression,
  evaluationValuesEqual,
} from "@/tests/evaluation/regression";

import type {
  StoreAgentEvaluationScenario,
} from "@/tests/evaluation/types";

import type {
  StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

const scenario:
  StoreAgentEvaluationScenario<
    unknown,
    unknown
  > = {
    schemaVersion: 1,

    id:
      "metrics/example-v1",

    title:
      "Example",

    domain:
      "metrics",

    risk:
      "critical",

    configurationVersion:
      "metrics-config-v1",

    input: {
      availableQuantity:
        10,
    },

    expected: {
      value:
        5,

      reasonCode:
        null,
    },

    protects: [
      "Reviewed deterministic truth remains stable.",
    ],
  };

const golden:
  StoreAgentGoldenOutput<
    unknown
  > = {
    goldenSchemaVersion: 1,

    id:
      "metrics/example-v1",

    scenarioId:
      "metrics/example-v1",

    configurationVersion:
      "metrics-config-v1",

    fixture:
      null,

    expected: {
      value:
        5,

      reasonCode:
        null,
    },

    review: {
      status:
        "approved",

      rationale:
        "Reviewed deterministic truth.",
    },
  };

describe(
  "StoreAgent regression drift policy",
  () => {
    it(
      "treats approved matching output as reproducible",
      () => {
        expect(
          assessEvaluationRegression({
            scenario,

            golden,

            actual: {
              value:
                5,

              reasonCode:
                null,
            },
          }),
        ).toEqual({
          status:
            "match",

          scenarioId:
            "metrics/example-v1",
        });
      },
    );

    it(
      "ignores object property order when comparing deterministic truth",
      () => {
        expect(
          evaluationValuesEqual(
            {
              a: 1,
              b: 2,
            },

            {
              b: 2,
              a: 1,
            },
          ),
        ).toBe(true);
      },
    );

    it(
      "detects changed deterministic output as regression",
      () => {
        expect(
          assessEvaluationRegression({
            scenario,

            golden,

            actual: {
              value:
                6,

              reasonCode:
                null,
            },
          }),
        ).toEqual({
          status:
            "regression",

          scenarioId:
            "metrics/example-v1",

          expected:
            golden.expected,

          actual: {
            value:
              6,

            reasonCode:
              null,
          },
        });
      },
    );

    it(
      "throws a CI-style failure for unapproved drift",
      () => {
        expect(() =>
          assertNoEvaluationRegression({
            scenario,

            golden,

            actual: {
              value:
                6,
            },
          }),
        ).toThrow(
          'Unapproved evaluation regression detected for "metrics/example-v1".',
        );
      },
    );

    it(
      "rejects scenario and golden configuration mismatch",
      () => {
        expect(() =>
          assertEvaluationArtifactAlignment(
            scenario,

            {
              ...golden,

              configurationVersion:
                "metrics-config-v2",
            },
          ),
        ).toThrow(
          'Golden configuration mismatch for "metrics/example-v1".',
        );
      },
    );

    it(
      "rejects scenario-to-golden identity mismatch",
      () => {
        expect(() =>
          assertEvaluationArtifactAlignment(
            scenario,

            {
              ...golden,

              scenarioId:
                "metrics/other-v1",
            },
          ),
        ).toThrow(
          'Golden scenario mismatch: expected "metrics/example-v1", received "metrics/other-v1".',
        );
      },
    );

    it(
      "rejects scenario expected output that no longer matches its approved golden",
      () => {
        expect(() =>
          assertEvaluationArtifactAlignment(
            {
              ...scenario,

              expected: {
                value:
                  999,
              },
            },

            golden,
          ),
        ).toThrow(
          'Scenario expected output is not the approved golden for "metrics/example-v1".',
        );
      },
    );
  },
);
