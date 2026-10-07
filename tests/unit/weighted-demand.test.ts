import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateWeightedDemandForecast,
} from "@/lib/forecasting/weighted-demand";

describe("weighted-demand-v1", () => {
  it("combines all four windows using fixed weights", () => {
    const result =
      calculateWeightedDemandForecast({
        windows: [
          {
            windowDays: 7,
            dailyDemand: 10,
            usableDays: 7,
          },
          {
            windowDays: 14,
            dailyDemand: 8,
            usableDays: 14,
          },
          {
            windowDays: 30,
            dailyDemand: 6,
            usableDays: 30,
          },
          {
            windowDays: 90,
            dailyDemand: 4,
            usableDays: 90,
          },
        ],
      });

    expect(result.algorithmVersion).toBe(
      "weighted-demand-v1",
    );

    expect(result.dailyDemand).toBeCloseTo(
      8,
      10,
    );
  });

  it("renormalizes weights when a window is unavailable", () => {
    const result =
      calculateWeightedDemandForecast({
        windows: [
          {
            windowDays: 7,
            dailyDemand: 10,
            usableDays: 7,
          },
          {
            windowDays: 14,
            dailyDemand: null,
            usableDays: 14,
          },
          {
            windowDays: 30,
            dailyDemand: 4,
            usableDays: 30,
          },
        ],
      });

    expect(result.reasonCode).toBeNull();

    expect(
      result.activeWindows.map(
        (window) => window.windowDays,
      ),
    ).toEqual([7, 30]);

    expect(result.dailyDemand).toBeCloseTo(
      8,
      10,
    );
  });

  it("excludes windows below minimum usable-day coverage", () => {
    const result =
      calculateWeightedDemandForecast({
        windows: [
          {
            windowDays: 7,
            dailyDemand: 12,
            usableDays: 3,
          },
          {
            windowDays: 14,
            dailyDemand: 6,
            usableDays: 14,
          },
        ],
      });

    expect(
      result.activeWindows.map(
        (window) => window.windowDays,
      ),
    ).toEqual([14]);

    expect(result.dailyDemand).toBe(6);
  });

  it("preserves known zero demand", () => {
    const result =
      calculateWeightedDemandForecast({
        windows: [
          {
            windowDays: 7,
            dailyDemand: 0,
            usableDays: 7,
          },
          {
            windowDays: 14,
            dailyDemand: 0,
            usableDays: 14,
          },
        ],
      });

    expect(result.dailyDemand).toBe(0);
    expect(result.reasonCode).toBeNull();
  });

  it("returns no forecast when no window is usable", () => {
    expect(
      calculateWeightedDemandForecast({
        windows: [
          {
            windowDays: 7,
            dailyDemand: null,
            usableDays: 7,
          },
          {
            windowDays: 14,
            dailyDemand: 5,
            usableDays: 3,
          },
        ],
      }),
    ).toEqual({
      algorithmVersion:
        "weighted-demand-v1",
      dailyDemand: null,
      activeWindows: [],
      reasonCode:
        "NO_USABLE_FORECAST_WINDOWS",
    });
  });

  it("rejects negative demand", () => {
    expect(() =>
      calculateWeightedDemandForecast({
        windows: [
          {
            windowDays: 7,
            dailyDemand: -1,
            usableDays: 7,
          },
        ],
      }),
    ).toThrow(
      "dailyDemand must be a non-negative finite number.",
    );
  });

  it("rejects usable days greater than the window length", () => {
    expect(() =>
      calculateWeightedDemandForecast({
        windows: [
          {
            windowDays: 7,
            dailyDemand: 4,
            usableDays: 8,
          },
        ],
      }),
    ).toThrow(
      "usableDays cannot exceed windowDays.",
    );
  });

  it("rejects duplicate windows", () => {
    expect(() =>
      calculateWeightedDemandForecast({
        windows: [
          {
            windowDays: 7,
            dailyDemand: 4,
            usableDays: 7,
          },
          {
            windowDays: 7,
            dailyDemand: 5,
            usableDays: 7,
          },
        ],
      }),
    ).toThrow(
      "Duplicate 7-day forecast window.",
    );
  });
});
