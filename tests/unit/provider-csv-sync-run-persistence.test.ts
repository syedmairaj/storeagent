import { describe, expect, it, vi } from "vitest";

import { createCsvSyncRunPersistence } from "@/lib/providers/csv/sync-run-persistence";

import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";

vi.mock("server-only", () => ({}));

const context: CsvTrustedImportContext = {
  organizationId: "org-1",

  integrationId: "integration-1",

  storeId: "store-1",

  provider: "csv",

  scope: {
    organizationId: "org-1",

    storeId: "store-1",

    source: "integration_binding",
  },
};

function rpcClient(
  implementation: (
    rpcName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: {
      message: string;
    } | null;
  }>,
) {
  return {
    rpc: vi.fn(implementation),
  };
}

describe("CSV SyncRun Supabase persistence", () => {
  it("begins a new running SyncRun", async () => {
    const client = rpcClient(async () => ({
      data: [
        {
          sync_run_id: "sync-1",

          disposition: "started",

          status: "running",

          discovered_count: 0,

          imported_count: 0,

          updated_count: 0,

          skipped_count: 0,

          quarantined_count: 0,

          failed_count: 0,
        },
      ],

      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.begin({
        context,

        idempotencyKey: " import-001 ",

        reconciliationMetadata: {
          source: "unit-test",
        },
      }),
    ).resolves.toEqual({
      syncRunId: "sync-1",

      disposition: "started",

      status: "running",

      counts: {
        discovered: 0,

        imported: 0,

        updated: 0,

        skipped: 0,

        quarantined: 0,

        failed: 0,
      },
    });

    expect(client.rpc).toHaveBeenCalledWith("csv_begin_sync_run", {
      p_organization_id: "org-1",

      p_store_id: "store-1",

      p_integration_id: "integration-1",

      p_idempotency_key: "import-001",

      p_reconciliation_metadata: {
        source: "unit-test",
      },
    });
  });

  it.each([
    ["replayed", "completed"],
    ["in_progress", "running"],
  ] as const)(
    "accepts begin disposition %s with status %s",
    async (disposition, status) => {
      const client = rpcClient(async () => ({
        data: [
          {
            sync_run_id: "sync-1",

            disposition,

            status,

            discovered_count: 9,

            imported_count: 9,

            updated_count: 0,

            skipped_count: 0,

            quarantined_count: 0,

            failed_count: 0,
          },
        ],

        error: null,
      }));

      const persistence = createCsvSyncRunPersistence(client as never);

      const result = await persistence.begin({
        context,

        idempotencyKey: "import-001",
      });

      expect(result.disposition).toBe(disposition);

      expect(result.status).toBe(status);
    },
  );

  it("completes with exact final counts", async () => {
    const client = rpcClient(async () => ({
      data: [
        {
          sync_run_id: "sync-1",

          status: "completed_with_errors",
        },
      ],

      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.complete({
        context,

        syncRunId: "sync-1",

        counts: {
          discovered: 9,

          imported: 7,

          updated: 0,

          skipped: 1,

          quarantined: 1,

          failed: 0,
        },
      }),
    ).resolves.toEqual({
      syncRunId: "sync-1",

      status: "completed_with_errors",
    });

    expect(client.rpc).toHaveBeenCalledWith("csv_complete_sync_run", {
      p_organization_id: "org-1",

      p_integration_id: "integration-1",

      p_sync_run_id: "sync-1",

      p_discovered_count: 9,

      p_imported_count: 7,

      p_updated_count: 0,

      p_skipped_count: 1,

      p_quarantined_count: 1,

      p_failed_count: 0,

      p_reconciliation_metadata: null,
    });
  });

  it("rejects completion while rows remain pending", async () => {
    const client = rpcClient(async () => ({
      data: [],
      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.complete({
        context,

        syncRunId: "sync-1",

        counts: {
          discovered: 2,

          imported: 1,

          updated: 0,

          skipped: 0,

          quarantined: 0,

          failed: 0,
        },
      }),
    ).rejects.toThrow(
      "CSV SyncRun completion requires every discovered row to have exactly one terminal disposition.",
    );

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("marks orchestration failure through fail RPC", async () => {
    const client = rpcClient(async () => ({
      data: [
        {
          sync_run_id: "sync-1",

          status: "failed",
        },
      ],

      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.fail({
        context,

        syncRunId: "sync-1",

        errorSummary: {
          code: "CSV_IMPORT_FAILED",
        },
      }),
    ).resolves.toEqual({
      syncRunId: "sync-1",

      status: "failed",
    });

    expect(client.rpc).toHaveBeenCalledWith("csv_fail_sync_run", {
      p_organization_id: "org-1",

      p_integration_id: "integration-1",

      p_sync_run_id: "sync-1",

      p_error_summary: {
        code: "CSV_IMPORT_FAILED",
      },

      p_reconciliation_metadata: null,
    });
  });

  it("rejects blank idempotency key before RPC", async () => {
    const client = rpcClient(async () => ({
      data: [],
      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.begin({
        context,

        idempotencyKey: "   ",
      }),
    ).rejects.toThrow("idempotencyKey must not be empty.");

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed begin RPC shape", async () => {
    const client = rpcClient(async () => ({
      data: [],
      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.begin({
        context,

        idempotencyKey: "import-001",
      }),
    ).rejects.toThrow(
      'CSV SyncRun RPC "csv_begin_sync_run" must return exactly one row.',
    );
  });

  it("rejects unexpected begin disposition", async () => {
    const client = rpcClient(async () => ({
      data: [
        {
          sync_run_id: "sync-1",

          disposition: "mystery",

          status: "running",

          discovered_count: 0,

          imported_count: 0,

          updated_count: 0,

          skipped_count: 0,

          quarantined_count: 0,

          failed_count: 0,
        },
      ],

      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.begin({
        context,

        idempotencyKey: "import-001",
      }),
    ).rejects.toThrow('Unexpected CSV SyncRun begin disposition "mystery".');
  });

  it("rejects invalid RPC counts", async () => {
    const client = rpcClient(async () => ({
      data: [
        {
          sync_run_id: "sync-1",

          disposition: "replayed",

          status: "completed",

          discovered_count: 1,

          imported_count: -1,

          updated_count: 0,

          skipped_count: 0,

          quarantined_count: 0,

          failed_count: 0,
        },
      ],

      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.begin({
        context,

        idempotencyKey: "import-001",
      }),
    ).rejects.toThrow("CSV SyncRun RPC returned invalid imported_count.");
  });

  it("surfaces Supabase RPC failures", async () => {
    const client = rpcClient(async () => ({
      data: null,

      error: {
        message: "database unavailable",
      },
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.begin({
        context,

        idempotencyKey: "import-001",
      }),
    ).rejects.toThrow(
      'CSV SyncRun RPC "csv_begin_sync_run" failed: database unavailable',
    );
  });

  it("rejects non-terminal completion RPC status", async () => {
    const client = rpcClient(async () => ({
      data: [
        {
          sync_run_id: "sync-1",

          status: "running",
        },
      ],

      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.complete({
        context,

        syncRunId: "sync-1",

        counts: {
          discovered: 1,

          imported: 1,

          updated: 0,

          skipped: 0,

          quarantined: 0,

          failed: 0,
        },
      }),
    ).rejects.toThrow(
      'CSV SyncRun RPC "csv_complete_sync_run" returned non-terminal orchestration status "running".',
    );
  });
});
