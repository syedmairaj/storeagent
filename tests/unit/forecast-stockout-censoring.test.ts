import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyDemandObservation,
  summarizeDemandSeriesQuality,
} from "@/lib/forecasting/stockout-censoring";

describe("stockout-censoring-v1", () => {
  it("keeps positive-sales days usable", () => {
    expect(
      classifyDemandObservation({
        date: "2026-10-01",
        unitsSold: 5,
        availability: "unavailable",
        dataComplete: true,
      }),
    ).toEqual({
      date: "2026-10-01",
      unitsSold: 5,
      disposition: "usable",
      reasonCode: null,
    });
  });

  it("censors zero-sales days when inventory was unavailable", () => {
    expect(
      classifyDemandObservation({
        date: "2026-10-02",
        unitsSold: 0,
        availability: "unavailable",
        dataComplete: true,
      }),
    ).toEqual({
      date: "2026-10-02",
      unitsSold: 0,
      disposition: "stockout_censored",
      reasonCode: "STOCKOUT_CENSORED",
    });
  });

  it("keeps zero-sales days usable when inventory was available", () => {
    expect(
      classifyDemandObservation({
        date: "2026-10-03",
        unitsSold: 0,
        availability: "available",
        dataComplete: true,
      }),
    ).toEqual({
      date: "2026-10-03",
      unitsSold: 0,
      disposition: "usable",
      reasonCode: null,
    });
  });

  it("does not convert unknown availability into zero demand", () => {
    expect(
      classifyDemandObservation({
        date: "2026-10-04",
        unitsSold: 0,
        availability: "unknown",
        dataComplete: true,
      }),
    ).toEqual({
      date: "2026-10-04",
      unitsSold: 0,
      disposition: "unusable",
      reasonCode: "AVAILABILITY_UNKNOWN",
    });
  });

  it("treats incomplete source data as unusable", () => {
    expect(
      classifyDemandObservation({
        date: "2026-10-05",
        unitsSold: 0,
        availability: "available",
        dataComplete: false,
      }),
    ).toEqual({
      date: "2026-10-05",
      unitsSold: 0,
      disposition: "unusable",
      reasonCode: "DATA_INCOMPLETE",
    });
  });

  it("rejects negative observed sales", () => {
    expect(() =>
      classifyDemandObservation({
        date: "2026-10-06",
        unitsSold: -1,
        availability: "available",
        dataComplete: true,
      }),
    ).toThrow(
      "unitsSold must be a non-negative integer.",
    );
  });

  it("summarizes usable censored and unusable observations", () => {
    expect(
      summarizeDemandSeriesQuality([
        {
          date: "2026-10-01",
          unitsSold: 2,
          availability: "available",
          dataComplete: true,
        },
        {
          date: "2026-10-02",
          unitsSold: 0,
          availability: "unavailable",
          dataComplete: true,
        },
        {
          date: "2026-10-03",
          unitsSold: 0,
          availability: "unknown",
          dataComplete: true,
        },
        {
          date: "2026-10-04",
          unitsSold: 0,
          availability: "available",
          dataComplete: true,
        },
      ]),
    ).toEqual({
      usableDays: 2,
      censoredDays: 1,
      unusableDays: 1,
      totalDays: 4,
    });
  });
});
