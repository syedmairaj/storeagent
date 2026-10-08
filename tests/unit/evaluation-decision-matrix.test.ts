import {
  describe,
  expect,
  it,
} from "vitest";

import {
  runDecisionEvaluationCase,
} from "@/tests/evaluation/decision-runner";

import {
  DECISION_V1_MATRIX,
} from "@/tests/evaluation/decision-matrix";

describe(
  "StoreAgent decision-v1 evaluation matrix",
  () => {
    for (
      const scenario
      of DECISION_V1_MATRIX
    ) {
      it(
        scenario.id,
        () => {
          expect(
            runDecisionEvaluationCase(
              scenario.evaluation,
            ),
          ).toEqual(
            scenario.evaluation
              .expected,
          );
        },
      );
    }

    it(
      "contains unique stable scenario IDs",
      () => {
        const ids =
          DECISION_V1_MATRIX.map(
            (scenario) =>
              scenario.id,
          );

        expect(
          new Set(ids).size,
        ).toBe(
          ids.length,
        );
      },
    );

    it(
      "requires every scenario to state the invariant it protects",
      () => {
        for (
          const scenario
          of DECISION_V1_MATRIX
        ) {
          expect(
            scenario.protects.trim()
              .length,
          ).toBeGreaterThan(0);
        }
      },
    );

    it(
      "covers all intervention and no-intervention states",
      () => {
        const ids =
          new Set(
            DECISION_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        for (
          const id of [
            "decision/reorder-critical-v1",
            "decision/reduce-incoming-excess-v1",
            "decision/promote-aged-excess-v1",
            "decision/healthy-no-intervention-v1",
            "decision/watch-unknown-inventory-v1",
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
      "covers incompatible and compatible multi-action states",
      () => {
        const ids =
          new Set(
            DECISION_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        expect(
          ids.has(
            "decision/reorder-reduce-conflict-watch-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "decision/reorder-promote-conflict-watch-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "decision/reduce-primary-promote-secondary-v1",
          ),
        ).toBe(true);
      },
    );

    it(
      "covers known-zero versus unknown semantics",
      () => {
        const ids =
          new Set(
            DECISION_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        expect(
          ids.has(
            "decision/reorder-known-zero-incoming-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "decision/watch-unknown-incoming-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "decision/healthy-known-zero-demand-v1",
          ),
        ).toBe(true);
      },
    );

    it(
      "covers the decision-confidence ceiling",
      () => {
        const ids =
          new Set(
            DECISION_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        expect(
          ids.has(
            "decision/reorder-medium-forecast-confidence-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "decision/reorder-medium-data-quality-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "decision/reorder-low-data-quality-v1",
          ),
        ).toBe(true);
      },
    );
  },
);
