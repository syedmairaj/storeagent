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
  "StoreAgent evaluation artifact separation",
  () => {
    const fixtureFiles = [
      "tests/fixtures/metrics/metrics-v1-matrix.ts",
      "tests/fixtures/forecast/forecast-v1-matrix.ts",
      "tests/fixtures/decision/decision-v1-matrix.ts",
      "tests/fixtures/tenancy/cross-tenant-v1-matrix.ts",
    ];

    it(
      "keeps reviewed expected literals out of matrix fixtures",
      () => {
        for (
          const file
          of fixtureFiles
        ) {
          const source =
            read(file);

          expect(
            source,
            `${file} must not own expected output`,
          ).not.toMatch(
            /\bexpected\s*:/,
          );

          expect(
            source,
          ).toContain(
            "fixtureSchemaVersion",
          );

          expect(
            source,
          ).toContain(
            "fixtureVersion",
          );
        }
      },
    );

    it(
      "gives every matrix domain an approved golden artifact",
      () => {
        const goldenFiles = [
          "tests/golden/metrics/metrics-v1-matrix.ts",
          "tests/golden/forecast/forecast-v1-matrix.ts",
          "tests/golden/decision/decision-v1-matrix.ts",
          "tests/golden/tenancy/cross-tenant-v1-matrix.ts",
        ];

        for (
          const file
          of goldenFiles
        ) {
          const source =
            read(file);

          expect(
            source,
          ).toContain(
            '"status": "approved"',
          );

          expect(
            source,
          ).toContain(
            '"expected":',
          );

          expect(
            source,
          ).toContain(
            '"scenarioId":',
          );
        }
      },
    );

    it(
      "assembles scenarios from fixture inputs and golden expected outputs",
      () => {
        const scenarioFiles = [
          "tests/evaluation/metrics-scenarios.ts",
          "tests/evaluation/forecast-scenarios.ts",
          "tests/evaluation/decision-scenarios.ts",
          "tests/evaluation/tenancy-scenarios.ts",
        ];

        for (
          const file
          of scenarioFiles
        ) {
          const source =
            read(file);

          expect(
            source,
          ).toContain(
            "fixtureCase.evaluation",
          );

          expect(
            source,
          ).toContain(
            "golden.expected",
          );

          expect(
            source,
          ).toContain(
            "golden.configurationVersion",
          );
        }
      },
    );

    it(
      "does not regenerate expected outputs from production functions",
      () => {
        const goldenFiles = [
          "tests/golden/metrics/metrics-v1-matrix.ts",
          "tests/golden/forecast/forecast-v1-matrix.ts",
          "tests/golden/decision/decision-v1-matrix.ts",
          "tests/golden/tenancy/cross-tenant-v1-matrix.ts",
        ];

        const forbidden = [
          "@/lib/metrics",
          "@/lib/forecasting",
          "@/lib/decision-engine",
          "@/lib/tenancy",
          "@/lib/providers",
          "runMetricsEvaluationCase",
          "runForecastEvaluationCase",
          "runDecisionEvaluationCase",
          "runTenancyAdversarialCase",
        ];

        for (
          const file
          of goldenFiles
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
              `${file} must not derive golden truth from ${term}`,
            ).toBe(false);
          }
        }
      },
    );
  },
);
