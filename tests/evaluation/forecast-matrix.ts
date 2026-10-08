import type {
  ForecastEvaluationCase,
} from "@/tests/evaluation/forecast-runner";

import {
  FORECAST_V1_SCENARIOS,
} from "@/tests/evaluation/forecast-scenarios";

export const FORECAST_V1_MATRIX =
  FORECAST_V1_SCENARIOS.map(
    (scenario) => ({
      id:
        scenario.id,

      risk:
        scenario.risk,

      protects:
        scenario.protects.join(
          " ",
        ),

      evaluation: ({
        ...scenario.input,

        expected:
          scenario.expected,
      } as ForecastEvaluationCase),
    }),
  );
