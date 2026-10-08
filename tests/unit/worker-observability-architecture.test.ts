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
  return new RegExp(
    `^\\s*${field}\\??\\s*:`,
    "m",
  ).test(block);
}

describe("worker observability architecture", () => {
  it("keeps secrets and raw provider payloads out of telemetry events", () => {
    const types =
      read(
        "workers/types.ts",
      );

    const context =
      interfaceBlock(
        types,
        "WorkerTelemetryContext",
      );

    const event =
      interfaceBlock(
        types,
        "WorkerTelemetryEvent",
      );

    const combined =
      `${context}\n${event}`;

    const forbidden = [
      "accessToken",
      "refreshToken",
      "apiKey",
      "secret",
      "rawPayload",
      "providerPayload",
      "webhookBody",
      "shopifyPayload",
    ];

    for (
      const field of forbidden
    ) {
      expect(
        hasDeclaredField(
          combined,
          field,
        ),
        `Telemetry must not own ${field}`,
      ).toBe(false);
    }
  });

  it("keeps structured correlation identifiers explicit", () => {
    const types =
      read(
        "workers/types.ts",
      );

    const context =
      interfaceBlock(
        types,
        "WorkerTelemetryContext",
      );

    for (
      const field of [
        "idempotencyKey",
        "organizationId",
        "storeId",
        "executionId",
        "canonicalRunId",
        "attemptCount",
      ]
    ) {
      expect(
        hasDeclaredField(
          context,
          field,
        ),
        `Telemetry context must declare ${field}`,
      ).toBe(true);
    }
  });

  it("does not write logs directly from the architecture helper", () => {
    const source =
      read(
        "workers/observability.ts",
      );

    const forbidden = [
      "console.log",
      "console.error",
      "console.warn",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(
          term,
        ),
        `Observability contract must not emit through ${term}`,
      ).toBe(false);
    }
  });

  it("does not depend on logging or monitoring vendors", () => {
    const source =
      read(
        "workers/observability.ts",
      );

    const forbidden = [
      "sentry",
      "datadog",
      "newrelic",
      "logtail",
      "betterstack",
      "axiom",
      "pino",
      "winston",
      "@supabase",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.toLowerCase().includes(
          dependency.toLowerCase(),
        ),
        `Observability contract must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("does not calculate inventory commercial truth", () => {
    const source =
      read(
        "workers/observability.ts",
      );

    const forbidden = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "recommendedQuantity",
      "reorderPoint",
      "forecastExpectedDemandUnits",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(
          term,
        ),
        `Observability must not own ${term}`,
      ).toBe(false);
    }
  });

  it("does not generate logical job identity", () => {
    const source =
      read(
        "workers/observability.ts",
      );

    expect(
      source,
    ).not.toContain(
      "buildWorkerIdempotencyKey",
    );

    expect(
      source,
    ).not.toContain(
      "randomUUID",
    );
  });
});
