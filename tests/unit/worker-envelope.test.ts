import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isStoreAgentJobType,
  validateWorkerJobEnvelope,
} from "@/workers/envelope";

describe("worker job envelope", () => {
  it("freezes the initial background-job vocabulary", () => {
    const expected = [
      "provider_sync",
      "provider_reconciliation",
      "metrics_aggregation",
      "forecast_generation",
      "action_generation",
      "explanation_generation",
      "notification_delivery",
    ];

    for (const jobType of expected) {
      expect(
        isStoreAgentJobType(
          jobType,
        ),
      ).toBe(true);
    }
  });

  it("rejects arbitrary job-type strings", () => {
    expect(
      isStoreAgentJobType(
        "do_whatever",
      ),
    ).toBe(false);
  });

  it("accepts a valid V1 job envelope", () => {
    expect(
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "forecast_generation",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        idempotencyKey:
          "forecast:org-a:store-a:2026-10-08",

        subjects: [
          {
            resourceType:
              "forecast_run",

            resourceId:
              "forecast-run-1",
          },
        ],

        requestedAt:
          "2026-10-08T03:30:00.000Z",
      }),
    ).toEqual({
      version: 1,

      jobType:
        "forecast_generation",

      organizationId:
        "org-a",

      storeId:
        "store-a",

      idempotencyKey:
        "forecast:org-a:store-a:2026-10-08",

      subjects: [
        {
          resourceType:
            "forecast_run",

          resourceId:
            "forecast-run-1",
        },
      ],

      requestedAt:
        "2026-10-08T03:30:00.000Z",
    });
  });

  it("supports organization-scoped jobs", () => {
    expect(
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "provider_reconciliation",

        organizationId:
          "org-a",

        storeId: null,

        idempotencyKey:
          "reconcile:org-a:integration-1",

        subjects: [
          {
            resourceType:
              "integration",

            resourceId:
              "integration-1",
          },
        ],

        requestedAt:
          "2026-10-08T03:30:00Z",
      }).storeId,
    ).toBeNull();
  });

  it("rejects blank organization scope", () => {
    expect(() =>
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "provider_sync",

        organizationId: " ",

        storeId: null,

        idempotencyKey:
          "sync-1",

        subjects: [],

        requestedAt:
          "2026-10-08T03:30:00Z",
      }),
    ).toThrow(
      "Worker organizationId must not be empty.",
    );
  });

  it("rejects blank idempotency key", () => {
    expect(() =>
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        idempotencyKey: " ",

        subjects: [],

        requestedAt:
          "2026-10-08T03:30:00Z",
      }),
    ).toThrow(
      "Worker job idempotencyKey must not be empty.",
    );
  });

  it("requires explicit UTC requestedAt", () => {
    expect(() =>
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "action_generation",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        idempotencyKey:
          "action-1",

        subjects: [],

        requestedAt:
          "2026-10-08T07:30:00+04:00",
      }),
    ).toThrow(
      "Worker job requestedAt must be an explicit UTC ISO-8601 timestamp.",
    );
  });

  it("rejects local timestamps with no timezone", () => {
    expect(() =>
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "metrics_aggregation",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        idempotencyKey:
          "metric-1",

        subjects: [],

        requestedAt:
          "2026-10-08T03:30:00",
      }),
    ).toThrow(
      "Worker job requestedAt must be an explicit UTC ISO-8601 timestamp.",
    );
  });

  it("rejects unsupported envelope versions", () => {
    expect(() =>
      validateWorkerJobEnvelope({
        version: 2 as 1,

        jobType:
          "provider_sync",

        organizationId:
          "org-a",

        storeId: null,

        idempotencyKey:
          "sync-1",

        subjects: [],

        requestedAt:
          "2026-10-08T03:30:00Z",
      }),
    ).toThrow(
      'Unsupported worker job envelope version "2".',
    );
  });

  it("rejects blank subject resource type", () => {
    expect(() =>
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "forecast_generation",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        idempotencyKey:
          "forecast-1",

        subjects: [
          {
            resourceType: " ",

            resourceId:
              "run-1",
          },
        ],

        requestedAt:
          "2026-10-08T03:30:00Z",
      }),
    ).toThrow(
      "Worker job subject resourceType must not be empty.",
    );
  });

  it("rejects blank subject resource ID", () => {
    expect(() =>
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "forecast_generation",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        idempotencyKey:
          "forecast-1",

        subjects: [
          {
            resourceType:
              "forecast_run",

            resourceId: " ",
          },
        ],

        requestedAt:
          "2026-10-08T03:30:00Z",
      }),
    ).toThrow(
      "Worker job subject resourceId must not be empty.",
    );
  });

  it("allows an empty subject list for jobs whose target will be resolved from scope", () => {
    expect(
      validateWorkerJobEnvelope({
        version: 1,

        jobType:
          "notification_delivery",

        organizationId:
          "org-a",

        storeId: null,

        idempotencyKey:
          "notification-digest-1",

        subjects: [],

        requestedAt:
          "2026-10-08T03:30:00Z",
      }).subjects,
    ).toEqual([]);
  });
});
