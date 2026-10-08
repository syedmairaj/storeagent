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
  "StoreAgent AI numeric-mutation evaluation architecture",
  () => {
    it(
      "does not implement an AI provider during M0",
      () => {
        const source =
          read(
            "tests/evaluation/ai-numeric-mutation.ts",
          );

        for (
          const forbidden of [
            "openai",
            "@anthropic",
            "@google/generative-ai",
            "fetch(",
            "axios",
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
      "keeps the future explanation worker outside deterministic truth ownership",
      () => {
        const worker =
          read(
            "workers/explain-actions.ts",
          );

        expect(
          worker.trim(),
        ).toBe(
          "",
        );
      },
    );

    it(
      "protects action quantity confidence and deterministic evidence",
      () => {
        const source =
          read(
            "tests/evaluation/ai-numeric-mutation.ts",
          );

        for (
          const field of [
            "actionType",
            "recommendedQuantity",
            "priority",
            "confidence",
            "availableQuantity",
            "incomingQuantity",
            "forecastExpectedDemandUnits",
            "daysOfStock",
            "reorderPointUnits",
            "targetStockUnits",
            "stockoutRisk",
            "overstockRisk",
            "dataQualityScore",
            "reasonCodes",
          ]
        ) {
          expect(
            source,
          ).toContain(
            field,
          );
        }
      },
    );

    it(
      "allows omission instead of forcing AI to repeat every numeric field",
      () => {
        const source =
          read(
            "tests/evaluation/ai-numeric-mutation.ts",
          );

        expect(
          source,
        ).toContain(
          "claim !== undefined",
        );
      },
    );

    it(
      "rejects invented numeric confidence percentages",
      () => {
        const source =
          read(
            "tests/evaluation/ai-numeric-mutation.ts",
          );

        expect(
          source,
        ).toContain(
          "UNSUPPORTED_CONFIDENCE_PERCENT",
        );
      },
    );

    it(
      "does not mutate commerce-domain or decision-engine production modules",
      () => {
        const boundary =
          read(
            "tests/evaluation/ai-numeric-mutation.ts",
          );

        expect(
          boundary,
        ).not.toContain(
          "decideInventoryAction(",
        );

        expect(
          boundary,
        ).not.toContain(
          "calculateWeightedDemandForecast(",
        );

        expect(
          boundary,
        ).not.toContain(
          "calculateRecommendedOrderQuantity(",
        );
      },
    );
  },
);
