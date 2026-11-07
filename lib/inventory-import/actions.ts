"use server";

import { createHash, randomUUID } from "node:crypto";

import { requireAppIdentity } from "@/lib/auth/app-route";
import { authorizeMerchantInventoryImport } from "@/lib/inventory-import/authorize";
import { buildMerchantCsvImportPlan } from "@/lib/inventory-import/build-csv-plan";
import {
  MERCHANT_CSV_TEMPLATE,
  type MerchantColumnMapping,
  type MerchantImportPreviewRow,
} from "@/lib/inventory-import/contract";
import { ensureCsvStoreIntegration } from "@/lib/inventory-import/ensure-integration";
import { parseMerchantInventoryCsv } from "@/lib/inventory-import/parse-merchant-csv";
import { executeCsvImport } from "@/lib/providers/csv/import-execution";
import { createCsvSupabasePersistence } from "@/lib/providers/csv/supabase-persistence";
import { createCsvSyncRunPersistence } from "@/lib/providers/csv/sync-run-persistence";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PreviewInventoryImportResult =
  | {
      ok: true;
      contentHash: string;
      headers: readonly string[];
      mapping: MerchantColumnMapping;
      rows: readonly MerchantImportPreviewRow[];
      readyCount: number;
      rejectedCount: number;
      storeName: string;
      locationName: string;
    }
  | { ok: false; error: string };

export type ConfirmInventoryImportResult =
  | {
      ok: true;
      syncRunId: string;
      disposition: "executed" | "replayed" | "in_progress";
      readyCount: number;
      rejectedCount: number;
      counts: {
        discovered: number;
        imported: number;
        updated: number;
        skipped: number;
        quarantined: number;
        failed: number;
      };
      /**
       * Merchant-facing SKU outcomes from the inventory_snapshot lane only.
       * SyncRun `counts` aggregate product + variant + inventory lanes.
       */
      skuCounts: {
        created: number;
        updated: number;
        skipped: number;
        quarantined: number;
        failed: number;
      };
      storeName: string;
      locationName: string;
      rowErrors: readonly {
        rowNumber: number;
        code: string;
        message: string;
      }[];
    }
  | { ok: false; error: string };

function buildIdempotencyKey(input: {
  organizationId: string;
  storeId: string;
  locationId: string;
  contentHash: string;
  confirmationToken: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.organizationId,
        input.storeId,
        input.locationId,
        input.contentHash,
        input.confirmationToken,
      ].join(":"),
      "utf8",
    )
    .digest("hex");
}

export async function getMerchantInventoryCsvTemplateAction(): Promise<{
  filename: string;
  content: string;
}> {
  await requireAppIdentity();
  return {
    filename: "storeagent-inventory-import-template.csv",
    content: `${MERCHANT_CSV_TEMPLATE}\n`,
  };
}

export async function previewMerchantInventoryImportAction(input: {
  organizationId: string;
  storeId: string;
  locationId: string;
  csvText: string;
  mappingOverride?: MerchantColumnMapping;
}): Promise<PreviewInventoryImportResult> {
  const identity = await requireAppIdentity();
  const authorized = await authorizeMerchantInventoryImport({
    identity,
    organizationId: input.organizationId,
    storeId: input.storeId,
    locationId: input.locationId,
  });

  if (!authorized.ok) {
    return { ok: false, error: authorized.error };
  }

  const parsed = parseMerchantInventoryCsv({
    source: input.csvText,
    mappingOverride: input.mappingOverride,
  });

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return {
    ok: true,
    contentHash: parsed.contentHash,
    headers: parsed.headers,
    mapping: parsed.mapping,
    rows: parsed.rows,
    readyCount: parsed.readyCount,
    rejectedCount: parsed.rejectedCount,
    storeName: authorized.scope.storeName,
    locationName: authorized.scope.locationName,
  };
}

export async function confirmMerchantInventoryImportAction(input: {
  organizationId: string;
  storeId: string;
  locationId: string;
  csvText: string;
  contentHash: string;
  confirmationToken: string;
  mappingOverride?: MerchantColumnMapping;
}): Promise<ConfirmInventoryImportResult> {
  const identity = await requireAppIdentity();
  const authorized = await authorizeMerchantInventoryImport({
    identity,
    organizationId: input.organizationId,
    storeId: input.storeId,
    locationId: input.locationId,
  });

  if (!authorized.ok) {
    return { ok: false, error: authorized.error };
  }

  if (!input.confirmationToken.trim()) {
    return { ok: false, error: "Confirmation token is required." };
  }

  const parsed = parseMerchantInventoryCsv({
    source: input.csvText,
    mappingOverride: input.mappingOverride,
  });

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  if (parsed.contentHash !== input.contentHash) {
    return {
      ok: false,
      error: "The CSV changed after preview. Preview again before importing.",
    };
  }

  if (parsed.readyCount === 0) {
    return {
      ok: false,
      error: "No valid rows are ready to import.",
    };
  }

  // Reject entire confirmation if any row is invalid — never silent discard.
  if (parsed.rejectedCount > 0) {
    return {
      ok: false,
      error: `${parsed.rejectedCount} row(s) still need fixes before import.`,
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { context } = await ensureCsvStoreIntegration({
      organizationId: authorized.scope.organizationId,
      storeId: authorized.scope.storeId,
      locationId: authorized.scope.locationId,
      client: admin,
    });

    const observedAt = new Date().toISOString();
    const plan = buildMerchantCsvImportPlan({
      context,
      rows: parsed.rows,
      storeCurrency: authorized.scope.storeCurrency,
      observedAt,
    });

    const idempotencyKey = buildIdempotencyKey({
      organizationId: authorized.scope.organizationId,
      storeId: authorized.scope.storeId,
      locationId: authorized.scope.locationId,
      contentHash: parsed.contentHash,
      confirmationToken: input.confirmationToken.trim(),
    });

    const result = await executeCsvImport({
      plan,
      idempotencyKey,
      resourcePersistence: createCsvSupabasePersistence(admin),
      syncRunPersistence: createCsvSyncRunPersistence(admin),
    });

    const inventoryRows =
      result.execution?.rows.filter(
        (row) => row.lane === "inventory_snapshot",
      ) ?? [];

    const skuCounts = {
      created: inventoryRows.filter((row) => row.disposition === "imported")
        .length,
      updated: inventoryRows.filter((row) => row.disposition === "updated")
        .length,
      skipped: inventoryRows.filter((row) => row.disposition === "skipped")
        .length,
      quarantined: inventoryRows.filter(
        (row) => row.disposition === "quarantined",
      ).length,
      failed: inventoryRows.filter((row) => row.disposition === "failed")
        .length,
    };

    const rowErrors = inventoryRows
      .filter(
        (row) =>
          row.disposition === "quarantined" || row.disposition === "failed",
      )
      .map((row) => ({
        rowNumber: row.rowNumber,
        code: row.errorCode ?? row.disposition,
        message:
          row.quarantine?.issues[0]?.message ??
          `Row ${row.rowNumber} ${row.disposition}.`,
      }));

    return {
      ok: true,
      syncRunId: result.syncRunId,
      disposition: result.disposition,
      readyCount: parsed.readyCount,
      rejectedCount: parsed.rejectedCount,
      counts: result.counts,
      skuCounts,
      storeName: authorized.scope.storeName,
      locationName: authorized.scope.locationName,
      rowErrors,
    };
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message
        : "Unable to import inventory right now.";

    return {
      ok: false,
      error: message.includes("owner or admin")
        ? "Only owners and admins can import inventory."
        : "Unable to import inventory right now.",
    };
  }
}

export async function createImportConfirmationTokenAction(): Promise<string> {
  await requireAppIdentity();
  return randomUUID();
}
