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

describe("CSV adapter architecture", () => {
  it("keeps CSV adapters free from commercial engine imports", () => {
    const files = [
      "lib/providers/csv/mapping.ts",
      "lib/providers/csv/identity.ts",
    ];

    const forbidden = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (const file of files) {
      const source =
        read(file);

      for (
        const dependency
        of forbidden
      ) {
        expect(
          source.includes(
            dependency,
          ),
          `${file} must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("does not use row number as a successful identity fallback", () => {
    const source =
      read(
        "lib/providers/csv/identity.ts",
      );

    expect(
      source,
    ).not.toContain(
      'name: "row"',
    );
  });
});
