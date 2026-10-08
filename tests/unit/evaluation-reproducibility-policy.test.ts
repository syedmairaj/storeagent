import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildForecastReproducibilityFingerprint,
  FORECAST_ALGORITHM_VERSIONS_V1,
} from "@/lib/forecasting/reproducibility";

import {
  buildDecisionReproducibilityFingerprint,
  DECISION_ALGORITHM_VERSIONS_V1,
} from "@/lib/decision-engine/reproducibility";

const forecastDescriptor = {
  algorithmVersions:
    FORECAST_ALGORITHM_VERSIONS_V1,

  inputStartDate:
    "2026-07-01",

  inputEndDate:
    "2026-09-30",

  configurationVersion:
    "forecast-config-v1",
};

const decisionDescriptor = {
  algorithmVersions:
    DECISION_ALGORITHM_VERSIONS_V1,

  configurationVersion:
    "decision-config-v1",
};

describe(
  "StoreAgent reproducibility policy",
  () => {
    it(
      "forecast fingerprint is repeatable for identical canonical truth",
      () => {
        const input = {
          variantId:
            "variant-a",

          demand: [
            1,
            2,
            3,
          ],
        };

        const first =
          buildForecastReproducibilityFingerprint(
            forecastDescriptor,
            input,
          );

        const second =
          buildForecastReproducibilityFingerprint(
            forecastDescriptor,
            input,
          );

        expect(
          first.fingerprint,
        ).toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "forecast property order does not create false drift",
      () => {
        const first =
          buildForecastReproducibilityFingerprint(
            forecastDescriptor,
            {
              variantId:
                "variant-a",

              demand: [
                1,
                2,
              ],
            },
          );

        const second =
          buildForecastReproducibilityFingerprint(
            forecastDescriptor,
            {
              demand: [
                1,
                2,
              ],

              variantId:
                "variant-a",
            },
          );

        expect(
          first.fingerprint,
        ).toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "forecast canonical input change changes fingerprint",
      () => {
        const first =
          buildForecastReproducibilityFingerprint(
            forecastDescriptor,
            {
              demand: [
                1,
                2,
                3,
              ],
            },
          );

        const second =
          buildForecastReproducibilityFingerprint(
            forecastDescriptor,
            {
              demand: [
                1,
                2,
                4,
              ],
            },
          );

        expect(
          first.fingerprint,
        ).not.toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "forecast input period change changes fingerprint",
      () => {
        const first =
          buildForecastReproducibilityFingerprint(
            forecastDescriptor,
            {
              demand: [
                1,
                2,
                3,
              ],
            },
          );

        const second =
          buildForecastReproducibilityFingerprint(
            {
              ...forecastDescriptor,

              inputStartDate:
                "2026-08-01",
            },

            {
              demand: [
                1,
                2,
                3,
              ],
            },
          );

        expect(
          first.fingerprint,
        ).not.toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "forecast algorithm version change changes fingerprint",
      () => {
        const first =
          buildForecastReproducibilityFingerprint(
            forecastDescriptor,
            {},
          );

        const second =
          buildForecastReproducibilityFingerprint(
            {
              ...forecastDescriptor,

              algorithmVersions: {
                ...FORECAST_ALGORITHM_VERSIONS_V1,

                weightedDemand:
                  "weighted-demand-v2",
              } as unknown as typeof FORECAST_ALGORITHM_VERSIONS_V1,
            },

            {},
          );

        expect(
          first.fingerprint,
        ).not.toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "decision fingerprint is repeatable for identical canonical truth",
      () => {
        const input = {
          availableQuantity:
            10,

          stockoutRisk:
            "high",
        };

        expect(
          buildDecisionReproducibilityFingerprint(
            decisionDescriptor,
            input,
          ).fingerprint,
        ).toBe(
          buildDecisionReproducibilityFingerprint(
            decisionDescriptor,
            input,
          ).fingerprint,
        );
      },
    );

    it(
      "decision property order does not create false drift",
      () => {
        const first =
          buildDecisionReproducibilityFingerprint(
            decisionDescriptor,
            {
              availableQuantity:
                10,

              stockoutRisk:
                "high",
            },
          );

        const second =
          buildDecisionReproducibilityFingerprint(
            decisionDescriptor,
            {
              stockoutRisk:
                "high",

              availableQuantity:
                10,
            },
          );

        expect(
          first.fingerprint,
        ).toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "decision canonical input change changes fingerprint",
      () => {
        const first =
          buildDecisionReproducibilityFingerprint(
            decisionDescriptor,
            {
              availableQuantity:
                10,
            },
          );

        const second =
          buildDecisionReproducibilityFingerprint(
            decisionDescriptor,
            {
              availableQuantity:
                11,
            },
          );

        expect(
          first.fingerprint,
        ).not.toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "decision configuration change changes fingerprint",
      () => {
        const first =
          buildDecisionReproducibilityFingerprint(
            decisionDescriptor,
            {},
          );

        const second =
          buildDecisionReproducibilityFingerprint(
            {
              ...decisionDescriptor,

              configurationVersion:
                "decision-config-v2",
            },
            {},
          );

        expect(
          first.fingerprint,
        ).not.toBe(
          second.fingerprint,
        );
      },
    );

    it(
      "decision algorithm version change changes fingerprint",
      () => {
        const first =
          buildDecisionReproducibilityFingerprint(
            decisionDescriptor,
            {},
          );

        const second =
          buildDecisionReproducibilityFingerprint(
            {
              ...decisionDescriptor,

              algorithmVersions: {
                ...DECISION_ALGORITHM_VERSIONS_V1,

                reorder:
                  "reorder-rule-v2",
              } as unknown as typeof DECISION_ALGORITHM_VERSIONS_V1,
            },

            {},
          );

        expect(
          first.fingerprint,
        ).not.toBe(
          second.fingerprint,
        );
      },
    );
  },
);
