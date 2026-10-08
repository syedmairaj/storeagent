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

describe("worker idempotency architecture", () => {
  it("does not include requestedAt in logical idempotency construction", () => {
    const source =
      read(
        "workers/idempotency.ts",
      );

    expect(
      source,
    ).not.toContain(
      "requestedAt:",
    );

    expect(
      source,
    ).not.toContain(
      "input.requestedAt",
    );

    expect(
      source,
    ).not.toContain(
      "requestedAt,",
    );
  });

  it("does not use random execution identifiers", () => {
    const source =
      read(
        "workers/idempotency.ts",
      );

    const forbidden = [
      "Math.random",
      "randomUUID",
      "crypto.randomUUID",
      "Date.now",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(term),
        `Idempotency key must not depend on ${term}`,
      ).toBe(false);
    }
  });

  it("does not couple logical identity to queue vendors", () => {
    const source =
      read(
        "workers/idempotency.ts",
      );

    const forbidden = [
      "inngest",
      "trigger.dev",
      "bullmq",
      "pg-boss",
      "redis",
      "upstash",
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
        `Idempotency contract must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("keeps SyncRun as canonical synchronization ownership", () => {
    const domain =
      read(
        "lib/commerce-domain/types.ts",
      );

    expect(
      domain,
    ).toContain(
      "idempotencyKey: string;",
    );

    const worker =
      read(
        "workers/idempotency.ts",
      );

    expect(
      worker,
    ).not.toContain(
      "interface SyncRun",
    );
  });
});
