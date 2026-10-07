import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateForecastConfidence,
} from "@/lib/forecasting/confidence";

describe("forecast-confidence-v1", () => {
  it("gives high confidence to sufficient clean history", () => {
    expect(
      calculateForecastConfidence({
        dataSufficiency: "sufficient",
        baselineAvailable: true,
        totalDays: 30,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: 0,
      }),
    ).toEqual({
      algorithmVersion: "forecast-confidence-v1",
      confidence: "high",
      unusableRatio: 0,
      censoredRatio: 0,
      promotionExcludedRatio: 0,
      reasonCodes: [],
    });
  });

  it("starts limited history at medium confidence", () => {
    const result =
      calculateForecastConfidence({
        dataSufficiency: "limited",
        baselineAvailable: true,
        totalDays: 14,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: 0,
      });

    expect(result.confidence).toBe("medium");

    expect(result.reasonCodes).toContain(
      "LIMITED_HISTORY",
    );
  });

  it("keeps insufficient history low even with clean data", () => {
    expect(
      calculateForecastConfidence({
        dataSufficiency: "insufficient",
        baselineAvailable: true,
        totalDays: 6,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: 0,
      }).confidence,
    ).toBe("low");
  });

  it("forces confidence low when baseline is unavailable", () => {
    const result =
      calculateForecastConfidence({
        dataSufficiency: "sufficient",
        baselineAvailable: false,
        totalDays: 30,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: 0,
      });

    expect(result.confidence).toBe("low");

    expect(result.reasonCodes).toContain(
      "BASELINE_UNAVAILABLE",
    );
  });

  it("degrades sufficient history one level for moderate censoring", () => {
    const result =
      calculateForecastConfidence({
        dataSufficiency: "sufficient",
        baselineAvailable: true,
        totalDays: 100,
        censoredDays: 20,
        promotionExcludedDays: 0,
        unusableDays: 0,
      });

    expect(result.confidence).toBe("medium");

    expect(result.reasonCodes).toContain(
      "MODERATE_CENSORING_RATIO",
    );
  });

  it("degrades limited history to low for moderate data issues", () => {
    expect(
      calculateForecastConfidence({
        dataSufficiency: "limited",
        baselineAvailable: true,
        totalDays: 20,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: 2,
      }).confidence,
    ).toBe("low");
  });

  it("forces low confidence for severe censoring", () => {
    const result =
      calculateForecastConfidence({
        dataSufficiency: "sufficient",
        baselineAvailable: true,
        totalDays: 100,
        censoredDays: 40,
        promotionExcludedDays: 0,
        unusableDays: 0,
      });

    expect(result.confidence).toBe("low");

    expect(result.reasonCodes).toContain(
      "HIGH_CENSORING_RATIO",
    );
  });

  it("forces low confidence for severe promotion contamination", () => {
    expect(
      calculateForecastConfidence({
        dataSufficiency: "sufficient",
        baselineAvailable: true,
        totalDays: 100,
        censoredDays: 0,
        promotionExcludedDays: 50,
        unusableDays: 0,
      }).confidence,
    ).toBe("low");
  });

  it("forces low confidence for severe unusable data", () => {
    expect(
      calculateForecastConfidence({
        dataSufficiency: "sufficient",
        baselineAvailable: true,
        totalDays: 100,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: 25,
      }).confidence,
    ).toBe("low");
  });

  it("does not raise low confidence when data quality is clean", () => {
    expect(
      calculateForecastConfidence({
        dataSufficiency: "insufficient",
        baselineAvailable: true,
        totalDays: 5,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: 0,
      }).confidence,
    ).toBe("low");
  });

  it("rejects observation counts greater than total days", () => {
    expect(() =>
      calculateForecastConfidence({
        dataSufficiency: "sufficient",
        baselineAvailable: true,
        totalDays: 10,
        censoredDays: 11,
        promotionExcludedDays: 0,
        unusableDays: 0,
      }),
    ).toThrow(
      "censoredDays cannot exceed totalDays.",
    );
  });
});
