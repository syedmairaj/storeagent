import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("decision-engine invariants", () => {
  it("keeps deterministic decision modules independent from AI UI database and provider SDKs", () => {
    const directory = path.join(
      ROOT,
      "lib/decision-engine",
    );

    const files = fs
      .readdirSync(directory)
      .filter((file) =>
        file.endsWith(".ts"),
      );

    const forbidden = [
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "react",
      "next/",
      "@supabase",
      "@shopify",
      "stripe",
    ];

    for (const file of files) {
      const source = read(
        `lib/decision-engine/${file}`,
      );

      for (const dependency of forbidden) {
        expect(
          source.includes(dependency),
          `${file} must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("keeps HEALTHY out of persisted InventoryActionType", () => {
    const domain = read(
      "lib/commerce-domain/types.ts",
    );

    const start = domain.indexOf(
      "export type InventoryActionType =",
    );

    const end = domain.indexOf(
      "export type InventoryHealthState =",
    );

    const block = domain.slice(
      start,
      end,
    );

    expect(
      block.includes("HEALTHY"),
    ).toBe(false);
  });

  it("documents that AI cannot choose inventory truth", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "AI must not:",
    );

    expect(spec).toContain(
      "choose an action type",
    );
  });

  it("documents that conflicting commercial signals fail closed", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "CONFLICTING_SIGNALS",
    );

    expect(spec).toContain(
      "A conflict is resolved later as WATCH.",
    );
  });

  it("documents that known zero and unknown remain distinct", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "Known zero remains distinct from unknown.",
    );
  });

  it("documents that HEALTHY is not persisted as an action", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "HEALTHY is a state, not a persisted `InventoryAction`.",
    );
  });

  it("documents immutable historical evidence", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "Later data refreshes must not silently rewrite an earlier action's evidence snapshot.",
    );
  });

  it("documents decision reproducibility", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "Decision output must be reproducible.",
    );

    expect(spec).toContain(
      "AI output is not part of the deterministic decision fingerprint.",
    );
  });
});
