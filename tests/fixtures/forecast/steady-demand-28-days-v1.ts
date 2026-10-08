import type {
  StoreAgentEvaluationFixture,
} from "@/tests/evaluation/fixture";

export interface SteadyDemand28DaysFixtureInput {
  variantId: string;

  observations:
    readonly {
      date: string;
      unitsSold: number;
    }[];
}

export const steadyDemand28DaysFixture:
  StoreAgentEvaluationFixture<
    SteadyDemand28DaysFixtureInput
  > = {
    fixtureSchemaVersion: 1,

    id:
      "forecast/steady-demand-28-days-v1",

    domain:
      "forecast",

    fixtureVersion: 1,

    description:
      "Twenty-eight complete UTC-date demand observations with steady demand of four units per day.",

    input: {
      variantId:
        "variant-steady-1",

      observations:
        Array.from(
          {
            length: 28,
          },
          (
            _,
            index,
          ) => {
            const day =
              String(
                index + 1,
              ).padStart(
                2,
                "0",
              );

            return {
              date:
                `2026-09-${day}`,

              unitsSold: 4,
            };
          },
        ),
    },
  };
