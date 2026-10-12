import { describe, expect, it, vi } from "vitest";

import { executeCsvImport } from "@/lib/providers/csv/import-execution";

import type { CsvImportPlan } from "@/lib/providers/csv/import-assembly";

import type {
  CsvPersistedResource,
  CsvResourcePersistencePort,
} from "@/lib/providers/csv/resource-orchestration";

import type {
  CsvSyncRunPersistencePort,
  CsvSyncRunSnapshot,
  CsvSyncRunTerminalResult,
} from "@/lib/providers/csv/sync-run-persistence";

const plan: CsvImportPlan = {
  context: {
    organizationId: "org-1",
    integrationId: "integration-1",
    storeId: "store-1",
    provider: "csv",

    scope: {
      organizationId: "org-1",
      storeId: "store-1",
      source: "integration_binding",
    },
  },

  products: {
    source: ["Product ID,Title,Status", "P-1,Widget,active"].join("\n"),

    config: {
      resourceType: "product",
      adapterVersion: "test-v1",

      mappings: [
        {
          canonicalField: "externalId",
          sourceColumn: "Product ID",
        },
        {
          canonicalField: "title",
          sourceColumn: "Title",
        },
        {
          canonicalField: "status",
          sourceColumn: "Status",
        },
      ],
    },
  },
};

function unexpectedPersistenceCall(): Promise<never> {
  return Promise.reject(new Error("Unexpected persistence call."));
}

function resourcePersistence(): CsvResourcePersistencePort {
  return {
    resolveBinding: vi.fn(async () => null),

    persistProduct: vi.fn(async (): Promise<CsvPersistedResource> => ({
      canonicalEntityId: "product-1",
      disposition: "imported",
    })),

    persistProductVariant: vi.fn(unexpectedPersistenceCall),

    appendInventorySnapshot: vi.fn(unexpectedPersistenceCall),

    persistOrder: vi.fn(unexpectedPersistenceCall),

    persistOrderItem: vi.fn(unexpectedPersistenceCall),

    persistSupplier: vi.fn(unexpectedPersistenceCall),

    persistSupplierProduct: vi.fn(unexpectedPersistenceCall),

    persistPurchaseOrder: vi.fn(unexpectedPersistenceCall),

    persistPurchaseOrderItem: vi.fn(unexpectedPersistenceCall),
  };
}

function syncRunPersistence(
  overrides?: Partial<CsvSyncRunPersistencePort>,
): CsvSyncRunPersistencePort {
  return {
    begin: vi.fn(async (): Promise<CsvSyncRunSnapshot> => ({
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
    })),

    complete: vi.fn(async (): Promise<CsvSyncRunTerminalResult> => ({
      syncRunId: "sync-1",
      status: "completed",
    })),

    fail: vi.fn(async (): Promise<CsvSyncRunTerminalResult> => ({
      syncRunId: "sync-1",
      status: "failed",
    })),

    ...overrides,
  };
}

describe("CSV import operational execution", () => {
  it("executes D-D exactly once for a newly started SyncRun", async () => {
    const resources = resourcePersistence();

    const runs = syncRunPersistence();

    const result = await executeCsvImport({
      plan,
      idempotencyKey: "import-001",
      resourcePersistence: resources,
      syncRunPersistence: runs,
    });

    expect(result.disposition).toBe("executed");

    expect(result.status).toBe("completed");

    expect(result.counts).toEqual({
      discovered: 1,
      imported: 1,
      updated: 0,
      skipped: 0,
      quarantined: 0,
      failed: 0,
    });

    expect(resources.persistProduct).toHaveBeenCalledTimes(1);

    expect(runs.complete).toHaveBeenCalledTimes(1);

    expect(runs.fail).not.toHaveBeenCalled();
  });

  it("does not execute D-D for terminal replay", async () => {
    const resources = resourcePersistence();

    const runs = syncRunPersistence({
      begin: vi.fn(async (): Promise<CsvSyncRunSnapshot> => ({
        syncRunId: "sync-1",
        disposition: "replayed",
        status: "completed",

        counts: {
          discovered: 1,
          imported: 1,
          updated: 0,
          skipped: 0,
          quarantined: 0,
          failed: 0,
        },
      })),
    });

    const result = await executeCsvImport({
      plan,
      idempotencyKey: "import-001",
      resourcePersistence: resources,
      syncRunPersistence: runs,
    });

    expect(result).toEqual({
      syncRunId: "sync-1",
      disposition: "replayed",
      status: "completed",

      counts: {
        discovered: 1,
        imported: 1,
        updated: 0,
        skipped: 0,
        quarantined: 0,
        failed: 0,
      },

      execution: null,
    });

    expect(resources.persistProduct).not.toHaveBeenCalled();

    expect(runs.complete).not.toHaveBeenCalled();

    expect(runs.fail).not.toHaveBeenCalled();
  });

  it("does not execute D-D when another worker owns the SyncRun", async () => {
    const resources = resourcePersistence();

    const runs = syncRunPersistence({
      begin: vi.fn(async (): Promise<CsvSyncRunSnapshot> => ({
        syncRunId: "sync-1",
        disposition: "in_progress",
        status: "running",

        counts: {
          discovered: 0,
          imported: 0,
          updated: 0,
          skipped: 0,
          quarantined: 0,
          failed: 0,
        },
      })),
    });

    const result = await executeCsvImport({
      plan,
      idempotencyKey: "import-001",
      resourcePersistence: resources,
      syncRunPersistence: runs,
    });

    expect(result.disposition).toBe("in_progress");

    expect(result.execution).toBeNull();

    expect(resources.persistProduct).not.toHaveBeenCalled();

    expect(runs.complete).not.toHaveBeenCalled();

    expect(runs.fail).not.toHaveBeenCalled();
  });

  it("completes with errors when D-D records a row-level operational failure", async () => {
    const resources = resourcePersistence();

    resources.persistProduct = vi.fn(
      async (): Promise<CsvPersistedResource> => {
        throw new Error("database exploded");
      },
    );

    const runs = syncRunPersistence({
      complete: vi.fn(async (): Promise<CsvSyncRunTerminalResult> => ({
        syncRunId: "sync-1",
        status: "completed_with_errors",
      })),
    });

    const result = await executeCsvImport({
      plan,
      idempotencyKey: "import-001",
      resourcePersistence: resources,
      syncRunPersistence: runs,
    });

    expect(result.disposition).toBe("executed");

    expect(result.status).toBe("completed_with_errors");

    expect(result.counts).toEqual({
      discovered: 1,
      imported: 0,
      updated: 0,
      skipped: 0,
      quarantined: 0,
      failed: 1,
    });

    expect(result.execution?.failures).toEqual([
      {
        lane: "product",
        rowNumber: 2,
        errorCode: "Error",
      },
    ]);

    expect(runs.complete).toHaveBeenCalledWith({
      context: plan.context,
      syncRunId: "sync-1",

      counts: {
        discovered: 1,
        imported: 0,
        updated: 0,
        skipped: 0,
        quarantined: 0,
        failed: 1,
      },

      reconciliationMetadata: {
        orchestration: "csv-import",
      },
    });

    expect(runs.fail).not.toHaveBeenCalled();
  });

  it("marks the SyncRun failed when whole-import orchestration throws", async () => {
    const resources = resourcePersistence();

    const throwingPlan = {
      context: plan.context,

      get products(): CsvImportPlan["products"] {
        throw new Error("preflight exploded");
      },
    } satisfies CsvImportPlan;

    const runs = syncRunPersistence();

    await expect(
      executeCsvImport({
        plan: throwingPlan,
        idempotencyKey: "import-001",
        resourcePersistence: resources,
        syncRunPersistence: runs,
      }),
    ).rejects.toThrow("preflight exploded");

    expect(runs.complete).not.toHaveBeenCalled();

    expect(runs.fail).toHaveBeenCalledTimes(1);

    expect(runs.fail).toHaveBeenCalledWith({
      context: plan.context,

      syncRunId: "sync-1",

      errorSummary: {
        code: "CSV_IMPORT_ORCHESTRATION_FAILED",
      },

      reconciliationMetadata: {
        orchestration: "csv-import",
      },
    });
  });

  it("preserves original orchestration error if fail finalization also errors", async () => {
    const resources = resourcePersistence();

    const throwingPlan = {
      context: plan.context,

      get products(): CsvImportPlan["products"] {
        throw new Error("original failure");
      },
    } satisfies CsvImportPlan;

    const runs = syncRunPersistence({
      fail: vi.fn(async (): Promise<CsvSyncRunTerminalResult> => {
        throw new Error("finalization failure");
      }),
    });

    await expect(
      executeCsvImport({
        plan: throwingPlan,
        idempotencyKey: "import-001",
        resourcePersistence: resources,
        syncRunPersistence: runs,
      }),
    ).rejects.toThrow("original failure");

    expect(runs.fail).toHaveBeenCalledTimes(1);
  });

  it("marks the SyncRun failed if completion itself fails", async () => {
    const resources = resourcePersistence();

    const runs = syncRunPersistence({
      complete: vi.fn(async (): Promise<CsvSyncRunTerminalResult> => {
        throw new Error("completion failed");
      }),
    });

    await expect(
      executeCsvImport({
        plan,
        idempotencyKey: "import-001",
        resourcePersistence: resources,
        syncRunPersistence: runs,
      }),
    ).rejects.toThrow("completion failed");

    expect(resources.persistProduct).toHaveBeenCalledTimes(1);

    expect(runs.fail).toHaveBeenCalledTimes(1);
  });
});
