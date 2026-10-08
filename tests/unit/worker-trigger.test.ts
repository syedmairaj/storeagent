import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildTriggeredWorkerIdempotencyKey,
  triggerEstablishesTenantOwnership,
  validateWorkerTrigger,
  validateWorkerTriggerRequest,
} from "@/workers/trigger";

describe("worker scheduled and event trigger boundary", () => {
  it("accepts a scheduled trigger", () => {
    expect(
      validateWorkerTrigger({
        kind: "scheduled",
        triggerKey:
          "nightly-store-sync",
      }),
    ).toEqual({
      kind: "scheduled",
      triggerKey:
        "nightly-store-sync",
    });
  });

  it("accepts an event trigger backed by Integration identity", () => {
    expect(
      validateWorkerTrigger({
        kind: "event",
        triggerKey:
          "provider-event-123",

        sourceType:
          "integration",

        sourceId:
          "integration-1",
      }),
    ).toEqual({
      kind: "event",
      triggerKey:
        "provider-event-123",

      sourceType:
        "integration",

      sourceId:
        "integration-1",
    });
  });

  it("accepts an event trigger backed by canonical entity identity", () => {
    expect(
      validateWorkerTrigger({
        kind: "event",
        triggerKey:
          "canonical-event-1",

        sourceType:
          "canonical_entity",

        sourceId:
          "inventory-snapshot-1",
      }),
    ).toEqual({
      kind: "event",
      triggerKey:
        "canonical-event-1",

      sourceType:
        "canonical_entity",

      sourceId:
        "inventory-snapshot-1",
    });
  });

  it("rejects blank scheduled trigger identity", () => {
    expect(() =>
      validateWorkerTrigger({
        kind: "scheduled",
        triggerKey: " ",
      }),
    ).toThrow(
      "Worker trigger triggerKey must not be empty.",
    );
  });

  it("rejects blank event source identity", () => {
    expect(() =>
      validateWorkerTrigger({
        kind: "event",
        triggerKey:
          "event-1",

        sourceType:
          "integration",

        sourceId: " ",
      }),
    ).toThrow(
      "Worker trigger event sourceId must not be empty.",
    );
  });

  it("validates trigger requests independently of tenant scope", () => {
    expect(
      validateWorkerTriggerRequest({
        jobType:
          "provider_sync",

        trigger: {
          kind: "scheduled",
          triggerKey:
            "nightly-sync",
        },

        operationKey:
          "sync-run-1",

        subjects: [
          {
            resourceType:
              "sync_run",

            resourceId:
              "sync-run-1",
          },
        ],
      }),
    ).toEqual({
      jobType:
        "provider_sync",

      trigger: {
        kind: "scheduled",
        triggerKey:
          "nightly-sync",
      },

      operationKey:
        "sync-run-1",

      subjects: [
        {
          resourceType:
            "sync_run",

          resourceId:
            "sync-run-1",
        },
      ],
    });
  });

  it("rejects missing logical operation identity", () => {
    expect(() =>
      validateWorkerTriggerRequest({
        jobType:
          "forecast_generation",

        trigger: {
          kind: "scheduled",
          triggerKey:
            "forecast-schedule",
        },

        operationKey: " ",

        subjects: [],
      }),
    ).toThrow(
      "Worker trigger operationKey must not be empty.",
    );
  });

  it("does not let a scheduled trigger establish tenant ownership", () => {
    expect(
      triggerEstablishesTenantOwnership({
        kind: "scheduled",
        triggerKey:
          "nightly-sync",
      }),
    ).toBe(false);
  });

  it("does not let an Integration event establish tenant ownership by itself", () => {
    expect(
      triggerEstablishesTenantOwnership({
        kind: "event",

        triggerKey:
          "event-1",

        sourceType:
          "integration",

        sourceId:
          "integration-1",
      }),
    ).toBe(false);
  });

  it("builds deterministic worker identity only after trusted scope resolution", () => {
    const request = {
      jobType:
        "forecast_generation" as const,

      trigger: {
        kind:
          "scheduled" as const,

        triggerKey:
          "daily-forecast",
      },

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

    const first =
      buildTriggeredWorkerIdempotencyKey(
        request,
        {
          organizationId:
            "org-a",

          storeId:
            "store-a",
        },
      );

    const second =
      buildTriggeredWorkerIdempotencyKey(
        request,
        {
          organizationId:
            "org-a",

          storeId:
            "store-a",
        },
      );

    expect(first).toBe(
      second,
    );
  });

  it("produces different identity for different trusted organizations", () => {
    const request = {
      jobType:
        "provider_sync" as const,

      trigger: {
        kind:
          "event" as const,

        triggerKey:
          "provider-event-1",

        sourceType:
          "integration" as const,

        sourceId:
          "integration-1",
      },

      operationKey:
        "sync-run-1",

      subjects: [],
    };

    expect(
      buildTriggeredWorkerIdempotencyKey(
        request,
        {
          organizationId:
            "org-a",
          storeId: null,
        },
      ),
    ).not.toBe(
      buildTriggeredWorkerIdempotencyKey(
        request,
        {
          organizationId:
            "org-b",
          storeId: null,
        },
      ),
    );
  });

  it("does not make trigger delivery identity the logical job identity automatically", () => {
    const first =
      buildTriggeredWorkerIdempotencyKey(
        {
          jobType:
            "provider_sync",

          trigger: {
            kind: "event",

            triggerKey:
              "delivery-a",

            sourceType:
              "integration",

            sourceId:
              "integration-1",
          },

          operationKey:
            "sync-run-1",

          subjects: [],
        },
        {
          organizationId:
            "org-a",
          storeId: null,
        },
      );

    const second =
      buildTriggeredWorkerIdempotencyKey(
        {
          jobType:
            "provider_sync",

          trigger: {
            kind: "event",

            triggerKey:
              "delivery-b",

            sourceType:
              "integration",

            sourceId:
              "integration-1",
          },

          operationKey:
            "sync-run-1",

          subjects: [],
        },
        {
          organizationId:
            "org-a",
          storeId: null,
        },
      );

    expect(first).toBe(
      second,
    );
  });
});
