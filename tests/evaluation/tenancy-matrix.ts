import type {
  TenancyAdversarialCase,
} from "@/tests/evaluation/tenancy-adversarial-runner";

import {
  CROSS_TENANT_V1_SCENARIOS,
} from "@/tests/evaluation/tenancy-scenarios";

export const CROSS_TENANT_V1_MATRIX =
  CROSS_TENANT_V1_SCENARIOS.map(
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
      } as TenancyAdversarialCase),
    }),
  );
