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

describe("worker terminal failure architecture", () => {
  it("keeps dead-work semantics independent of queue-vendor DLQ concepts", () => {
    const source =
      read(
        "workers/failure.ts",
      );

    const forbidden = [
      "deadLetterQueue",
      "dlq",
      "bullmq",
      "inngest",
      "trigger.dev",
      "pg-boss",
      "redis",
      "upstash",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.toLowerCase().includes(
          term.toLowerCase(),
        ),
        `Terminal failure policy must not depend on ${term}`,
      ).toBe(false);
    }
  });

  it("does not store raw provider payloads or credentials in failure records", () => {
    const types =
      read(
        "workers/types.ts",
      );

    const failureRecord =
      interfaceBlock(
        types,
        "WorkerTerminalFailureRecord",
      );

    const forbidden = [
      "rawPayload",
      "providerPayload",
      "accessToken",
      "refreshToken",
      "apiKey",
      "secret",
    ];

    for (
      const field of forbidden
    ) {
      expect(
        hasDeclaredField(
          failureRecord,
          field,
        ),
        `Worker failure record must not contain ${field}`,
      ).toBe(false);
    }
  });

  it("does not mutate canonical commercial truth from terminal-failure policy", () => {
    const source =
      read(
        "workers/failure.ts",
      );

    const forbidden = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "@/lib/providers",
      "@supabase",
    ];

    for (
      const dependency of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Terminal failure policy must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("keeps terminal failure tied to the same logical idempotency identity", () => {
    const types =
      read(
        "workers/types.ts",
      );

    const failureRecord =
      interfaceBlock(
        types,
        "WorkerTerminalFailureRecord",
      );

    expect(
      hasDeclaredField(
        failureRecord,
        "idempotencyKey",
      ),
    ).toBe(true);

    const failure =
      read(
        "workers/failure.ts",
      );

    expect(
      failure,
    ).not.toContain(
      "buildWorkerIdempotencyKey",
    );
  });
});
