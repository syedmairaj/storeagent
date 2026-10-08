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

describe("StoreAgent metrics evaluation architecture", () => {
  it("executes the canonical metrics implementation rather than reimplementing formulas", () => {
    const source =
      read(
        "tests/evaluation/metrics-runner.ts",
      );

    expect(
      source,
    ).toContain(
      '@/lib/metrics/inventory-math',
    );
  });

  it("keeps the metrics runner free of AI provider dependencies", () => {
    const source =
      read(
        "tests/evaluation/metrics-runner.ts",
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
  });

  it("keeps evaluation independent from live provider SDKs and networks", () => {
    const source =
      read(
        "tests/evaluation/metrics-runner.ts",
      );

    for (
      const dependency of [
        "@shopify",
        "fetch(",
        "axios",
        "@supabase",
      ]
    ) {
      expect(
        source.includes(
          dependency,
        ),
      ).toBe(false);
    }
  });

  it("keeps matrix evidence versioned through stable scenario IDs", () => {
    const matrix =
      read(
        "tests/fixtures/metrics/metrics-v1-matrix.ts",
      );

    expect(
      matrix,
    ).toContain(
      "-v1",
    );

    expect(
      matrix,
    ).not.toContain(
      "Math.random",
    );

    expect(
      matrix,
    ).not.toContain(
      "Date.now",
    );
  });
});
