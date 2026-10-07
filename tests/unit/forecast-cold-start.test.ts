import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveColdStartForecast,
} from "@/lib/forecasting/cold-start";

describe("cold-start-v1", () => {
  it("refuses numeric forecast for insufficient history", () => {
    expect(
      resolveColdStartForecast({
        dataSufficiency: "insufficient",
        baselineDailyDemand: 4,
      }),
    ).toEqual({
      algorithmVersion: "cold-start-v1",
      mode: "unavailable",
      dailyDemand: null,
      dataSufficiency: "insufficient",
      reasonCode: "INSUFFICIENT_HISTORY",
    });
  });

  it("allows own-SKU forecast with limited history", () => {
    expect(
      resolveColdStartForecast({
        dataSufficiency: "limited",
        baselineDailyDemand: 4,
      }),
    ).toEqual({
      algorithmVersion: "cold-start-v1",
      mode: "limited_history",
      dailyDemand: 4,
      dataSufficiency: "limited",
      reasonCode: null,
    });
  });

  it("allows standard forecast with sufficient history", () => {
    expect(
      resolveColdStartForecast({
        dataSufficiency: "sufficient",
        baselineDailyDemand: 6,
      }),
    ).toEqual({
      algorithmVersion: "cold-start-v1",
      mode: "standard",
      dailyDemand: 6,
      dataSufficiency: "sufficient",
      reasonCode: null,
    });
  });

  it("preserves known zero demand with limited history", () => {
    expect(
      resolveColdStartForecast({
        dataSufficiency: "limited",
        baselineDailyDemand: 0,
      }),
    ).toEqual({
      algorithmVersion: "cold-start-v1",
      mode: "limited_history",
      dailyDemand: 0,
      dataSufficiency: "limited",
      reasonCode: null,
    });
  });

  it("fails closed when baseline is unavailable", () => {
    expect(
      resolveColdStartForecast({
        dataSufficiency: "sufficient",
        baselineDailyDemand: null,
      }),
    ).toEqual({
      algorithmVersion: "cold-start-v1",
      mode: "unavailable",
      dailyDemand: null,
      dataSufficiency: "sufficient",
      reasonCode: "BASELINE_UNAVAILABLE",
    });
  });

  it("rejects negative baseline demand", () => {
    expect(() =>
      resolveColdStartForecast({
        dataSufficiency: "limited",
        baselineDailyDemand: -1,
      }),
    ).toThrow(
      "baselineDailyDemand must be a non-negative finite number.",
    );
  });
});
