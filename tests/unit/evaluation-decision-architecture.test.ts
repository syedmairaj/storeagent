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
  "StoreAgent decision evaluation architecture",
  () => {
    it(
      "executes the canonical decision orchestrator rather than implementing another decision engine",
      () => {
        const source =
          read(
            "tests/evaluation/decision-runner.ts",
          );

        expect(
          source,
        ).toContain(
          "@/lib/decision-engine/decide",
        );

        expect(
          source,
        ).toContain(
          "decideInventoryAction",
        );
      },
    );

    it(
      "uses the canonical evidence-snapshot builder",
      () => {
        const source =
          read(
            "tests/evaluation/decision-runner.ts",
          );

        expect(
          source,
        ).toContain(
          "@/lib/decision-engine/evidence-snapshot",
        );

        expect(
          source,
        ).toContain(
          "buildInventoryActionEvidence",
        );
      },
    );

    it(
      "keeps decision evaluation independent from AI",
      () => {
        const source =
          read(
            "tests/evaluation/decision-runner.ts",
          );

        for (
          const dependency of [
            "openai",
            "@anthropic",
            "@google/generative-ai",
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
      "keeps decision evaluation independent from provider and billing SDKs",
      () => {
        const source =
          read(
            "tests/evaluation/decision-runner.ts",
          );

        for (
          const dependency of [
            "@shopify",
            "stripe",
            "@supabase",
            "fetch(",
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
      "keeps scenario evidence deterministic",
      () => {
        const matrix =
          read(
            "tests/fixtures/decision/decision-v1-matrix.ts",
          );

        for (
          const forbidden of [
            "Date.now",
            "new Date(",
            "Math.random",
            "randomUUID",
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
  },
);
