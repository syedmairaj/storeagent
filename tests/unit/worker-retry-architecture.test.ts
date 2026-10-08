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

describe("worker retry architecture", () => {
  it("keeps retry policy deterministic", () => {
    const source =
      read(
        "workers/retry.ts",
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
        source.includes(
          term,
        ),
        `Retry policy must not depend on ${term}`,
      ).toBe(false);
    }
  });

  it("does not construct new logical idempotency identity during retry", () => {
    const source =
      read(
        "workers/retry.ts",
      );

    expect(
      source,
    ).not.toContain(
      "buildWorkerIdempotencyKey",
    );

    expect(
      source,
    ).not.toContain(
      "operationKey",
    );
  });

  it("fails closed for unknown failure classification", () => {
    const source =
      read(
        "workers/retry.ts",
      );

    expect(
      source,
    ).not.toContain(
      '"unknown",\n      "timeout"',
    );

    expect(
      source,
    ).toContain(
      '"timeout"',
    );
  });

  it("remains independent of queue and persistence vendors", () => {
    const source =
      read(
        "workers/retry.ts",
      );

    const forbidden = [
      "inngest",
      "trigger.dev",
      "bullmq",
      "pg-boss",
      "redis",
      "upstash",
      "@supabase",
      "prisma",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Retry policy must not depend on ${dependency}`,
      ).toBe(false);
    }
  });
});
