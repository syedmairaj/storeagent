import type {
  SyncRunCounts,
  SyncRunStatus,
} from "@/lib/commerce-domain/types";

import {
  assertSyncRunCountsValid,
} from "@/lib/providers/csv/accounting";

export type CsvSyncRunLifecycleEvent =
  | "start"
  | "complete"
  | "fail"
  | "cancel";

const TERMINAL_STATUSES =
  new Set<SyncRunStatus>([
    "completed",
    "completed_with_errors",
    "failed",
    "cancelled",
  ]);

export function csvSyncRunStatusIsTerminal(
  status: SyncRunStatus,
): boolean {
  return TERMINAL_STATUSES.has(
    status,
  );
}

export function finalizeSuccessfulCsvSyncRunStatus(
  counts: SyncRunCounts,
): Extract<
  SyncRunStatus,
  "completed" |
  "completed_with_errors"
> {
  assertSyncRunCountsValid(
    counts,
  );

  const hasErrors =
    counts.quarantined > 0 ||
    counts.failed > 0;

  return hasErrors
    ? "completed_with_errors"
    : "completed";
}

export function transitionCsvSyncRunStatus(
  current: SyncRunStatus,
  event:
    CsvSyncRunLifecycleEvent,
  counts?:
    SyncRunCounts,
): SyncRunStatus {
  if (
    csvSyncRunStatusIsTerminal(
      current,
    )
  ) {
    throw new Error(
      `Terminal CSV SyncRun status "${current}" cannot transition.`,
    );
  }

  switch (event) {
    case "start": {
      if (
        current !==
        "queued"
      ) {
        throw new Error(
          `CSV SyncRun can start only from queued; received "${current}".`,
        );
      }

      return "running";
    }

    case "complete": {
      if (
        current !==
        "running"
      ) {
        throw new Error(
          `CSV SyncRun can complete only from running; received "${current}".`,
        );
      }

      if (
        counts ===
        undefined
      ) {
        throw new Error(
          "CSV SyncRun completion requires final counts.",
        );
      }

      return finalizeSuccessfulCsvSyncRunStatus(
        counts,
      );
    }

    case "fail": {
      if (
        current !==
          "queued" &&
        current !==
          "running"
      ) {
        throw new Error(
          `CSV SyncRun cannot fail from "${current}".`,
        );
      }

      return "failed";
    }

    case "cancel": {
      if (
        current !==
          "queued" &&
        current !==
          "running"
      ) {
        throw new Error(
          `CSV SyncRun cannot cancel from "${current}".`,
        );
      }

      return "cancelled";
    }
  }
}
