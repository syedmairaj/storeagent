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

describe("SyncRun worker orchestration architecture", () => {
  it("imports the canonical SyncRun status rather than redefining it", () => {
    const source =
      read(
        "workers/sync-run.ts",
      );

    expect(
      source,
    ).toContain(
      'from "@/lib/commerce-domain/types"',
    );

    expect(
      source,
    ).not.toContain(
      "export type SyncRunStatus",
    );

    expect(
      /\b(?:export\s+)?interface\s+SyncRun\s*\{/.test(
        source,
      ),
    ).toBe(false);
  });

  it("does not let retry_wait directly equal canonical failure", () => {
    const source =
      read(
        "workers/sync-run.ts",
      );

    expect(
      source,
    ).toContain(
      'status === "running"',
    );

    expect(
      source,
    ).not.toContain(
      '"retry_wait" ? "failed"',
    );
  });

  it("keeps provider normalization outside SyncRun orchestration", () => {
    const source =
      read(
        "workers/sync-run.ts",
      );

    const forbidden = [
      "@/lib/providers/",
      "normalizeShopify",
      "normalizeCsv",
      "rawPayload",
      "shopifyPayload",
    ];

    for (
      const term of forbidden
    ) {
      expect(
        source.includes(
          term,
        ),
        `SyncRun orchestration must not normalize provider data via ${term}`,
      ).toBe(false);
    }
  });

  it("does not calculate reconciliation counts inside the architecture helper", () => {
    const source =
      read(
        "workers/sync-run.ts",
      );

    const forbidden = [
      "discovered:",
      "imported:",
      "updated:",
      "skipped:",
      "quarantined:",
      "failed:",
    ];

    for (
      const field of forbidden
    ) {
      expect(
        source.includes(
          field,
        ),
        `SyncRun orchestration helper must not fabricate ${field}`,
      ).toBe(false);
    }
  });

  it("does not create or replace canonical SyncRun idempotency keys", () => {
    const source =
      read(
        "workers/sync-run.ts",
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

    expect(
      source,
    ).not.toContain(
      "Math.random",
    );
  });

  it("remains persistence and queue-runtime independent", () => {
    const source =
      read(
        "workers/sync-run.ts",
      );

    const forbidden = [
      "@supabase",
      "prisma",
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
        `SyncRun orchestration contract must not depend on ${dependency}`,
      ).toBe(false);
    }
  });
});
