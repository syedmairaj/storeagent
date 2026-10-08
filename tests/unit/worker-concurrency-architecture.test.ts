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

describe("worker concurrency architecture", () => {
  it("reuses lease ownership fencing", () => {
    const source =
      read(
        "workers/concurrency.ts",
      );

    expect(
      source,
    ).toContain(
      "assertWorkerLeaseOwnership",
    );
  });

  it("does not generate a replacement idempotency identity for duplicates", () => {
    const source =
      read(
        "workers/concurrency.ts",
      );

    expect(
      source,
    ).not.toContain(
      "buildWorkerIdempotencyKey",
    );

    const forbidden = [
      "randomUUID",
      "Math.random",
      "Date.now",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(
          term,
        ),
        `Concurrency handling must not create replacement identity using ${term}`,
      ).toBe(false);
    }
  });

  it("does not implement unsafe select-then-insert persistence in the architecture layer", () => {
    const source =
      read(
        "workers/concurrency.ts",
      );

    const forbidden = [
      "@supabase",
      "insert(",
      ".insert(",
      "SELECT ",
      "INSERT ",
      "prisma",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(
          term,
        ),
        `Pure concurrency contract must not implement persistence via ${term}`,
      ).toBe(false);
    }
  });

  it("remains queue-vendor independent", () => {
    const source =
      read(
        "workers/concurrency.ts",
      );

    const forbidden = [
      "inngest",
      "trigger.dev",
      "bullmq",
      "pg-boss",
      "redis",
      "upstash",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Concurrency contract must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("does not let worker concurrency policy calculate commercial truth", () => {
    const source =
      read(
        "workers/concurrency.ts",
      );

    const forbidden = [
      "@/lib/metrics",
      "@/lib/forecasting",
      "@/lib/decision-engine",
      "recommendedQuantity",
      "reorderPoint",
      "safetyStock",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(
          term,
        ),
        `Concurrency contract must not own ${term}`,
      ).toBe(false);
    }
  });
});
