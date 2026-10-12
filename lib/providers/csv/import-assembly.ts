import type { SyncRunCounts } from "@/lib/commerce-domain/types";

import type {
  CsvAdapterConfig,
  CsvInventoryAdapterConfig,
  CsvSupplierProductAdapterConfig,
  ProviderNormalizationResult,
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

import {
  analyzeCsvDuplicates,
  csvInventoryDuplicateIdentity,
  csvResourceDuplicateIdentity,
  csvSupplierProductDuplicateIdentity,
} from "./duplicate-analysis";

import type { CsvDuplicateDecision } from "./duplicate-analysis";

import type { CsvDependencyTask, CsvImportLane } from "./dependency-plan";

import { normalizeCsvInventoryObservation } from "./inventory-normalization";

import type { CsvInventoryObservationResult } from "./inventory-normalization";

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

import {
  buildCsvInventoryQuarantineEnvelope,
  buildCsvQuarantineEnvelope,
  buildCsvSupplierProductQuarantineEnvelope,
} from "./quarantine";

import type { CsvQuarantineEnvelope } from "./quarantine";

import type { CsvResourcePersistencePort } from "./resource-orchestration";

import {
  executeCsvInventoryRow,
  executeCsvPreclassifiedRow,
  executeCsvResourceRow,
  executeCsvSupplierProductRow,
} from "./row-execution";

import type { CsvExecutedRow } from "./row-execution";

import {
  normalizeCsvSupplierProductRow,
  normalizeCsvSupplierRow,
} from "./supplier-normalization";

import type { CsvSupplierProductResult } from "./supplier-normalization";

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

interface CsvNormalizedBatchRow<TResult> {
  rowNumber: number;
  normalized: TResult;
}

type CsvDuplicateTerminal =
  | {
      disposition: "skipped";
    }
  | {
      disposition: "quarantined";
      quarantine: CsvQuarantineEnvelope;
    };

function analyzeResourceDuplicates<TCanonical>(
  rows: readonly CsvNormalizedBatchRow<
    ProviderNormalizationResult<TCanonical>
  >[],
): ReadonlyMap<number, CsvDuplicateDecision> {
  return analyzeCsvDuplicates(
    rows.flatMap(({ rowNumber, normalized }) => {
      if (normalized.disposition !== "accepted") {
        return [];
      }

      return [
        {
          rowNumber,
          identity: csvResourceDuplicateIdentity({
            resourceType: normalized.resourceType,
            externalId: normalized.externalId,
          }),
          payload: {
            externalParentId: normalized.externalParentId,
            canonical: normalized.canonical,
          },
        },
      ];
    }),
  );
}

function analyzeInventoryDuplicates(
  rows: readonly CsvNormalizedBatchRow<CsvInventoryObservationResult>[],
): ReadonlyMap<number, CsvDuplicateDecision> {
  return analyzeCsvDuplicates(
    rows.flatMap(({ rowNumber, normalized }) => {
      if (normalized.disposition !== "accepted") {
        return [];
      }

      return [
        {
          rowNumber,
          identity: csvInventoryDuplicateIdentity({
            variantExternalId: normalized.variantExternalId,
            locationExternalId: normalized.locationExternalId,
            observedAt: normalized.canonical.observedAt,
          }),
          payload: normalized.canonical,
        },
      ];
    }),
  );
}

function analyzeSupplierProductDuplicates(
  rows: readonly CsvNormalizedBatchRow<CsvSupplierProductResult>[],
): ReadonlyMap<number, CsvDuplicateDecision> {
  return analyzeCsvDuplicates(
    rows.flatMap(({ rowNumber, normalized }) => {
      if (normalized.disposition !== "accepted") {
        return [];
      }

      return [
        {
          rowNumber,
          identity: csvSupplierProductDuplicateIdentity({
            supplierExternalId: normalized.supplierExternalId,
            variantExternalId: normalized.variantExternalId,
          }),
          payload: normalized.canonical,
        },
      ];
    }),
  );
}

function duplicateDecision(
  rowNumber: number,
  decisions: ReadonlyMap<number, CsvDuplicateDecision>,
): CsvDuplicateDecision | null {
  return decisions.get(rowNumber) ?? null;
}

function resourceDuplicateTerminal<TCanonical>(
  rowNumber: number,
  normalized: ProviderNormalizationResult<TCanonical>,
  decisions: ReadonlyMap<number, CsvDuplicateDecision>,
): CsvDuplicateTerminal | null {
  if (normalized.disposition !== "accepted") {
    return null;
  }

  const decision = duplicateDecision(rowNumber, decisions);

  if (
    decision === null ||
    decision.disposition === "unique" ||
    decision.disposition === "representative"
  ) {
    return null;
  }

  if (decision.disposition === "redundant") {
    return {
      disposition: "skipped",
    };
  }

  return {
    disposition: "quarantined",
    quarantine: buildCsvQuarantineEnvelope(rowNumber, {
      provider: normalized.provider,
      resourceType: normalized.resourceType,
      externalId: normalized.externalId,
      externalParentId: normalized.externalParentId,
      adapterVersion: normalized.adapterVersion,
      reasonCode: "DUPLICATE_CONFLICT",
      issues: [],
    }),
  };
}

function inventoryDuplicateTerminal(
  rowNumber: number,
  normalized: CsvInventoryObservationResult,
  decisions: ReadonlyMap<number, CsvDuplicateDecision>,
): CsvDuplicateTerminal | null {
  if (normalized.disposition !== "accepted") {
    return null;
  }

  const decision = duplicateDecision(rowNumber, decisions);

  if (
    decision === null ||
    decision.disposition === "unique" ||
    decision.disposition === "representative"
  ) {
    return null;
  }

  if (decision.disposition === "redundant") {
    return {
      disposition: "skipped",
    };
  }

  return {
    disposition: "quarantined",
    quarantine: buildCsvInventoryQuarantineEnvelope({
      rowNumber,
      adapterVersion: normalized.adapterVersion,
      variantExternalId: normalized.variantExternalId,
      locationExternalId: normalized.locationExternalId,
      reasonCode: "DUPLICATE_CONFLICT",
      issues: [],
    }),
  };
}

function supplierProductDuplicateTerminal(
  rowNumber: number,
  normalized: CsvSupplierProductResult,
  decisions: ReadonlyMap<number, CsvDuplicateDecision>,
): CsvDuplicateTerminal | null {
  if (normalized.disposition !== "accepted") {
    return null;
  }

  const decision = duplicateDecision(rowNumber, decisions);

  if (
    decision === null ||
    decision.disposition === "unique" ||
    decision.disposition === "representative"
  ) {
    return null;
  }

  if (decision.disposition === "redundant") {
    return {
      disposition: "skipped",
    };
  }

  return {
    disposition: "quarantined",
    quarantine: buildCsvSupplierProductQuarantineEnvelope({
      rowNumber,
      adapterVersion: normalized.adapterVersion,
      supplierExternalId: normalized.supplierExternalId,
      variantExternalId: normalized.variantExternalId,
      reasonCode: "DUPLICATE_CONFLICT",
      issues: [],
    }),
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

    const productConfig = plan.products.config;

    const parsed = parseCsv(plan.products.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvProductRow(parsedRow.row, productConfig),
    }));

    const duplicateDecisions = analyzeResourceDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = resourceDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(accounting, rowNumber, normalized, (accepted) =>
          orchestrateCsvProduct(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.suppliers) {
    const runtime = createBatchRuntime("supplier");

    runtimes.push(runtime);

    const supplierConfig = plan.suppliers.config;

    const parsed = parseCsv(plan.suppliers.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvSupplierRow(parsedRow.row, supplierConfig),
    }));

    const duplicateDecisions = analyzeResourceDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = resourceDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(accounting, rowNumber, normalized, (accepted) =>
          orchestrateCsvSupplier(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.orders) {
    const runtime = createBatchRuntime("order");

    runtimes.push(runtime);

    const orderConfig = plan.orders.config;

    const parsed = parseCsv(plan.orders.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvOrderRow(parsedRow.row, orderConfig),
    }));

    const duplicateDecisions = analyzeResourceDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = resourceDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(accounting, rowNumber, normalized, (accepted) =>
          orchestrateCsvOrder(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.productVariants) {
    const runtime = createBatchRuntime("product_variant");

    runtimes.push(runtime);

    const productVariantConfig = plan.productVariants.config;

    const parsed = parseCsv(plan.productVariants.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvProductVariantRow(
        parsedRow.row,
        productVariantConfig,
        parsedRow.rowNumber,
      ),
    }));

    const duplicateDecisions = analyzeResourceDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = resourceDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(accounting, rowNumber, normalized, (accepted) =>
          orchestrateCsvProductVariant(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.purchaseOrders) {
    const runtime = createBatchRuntime("purchase_order");

    runtimes.push(runtime);

    const purchaseOrderConfig = plan.purchaseOrders.config;

    const parsed = parseCsv(plan.purchaseOrders.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvPurchaseOrderRow(
        parsedRow.row,
        purchaseOrderConfig,
      ),
    }));

    const duplicateDecisions = analyzeResourceDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = resourceDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(accounting, rowNumber, normalized, (accepted) =>
          orchestrateCsvPurchaseOrder(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.inventorySnapshots) {
    const runtime = createBatchRuntime("inventory_snapshot");

    runtimes.push(runtime);

    const inventoryConfig = plan.inventorySnapshots.config;

    const parsed = parseCsv(plan.inventorySnapshots.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvInventoryObservation(
        parsedRow.row,
        inventoryConfig,
        parsedRow.rowNumber,
      ),
    }));

    const duplicateDecisions = analyzeInventoryDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = inventoryDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvInventoryRow(accounting, rowNumber, normalized, (accepted) =>
          orchestrateCsvInventorySnapshot(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.supplierProducts) {
    const runtime = createBatchRuntime("supplier_product");

    runtimes.push(runtime);

    const supplierProductConfig = plan.supplierProducts.config;

    const parsed = parseCsv(plan.supplierProducts.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvSupplierProductRow(
        parsedRow.row,
        supplierProductConfig,
      ),
    }));

    const duplicateDecisions = analyzeSupplierProductDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = supplierProductDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvSupplierProductRow(
          accounting,
          rowNumber,
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

    const orderItemConfig = plan.orderItems.config;

    const parsed = parseCsv(plan.orderItems.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvOrderItemRow(
        parsedRow.row,
        orderItemConfig,
        parsedRow.rowNumber,
      ),
    }));

    const duplicateDecisions = analyzeResourceDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = resourceDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(accounting, rowNumber, normalized, (accepted) =>
          orchestrateCsvOrderItem(plan.context, accepted, persistence),
        ),
      );
    }
  }

  if (plan.purchaseOrderItems) {
    const runtime = createBatchRuntime("purchase_order_item");

    runtimes.push(runtime);

    const purchaseOrderItemConfig = plan.purchaseOrderItems.config;

    const parsed = parseCsv(plan.purchaseOrderItems.source);

    const normalizedRows = parsed.rows.map((parsedRow) => ({
      rowNumber: parsedRow.rowNumber,
      normalized: normalizeCsvPurchaseOrderItemRow(
        parsedRow.row,
        purchaseOrderItemConfig,
        parsedRow.rowNumber,
      ),
    }));

    const duplicateDecisions = analyzeResourceDuplicates(normalizedRows);

    for (const { rowNumber, normalized } of normalizedRows) {
      const duplicate = resourceDuplicateTerminal(
        rowNumber,
        normalized,
        duplicateDecisions,
      );

      if (duplicate !== null) {
        addExecutionTask(tasks, rows, runtime, async (accounting) =>
          executeCsvPreclassifiedRow(accounting, rowNumber, duplicate),
        );

        continue;
      }

      addExecutionTask(tasks, rows, runtime, (accounting) =>
        executeCsvResourceRow(accounting, rowNumber, normalized, (accepted) =>
          orchestrateCsvPurchaseOrderItem(plan.context, accepted, persistence),
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
