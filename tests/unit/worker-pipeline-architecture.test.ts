import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(
  relativePath: string,
): string {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath,
    ),
    "utf8",
  );
}

describe("inventory intelligence worker pipeline architecture", () => {
  it("does not reimplement deterministic metrics", () => {
    const source =
      read(
        "workers/pipeline.ts",
      );

    const forbidden = [
      "calculateSalesVelocity",
      "calculateDaysOfStock",
      "calculateSafetyStock",
      "calculateReorderPoint",
      "calculateTargetStock",
      "calculateRecommendedOrderQuantity",
      "calculateStockoutRisk",
      "calculateOverstockRisk",
    ];

    for (
      const functionName
      of forbidden
    ) {
      expect(
        source.includes(
          functionName,
        ),
        `Worker pipeline must not reimplement or directly own ${functionName}`,
      ).toBe(false);
    }
  });

  it("does not reimplement deterministic forecasting", () => {
    const source =
      read(
        "workers/pipeline.ts",
      );

    const forbidden = [
      "calculateWeightedDemandForecast",
      "applyTrendAdjustment",
      "resolveColdStartForecast",
      "calculateForecastConfidence",
      "calculateForecastHorizons",
      "calculateForecastBacktest",
    ];

    for (
      const functionName
      of forbidden
    ) {
      expect(
        source.includes(
          functionName,
        ),
        `Worker pipeline must not reimplement or directly own ${functionName}`,
      ).toBe(false);
    }
  });

  it("does not reimplement deterministic inventory decision logic", () => {
    const source =
      read(
        "workers/pipeline.ts",
      );

    expect(
      source,
    ).not.toContain(
      "decideInventoryAction",
    );

    const commercialOutputs = [
      "recommendedQuantity",
      "reorderPointUnits",
      "safetyStockUnits",
      "stockoutRisk",
      "overstockRisk",
      "forecastExpectedDemandUnits",
    ];

    for (
      const field
      of commercialOutputs
    ) {
      expect(
        source.includes(field),
        `Worker pipeline must not calculate ${field}`,
      ).toBe(false);
    }
  });

  it("does not allow AI into deterministic pipeline truth", () => {
    const source =
      read(
        "workers/pipeline.ts",
      );

    const forbidden = [
      "@/lib/ai",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Pipeline orchestration must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("does not consume raw provider data", () => {
    const source =
      read(
        "workers/pipeline.ts",
      );

    const forbidden = [
      "@/lib/providers",
      "@shopify",
      "rawPayload",
      "shopifyPayload",
      "csvRow",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Pipeline orchestration must not consume ${dependency}`,
      ).toBe(false);
    }
  });

  it("keeps orchestration independent of persistence and queue vendors", () => {
    const source =
      read(
        "workers/pipeline.ts",
      );

    const forbidden = [
      "@supabase",
      "prisma",
      "inngest",
      "trigger.dev",
      "bullmq",
      "pg-boss",
      "redis",
      "upstash",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Pipeline contract must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("preserves deterministic decision ownership in the existing engine", () => {
    const decisionTest =
      read(
        "tests/unit/decision-orchestration.test.ts",
      );

    expect(
      decisionTest,
    ).toContain(
      "decideInventoryAction",
    );

    const worker =
      read(
        "workers/pipeline.ts",
      );

    expect(
      worker,
    ).not.toContain(
      "decideInventoryAction",
    );
  });
});
