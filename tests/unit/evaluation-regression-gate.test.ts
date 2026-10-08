import {
  describe,
  it,
} from "vitest";

import {
  assertNoEvaluationRegression,
} from "@/tests/evaluation/regression";

import {
  normalizeEvaluationValue,
} from "@/tests/evaluation/normalize";

import {
  runMetricsEvaluationCase,
  type MetricsEvaluationCase,
} from "@/tests/evaluation/metrics-runner";

import {
  runForecastEvaluationCase,
  type ForecastEvaluationCase,
} from "@/tests/evaluation/forecast-runner";

import {
  runDecisionEvaluationCase,
  type DecisionEvaluationCase,
} from "@/tests/evaluation/decision-runner";

import {
  runTenancyAdversarialCase,
  type TenancyAdversarialCase,
} from "@/tests/evaluation/tenancy-adversarial-runner";

import {
  runWorkerEvaluationCase,
} from "@/tests/evaluation/worker-runner";

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

function goldenMap<
  TGolden extends {
    scenarioId: string;
  },
>(
  goldens:
    readonly TGolden[],
): Map<
  string,
  TGolden
> {
  return new Map(
    goldens.map(
      (golden) => [
        golden.scenarioId,
        golden,
      ],
    ),
  );
}

describe(
  "StoreAgent approved-golden regression gate",
  () => {
    it(
      "metrics matches approved goldens",
      () => {
        const goldens =
          goldenMap(
            metricsV1Goldens,
          );

        for (
          const scenario
          of METRICS_V1_SCENARIOS
        ) {
          const golden =
            goldens.get(
              scenario.id,
            );

          if (!golden) {
            throw new Error(
              `Missing metrics golden for "${scenario.id}".`,
            );
          }

          const actual =
            runMetricsEvaluationCase({
              ...scenario.input,

              expected:
                golden.expected,
            } as MetricsEvaluationCase);

          assertNoEvaluationRegression({
            scenario,

            golden,

            actual,
          });
        }
      },
    );

    it(
      "forecast matches approved goldens",
      () => {
        const goldens =
          goldenMap(
            forecastV1Goldens,
          );

        for (
          const scenario
          of FORECAST_V1_SCENARIOS
        ) {
          const golden =
            goldens.get(
              scenario.id,
            );

          if (!golden) {
            throw new Error(
              `Missing forecast golden for "${scenario.id}".`,
            );
          }

          const actual =
            runForecastEvaluationCase({
              ...scenario.input,

              expected:
                golden.expected,
            } as ForecastEvaluationCase);

          assertNoEvaluationRegression({
            scenario,

            golden,

            actual,

            normalize:
              normalizeEvaluationValue,
          });
        }
      },
    );

    it(
      "decision matches approved goldens",
      () => {
        const goldens =
          goldenMap(
            decisionV1Goldens,
          );

        for (
          const scenario
          of DECISION_V1_SCENARIOS
        ) {
          const golden =
            goldens.get(
              scenario.id,
            );

          if (!golden) {
            throw new Error(
              `Missing decision golden for "${scenario.id}".`,
            );
          }

          const actual =
            runDecisionEvaluationCase({
              ...scenario.input,

              expected:
                golden.expected,
            } as DecisionEvaluationCase);

          assertNoEvaluationRegression({
            scenario,

            golden,

            actual,
          });
        }
      },
    );

    it(
      "tenancy matches approved goldens",
      () => {
        const goldens =
          goldenMap(
            tenancyV1Goldens,
          );

        for (
          const scenario
          of CROSS_TENANT_V1_SCENARIOS
        ) {
          const golden =
            goldens.get(
              scenario.id,
            );

          if (!golden) {
            throw new Error(
              `Missing tenancy golden for "${scenario.id}".`,
            );
          }

          const actual =
            runTenancyAdversarialCase({
              ...scenario.input,

              expected:
                golden.expected,
            } as TenancyAdversarialCase);

          assertNoEvaluationRegression({
            scenario,

            golden,

            actual,
          });
        }
      },
    );

    it(
      "worker matches approved goldens",
      () => {
        const goldens =
          goldenMap(
            workerV1Goldens,
          );

        for (
          const scenario
          of WORKER_V1_SCENARIOS
        ) {
          const golden =
            goldens.get(
              scenario.id,
            );

          if (!golden) {
            throw new Error(
              `Missing worker golden for "${scenario.id}".`,
            );
          }

          const actual =
            runWorkerEvaluationCase(
              scenario.input,
            );

          assertNoEvaluationRegression({
            scenario,

            golden,

            actual,
          });
        }
      },
    );
  },
);
