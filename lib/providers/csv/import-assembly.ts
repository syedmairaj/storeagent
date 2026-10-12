import type { SyncRunCounts } from "@/lib/commerce-domain/types";

import type {
  CsvAdapterConfig,
  CsvInventoryAdapterConfig,
  CsvSupplierProductAdapterConfig,
} from "@/lib/providers/types";

import {
  assertCsvImportAccountingComplete,
  assertSyncRunCountsValid,
  createCsvImportAccountingState,
  emptySyncRunCounts,
} from "./accounting";

import type {
  CsvImportAccountingState,
  CsvRowTerminalDisposition,
} from "./accounting";

import { executeCsvDependencyPlan } from "./dependency-plan";

import type { CsvDependencyTask, CsvImportLane } from "./dependency-plan";

import { normalizeCsvInventoryObservation } from "./inventory-normalization";

import {
  orchestrateCsvInventorySnapshot,
  orchestrateCsvOrder,
  orchestrateCsvOrderItem,
  orchestrateCsvProduct,
  orchestrateCsvProductVariant,
  orchestrateCsvPurchaseOrder,
  orchestrateCsvPurchaseOrderItem,
  orchestrateCsvSupplier,
  orchestrateCsvSupplierProduct,
} from "./orchestrate-resource";

import {
  normalizeCsvOrderItemRow,
  normalizeCsvOrderRow,
} from "./order-normalization";

import { parseCsv } from "./parser";

import {
  normalizeCsvProductRow,
  normalizeCsvProductVariantRow,
} from "./product-normalization";

import {
  normalizeCsvPurchaseOrderItemRow,
  normalizeCsvPurchaseOrderRow,
} from "./purchase-order-normalization";

import type { CsvQuarantineEnvelope } from "./quarantine";

import type { CsvResourcePersistencePort } from "./resource-orchestration";

import {
  executeCsvInventoryRow,
  executeCsvResourceRow,
  executeCsvSupplierProductRow,
} from "./row-execution";

import type { CsvExecutedRow } from "./row-execution";

import {
  normalizeCsvSupplierProductRow,
  normalizeCsvSupplierRow,
} from "./supplier-normalization";

import type { CsvTrustedImportContext } from "./trusted-context";

export type CsvImportSource = string | Uint8Array;

export interface CsvImportBatch<TConfig> {
  source: CsvImportSource;

  config: TConfig;
}

/**
 * One batch per canonical import lane.
 *
 * Each batch is parsed independently and therefore owns its own
 * diagnostic row-number namespace.
 */
export interface CsvImportPlan {
  context: CsvTrustedImportContext;

  products?: CsvImportBatch<CsvAdapterConfig>;

  productVariants?: CsvImportBatch<CsvAdapterConfig>;

  inventorySnapshots?: CsvImportBatch<CsvInventoryAdapterConfig>;

  orders?: CsvImportBatch<CsvAdapterConfig>;

  orderItems?: CsvImportBatch<CsvAdapterConfig>;

  suppliers?: CsvImportBatch<CsvAdapterConfig>;

  supplierProducts?: CsvImportBatch<CsvSupplierProductAdapterConfig>;

  purchaseOrders?: CsvImportBatch<CsvAdapterConfig>;

  purchaseOrderItems?: CsvImportBatch<CsvAdapterConfig>;
}

export interface CsvImportExecutedRow {
  lane: CsvImportLane;

  rowNumber: number;

  disposition: CsvRowTerminalDisposition;

  quarantine: CsvQuarantineEnvelope | null;

  errorCode: string | null;

  canonicalEntityId: string | null;
}

export interface CsvImportExecutionResult {
  counts: SyncRunCounts;

  rows: readonly CsvImportExecutedRow[];

  quarantines: readonly CsvQuarantineEnvelope[];

  failures: readonly {
    lane: CsvImportLane;

    rowNumber: number;

    errorCode: string;
  }[];
}

interface CsvBatchRuntime {
  lane: CsvImportLane;

  accounting: CsvImportAccountingState;
}

function createBatchRuntime(lane: CsvImportLane): CsvBatchRuntime {
  return {
    lane,

    accounting: createCsvImportAccountingState(),
  };
}

function addCounts(
  target: SyncRunCounts,
  source: SyncRunCounts,
): SyncRunCounts {
  const next: SyncRunCounts = {
    discovered: target.discovered + source.discovered,

    imported: target.imported + source.imported,

    updated: target.updated + source.updated,

    skipped: target.skipped + source.skipped,

    quarantined: target.quarantined + source.quarantined,

    failed: target.failed + source.failed,
  };

  assertSyncRunCountsValid(next);

  return next;
}

function publicRowResult(
  lane: CsvImportLane,
  executed: CsvExecutedRow,
): CsvImportExecutedRow {
  return {
    lane,

    rowNumber: executed.rowNumber,

    disposition: executed.disposition,

    quarantine: executed.quarantine,

    errorCode: executed.errorCode,

    canonicalEntityId: executed.canonicalEntityId,
  };
}

function addExecutionTask(
  tasks: CsvDependencyTask<CsvImportExecutedRow>[],
  rows: CsvImportExecutedRow[],
  runtime: CsvBatchRuntime,
  execute: (accounting: CsvImportAccountingState) => Promise<CsvExecutedRow>,
): void {
  tasks.push({
    lane: runtime.lane,

    execute: async () => {
      const executed = await execute(runtime.accounting);

      runtime.accounting = executed.accounting;

      const row = publicRowResult(runtime.lane, executed);

      rows.push(row);

      return row;
    },
  });
}

/**
 * Build and execute one multi-resource CSV import plan.
 *
 * Important boundaries:
 *
 * - every source is fully parsed and normalized before persistence starts
 * - row numbers remain batch-local diagnostic provenance
 * - dependency execution is deterministic and sequential
 * - location bindings are prerequisites, never created here
 * - SyncRun persistence/finalization is deliberately owned by the next layer
 */
export async function executeCsvImportPlan(
  plan: CsvImportPlan,
  persistence: CsvResourcePersistencePort,
): Promise<CsvImportExecutionResult> {
  const tasks: CsvDependencyTask<CsvImportExecutedRow>[] = [];

  const rows: CsvImportExecutedRow[] = [];

  const runtimes: CsvBatchRuntime[] = [];

  // ---------------------------------------------------------------------------
  // Preflight: parse + normalize every configured batch before any persistence.
  // ---------------------------------------------------------------------------

  if (plan.products) {
    const runtime = createBatchRuntime("product");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.products.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvProductRow(
        parsedRow.row,
        plan.products.config,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvProduct(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.suppliers) {
    const runtime = createBatchRuntime("supplier");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.suppliers.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvSupplierRow(
        parsedRow.row,
        plan.suppliers.config,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvSupplier(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.orders) {
    const runtime = createBatchRuntime("order");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.orders.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvOrderRow(
        parsedRow.row,
        plan.orders.config,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvOrder(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.productVariants) {
    const runtime = createBatchRuntime("product_variant");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.productVariants.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvProductVariantRow(
        parsedRow.row,
        plan.productVariants.config,
        parsedRow.rowNumber,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvProductVariant(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.purchaseOrders) {
    const runtime = createBatchRuntime("purchase_order");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.purchaseOrders.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvPurchaseOrderRow(
        parsedRow.row,
        plan.purchaseOrders.config,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvPurchaseOrder(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.inventorySnapshots) {
    const runtime = createBatchRuntime("inventory_snapshot");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.inventorySnapshots.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvInventoryObservation(
        parsedRow.row,
        plan.inventorySnapshots.config,
        parsedRow.rowNumber,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvInventoryRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvInventorySnapshot(
              plan.context,
              accepted,
              persistence,
            ),
        ),
      );
    }
  }

  if (plan.supplierProducts) {
    const runtime = createBatchRuntime("supplier_product");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.supplierProducts.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvSupplierProductRow(
        parsedRow.row,
        plan.supplierProducts.config,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvSupplierProductRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvSupplierProduct(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.orderItems) {
    const runtime = createBatchRuntime("order_item");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.orderItems.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvOrderItemRow(
        parsedRow.row,
        plan.orderItems.config,
        parsedRow.rowNumber,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvOrderItem(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.purchaseOrderItems) {
    const runtime = createBatchRuntime("purchase_order_item");

    runtimes.push(runtime);

    const parsed = parseCsv(plan.purchaseOrderItems.source);

    for (const parsedRow of parsed.rows) {
      const normalized = normalizeCsvPurchaseOrderItemRow(
        parsedRow.row,
        plan.purchaseOrderItems.config,
        parsedRow.rowNumber,
      );

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(
          accounting,
          parsedRow.rowNumber,
          normalized,
          (accepted) =>
            orchestrateCsvPurchaseOrderItem(
              plan.context,
              accepted,
              persistence,
            ),
        ),
      );
    }
  }

  // Every normalizer above has now run. No persistence has occurred yet.
  await executeCsvDependencyPlan(tasks);

  let counts = emptySyncRunCounts();

  for (const runtime of runtimes) {
    assertCsvImportAccountingComplete(runtime.accounting);

    counts = addCounts(counts, runtime.accounting.counts);
  }

  assertSyncRunCountsValid(counts);

  const quarantines = rows.flatMap((row) =>
    row.quarantine === null ? [] : [row.quarantine],
  );

  const failures = rows.flatMap((row) => {
    if (row.disposition !== "failed" || row.errorCode === null) {
      return [];
    }

    return [
      {
        lane: row.lane,

        rowNumber: row.rowNumber,

        errorCode: row.errorCode,
      },
    ];
  });

  return {
    counts,

    rows,

    quarantines,

    failures,
  };
}
