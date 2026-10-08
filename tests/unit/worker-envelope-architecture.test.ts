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

function interfaceBlock(
  source: string,
  interfaceName: string,
): string {
  const start =
    source.indexOf(
      `export interface ${interfaceName} {`,
    );

  if (start === -1) {
    throw new Error(
      `Interface ${interfaceName} not found.`,
    );
  }

  const end =
    source.indexOf(
      "\n}",
      start,
    );

  if (end === -1) {
    throw new Error(
      `Interface ${interfaceName} is not closed.`,
    );
  }

  return source.slice(
    start,
    end + 2,
  );
}

function hasDeclaredField(
  block: string,
  field: string,
): boolean {
  const pattern =
    new RegExp(
      `^\\s*${field}\\??\\s*:`,
      "m",
    );

  return pattern.test(
    block,
  );
}

describe("worker job-envelope architecture", () => {
  it("does not duplicate canonical SyncRun or ForecastRun types", () => {
    const types =
      read(
        "workers/types.ts",
      );

    expect(
      types,
    ).not.toContain(
      "interface SyncRun",
    );

    expect(
      types,
    ).not.toContain(
      "interface ForecastRun",
    );
  });

  it("keeps commercial truth out of the generic job envelope", () => {
    const types =
      read(
        "workers/types.ts",
      );

    const envelope =
      interfaceBlock(
        types,
        "WorkerJobEnvelopeV1",
      );

    const forbidden = [
      "recommendedQuantity",
      "forecastExpectedDemandUnits",
      "salesVelocity",
      "reorderPoint",
      "safetyStock",
      "stockoutRisk",
      "confidenceReasonCodes",
    ];

    for (
      const field of forbidden
    ) {
      expect(
        hasDeclaredField(
          envelope,
          field,
        ),
        `Generic job envelope must not own ${field}`,
      ).toBe(false);
    }
  });

  it("keeps secrets and provider raw payloads out of the job envelope", () => {
    const types =
      read(
        "workers/types.ts",
      );

    const envelope =
      interfaceBlock(
        types,
        "WorkerJobEnvelopeV1",
      );

    const forbidden = [
      "accessToken",
      "refreshToken",
      "apiKey",
      "secret",
      "rawPayload",
      "shopifyPayload",
    ];

    for (
      const field of forbidden
    ) {
      expect(
        hasDeclaredField(
          envelope,
          field,
        ),
        `Generic job envelope must not own ${field}`,
      ).toBe(false);
    }
  });

  it("keeps queue vendors out of the worker contract", () => {
    const files = [
      "workers/types.ts",
      "workers/envelope.ts",
    ];

    const forbidden = [
      "inngest",
      "trigger.dev",
      "bullmq",
      "pg-boss",
      "redis",
      "upstash",
      "@supabase",
    ];

    for (const file of files) {
      const source =
        read(file);

      for (
        const dependency of forbidden
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

  it("reuses M0.8.1 worker scope validation", () => {
    const source =
      read(
        "workers/envelope.ts",
      );

    expect(
      source,
    ).toContain(
      "assertWorkerExecutionScope",
    );
  });
});
