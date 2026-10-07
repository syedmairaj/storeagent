import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyHistorySufficiency,
} from "@/lib/forecasting/history-sufficiency";

describe("forecast-history-sufficiency-v1", () => {
  it("classifies less than seven usable days as insufficient", () => {
    expect(
      classifyHistorySufficiency({
        usableDays: 6,
      }),
    ).toEqual({
      dataSufficiency: "insufficient",
      usableDays: 6,
    });
  });

  it("classifies seven usable days as limited", () => {
    expect(
      classifyHistorySufficiency({
        usableDays: 7,
      }).dataSufficiency,
    ).toBe("limited");
  });

  it("keeps twenty-seven usable days limited", () => {
    expect(
      classifyHistorySufficiency({
        usableDays: 27,
      }).dataSufficiency,
    ).toBe("limited");
  });

  it("classifies twenty-eight usable days as sufficient", () => {
    expect(
      classifyHistorySufficiency({
        usableDays: 28,
      }).dataSufficiency,
    ).toBe("sufficient");
  });

  it("rejects negative usable-day counts", () => {
    expect(() =>
      classifyHistorySufficiency({
        usableDays: -1,
      }),
    ).toThrow(
      "usableDays must be a non-negative integer.",
    );
  });
});
