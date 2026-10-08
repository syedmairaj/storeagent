import {
  describe,
  expect,
  it,
} from "vitest";

import {
  runForecastEvaluationCase,
} from "@/tests/evaluation/forecast-runner";

import {
  normalizeEvaluationValue,
} from "@/tests/evaluation/normalize";

import {
  FORECAST_V1_MATRIX,
} from "@/tests/evaluation/forecast-matrix";

describe(
  "StoreAgent forecast-v1 evaluation matrix",
  () => {
    for (
      const scenario
      of FORECAST_V1_MATRIX
    ) {
      it(
        scenario.id,
        () => {
          const actual =
            runForecastEvaluationCase(
              scenario.evaluation,
            );

          expect(
            normalizeEvaluationValue(
              actual,
            ),
          ).toEqual(
            normalizeEvaluationValue(
              scenario.evaluation.expected,
            ),
          );
        },
      );
    }

    it(
      "contains unique stable scenario IDs",
      () => {
        const ids =
          FORECAST_V1_MATRIX.map(
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
      "requires every scenario to state its protected invariant",
      () => {
        for (
          const scenario
          of FORECAST_V1_MATRIX
        ) {
          expect(
            scenario.protects.trim()
              .length,
          ).toBeGreaterThan(0);
        }
      },
    );

    it(
      "covers exact history sufficiency boundaries",
      () => {
        const ids =
          new Set(
            FORECAST_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        for (
          const id of [
            "forecast/history-6-days-insufficient-v1",
            "forecast/history-7-days-limited-v1",
            "forecast/history-27-days-limited-v1",
            "forecast/history-28-days-sufficient-v1",
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
      "covers known-zero versus unknown demand semantics",
      () => {
        const ids =
          new Set(
            FORECAST_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        expect(
          ids.has(
            "forecast/available-zero-sales-known-zero-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "forecast/unknown-availability-not-zero-demand-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "forecast/horizons-known-zero-v1",
          ),
        ).toBe(true);

        expect(
          ids.has(
            "forecast/horizons-unknown-demand-v1",
          ),
        ).toBe(true);
      },
    );

    it(
      "covers confidence quality boundaries",
      () => {
        const ids =
          new Set(
            FORECAST_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        for (
          const id of [
            "forecast/confidence-unusable-moderate-boundary-v1",
            "forecast/confidence-unusable-severe-boundary-v1",
            "forecast/confidence-censoring-moderate-boundary-v1",
            "forecast/confidence-censoring-severe-boundary-v1",
            "forecast/confidence-promotion-severe-boundary-v1",
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
