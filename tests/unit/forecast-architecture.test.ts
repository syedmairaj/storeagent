import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  calculateWeightedDemandForecast,
} from "@/lib/forecasting/weighted-demand";

import {
  applyTrendAdjustment,
} from "@/lib/forecasting/trend-adjustment";

import {
  resolveColdStartForecast,
} from "@/lib/forecasting/cold-start";

import {
  calculateForecastConfidence,
} from "@/lib/forecasting/confidence";

import {
  buildForecastReproducibilityFingerprint,
  FORECAST_ALGORITHM_VERSIONS_V1,
} from "@/lib/forecasting/reproducibility";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("StoreAgent forecast architecture", () => {
  it("keeps forecasting independent from UI AI and provider SDKs", () => {
    const files = [
      "lib/forecasting/weighted-demand.ts",
      "lib/forecasting/trend-adjustment.ts",
      "lib/forecasting/stockout-censoring.ts",
      "lib/forecasting/promotion-treatment.ts",
      "lib/forecasting/cold-start.ts",
      "lib/forecasting/confidence.ts",
      "lib/forecasting/horizons.ts",
      "lib/forecasting/backtesting.ts",
      "lib/forecasting/reproducibility.ts",
    ];

    const forbidden = [
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "@shopify",
      "stripe",
    ];

    for (const file of files) {
      const source = read(file);

      for (const value of forbidden) {
        expect(
          source.includes(value),
          `${file} must not depend on ${value}`,
        ).toBe(false);
      }
    }
  });

  it("never produces negative weighted demand", () => {
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
            dailyDemand: 3,
            usableDays: 14,
          },
        ],
      });

    expect(result.dailyDemand).not.toBeNull();

    expect(
      result.dailyDemand as number,
    ).toBeGreaterThanOrEqual(0);
  });

  it("trend adjustment never produces negative forecast demand", () => {
    const result =
      applyTrendAdjustment({
        baselineDailyDemand: 1,
        recentDailyDemand: 0,
        priorDailyDemand: 100,
      });

    expect(
      result.adjustedDailyDemand,
    ).toBeGreaterThanOrEqual(0);
  });

  it("cold-start policy does not fabricate demand", () => {
    const result =
      resolveColdStartForecast({
        dataSufficiency: "insufficient",
        baselineDailyDemand: null,
      });

    expect(result.dailyDemand).toBeNull();
    expect(result.mode).toBe("unavailable");
  });

  it("insufficient history can never produce high or medium confidence", () => {
    const result =
      calculateForecastConfidence({
        dataSufficiency: "insufficient",
        baselineAvailable: true,
        totalDays: 6,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: 0,
      });

    expect(result.confidence).toBe("low");
  });

  it("severe data-quality degradation forces low confidence", () => {
    const result =
      calculateForecastConfidence({
        dataSufficiency: "sufficient",
        baselineAvailable: true,
        totalDays: 100,
        censoredDays: 50,
        promotionExcludedDays: 0,
        unusableDays: 0,
      });

    expect(result.confidence).toBe("low");
  });

  it("reproducibility fingerprint is deterministic", () => {
    const descriptor = {
      algorithmVersions:
        FORECAST_ALGORITHM_VERSIONS_V1,
      inputStartDate: "2026-07-01",
      inputEndDate: "2026-09-30",
      configurationVersion:
        "forecast-config-v1",
    };

    const input = {
      variantId: "variant-1",
      observations: [1, 2, 3, 4],
    };

    const a =
      buildForecastReproducibilityFingerprint(
        descriptor,
        input,
      );

    const b =
      buildForecastReproducibilityFingerprint(
        descriptor,
        input,
      );

    expect(a.fingerprint).toBe(
      b.fingerprint,
    );
  });

  it("forecasting documentation keeps decisions outside forecasting", () => {
    const spec = read(
      "docs/FORECASTING.md",
    );

    expect(spec).toContain(
      "Forecasting answers:",
    );

    expect(spec).toContain(
      "How much demand is expected?",
    );

    expect(spec).toContain(
      "Forecasting must not directly emit:",
    );

    expect(spec).toContain("REORDER");
    expect(spec).toContain("REDUCE");
    expect(spec).toContain("PROMOTE");
    expect(spec).toContain("WATCH");
  });

  it("forecast documentation explicitly excludes AI from numeric truth", () => {
    const spec = read(
      "docs/FORECASTING.md",
    );

    expect(spec).toContain(
      "AI does not calculate forecast truth.",
    );

    expect(spec).toContain(
      "AI cannot assign, raise, or override forecast confidence.",
    );
  });
});
