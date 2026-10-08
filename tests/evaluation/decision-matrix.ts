import type {
  DecisionEvaluationCase,
} from "@/tests/evaluation/decision-runner";

import {
  DECISION_V1_SCENARIOS,
} from "@/tests/evaluation/decision-scenarios";

export const DECISION_V1_MATRIX =
  DECISION_V1_SCENARIOS.map(
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
      } as DecisionEvaluationCase),
    }),
  );
