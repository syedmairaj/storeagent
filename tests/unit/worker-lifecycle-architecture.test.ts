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

describe("worker lifecycle architecture", () => {
  it("keeps infrastructure lifecycle separate from SyncRunStatus", () => {
    const workerTypes =
      read(
        "workers/types.ts",
      );

    expect(
      workerTypes,
    ).toContain(
      "WorkerJobStatus",
    );

    expect(
      workerTypes,
    ).not.toContain(
      "type SyncRunStatus",
    );
  });

  it("keeps infrastructure lifecycle separate from ForecastRunStatus", () => {
    const workerTypes =
      read(
        "workers/types.ts",
      );

    expect(
      workerTypes,
    ).not.toContain(
      "type ForecastRunStatus",
    );
  });

  it("does not let terminal worker states re-enter execution", () => {
    const lifecycle =
      read(
        "workers/lifecycle.ts",
      );

    expect(
      lifecycle,
    ).toContain(
      "succeeded: []",
    );

    expect(
      lifecycle,
    ).toContain(
      "failed: []",
    );

    expect(
      lifecycle,
    ).toContain(
      "cancelled: []",
    );
  });

  it("does not depend on a queue runtime or database implementation", () => {
    const source =
      read(
        "workers/lifecycle.ts",
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
        `Worker lifecycle must not depend on ${dependency}`,
      ).toBe(false);
    }
  });
});
