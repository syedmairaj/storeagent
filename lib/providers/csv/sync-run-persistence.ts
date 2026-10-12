import "server-only";

import type {
  JsonValue,
  SyncRunCounts,
  SyncRunStatus,
} from "@/lib/commerce-domain/types";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { assertSyncRunCountsValid } from "./accounting";
import type { CsvTrustedImportContext } from "./trusted-context";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type CsvSyncRunJsonObject = {
  [key: string]: JsonValue;
};

export type CsvSyncRunBeginDisposition = "started" | "replayed" | "in_progress";

export interface CsvSyncRunSnapshot {
  syncRunId: string;

  disposition: CsvSyncRunBeginDisposition;

  status: SyncRunStatus;

  counts: SyncRunCounts;
}

export interface CsvSyncRunTerminalResult {
  syncRunId: string;

  status: Extract<
    SyncRunStatus,
    "completed" | "completed_with_errors" | "failed"
  >;
}

export interface CsvSyncRunPersistencePort {
  begin(input: {
    context: CsvTrustedImportContext;

    idempotencyKey: string;

    reconciliationMetadata?: CsvSyncRunJsonObject | null;
  }): Promise<CsvSyncRunSnapshot>;

  complete(input: {
    context: CsvTrustedImportContext;

    syncRunId: string;

    counts: SyncRunCounts;

    reconciliationMetadata?: CsvSyncRunJsonObject | null;
  }): Promise<CsvSyncRunTerminalResult>;

  fail(input: {
    context: CsvTrustedImportContext;

    syncRunId: string;

    errorSummary: CsvSyncRunJsonObject | null;

    reconciliationMetadata?: CsvSyncRunJsonObject | null;
  }): Promise<CsvSyncRunTerminalResult>;
}

interface BeginRpcRow {
  sync_run_id: string;

  disposition: string;

  status: string;

  discovered_count: number;

  imported_count: number;

  updated_count: number;

  skipped_count: number;

  quarantined_count: number;

  failed_count: number;
}

interface TerminalRpcRow {
  sync_run_id: string;

  status: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${field} must not be empty.`);
  }

  return normalized;
}

function syncRunStatus(value: string): SyncRunStatus {
  switch (value) {
    case "queued":
    case "running":
    case "completed":
    case "completed_with_errors":
    case "failed":
    case "cancelled":
      return value;

    default:
      throw new Error(`Unexpected CSV SyncRun status "${value}".`);
  }
}

function beginDisposition(value: string): CsvSyncRunBeginDisposition {
  switch (value) {
    case "started":
    case "replayed":
    case "in_progress":
      return value;

    default:
      throw new Error(`Unexpected CSV SyncRun begin disposition "${value}".`);
  }
}

function requireNonNegativeSafeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`CSV SyncRun RPC returned invalid ${field}.`);
  }

  return value;
}

function beginRpcResult(rpcName: string, data: unknown): CsvSyncRunSnapshot {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      `CSV SyncRun RPC "${rpcName}" must return exactly one row.`,
    );
  }

  const row = data[0] as Partial<BeginRpcRow>;

  if (typeof row.sync_run_id !== "string" || !row.sync_run_id.trim()) {
    throw new Error(
      `CSV SyncRun RPC "${rpcName}" returned an invalid SyncRun id.`,
    );
  }

  if (typeof row.disposition !== "string") {
    throw new Error(
      `CSV SyncRun RPC "${rpcName}" returned an invalid begin disposition.`,
    );
  }

  if (typeof row.status !== "string") {
    throw new Error(`CSV SyncRun RPC "${rpcName}" returned an invalid status.`);
  }

  const counts: SyncRunCounts = {
    discovered: requireNonNegativeSafeInteger(
      row.discovered_count,
      "discovered_count",
    ),

    imported: requireNonNegativeSafeInteger(
      row.imported_count,
      "imported_count",
    ),

    updated: requireNonNegativeSafeInteger(row.updated_count, "updated_count"),

    skipped: requireNonNegativeSafeInteger(row.skipped_count, "skipped_count"),

    quarantined: requireNonNegativeSafeInteger(
      row.quarantined_count,
      "quarantined_count",
    ),

    failed: requireNonNegativeSafeInteger(row.failed_count, "failed_count"),
  };

  assertSyncRunCountsValid(counts);

  return {
    syncRunId: row.sync_run_id,

    disposition: beginDisposition(row.disposition),

    status: syncRunStatus(row.status),

    counts,
  };
}

function terminalRpcResult(
  rpcName: string,
  data: unknown,
): CsvSyncRunTerminalResult {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      `CSV SyncRun RPC "${rpcName}" must return exactly one row.`,
    );
  }

  const row = data[0] as Partial<TerminalRpcRow>;

  if (typeof row.sync_run_id !== "string" || !row.sync_run_id.trim()) {
    throw new Error(
      `CSV SyncRun RPC "${rpcName}" returned an invalid SyncRun id.`,
    );
  }

  if (typeof row.status !== "string") {
    throw new Error(`CSV SyncRun RPC "${rpcName}" returned an invalid status.`);
  }

  const status = syncRunStatus(row.status);

  if (
    status !== "completed" &&
    status !== "completed_with_errors" &&
    status !== "failed"
  ) {
    throw new Error(
      `CSV SyncRun RPC "${rpcName}" returned non-terminal orchestration status "${status}".`,
    );
  }

  return {
    syncRunId: row.sync_run_id,

    status,
  };
}

function assertCompletionCounts(counts: SyncRunCounts): void {
  assertSyncRunCountsValid(counts);

  const terminal =
    counts.imported +
    counts.updated +
    counts.skipped +
    counts.quarantined +
    counts.failed;

  if (terminal !== counts.discovered) {
    throw new Error(
      "CSV SyncRun completion requires every discovered row to have exactly one terminal disposition.",
    );
  }
}

async function beginRpc(
  client: SupabaseAdminClient,
  args: Record<string, unknown>,
): Promise<CsvSyncRunSnapshot> {
  const rpcName = "csv_begin_sync_run";

  const { data, error } = await client.rpc(rpcName, args);

  if (error) {
    throw new Error(`CSV SyncRun RPC "${rpcName}" failed: ${error.message}`);
  }

  return beginRpcResult(rpcName, data);
}

async function terminalRpc(
  client: SupabaseAdminClient,
  rpcName: string,
  args: Record<string, unknown>,
): Promise<CsvSyncRunTerminalResult> {
  const { data, error } = await client.rpc(rpcName, args);

  if (error) {
    throw new Error(`CSV SyncRun RPC "${rpcName}" failed: ${error.message}`);
  }

  return terminalRpcResult(rpcName, data);
}

export function createCsvSyncRunPersistence(
  client: SupabaseAdminClient = createSupabaseAdminClient(),
): CsvSyncRunPersistencePort {
  return {
    async begin(input) {
      const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");

      return beginRpc(client, {
        p_organization_id: input.context.organizationId,

        p_store_id: input.context.storeId,

        p_integration_id: input.context.integrationId,

        p_idempotency_key: idempotencyKey,

        p_reconciliation_metadata: input.reconciliationMetadata ?? null,
      });
    },

    async complete(input) {
      const syncRunId = required(input.syncRunId, "syncRunId");

      assertCompletionCounts(input.counts);

      return terminalRpc(client, "csv_complete_sync_run", {
        p_organization_id: input.context.organizationId,

        p_integration_id: input.context.integrationId,

        p_sync_run_id: syncRunId,

        p_discovered_count: input.counts.discovered,

        p_imported_count: input.counts.imported,

        p_updated_count: input.counts.updated,

        p_skipped_count: input.counts.skipped,

        p_quarantined_count: input.counts.quarantined,

        p_failed_count: input.counts.failed,

        p_reconciliation_metadata: input.reconciliationMetadata ?? null,
      });
    },

    async fail(input) {
      const syncRunId = required(input.syncRunId, "syncRunId");

      return terminalRpc(client, "csv_fail_sync_run", {
        p_organization_id: input.context.organizationId,

        p_integration_id: input.context.integrationId,

        p_sync_run_id: syncRunId,

        p_error_summary: input.errorSummary,

        p_reconciliation_metadata: input.reconciliationMetadata ?? null,
      });
    },
  };
}
