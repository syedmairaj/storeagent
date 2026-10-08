import type {
  StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

export interface SteadyDemand28DaysGoldenExpected {
  dataSufficiency:
    "sufficient";

  dailyDemand: number;

  confidence:
    "high" | "medium" | "low";
}

export const steadyDemand28DaysGolden:
  StoreAgentGoldenOutput<
    SteadyDemand28DaysGoldenExpected
  > = {
    goldenSchemaVersion: 1,

    id:
      "forecast/steady-demand-28-days-v1",

    scenarioId:
      "forecast/steady-demand-28-days-v1",

    configurationVersion:
      "forecast-config-v1",

    fixture: {
      fixtureId:
        "forecast/steady-demand-28-days-v1",

      fixtureVersion: 1,
    },

    expected: {
      dataSufficiency:
        "sufficient",

      dailyDemand: 4,

      confidence:
        "high",
    },

    review: {
      status:
        "approved",

      rationale:
        "Twenty-eight complete steady-demand observations provide sufficient history and preserve the known four-unit daily demand baseline.",
    },
  };
