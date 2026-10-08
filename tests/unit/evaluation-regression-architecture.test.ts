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
  "StoreAgent reproducibility and regression architecture",
  () => {
    it(
      "does not introduce a replacement forecast or decision fingerprint algorithm",
      () => {
        const source =
          read(
            "tests/evaluation/regression.ts",
          );

        expect(
          source,
        ).not.toContain(
          "fnv1a32",
        );

        expect(
          source,
        ).not.toContain(
          "buildForecastReproducibilityFingerprint",
        );

        expect(
          source,
        ).not.toContain(
          "buildDecisionReproducibilityFingerprint",
        );
      },
    );

    it(
      "keeps regression comparison independent from network AI and provider SDKs",
      () => {
        const source =
          read(
            "tests/evaluation/regression.ts",
          );

        for (
          const forbidden of [
            "fetch(",
            "openai",
            "@anthropic",
            "@google/generative-ai",
            "@shopify",
            "@supabase",
            "stripe",
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
      "contains no automatic golden mutation path",
      () => {
        const files = [
          "tests/evaluation/regression.ts",
          "tests/unit/evaluation-regression-gate.test.ts",
        ];

        for (
          const file
          of files
        ) {
          const source =
            read(file);

          for (
            const forbidden of [
              "writeFileSync",
              "writeFile(",
              "appendFile",
              "renameSync",
              "rmSync",
              "unlinkSync",
            ]
          ) {
            expect(
              source.includes(
                forbidden,
              ),
            ).toBe(false);
          }
        }
      },
    );

    it(
      "requires explicit approved golden alignment before regression comparison",
      () => {
        const source =
          read(
            "tests/evaluation/regression.ts",
          );

        expect(
          source,
        ).toContain(
          "assertEvaluationArtifactAlignment",
        );

        expect(
          source,
        ).toContain(
          "golden.configurationVersion",
        );

        expect(
          source,
        ).toContain(
          "golden.review.status",
        );
      },
    );

    it(
      "fails rather than silently accepting unapproved output drift",
      () => {
        const source =
          read(
            "tests/evaluation/regression.ts",
          );

        expect(
          source,
        ).toContain(
          "Unapproved evaluation regression detected",
        );
      },
    );
  },
);
