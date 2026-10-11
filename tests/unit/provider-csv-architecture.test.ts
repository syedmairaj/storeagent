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

  it("keeps structural parsing independent from mapping, identity, persistence, and business engines", () => {
    const source =
      read(
        "lib/providers/csv/parser.ts",
      );

    const forbidden = [
      "@/lib/providers/csv/mapping",
      "@/lib/providers/csv/identity",
      "@/lib/providers/bindings",
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "@supabase",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `CSV parser must not depend on ${dependency}`,
      ).toBe(false);
    }
  });


  it("keeps product and variant CSV normalization upstream of persistence and commercial engines", () => {
    const source =
      read(
        "lib/providers/csv/product-normalization.ts",
      );

    const forbidden = [
      "@supabase",
      "@/lib/supabase",
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `CSV product normalizer must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("does not manufacture canonical UUIDs or tenant ownership during CSV normalization", () => {
    const source =
      read(
        "lib/providers/csv/product-normalization.ts",
      );

    expect(
      source,
    ).not.toContain(
      "randomUUID",
    );

    expect(
      source,
    ).not.toContain(
      "organizationId:",
    );

    expect(
      source,
    ).not.toContain(
      "storeId:",
    );

    expect(
      source,
    ).not.toContain(
      "canonicalEntityId:",
    );
  });

});
