"use server";

import { createHash, randomUUID } from "node:crypto";

import { requireAppIdentity } from "@/lib/auth/app-route";
import { authorizeMerchantInventoryImport } from "@/lib/inventory-import/authorize";
import { ensureCsvStoreIntegration } from "@/lib/inventory-import/ensure-integration";
import { executeCsvImport } from "@/lib/providers/csv/import-execution";
import { createCsvSupabasePersistence } from "@/lib/providers/csv/supabase-persistence";
import { createCsvSyncRunPersistence } from "@/lib/providers/csv/sync-run-persistence";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  buildMerchantSalesCsvImportPlan,
  collectMerchantSalesOrders,
} from "@/lib/sales-import/build-csv-plan";
import { assertNoConflictingSalesHistory } from "@/lib/sales-import/conflict-guard";
import {
  MERCHANT_SALES_CSV_TEMPLATE,
  type MerchantSalesColumnMapping,
  type MerchantSalesImportPreviewRow,
} from "@/lib/sales-import/contract";
import { loadKnownStoreSkus } from "@/lib/sales-import/load-known-skus";
import { parseMerchantSalesCsv } from "@/lib/sales-import/parse-merchant-sales-csv";

export type PreviewSalesImportResult =
  | {
      ok: true;
      contentHash: string;
      headers: readonly string[];
      mapping: MerchantSalesColumnMapping;
      rows: readonly MerchantSalesImportPreviewRow[];
      readyCount: number;
      rejectedCount: number;
      velocityEligibleCount: number;
      storeName: string;
      locationName: string;
      storeTimezone: string;
      knownSkuCount: number;
    }
  | { ok: false; error: string };

export type ConfirmSalesImportResult =
  | {
      ok: true;
      syncRunId: string;
      disposition: "executed" | "replayed" | "in_progress";
      readyCount: number;
      rejectedCount: number;
      velocityEligibleCount: number;
      counts: {
        discovered: number;
        imported: number;
        updated: number;
        skipped: number;
        quarantined: number;
        failed: number;
      };
      orderItemCounts: {
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
      metricRecomputeNote: string;
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
        "merchant-sales-import-v1",
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

async function loadStoreTimezone(input: {
  organizationId: string;
  storeId: string;
}): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stores")
    .select("timezone")
    .eq("organization_id", input.organizationId)
    .eq("id", input.storeId)
    .maybeSingle();

  if (error || !data?.timezone) {
    throw new Error("Unable to load store timezone.");
  }

  return String(data.timezone);
}

export async function getMerchantSalesCsvTemplateAction(): Promise<{
  filename: string;
  content: string;
}> {
  await requireAppIdentity();
  return {
    filename: "storeagent-sales-import-template.csv",
    content: `${MERCHANT_SALES_CSV_TEMPLATE}\n`,
  };
}

export async function createSalesImportConfirmationTokenAction(): Promise<string> {
  await requireAppIdentity();
  return randomUUID();
}

export async function previewMerchantSalesImportAction(input: {
  organizationId: string;
  storeId: string;
  locationId: string;
  csvText: string;
  mappingOverride?: MerchantSalesColumnMapping;
}): Promise<PreviewSalesImportResult> {
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

  try {
    const [knownSkus, storeTimezone] = await Promise.all([
      loadKnownStoreSkus({
        organizationId: authorized.scope.organizationId,
        storeId: authorized.scope.storeId,
      }),
      loadStoreTimezone({
        organizationId: authorized.scope.organizationId,
        storeId: authorized.scope.storeId,
      }),
    ]);

    const parsed = parseMerchantSalesCsv({
      source: input.csvText,
      storeTimezone,
      storeCurrency: authorized.scope.storeCurrency,
      knownSkus,
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
      velocityEligibleCount: parsed.velocityEligibleCount,
      storeName: authorized.scope.storeName,
      locationName: authorized.scope.locationName,
      storeTimezone,
      knownSkuCount: knownSkus.size,
    };
  } catch {
    return {
      ok: false,
      error: "Unable to preview sales import right now.",
    };
  }
}

export async function confirmMerchantSalesImportAction(input: {
  organizationId: string;
  storeId: string;
  locationId: string;
  csvText: string;
  contentHash: string;
  confirmationToken: string;
  mappingOverride?: MerchantSalesColumnMapping;
}): Promise<ConfirmSalesImportResult> {
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

  try {
    const [knownSkus, storeTimezone] = await Promise.all([
      loadKnownStoreSkus({
        organizationId: authorized.scope.organizationId,
        storeId: authorized.scope.storeId,
      }),
      loadStoreTimezone({
        organizationId: authorized.scope.organizationId,
        storeId: authorized.scope.storeId,
      }),
    ]);

    const parsed = parseMerchantSalesCsv({
      source: input.csvText,
      storeTimezone,
      storeCurrency: authorized.scope.storeCurrency,
      knownSkus,
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
      return { ok: false, error: "No valid rows are ready to import." };
    }

    if (parsed.rejectedCount > 0) {
      return {
        ok: false,
        error: `${parsed.rejectedCount} row(s) still need fixes before import.`,
      };
    }

    try {
      collectMerchantSalesOrders(parsed.rows);
    } catch (cause) {
      return {
        ok: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Order lines conflict and cannot be imported.",
      };
    }

    const admin = createSupabaseAdminClient();
    const { context } = await ensureCsvStoreIntegration({
      organizationId: authorized.scope.organizationId,
      storeId: authorized.scope.storeId,
      locationId: authorized.scope.locationId,
      client: admin,
    });

    const conflictCheck = await assertNoConflictingSalesHistory({
      context,
      rows: parsed.rows,
      client: admin,
    });
    if (!conflictCheck.ok) {
      return { ok: false, error: conflictCheck.error };
    }

    const plan = buildMerchantSalesCsvImportPlan({
      context,
      rows: parsed.rows,
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

    const orderItemRows =
      result.execution?.rows.filter((row) => row.lane === "order_item") ?? [];

    const orderItemCounts = {
      created: orderItemRows.filter((row) => row.disposition === "imported")
        .length,
      updated: orderItemRows.filter((row) => row.disposition === "updated")
        .length,
      skipped: orderItemRows.filter((row) => row.disposition === "skipped")
        .length,
      quarantined: orderItemRows.filter(
        (row) => row.disposition === "quarantined",
      ).length,
      failed: orderItemRows.filter((row) => row.disposition === "failed")
        .length,
    };

    const rowErrors = orderItemRows
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
      velocityEligibleCount: parsed.velocityEligibleCount,
      counts: result.counts,
      orderItemCounts,
      storeName: authorized.scope.storeName,
      locationName: authorized.scope.locationName,
      rowErrors,
      metricRecomputeNote:
        "Sales lines are persisted as orders and order items. Grain-aligned sales velocity (sku_daily_metrics) requires a separate authorized M5 metric recompute — workers and cron stay off in this milestone. Decision readiness will keep cover blocked until recomputed metrics exist.",
    };
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message
        : "Unable to import sales right now.";

    return {
      ok: false,
      error: message.includes("owner or admin")
        ? "Only owners and admins can import sales."
        : "Unable to import sales right now.",
    };
  }
}
