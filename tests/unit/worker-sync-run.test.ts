import {
  describe,
  expect,
  it,
} from "vitest";

import {
  syncRunStatusForWorkerOutcome,
  validateProviderSyncIdempotencyBinding,
  validateSyncRunExecutionIdentity,
  workerStatusMayDirectlyOwnSyncRunStatus,
} from "@/workers/sync-run";

describe("provider SyncRun worker orchestration", () => {
  it("maps explicit synchronization start to canonical running", () => {
    expect(
      syncRunStatusForWorkerOutcome({
        kind: "started",
      }),
    ).toBe(
      "running",
    );
  });

  it("maps successful synchronization completion to completed", () => {
    expect(
      syncRunStatusForWorkerOutcome({
        kind: "completed",
        completedWithErrors: false,
      }),
    ).toBe(
      "completed",
    );
  });

  it("maps partial synchronization completion to completed_with_errors", () => {
    expect(
      syncRunStatusForWorkerOutcome({
        kind: "completed",
        completedWithErrors: true,
      }),
    ).toBe(
      "completed_with_errors",
    );
  });

  it("maps terminal worker execution failure to canonical failed outcome", () => {
    expect(
      syncRunStatusForWorkerOutcome({
        kind: "terminal_failure",
        failureClass:
          "timeout",
      }),
    ).toBe(
      "failed",
    );
  });

  it("maps explicit cancellation to canonical cancelled", () => {
    expect(
      syncRunStatusForWorkerOutcome({
        kind: "cancelled",
      }),
    ).toBe(
      "cancelled",
    );
  });

  it("does not treat queued as canonical synchronization progress", () => {
    expect(
      workerStatusMayDirectlyOwnSyncRunStatus(
        "queued",
      ),
    ).toBe(false);
  });

  it("does not treat claimed as canonical synchronization progress", () => {
    expect(
      workerStatusMayDirectlyOwnSyncRunStatus(
        "claimed",
      ),
    ).toBe(false);
  });

  it("does not treat retry_wait as canonical synchronization failure", () => {
    expect(
      workerStatusMayDirectlyOwnSyncRunStatus(
        "retry_wait",
      ),
    ).toBe(false);
  });

  it("recognizes execution-bearing worker states separately", () => {
    expect(
      workerStatusMayDirectlyOwnSyncRunStatus(
        "running",
      ),
    ).toBe(true);

    expect(
      workerStatusMayDirectlyOwnSyncRunStatus(
        "succeeded",
      ),
    ).toBe(true);

    expect(
      workerStatusMayDirectlyOwnSyncRunStatus(
        "failed",
      ),
    ).toBe(true);

    expect(
      workerStatusMayDirectlyOwnSyncRunStatus(
        "cancelled",
      ),
    ).toBe(true);
  });

  it("validates canonical SyncRun execution identity", () => {
    expect(
      validateSyncRunExecutionIdentity({
        syncRunId:
          "sync-run-1",

        integrationId:
          "integration-1",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        syncRunIdempotencyKey:
          "sync-run-key-1",
      }),
    ).toEqual({
      syncRunId:
        "sync-run-1",

      integrationId:
        "integration-1",

      organizationId:
        "org-a",

      storeId:
        "store-a",

      syncRunIdempotencyKey:
        "sync-run-key-1",
    });
  });

  it("rejects missing SyncRun identity", () => {
    expect(() =>
      validateSyncRunExecutionIdentity({
        syncRunId: " ",

        integrationId:
          "integration-1",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        syncRunIdempotencyKey:
          "sync-run-key-1",
      }),
    ).toThrow(
      "SyncRun orchestration syncRunId must not be empty.",
    );
  });

  it("rejects missing Integration identity", () => {
    expect(() =>
      validateSyncRunExecutionIdentity({
        syncRunId:
          "sync-run-1",

        integrationId: " ",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        syncRunIdempotencyKey:
          "sync-run-key-1",
      }),
    ).toThrow(
      "SyncRun orchestration integrationId must not be empty.",
    );
  });

  it("rejects missing canonical SyncRun idempotency identity", () => {
    expect(() =>
      validateSyncRunExecutionIdentity({
        syncRunId:
          "sync-run-1",

        integrationId:
          "integration-1",

        organizationId:
          "org-a",

        storeId:
          "store-a",

        syncRunIdempotencyKey: " ",
      }),
    ).toThrow(
      "SyncRun orchestration syncRunIdempotencyKey must not be empty.",
    );
  });

  it("keeps worker-job and SyncRun idempotency identities explicit", () => {
    expect(
      validateProviderSyncIdempotencyBinding({
        workerJobIdempotencyKey:
          "worker-key-1",

        syncRunIdempotencyKey:
          "sync-run-key-1",
      }),
    ).toEqual({
      workerJobIdempotencyKey:
        "worker-key-1",

      syncRunIdempotencyKey:
        "sync-run-key-1",
    });
  });

  it("rejects missing worker-job idempotency identity", () => {
    expect(() =>
      validateProviderSyncIdempotencyBinding({
        workerJobIdempotencyKey:
          " ",

        syncRunIdempotencyKey:
          "sync-run-key-1",
      }),
    ).toThrow(
      "SyncRun orchestration workerJobIdempotencyKey must not be empty.",
    );
  });
});
