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
  "StoreAgent global evaluation architecture",
  () => {
    it(
      "keeps the six frozen evaluation domains in the core contract",
      () => {
        const source =
          read(
            "tests/evaluation/types.ts",
          );

        for (
          const domain of [
            "metrics",
            "forecast",
            "decision",
            "tenancy",
            "worker",
            "ai",
          ]
        ) {
          expect(
            source,
          ).toContain(
            `| "${domain}"`,
          );
        }
      },
    );

    it(
      "keeps deterministic fixtures separate from reviewed expected truth",
      () => {
        const files = [
          "tests/fixtures/metrics/metrics-v1-matrix.ts",
          "tests/fixtures/forecast/forecast-v1-matrix.ts",
          "tests/fixtures/decision/decision-v1-matrix.ts",
          "tests/fixtures/tenancy/cross-tenant-v1-matrix.ts",
          "tests/fixtures/worker/worker-v1-matrix.ts",
          "tests/fixtures/ai/ai-numeric-mutation-v1.ts",
        ];

        for (
          const file
          of files
        ) {
          expect(
            read(file),
          ).not.toMatch(
            /\bexpected\s*:/,
          );
        }
      },
    );

    it(
      "requires all six domains to own golden artifacts",
      () => {
        const files = [
          "tests/golden/metrics/metrics-v1-matrix.ts",
          "tests/golden/forecast/forecast-v1-matrix.ts",
          "tests/golden/decision/decision-v1-matrix.ts",
          "tests/golden/tenancy/cross-tenant-v1-matrix.ts",
          "tests/golden/worker/worker-v1-matrix.ts",
          "tests/golden/ai/ai-numeric-mutation-v1.ts",
        ];

        for (
          const file
          of files
        ) {
          expect(
            fs.existsSync(
              path.join(
                ROOT,
                file,
              ),
            ),
          ).toBe(true);
        }
      },
    );

    it(
      "keeps evaluation architecture free from live network and provider execution",
      () => {
        const files = [
          "tests/evaluation/scenario.ts",
          "tests/evaluation/fixture.ts",
          "tests/evaluation/golden.ts",
          "tests/evaluation/regression.ts",
          "tests/evaluation/ai-numeric-mutation.ts",
        ];

        const forbidden = [
          "fetch(",
          "axios",
          "openai",
          "@anthropic",
          "@google/generative-ai",
          "@shopify",
          "stripe",
        ];

        for (
          const file
          of files
        ) {
          const source =
            read(file);

          for (
            const term
            of forbidden
          ) {
            expect(
              source.includes(
                term,
              ),
              `${file} must not depend on ${term}`,
            ).toBe(false);
          }
        }
      },
    );

    it(
      "keeps automatic golden-writing APIs out of evaluation runtime",
      () => {
        const files = [
          "tests/evaluation/scenario.ts",
          "tests/evaluation/fixture.ts",
          "tests/evaluation/golden.ts",
          "tests/evaluation/regression.ts",
          "tests/evaluation/ai-numeric-mutation.ts",
        ];

        const forbidden = [
          "writeFileSync",
          "writeFile(",
          "appendFile",
          "renameSync",
          "unlinkSync",
          "updateSnapshot",
        ];

        for (
          const file
          of files
        ) {
          const source =
            read(file);

          for (
            const term
            of forbidden
          ) {
            expect(
              source.includes(
                term,
              ),
            ).toBe(false);
          }
        }
      },
    );

    it(
      "keeps the explanation worker unimplemented during M0",
      () => {
        expect(
          read(
            "workers/explain-actions.ts",
          ).trim(),
        ).toBe(
          "",
        );
      },
    );
  },
);
