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

describe("worker lease architecture", () => {
  it("keeps claim identity separate from logical idempotency identity", () => {
    const lease =
      read(
        "workers/lease.ts",
      );

    expect(
      lease,
    ).not.toContain(
      "buildWorkerIdempotencyKey",
    );

    expect(
      lease,
    ).not.toContain(
      "operationKey",
    );
  });

  it("does not generate claim tokens inside the pure architecture layer", () => {
    const source =
      read(
        "workers/lease.ts",
      );

    const forbidden = [
      "randomUUID",
      "Math.random",
      "crypto.randomUUID",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(term),
        `Lease contract must not generate claim token using ${term}`,
      ).toBe(false);
    }
  });

  it("requires running crash recovery to pass through retry_wait", () => {
    const source =
      read(
        "workers/lease.ts",
      );

    expect(
      source,
    ).toContain(
      'status === "running"',
    );

    expect(
      source,
    ).toContain(
      'return "retry_wait"',
    );
  });

  it("remains independent of queue and persistence vendors", () => {
    const source =
      read(
        "workers/lease.ts",
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
        `Lease contract must not depend on ${dependency}`,
      ).toBe(false);
    }
  });
});
