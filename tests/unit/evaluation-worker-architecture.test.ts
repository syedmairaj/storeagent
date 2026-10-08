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
  "StoreAgent worker evaluation architecture",
  () => {
    it(
      "executes canonical worker modules rather than implementing a second worker state machine",
      () => {
        const source =
          read(
            "tests/evaluation/worker-runner.ts",
          );

        for (
          const moduleName of [
            "concurrency",
            "failure",
            "idempotency",
            "lease",
            "lifecycle",
            "pipeline",
            "retry",
            "scope",
            "sync-run",
            "trigger",
          ]
        ) {
          expect(
            source,
          ).toContain(
            `@/workers/${moduleName}`,
          );
        }
      },
    );

    it(
      "keeps worker fixture inputs separate from reviewed expected outputs",
      () => {
        const fixture =
          read(
            "tests/fixtures/worker/worker-v1-matrix.ts",
          );

        expect(
          fixture,
        ).not.toMatch(
          /\bexpected\s*:/,
        );

        const golden =
          read(
            "tests/golden/worker/worker-v1-matrix.ts",
          );

        expect(
          golden,
        ).toContain(
          "approved(",
        );
      },
    );

    it(
      "keeps worker evaluation independent from AI provider billing and UI dependencies",
      () => {
        const source =
          read(
            "tests/evaluation/worker-runner.ts",
          );

        for (
          const forbidden of [
            "openai",
            "@anthropic",
            "@google/generative-ai",
            "@shopify",
            "stripe",
            "react",
            "next/",
            "fetch(",
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
      "does not treat infrastructure worker state as canonical business truth",
      () => {
        const source =
          read(
            "tests/evaluation/worker-runner.ts",
          );

        expect(
          source,
        ).toContain(
          "workerStatusMayDirectlyOwnSyncRunStatus",
        );

        expect(
          source,
        ).toContain(
          "syncRunStatusForWorkerOutcome",
        );

        expect(
          source,
        ).not.toContain(
          "InventoryAction",
        );

        expect(
          source,
        ).not.toContain(
          "ForecastRunStatus",
        );
      },
    );

    it(
      "keeps worker fixtures deterministic and credential-free",
      () => {
        const source =
          read(
            "tests/fixtures/worker/worker-v1-matrix.ts",
          );

        for (
          const forbidden of [
            "Date.now",
            "new Date(",
            "Math.random",
            "randomUUID",
            "accessToken",
            "refreshToken",
            "serviceRoleKey",
            "password",
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
  },
);
