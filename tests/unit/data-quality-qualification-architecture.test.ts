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

describe(
  "data quality qualification architecture",
  () => {
    const qualification = read(
      "lib/data-quality/qualification.ts",
    );

    it(
      "qualifies through the frozen reconciliation helper",
      () => {
        expect(qualification).toContain(
          "quarantineMayRequireDurableDataQualityIssue",
        );

        expect(qualification).toContain(
          'disposition: "durable_issue"',
        );

        expect(qualification).toContain(
          'disposition: "transient_only"',
        );

        expect(qualification).toContain(
          "M4.4 severity policy",
        );
      },
    );

    it(
      "keeps parent relationship metadata out of provider identity",
      () => {
        const types = read(
          "lib/data-quality/types.ts",
        );

        expect(types).not.toContain(
          "externalParentId",
        );

        expect(qualification).toContain(
          "reconciliation.externalParentId",
        );
      },
    );

    it(
      "stays free of persistence, clocks, and downstream products",
      () => {
        const forbidden = [
          "supabase",
          "@supabase",
          "next/",
          "react",
          "stripe",
          "openai",
          "@anthropic",
          "@shopify",
          "shopify-api",
          "randomUUID",
          "Math.random",
          "Date.now",
          "lib/metrics",
          "lib/forecasting",
          "lib/decision-engine",
          "@/lib/metrics",
          "@/lib/forecasting",
          "@/lib/decision-engine",
        ];

        for (const dependency of forbidden) {
          expect(
            qualification.includes(
              dependency,
            ),
            `qualification must not depend on ${dependency}`,
          ).toBe(false);
        }
      },
    );
  },
);
