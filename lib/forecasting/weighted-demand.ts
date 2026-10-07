import type {
  ForecastWindowDays,
  WeightedDemandForecastInput,
  WeightedDemandForecastResult,
} from "./types";

export const WEIGHTED_DEMAND_VERSION_V1 =
  "weighted-demand-v1" as const;

export const WINDOW_WEIGHTS_V1: Readonly<
  Record<ForecastWindowDays, number>
> = {
  7: 0.4,
  14: 0.3,
  30: 0.2,
  90: 0.1,
};

export const MIN_USABLE_DAYS_BY_WINDOW_V1: Readonly<
  Record<ForecastWindowDays, number>
> = {
  7: 4,
  14: 7,
  30: 15,
  90: 45,
};

function assertNonNegativeFinite(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative finite number.`,
    );
  }
}

function assertUsableDays(
  usableDays: number,
  windowDays: ForecastWindowDays,
): void {
  if (
    !Number.isInteger(usableDays) ||
    usableDays < 0
  ) {
    throw new Error(
      "usableDays must be a non-negative integer.",
    );
  }

  if (usableDays > windowDays) {
    throw new Error(
      "usableDays cannot exceed windowDays.",
    );
  }
}

/**
 * weighted-demand-v1
 *
 * Uses fixed configured weights:
 *
 * 7d  = 0.40
 * 14d = 0.30
 * 30d = 0.20
 * 90d = 0.10
 *
 * Windows without sufficient usable observations are excluded.
 * Remaining weights are renormalized deterministically.
 */
export function calculateWeightedDemandForecast(
  input: WeightedDemandForecastInput,
): WeightedDemandForecastResult {
  const seen = new Set<ForecastWindowDays>();

  const eligible = input.windows.flatMap((window) => {
    if (seen.has(window.windowDays)) {
      throw new Error(
        `Duplicate ${window.windowDays}-day forecast window.`,
      );
    }

    seen.add(window.windowDays);

    assertUsableDays(
      window.usableDays,
      window.windowDays,
    );

    if (window.dailyDemand === null) {
      return [];
    }

    assertNonNegativeFinite(
      window.dailyDemand,
      "dailyDemand",
    );

    if (
      window.usableDays <
      MIN_USABLE_DAYS_BY_WINDOW_V1[
        window.windowDays
      ]
    ) {
      return [];
    }

    return [{
      windowDays: window.windowDays,
      dailyDemand: window.dailyDemand,
      usableDays: window.usableDays,
      configuredWeight:
        WINDOW_WEIGHTS_V1[window.windowDays],
    }];
  });

  if (eligible.length === 0) {
    return {
      algorithmVersion:
        WEIGHTED_DEMAND_VERSION_V1,
      dailyDemand: null,
      activeWindows: [],
      reasonCode: "NO_USABLE_FORECAST_WINDOWS",
    };
  }

  const activeWeightTotal = eligible.reduce(
    (sum, window) =>
      sum + window.configuredWeight,
    0,
  );

  const activeWindows = eligible.map(
    (window) => ({
      ...window,
      normalizedWeight:
        window.configuredWeight /
        activeWeightTotal,
    }),
  );

  const dailyDemand = activeWindows.reduce(
    (sum, window) =>
      sum +
      window.dailyDemand *
        window.normalizedWeight,
    0,
  );

  return {
    algorithmVersion:
      WEIGHTED_DEMAND_VERSION_V1,
    dailyDemand,
    activeWindows,
    reasonCode: null,
  };
}
