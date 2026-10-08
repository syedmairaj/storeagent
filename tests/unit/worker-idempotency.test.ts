import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildWorkerIdempotencyKey,
  WORKER_IDEMPOTENCY_VERSION,
} from "@/workers/idempotency";

describe("worker deterministic idempotency", () => {
  it("freezes an explicit idempotency-key version", () => {
    expect(
      WORKER_IDEMPOTENCY_VERSION,
    ).toBe(
      "storeagent-job-v1",
    );
  });

  it("produces the same key for the same logical job", () => {
    const input = {
      jobType:
        "forecast_generation" as const,

      organizationId:
        "org-a",

      storeId:
        "store-a",

      operationKey:
        "forecast-run-1",

      subjects: [
        {
          resourceType:
            "forecast_run",

          resourceId:
            "forecast-run-1",
        },
      ],
    };

    expect(
      buildWorkerIdempotencyKey(
        input,
      ),
    ).toBe(
      buildWorkerIdempotencyKey(
        input,
      ),
    );
  });

  it("normalizes harmless surrounding whitespace", () => {
    const first =
      buildWorkerIdempotencyKey({
        jobType:
          "provider_sync",

        organizationId:
          " org-a ",

        storeId:
          " store-a ",

        operationKey:
          " sync-window-1 ",

        subjects: [
          {
            resourceType:
              " integration ",

            resourceId:
              " integration-1 ",
          },
        ],
      });

    const second =
      buildWorkerIdempotencyKey({
        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        operationKey:
          "sync-window-1",

        subjects: [
          {
            resourceType:
              "integration",

            resourceId:
              "integration-1",
          },
        ],
      });

    expect(first).toBe(
      second,
    );
  });

  it("is independent of subject ordering", () => {
    const first =
      buildWorkerIdempotencyKey({
        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        operationKey:
          "sync-1",

        subjects: [
          {
            resourceType:
              "sync_run",
            resourceId:
              "run-1",
          },
          {
            resourceType:
              "integration",
            resourceId:
              "integration-1",
          },
        ],
      });

    const second =
      buildWorkerIdempotencyKey({
        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        operationKey:
          "sync-1",

        subjects: [
          {
            resourceType:
              "integration",
            resourceId:
              "integration-1",
          },
          {
            resourceType:
              "sync_run",
            resourceId:
              "run-1",
          },
        ],
      });

    expect(first).toBe(
      second,
    );
  });

  it("changes when organization changes", () => {
    const base = {
      jobType:
        "forecast_generation" as const,

      storeId:
        "store-a",

      operationKey:
        "forecast-1",

      subjects: [],
    };

    expect(
      buildWorkerIdempotencyKey({
        ...base,
        organizationId:
          "org-a",
      }),
    ).not.toBe(
      buildWorkerIdempotencyKey({
        ...base,
        organizationId:
          "org-b",
      }),
    );
  });

  it("changes when store changes", () => {
    const base = {
      jobType:
        "metrics_aggregation" as const,

      organizationId:
        "org-a",

      operationKey:
        "2026-10-08",

      subjects: [],
    };

    expect(
      buildWorkerIdempotencyKey({
        ...base,
        storeId:
          "store-a",
      }),
    ).not.toBe(
      buildWorkerIdempotencyKey({
        ...base,
        storeId:
          "store-b",
      }),
    );
  });

  it("distinguishes organization-scoped from store-scoped work", () => {
    const base = {
      jobType:
        "provider_reconciliation" as const,

      organizationId:
        "org-a",

      operationKey:
        "reconcile-1",

      subjects: [],
    };

    expect(
      buildWorkerIdempotencyKey({
        ...base,
        storeId: null,
      }),
    ).not.toBe(
      buildWorkerIdempotencyKey({
        ...base,
        storeId:
          "store-a",
      }),
    );
  });

  it("changes when job type changes", () => {
    const base = {
      organizationId:
        "org-a",

      storeId:
        "store-a",

      operationKey:
        "run-1",

      subjects: [],
    };

    expect(
      buildWorkerIdempotencyKey({
        ...base,
        jobType:
          "metrics_aggregation",
      }),
    ).not.toBe(
      buildWorkerIdempotencyKey({
        ...base,
        jobType:
          "forecast_generation",
      }),
    );
  });

  it("changes when logical operation key changes", () => {
    const base = {
      jobType:
        "forecast_generation" as const,

      organizationId:
        "org-a",

      storeId:
        "store-a",

      subjects: [],
    };

    expect(
      buildWorkerIdempotencyKey({
        ...base,
        operationKey:
          "forecast-run-1",
      }),
    ).not.toBe(
      buildWorkerIdempotencyKey({
        ...base,
        operationKey:
          "forecast-run-2",
      }),
    );
  });

  it("changes when canonical subject identity changes", () => {
    const base = {
      jobType:
        "provider_sync" as const,

      organizationId:
        "org-a",

      storeId:
        "store-a",

      operationKey:
        "sync-1",
    };

    expect(
      buildWorkerIdempotencyKey({
        ...base,

        subjects: [
          {
            resourceType:
              "integration",

            resourceId:
              "integration-1",
          },
        ],
      }),
    ).not.toBe(
      buildWorkerIdempotencyKey({
        ...base,

        subjects: [
          {
            resourceType:
              "integration",

            resourceId:
              "integration-2",
          },
        ],
      }),
    );
  });

  it("preserves identifier case", () => {
    const base = {
      jobType:
        "provider_sync" as const,

      organizationId:
        "org-a",

      storeId: null,

      operationKey:
        "sync-1",

      subjects: [],
    };

    expect(
      buildWorkerIdempotencyKey({
        ...base,
        operationKey:
          "Sync-AbC",
      }),
    ).not.toBe(
      buildWorkerIdempotencyKey({
        ...base,
        operationKey:
          "sync-abc",
      }),
    );
  });

  it("rejects missing logical operation identity", () => {
    expect(() =>
      buildWorkerIdempotencyKey({
        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        operationKey: " ",

        subjects: [],
      }),
    ).toThrow(
      "Worker idempotency operationKey must not be empty.",
    );
  });
});
