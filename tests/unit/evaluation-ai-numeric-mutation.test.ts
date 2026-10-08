import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assessAiNumericMutation,
} from "@/tests/evaluation/ai-numeric-mutation";

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
  aiNumericMutationV1Fixture,
} from "@/tests/fixtures/ai/ai-numeric-mutation-v1";

import {
  aiNumericMutationV1Goldens,
} from "@/tests/golden/ai/ai-numeric-mutation-v1";

import {
  AI_NUMERIC_MUTATION_V1_SCENARIOS,
} from "@/tests/evaluation/ai-numeric-mutation-scenarios";

describe(
  "StoreAgent AI numeric-mutation evaluation",
  () => {
    const fixture =
      validateEvaluationFixture(
        aiNumericMutationV1Fixture,
      );

    const scenarios =
      AI_NUMERIC_MUTATION_V1_SCENARIOS.map(
        validateEvaluationScenario,
      );

    const goldens =
      aiNumericMutationV1Goldens.map(
        validateGoldenOutput,
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
            assessAiNumericMutation(
              scenario.input.truth,
              scenario.input.candidate,
            ),
          ).toEqual(
            golden?.expected,
          );
        },
      );
    }

    it(
      "links every AI scenario to one deterministic fixture and approved golden",
      () => {
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
      },
    );

    it(
      "contains explicit action quantity forecast risk confidence and evidence mutation attacks",
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
            "ai/action-type-mutation-v1",
            "ai/reorder-quantity-mutation-v1",
            "ai/fabricated-confidence-percent-v1",
            "ai/forecast-demand-mutation-v1",
            "ai/incoming-stock-invention-v1",
            "ai/stockout-risk-mutation-v1",
            "ai/data-quality-mutation-v1",
            "ai/fabricated-reason-code-v1",
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
      "allows omission and exact repetition of deterministic truth",
      () => {
        const allowed =
          scenarios.filter(
            (scenario) =>
              scenario.expected
                .status ===
              "allowed",
          );

        expect(
          allowed.length,
        ).toBeGreaterThan(
          0,
        );

        expect(
          allowed.some(
            (scenario) =>
              scenario.id ===
              "ai/prose-only-allowed-v1",
          ),
        ).toBe(true);

        expect(
          allowed.some(
            (scenario) =>
              scenario.id ===
              "ai/exact-quantity-allowed-v1",
          ),
        ).toBe(true);
      },
    );

    it(
      "classifies mutation scenarios as critical evaluation risk",
      () => {
        for (
          const scenario
          of scenarios
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
