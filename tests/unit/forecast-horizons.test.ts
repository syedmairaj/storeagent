import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateForecastHorizons,
} from "@/lib/forecasting/horizons";

describe("forecast-horizon-v1", () => {
  it("calculates lead-time review and combined demand", () => {
    expect(
      calculateForecastHorizons({
        dailyDemand: 4,
        leadTimeDays: 7,
        reviewPeriodDays: 14,
      }),
    ).toEqual({
      algorithmVersion: "forecast-horizon-v1",
      dailyDemand: 4,
      leadTimeDays: 7,
      reviewPeriodDays: 14,
      replenishmentHorizonDays: 21,
      leadTimeDemandUnits: 28,
      reviewPeriodDemandUnits: 56,
      replenishmentDemandUnits: 84,
      reasonCodes: [],
    });
  });

  it("preserves fractional expected demand", () => {
    const result =
      calculateForecastHorizons({
        dailyDemand: 2.25,
        leadTimeDays: 3,
        reviewPeriodDays: 4,
      });

    expect(
      result.leadTimeDemandUnits,
    ).toBe(6.75);

    expect(
      result.replenishmentDemandUnits,
    ).toBe(15.75);
  });

  it("preserves known zero demand", () => {
    const result =
      calculateForecastHorizons({
        dailyDemand: 0,
        leadTimeDays: 7,
        reviewPeriodDays: 14,
      });

    expect(result.leadTimeDemandUnits).toBe(0);
    expect(result.replenishmentDemandUnits).toBe(0);
  });

  it("fails closed for unavailable daily demand", () => {
    const result =
      calculateForecastHorizons({
        dailyDemand: null,
        leadTimeDays: 7,
        reviewPeriodDays: 14,
      });

    expect(result.leadTimeDemandUnits).toBeNull();
    expect(result.reviewPeriodDemandUnits).toBeNull();
    expect(result.replenishmentDemandUnits).toBeNull();

    expect(result.reasonCodes).toContain(
      "DAILY_DEMAND_UNAVAILABLE",
    );
  });

  it("still calculates review-period demand when lead time is unavailable", () => {
    const result =
      calculateForecastHorizons({
        dailyDemand: 4,
        leadTimeDays: null,
        reviewPeriodDays: 14,
      });

    expect(result.leadTimeDemandUnits).toBeNull();
    expect(result.reviewPeriodDemandUnits).toBe(56);
    expect(
      result.replenishmentDemandUnits,
    ).toBeNull();

    expect(result.reasonCodes).toContain(
      "LEAD_TIME_UNAVAILABLE",
    );
  });

  it("still calculates lead-time demand when review period is unavailable", () => {
    const result =
      calculateForecastHorizons({
        dailyDemand: 4,
        leadTimeDays: 7,
        reviewPeriodDays: null,
      });

    expect(result.leadTimeDemandUnits).toBe(28);
    expect(result.reviewPeriodDemandUnits).toBeNull();
    expect(
      result.replenishmentDemandUnits,
    ).toBeNull();

    expect(result.reasonCodes).toContain(
      "REVIEW_PERIOD_UNAVAILABLE",
    );
  });

  it("supports zero-day horizons explicitly", () => {
    expect(
      calculateForecastHorizons({
        dailyDemand: 5,
        leadTimeDays: 0,
        reviewPeriodDays: 0,
      }),
    ).toEqual({
      algorithmVersion: "forecast-horizon-v1",
      dailyDemand: 5,
      leadTimeDays: 0,
      reviewPeriodDays: 0,
      replenishmentHorizonDays: 0,
      leadTimeDemandUnits: 0,
      reviewPeriodDemandUnits: 0,
      replenishmentDemandUnits: 0,
      reasonCodes: [],
    });
  });

  it("rejects negative horizon inputs", () => {
    expect(() =>
      calculateForecastHorizons({
        dailyDemand: 5,
        leadTimeDays: -1,
        reviewPeriodDays: 14,
      }),
    ).toThrow(
      "leadTimeDays must be a non-negative finite number.",
    );
  });
});
