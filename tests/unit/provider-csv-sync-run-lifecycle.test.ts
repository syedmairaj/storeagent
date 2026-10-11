import {
  describe,
  expect,
  it,
} from "vitest";

import {
  csvSyncRunStatusIsTerminal,
  finalizeSuccessfulCsvSyncRunStatus,
  transitionCsvSyncRunStatus,
} from "@/lib/providers/csv/sync-run-lifecycle";

describe(
  "CSV SyncRun lifecycle",
  () => {
    const cleanCounts = {
      discovered: 2,
      imported: 1,
      updated: 1,
      skipped: 0,
      quarantined: 0,
      failed: 0,
    };

    it(
      "starts queued run as running",
      () => {
        expect(
          transitionCsvSyncRunStatus(
            "queued",
            "start",
          ),
        ).toBe(
          "running",
        );
      },
    );

    it(
      "completes clean run as completed",
      () => {
        expect(
          transitionCsvSyncRunStatus(
            "running",
            "complete",
            cleanCounts,
          ),
        ).toBe(
          "completed",
        );
      },
    );

    it(
      "completes quarantined run as completed_with_errors",
      () => {
        expect(
          finalizeSuccessfulCsvSyncRunStatus({
            discovered: 2,
            imported: 1,
            updated: 0,
            skipped: 0,
            quarantined: 1,
            failed: 0,
          }),
        ).toBe(
          "completed_with_errors",
        );
      },
    );

    it(
      "completes row-failure run as completed_with_errors",
      () => {
        expect(
          finalizeSuccessfulCsvSyncRunStatus({
            discovered: 2,
            imported: 1,
            updated: 0,
            skipped: 0,
            quarantined: 0,
            failed: 1,
          }),
        ).toBe(
          "completed_with_errors",
        );
      },
    );

    it(
      "does not treat skipped rows as errors",
      () => {
        expect(
          finalizeSuccessfulCsvSyncRunStatus({
            discovered: 2,
            imported: 1,
            updated: 0,
            skipped: 1,
            quarantined: 0,
            failed: 0,
          }),
        ).toBe(
          "completed",
        );
      },
    );

    it(
      "fails queued run on file-level failure",
      () => {
        expect(
          transitionCsvSyncRunStatus(
            "queued",
            "fail",
          ),
        ).toBe(
          "failed",
        );
      },
    );

    it(
      "fails running run on orchestration failure",
      () => {
        expect(
          transitionCsvSyncRunStatus(
            "running",
            "fail",
          ),
        ).toBe(
          "failed",
        );
      },
    );

    it(
      "supports cancellation without inventing retry behavior",
      () => {
        expect(
          transitionCsvSyncRunStatus(
            "running",
            "cancel",
          ),
        ).toBe(
          "cancelled",
        );
      },
    );

    it.each([
      "completed",
      "completed_with_errors",
      "failed",
      "cancelled",
    ] as const)(
      "recognizes terminal status %s",
      (
        status,
      ) => {
        expect(
          csvSyncRunStatusIsTerminal(
            status,
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects terminal lifecycle re-entry",
      () => {
        expect(() =>
          transitionCsvSyncRunStatus(
            "completed",
            "start",
          ),
        ).toThrow(
          'Terminal CSV SyncRun status "completed" cannot transition.',
        );
      },
    );

    it(
      "rejects complete without counts",
      () => {
        expect(() =>
          transitionCsvSyncRunStatus(
            "running",
            "complete",
          ),
        ).toThrow(
          "CSV SyncRun completion requires final counts.",
        );
      },
    );

    it(
      "rejects running-to-running start transition",
      () => {
        expect(() =>
          transitionCsvSyncRunStatus(
            "running",
            "start",
          ),
        ).toThrow(
          'CSV SyncRun can start only from queued; received "running".',
        );
      },
    );

    it(
      "rejects invalid count reconciliation on completion",
      () => {
        expect(() =>
          finalizeSuccessfulCsvSyncRunStatus({
            discovered: 1,
            imported: 1,
            updated: 0,
            skipped: 0,
            quarantined: 1,
            failed: 0,
          }),
        ).toThrow(
          "SyncRun terminal row count must not exceed discovered count.",
        );
      },
    );
  },
);
