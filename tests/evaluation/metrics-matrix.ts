import type {
  MetricsEvaluationCase,
} from "@/tests/evaluation/metrics-runner";

import {
  METRICS_V1_SCENARIOS,
} from "@/tests/evaluation/metrics-scenarios";

export const METRICS_V1_MATRIX =
  METRICS_V1_SCENARIOS.map(
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
      } as MetricsEvaluationCase),
    }),
  );
