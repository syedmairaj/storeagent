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

describe("StoreAgent golden evaluation architecture", () => {
  it("does not provide automatic golden regeneration", () => {
    const source =
      read(
        "tests/evaluation/golden.ts",
      );

    const forbidden = [
      "updateSnapshot",
      "writeGolden",
      "regenerateGolden",
      "autoApprove",
      "overwriteGolden",
    ];

    for (
      const operation
      of forbidden
    ) {
      expect(
        source.includes(
          operation,
        ),
        `Golden contract must not provide ${operation}`,
      ).toBe(false);
    }
  });

  it("keeps golden validation independent from runtime clocks and randomness", () => {
    const source =
      read(
        "tests/evaluation/golden.ts",
      );

    const forbidden = [
      "Date.now",
      "new Date(",
      "Math.random",
      "randomUUID",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Golden validation must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("keeps golden validation independent from live providers and AI", () => {
    const source =
      read(
        "tests/evaluation/golden.ts",
      );

    const forbidden = [
      "fetch(",
      "@shopify",
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "@supabase",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Golden validation must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("requires reviewed approval semantics", () => {
    const source =
      read(
        "tests/evaluation/golden.ts",
      );

    expect(
      source,
    ).toContain(
      'status:\n      StoreAgentGoldenReviewStatus;',
    );

    expect(
      source,
    ).toContain(
      "rationale: string;",
    );
  });

  it("requires explicit scenario and configuration identity", () => {
    const source =
      read(
        "tests/evaluation/golden.ts",
      );

    expect(
      source,
    ).toContain(
      "scenarioId: string;",
    );

    expect(
      source,
    ).toContain(
      "configurationVersion: string;",
    );
  });

  it("keeps golden expected output separate from fixture evidence", () => {
    const source =
      read(
        "tests/evaluation/golden.ts",
      );

    expect(
      source,
    ).toContain(
      "fixture:",
    );

    expect(
      source,
    ).toContain(
      "expected: TExpected;",
    );
  });
});
