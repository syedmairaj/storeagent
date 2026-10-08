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

describe("worker trigger architecture", () => {
  it("reuses deterministic worker idempotency", () => {
    const source =
      read(
        "workers/trigger.ts",
      );

    expect(
      source,
    ).toContain(
      "buildWorkerIdempotencyKey",
    );
  });

  it("reuses worker tenant-scope validation", () => {
    const source =
      read(
        "workers/trigger.ts",
      );

    expect(
      source,
    ).toContain(
      "assertWorkerExecutionScope",
    );
  });

  it("does not place organization ownership inside raw trigger types", () => {
    const types =
      read(
        "workers/types.ts",
      );

    const scheduledStart =
      types.indexOf(
        "export interface ScheduledWorkerTrigger",
      );

    const eventStart =
      types.indexOf(
        "export interface EventWorkerTrigger",
      );

    const unionStart =
      types.indexOf(
        "export type WorkerTrigger =",
      );

    expect(
      scheduledStart,
    ).toBeGreaterThanOrEqual(0);

    expect(
      eventStart,
    ).toBeGreaterThanOrEqual(0);

    expect(
      unionStart,
    ).toBeGreaterThan(
      eventStart,
    );

    const triggerBlock =
      types.slice(
        scheduledStart,
        unionStart,
      );

    expect(
      /^\s*organizationId\??\s*:/m.test(
        triggerBlock,
      ),
    ).toBe(false);

    expect(
      /^\s*storeId\??\s*:/m.test(
        triggerBlock,
      ),
    ).toBe(false);
  });

  it("does not trust provider external identifiers as tenant scope", () => {
    const source =
      read(
        "workers/trigger.ts",
      );

    const forbidden = [
      "externalShopId",
      "shopDomain",
      "providerOrganizationId",
      "webhookOrganizationId",
    ];

    for (
      const field of forbidden
    ) {
      expect(
        source.includes(
          field,
        ),
        `Trigger boundary must not derive tenant ownership from ${field}`,
      ).toBe(false);
    }
  });

  it("does not implement webhook verification inside generic worker trigger policy", () => {
    const source =
      read(
        "workers/trigger.ts",
      );

    const forbidden = [
      "hmac",
      "crypto.createHmac",
      "shopify-hmac",
      "webhook-signature",
    ];

    for (
      const dependency
      of forbidden
    ) {
      expect(
        source.toLowerCase().includes(
          dependency.toLowerCase(),
        ),
        `Generic trigger policy must not implement ${dependency}`,
      ).toBe(false);
    }
  });

  it("remains scheduler and queue vendor independent", () => {
    const source =
      read(
        "workers/trigger.ts",
      );

    const forbidden = [
      "vercel.cron",
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
        `Trigger contract must not depend on ${dependency}`,
      ).toBe(false);
    }
  });

  it("does not calculate commercial truth", () => {
    const source =
      read(
        "workers/trigger.ts",
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
      const dependency
      of forbidden
    ) {
      expect(
        source.includes(
          dependency,
        ),
        `Trigger boundary must not own ${dependency}`,
      ).toBe(false);
    }
  });
});
