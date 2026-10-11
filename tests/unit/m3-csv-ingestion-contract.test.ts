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

describe(
  "StoreAgent M3 CSV ingestion contract",
  () => {
    const contract = read(
      "docs/M3_CSV_INGESTION.md",
    );

    it(
      "keeps CSV at the provider boundary",
      () => {
        expect(contract).toContain(
          "CSV is a provider boundary.",
        );

        expect(contract).toContain(
          "CSV does not redefine canonical commerce semantics.",
        );
      },
    );

    it(
      "keeps canonical identity separate from CSV identity",
      () => {
        expect(contract).toContain(
          "Canonical UUIDs must never be copied from CSV values.",
        );

        expect(contract).toContain(
          "CSV source identity must resolve through ProviderBinding.",
        );
      },
    );

    it(
      "forbids row-number identity",
      () => {
        expect(contract).toContain(
          "Row number must never be used as durable external identity.",
        );
      },
    );

    it(
      "requires explicit mappings",
      () => {
        expect(contract).toContain(
          "CSV field mapping is explicit.",
        );

        expect(contract).toContain(
          "StoreAgent must not infer an unmapped canonical field",
        );
      },
    );

    it(
      "preserves NULL versus zero",
      () => {
        expect(contract).toContain(
          "Unknown value is not zero.",
        );

        expect(contract).toContain(
          "Blank optional quantity:",
        );

        expect(contract).toContain(
          "Explicit quantity `0`:",
        );
      },
    );

    it(
      "requires exact monetary semantics",
      () => {
        expect(contract).toContain(
          "Persisted monetary values use exact decimal semantics.",
        );

        expect(contract).toContain(
          "Binary floating-point money must not enter canonical persistence.",
        );
      },
    );

    it(
      "freezes provider-binding replay behavior",
      () => {
        expect(contract).toContain(
          "treat as idempotent/reconciliation path",
        );

        expect(contract).toContain(
          "do not rebind silently",
        );
      },
    );

    it(
      "separates current state from history",
      () => {
        expect(contract).toContain(
          "Current-state records may reconcile",
        );

        expect(contract).toContain(
          "Historical evidence is append-oriented",
        );
      },
    );

    it(
      "defines all terminal row dispositions",
      () => {
        for (
          const disposition of [
            "imported",
            "updated",
            "skipped",
            "quarantined",
            "failed",
          ]
        ) {
          expect(contract).toContain(
            `- ${disposition}`,
          );
        }
      },
    );

    it(
      "fails closed instead of guessing identity",
      () => {
        expect(contract).toContain(
          "If stable identity cannot be proven, the row is quarantined.",
        );

        expect(contract).toContain(
          "Identity must never be guessed.",
        );
      },
    );

    it(
      "keeps durable data-quality persistence deferred",
      () => {
        expect(contract).toContain(
          "Durable DataQualityIssue persistence is deferred to M4.",
        );
      },
    );

    it(
      "defines partial failure semantics",
      () => {
        expect(contract).toContain(
          "One bad row must not automatically corrupt or authorize another row.",
        );
      },
    );

    it(
      "keeps tenant authority outside CSV content",
      () => {
        expect(contract).toContain(
          "CSV content never establishes organization ownership.",
        );

        expect(contract).toContain(
          "CSV content never establishes store authorization.",
        );
      },
    );

    it(
      "does not broaden browser mutation authority",
      () => {
        expect(
          contract.replace(/\s+/g, " "),
        ).toContain(
          "Ordinary authenticated browser clients do not receive generic direct mutation rights",
        );
      },
    );

    it(
      "keeps later commercial intelligence out of M3",
      () => {
        for (
          const deferred of [
            "derived SKU metrics",
            "forecasting",
            "inventory decisions",
            "AI explanations",
            "Shopify synchronization",
            "billing",
          ]
        ) {
          expect(contract).toContain(
            deferred,
          );
        }
      },
    );
  },
);
