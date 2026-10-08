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

describe("worker scope architecture", () => {
  it("reuses the frozen service-role policy", () => {
    const source =
      read(
        "workers/scope.ts",
      );

    expect(
      source,
    ).toContain(
      "assertServiceOperationScope",
    );

    expect(
      source,
    ).toContain(
      "TrustedServiceTenantScope",
    );
  });

  it("does not introduce user-role authorization into workers", () => {
    const source =
      read(
        "workers/scope.ts",
      );

    expect(
      source.includes(
        "OrganizationMemberRole",
      ),
    ).toBe(false);

    expect(
      source.includes(
        "roleHasPermission",
      ),
    ).toBe(false);
  });

  it("keeps M0.8.1 free from queue and database implementation dependencies", () => {
    const source =
      read(
        "workers/scope.ts",
      );

    const forbidden = [
      "@supabase",
      "inngest",
      "trigger.dev",
      "bullmq",
      "pg-boss",
      "redis",
      "upstash",
      "openai",
      "@anthropic",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `workers/scope.ts must not depend on ${dependency}`,
      ).toBe(false);
    }
  });
});
