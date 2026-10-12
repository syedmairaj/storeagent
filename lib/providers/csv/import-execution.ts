import type { SyncRunCounts, SyncRunStatus } from "@/lib/commerce-domain/types";

import type {
  CsvImportExecutionResult,
  CsvImportPlan,
} from "./import-assembly";

import { executeCsvImportPlan } from "./import-assembly";

import type { CsvResourcePersistencePort } from "./resource-orchestration";

import type {
  CsvSyncRunPersistencePort,
  CsvSyncRunSnapshot,
} from "./sync-run-persistence";

export type CsvImportOperationalDisposition =
  "executed" | "replayed" | "in_progress";

export interface CsvImportOperationalResult {
  syncRunId: string;

  disposition: CsvImportOperationalDisposition;

  status: SyncRunStatus;

  counts: SyncRunCounts;

  execution: CsvImportExecutionResult | null;
}

export interface ExecuteCsvImportInput {
  plan: CsvImportPlan;

  idempotencyKey: string;

  resourcePersistence: CsvResourcePersistencePort;

  syncRunPersistence: CsvSyncRunPersistencePort;
}

function replayResult(
  snapshot: CsvSyncRunSnapshot,
): CsvImportOperationalResult {
  return {
    syncRunId: snapshot.syncRunId,

    disposition:
      snapshot.disposition === "in_progress" ? "in_progress" : "replayed",

    status: snapshot.status,

    counts: snapshot.counts,

    execution: null,
  };
}

function errorSummary(error: unknown): {
  code: string;
} {
  if (error instanceof Error && error.message.trim()) {
    return {
      code: "CSV_IMPORT_ORCHESTRATION_FAILED",
    };
  }

  return {
    code: "CSV_IMPORT_ORCHESTRATION_FAILED",
  };
}

export async function executeCsvImport(
  input: ExecuteCsvImportInput,
): Promise<CsvImportOperationalResult> {
  const begin = await input.syncRunPersistence.begin({
    context: input.plan.context,

    idempotencyKey: input.idempotencyKey,

    reconciliationMetadata: {
      orchestration: "csv-import",
    },
  });

  if (begin.disposition === "replayed" || begin.disposition === "in_progress") {
    return replayResult(begin);
  }

  try {
    const execution = await executeCsvImportPlan(
      input.plan,
      input.resourcePersistence,
    );

    const completed = await input.syncRunPersistence.complete({
      context: input.plan.context,

      syncRunId: begin.syncRunId,

      counts: execution.counts,

      reconciliationMetadata: {
        orchestration: "csv-import",
      },
    });

    return {
      syncRunId: begin.syncRunId,

      disposition: "executed",

      status: completed.status,

      counts: execution.counts,

      execution,
    };
  } catch (error) {
    try {
      await input.syncRunPersistence.fail({
        context: input.plan.context,

        syncRunId: begin.syncRunId,

        errorSummary: errorSummary(error),

        reconciliationMetadata: {
          orchestration: "csv-import",
        },
      });
    } catch {
      // Preserve the original import failure.
      //
      // Failure-finalization errors must not mask the
      // actual orchestration error that caused the run
      // to fail.
    }

    throw error;
  }
}
