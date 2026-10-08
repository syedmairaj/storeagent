import type {
  StoreAgentEvaluationScenario,
} from "@/tests/evaluation/types";

import {
  aiNumericMutationV1Fixture,
  type AiNumericMutationFixtureCase,
} from "@/tests/fixtures/ai/ai-numeric-mutation-v1";

import {
  aiNumericMutationV1Goldens,
} from "@/tests/golden/ai/ai-numeric-mutation-v1";

import type {
  AiNumericMutationAssessment,
} from "@/tests/evaluation/ai-numeric-mutation";

const goldenByScenarioId =
  new Map(
    aiNumericMutationV1Goldens.map(
      (golden) => [
        golden.scenarioId,
        golden,
      ],
    ),
  );

function titleFromId(
  id: string,
): string {
  return id
    .split("/", 2)[1]
    .replace(
      /-v1$/,
      "",
    )
    .split("-")
    .map(
      (part) =>
        part.charAt(0)
          .toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

export const AI_NUMERIC_MUTATION_V1_SCENARIOS:
  readonly StoreAgentEvaluationScenario<
    AiNumericMutationFixtureCase,
    AiNumericMutationAssessment
  >[] =
  aiNumericMutationV1Fixture.input.cases.map(
    (fixtureCase) => {
      const golden =
        goldenByScenarioId.get(
          fixtureCase.id,
        );

      if (!golden) {
        throw new Error(
          `Missing approved AI numeric-mutation golden for "${fixtureCase.id}".`,
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
          "ai",

        risk:
          golden.expected.status ===
          "violation"
            ? "critical"
            : "medium",

        configurationVersion:
          golden.configurationVersion,

        input:
          fixtureCase,

        expected:
          golden.expected,

        protects: [
          golden.review.rationale,
        ],
      };
    },
  );
