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

describe("StoreAgent evaluation fixture architecture", () => {
  it("keeps fixture validation independent from runtime clocks and randomness", () => {
    const source =
      read(
        "tests/evaluation/fixture.ts",
      );

    const forbidden = [
      "Date.now",
      "new Date(",
      "Math.random",
      "randomUUID",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(
          term,
        ),
        `Fixture contract must not depend on ${term}`,
      ).toBe(false);
    }
  });

  it("keeps fixture format independent from network and provider SDKs", () => {
    const source =
      read(
        "tests/evaluation/fixture.ts",
      );

    const forbidden = [
      "fetch(",
      "axios",
      "@shopify",
      "openai",
      "@anthropic",
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
        `Fixture contract must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("keeps credentials out of the fixture contract", () => {
    const source =
      read(
        "tests/evaluation/fixture.ts",
      );

    const forbiddenFields = [
      "accessToken:",
      "refreshToken:",
      "apiKey:",
      "serviceRoleKey:",
      "password:",
    ];

    for (
      const field
      of forbiddenFields
    ) {
      expect(
        source.includes(
          field,
        ),
        `Fixture contract must not declare ${field}`,
      ).toBe(false);
    }
  });

  it("requires explicit fixture identity and version", () => {
    const source =
      read(
        "tests/evaluation/fixture.ts",
      );

    expect(
      source,
    ).toContain(
      "id: string;",
    );

    expect(
      source,
    ).toContain(
      "fixtureVersion: number;",
    );
  });

  it("does not derive fixture identity from array position", () => {
    const source =
      read(
        "tests/evaluation/fixture.ts",
      );

    expect(
      source,
    ).not.toContain(
      "index +",
    );

    expect(
      source,
    ).not.toContain(
      "arrayIndex",
    );
  });
});
