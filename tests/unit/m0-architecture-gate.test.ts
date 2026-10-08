import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT =
  process.cwd();

function filesUnder(
  relativeDirectory: string,
): string[] {
  const absoluteDirectory =
    path.join(
      ROOT,
      relativeDirectory,
    );

  return fs
    .readdirSync(
      absoluteDirectory,
      {
        recursive: true,
        withFileTypes: true,
      },
    )
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts"),
    )
    .map(
      (entry) =>
        path.join(
          entry.parentPath,
          entry.name,
        ),
    );
}

function sourceUnder(
  relativeDirectory: string,
): string {
  return filesUnder(
    relativeDirectory,
  )
    .map(
      (file) =>
        fs.readFileSync(
          file,
          "utf8",
        ),
    )
    .join("\n");
}

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
  "StoreAgent M0 architecture gate",
  () => {
    it(
      "keeps the canonical commerce domain below all intelligence and provider layers",
      () => {
        const source =
          sourceUnder(
            "lib/commerce-domain",
          );

        for (
          const forbidden of [
            "@/lib/metrics",
            "@/lib/forecasting",
            "@/lib/decision-engine",
            "@/lib/providers",
            "@/workers",
          ]
        ) {
          expect(
            source.includes(
              forbidden,
            ),
            `commerce-domain must not import ${forbidden}`,
          ).toBe(false);
        }
      },
    );

    it(
      "keeps metrics below forecast decision provider and worker layers",
      () => {
        const source =
          sourceUnder(
            "lib/metrics",
          );

        for (
          const forbidden of [
            "@/lib/forecasting",
            "@/lib/decision-engine",
            "@/lib/providers",
            "@/workers",
          ]
        ) {
          expect(
            source.includes(
              forbidden,
            ),
            `metrics must not import ${forbidden}`,
          ).toBe(false);
        }
      },
    );

    it(
      "keeps forecasting below decision provider and worker layers",
      () => {
        const source =
          sourceUnder(
            "lib/forecasting",
          );

        for (
          const forbidden of [
            "@/lib/decision-engine",
            "@/lib/providers",
            "@/workers",
          ]
        ) {
          expect(
            source.includes(
              forbidden,
            ),
            `forecasting must not import ${forbidden}`,
          ).toBe(false);
        }
      },
    );

    it(
      "keeps the decision engine independent from providers workers and AI SDKs",
      () => {
        const source =
          sourceUnder(
            "lib/decision-engine",
          );

        for (
          const forbidden of [
            "@/lib/providers",
            "@/workers",
            "openai",
            "@anthropic",
            "@google/generative-ai",
          ]
        ) {
          expect(
            source.includes(
              forbidden,
            ),
            `decision engine must not depend on ${forbidden}`,
          ).toBe(false);
        }
      },
    );

    it(
      "keeps provider adapters outside deterministic intelligence ownership",
      () => {
        const source =
          sourceUnder(
            "lib/providers",
          );

        for (
          const forbidden of [
            "@/lib/metrics",
            "@/lib/forecasting",
            "@/lib/decision-engine",
            "@/workers",
          ]
        ) {
          expect(
            source.includes(
              forbidden,
            ),
            `providers must not depend on ${forbidden}`,
          ).toBe(false);
        }
      },
    );

    it(
      "keeps deterministic intelligence free from AI UI billing and provider SDK ownership",
      () => {
        const source = [
          sourceUnder(
            "lib/metrics",
          ),
          sourceUnder(
            "lib/forecasting",
          ),
          sourceUnder(
            "lib/decision-engine",
          ),
        ].join("\n");

        for (
          const forbidden of [
            "openai",
            "@anthropic",
            "@google/generative-ai",
            "react",
            "next/",
            "stripe",
            "@shopify",
            "supabase",
          ]
        ) {
          expect(
            source.includes(
              forbidden,
            ),
            `deterministic intelligence must not depend on ${forbidden}`,
          ).toBe(false);
        }
      },
    );

    it(
      "keeps AI explanation implementation outside M0",
      () => {
        expect(
          read(
            "workers/explain-actions.ts",
          ).trim(),
        ).toBe(
          "",
        );
      },
    );

    it(
      "documents organization as the primary tenant boundary",
      () => {
        expect(
          read(
            "docs/TENANCY_MODEL.md",
          ),
        ).toContain(
          "The Organization is the primary tenant boundary.",
        );
      },
    );

    it(
      "documents deterministic ownership across metrics forecast decision and AI",
      () => {
        expect(
          read(
            "docs/INVENTORY_FORMULAS.md",
          ),
        ).toContain(
          "AI does not calculate inventory truth.",
        );

        expect(
          read(
            "docs/FORECASTING.md",
          ),
        ).toContain(
          "AI does not calculate forecast truth.",
        );

        expect(
          read(
            "docs/DECISION_ENGINE.md",
          ),
        ).toContain(
          "The engine does not ask AI to determine commercial truth.",
        );

        expect(
          read(
            "docs/BACKGROUND_JOBS.md",
          ),
        ).toContain(
          "The metrics layer remains the owner of deterministic inventory formulas.",
        );
      },
    );

    it(
      "requires every completed M0 architecture milestone to have an explicit PASS record",
      () => {
        const status =
          read(
            "docs/IMPLEMENTATION_STATUS.md",
          );

        for (
          const milestone of [
            "M0.1",
            "M0.2",
            "M0.3",
            "M0.4",
            "M0.5",
            "M0.6",
            "M0.7",
            "M0.8",
            "M0.9",
          ]
        ) {
          const completion =
            `### ${milestone} completion`;

          const start =
            status.indexOf(
              completion,
            );

          expect(
            start,
            `${milestone} completion block missing`,
          ).toBeGreaterThanOrEqual(
            0,
          );

          const nextSection =
            status.indexOf(
              "\n## ",
              start,
            );

          const block =
            nextSection === -1
              ? status.slice(
                  start,
                )
              : status.slice(
                  start,
                  nextSection,
                );

          expect(
            block,
          ).toContain(
            "Status: PASS",
          );
        }
      },
    );
  },
);
