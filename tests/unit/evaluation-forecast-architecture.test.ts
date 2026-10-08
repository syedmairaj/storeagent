import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT =
  process.cwd();

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

describe(
  "StoreAgent forecast evaluation architecture",
  () => {
    it(
      "executes canonical forecasting modules rather than implementing a second forecast engine",
      () => {
        const source =
          read(
            "tests/evaluation/forecast-runner.ts",
          );

        for (
          const moduleName of [
            "history-sufficiency",
            "stockout-censoring",
            "promotion-treatment",
            "weighted-demand",
            "trend-adjustment",
            "cold-start",
            "confidence",
            "horizons",
            "backtesting",
          ]
        ) {
          expect(
            source,
          ).toContain(
            `@/lib/forecasting/${moduleName}`,
          );
        }
      },
    );

    it(
      "keeps forecast evaluation independent from AI and provider SDKs",
      () => {
        const source =
          read(
            "tests/evaluation/forecast-runner.ts",
          );

        for (
          const dependency of [
            "openai",
            "@anthropic",
            "@google/generative-ai",
            "@shopify",
            "stripe",
          ]
        ) {
          expect(
            source.includes(
              dependency,
            ),
          ).toBe(false);
        }
      },
    );

    it(
      "does not introduce inventory decision ownership",
      () => {
        const source =
          read(
            "tests/evaluation/forecast-runner.ts",
          );

        for (
          const forbidden of [
            "REORDER",
            "REDUCE",
            "PROMOTE",
            "WATCH",
            "calculateRecommendedOrderQuantity",
            "applySupplierOrderConstraints",
          ]
        ) {
          expect(
            source.includes(
              forbidden,
            ),
          ).toBe(false);
        }
      },
    );

    it(
      "keeps evaluation fixtures deterministic",
      () => {
        const matrix =
          read(
            "tests/fixtures/forecast/forecast-v1-matrix.ts",
          );

        for (
          const forbidden of [
            "Date.now",
            "new Date(",
            "Math.random",
            "randomUUID",
            "fetch(",
          ]
        ) {
          expect(
            matrix.includes(
              forbidden,
            ),
          ).toBe(false);
        }
      },
    );

    it(
      "limits floating-point normalization to evaluation comparison",
      () => {
        const source =
          read(
            "tests/evaluation/normalize.ts",
          );

        expect(
          source,
        ).toContain(
          "toFixed(12)",
        );

        const forecastRunner =
          read(
            "tests/evaluation/forecast-runner.ts",
          );

        expect(
          forecastRunner,
        ).not.toContain(
          "toFixed(",
        );
      },
    );
  },
);
