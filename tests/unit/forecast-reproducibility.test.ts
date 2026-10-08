import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildForecastReproducibilityFingerprint,
  FORECAST_ALGORITHM_VERSIONS_V1,
} from "@/lib/forecasting/reproducibility";

const descriptor = {
  algorithmVersions:
    FORECAST_ALGORITHM_VERSIONS_V1,
  inputStartDate: "2026-07-01",
  inputEndDate: "2026-09-30",
  configurationVersion:
    "forecast-config-v1",
};

describe("forecast reproducibility", () => {
  it("produces identical fingerprint for identical inputs", () => {
    const a =
      buildForecastReproducibilityFingerprint(
        descriptor,
        {
          variantId: "variant-1",
          dailyDemand: [1, 2, 3],
        },
      );

    const b =
      buildForecastReproducibilityFingerprint(
        descriptor,
        {
          variantId: "variant-1",
          dailyDemand: [1, 2, 3],
        },
      );

    expect(a.fingerprint).toBe(
      b.fingerprint,
    );
  });

  it("is stable across object property order", () => {
    const a =
      buildForecastReproducibilityFingerprint(
        descriptor,
        {
          variantId: "variant-1",
          dailyDemand: [1, 2, 3],
        },
      );

    const b =
      buildForecastReproducibilityFingerprint(
        descriptor,
        {
          dailyDemand: [1, 2, 3],
          variantId: "variant-1",
        },
      );

    expect(a.fingerprint).toBe(
      b.fingerprint,
    );
  });

  it("changes fingerprint when canonical input changes", () => {
    const a =
      buildForecastReproducibilityFingerprint(
        descriptor,
        {
          dailyDemand: [1, 2, 3],
        },
      );

    const b =
      buildForecastReproducibilityFingerprint(
        descriptor,
        {
          dailyDemand: [1, 2, 4],
        },
      );

    expect(a.fingerprint).not.toBe(
      b.fingerprint,
    );
  });

  it("changes fingerprint when configuration version changes", () => {
    const a =
      buildForecastReproducibilityFingerprint(
        descriptor,
        {
          dailyDemand: [1, 2, 3],
        },
      );

    const b =
      buildForecastReproducibilityFingerprint(
        {
          ...descriptor,
          configurationVersion:
            "forecast-config-v2",
        },
        {
          dailyDemand: [1, 2, 3],
        },
      );

    expect(a.fingerprint).not.toBe(
      b.fingerprint,
    );
  });

  it("changes fingerprint when algorithm version changes", () => {
    const a =
      buildForecastReproducibilityFingerprint(
        descriptor,
        {
          dailyDemand: [1, 2, 3],
        },
      );

    const b =
      buildForecastReproducibilityFingerprint(
        {
          ...descriptor,
          algorithmVersions: {
            ...FORECAST_ALGORITHM_VERSIONS_V1,
            weightedDemand:
              "weighted-demand-v2",
          } as unknown as typeof FORECAST_ALGORITHM_VERSIONS_V1,
        },
        {
          dailyDemand: [1, 2, 3],
        },
      );

    expect(a.fingerprint).not.toBe(
      b.fingerprint,
    );
  });

  it("requires explicit input period and configuration version", () => {
    expect(() =>
      buildForecastReproducibilityFingerprint(
        {
          ...descriptor,
          inputStartDate: "",
        },
        {},
      ),
    ).toThrow(
      "inputStartDate is required.",
    );
  });
});
