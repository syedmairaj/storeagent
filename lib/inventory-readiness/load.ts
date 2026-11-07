import "server-only";

import { countGrainAlignedKnownDemand } from "@/lib/inventory-readiness/align";
import { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";
import type {
  EvidencePresence,
  MerchantDecisionReadiness,
} from "@/lib/inventory-readiness/types";
import { AppError } from "@/lib/observability/app-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SnapshotGrainRow = {
  id: string;
  store_id: string;
  location_id: string;
  variant_id: string;
  available_quantity: number | null;
  observed_at: string;
};

type MetricGrainRow = {
  store_id: string;
  location_id: string;
  variant_id: string;
  metric_date: string;
  sales_velocity_30d: number | null;
};

/**
 * Load tenant-scoped inventory evidence and assess decision readiness.
 * Uses the member-scoped server client only (no service role).
 */
export async function loadMerchantDecisionReadiness(
  organizationId: string,
): Promise<MerchantDecisionReadiness> {
  const supabase = await createSupabaseServerClient();

  const { data: snapshots, error: snapshotError } = await supabase
    .from("inventory_snapshots")
    .select(
      "id,store_id,location_id,variant_id,available_quantity,observed_at",
    )
    .eq("organization_id", organizationId)
    .order("observed_at", { ascending: false })
    .limit(500);

  if (snapshotError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load inventory snapshots for decision readiness.",
      publicMessage: "Unable to assess decision readiness right now.",
      httpStatus: 500,
      cause: snapshotError,
    });
  }

  const rows = (snapshots ?? []) as SnapshotGrainRow[];
  const latestByGrain = new Map<string, SnapshotGrainRow>();
  for (const row of rows) {
    // Latest observation per variant×location (store implied by location ownership).
    const key = `${row.variant_id}:${row.location_id}`;
    if (!latestByGrain.has(key)) {
      latestByGrain.set(key, row);
    }
  }
  const latest = [...latestByGrain.values()];

  const [
    { count: salesCount, error: salesError },
    { count: metricCount, error: metricCountError },
    { data: metrics, error: metricRowsError },
  ] = await Promise.all([
    supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("sku_daily_metrics")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("sku_daily_metrics")
      .select(
        "store_id,location_id,variant_id,metric_date,sales_velocity_30d",
      )
      .eq("organization_id", organizationId)
      .order("metric_date", { ascending: false })
      .limit(1000),
  ]);

  if (salesError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to inspect sales evidence for decision readiness.",
      publicMessage: "Unable to assess decision readiness right now.",
      httpStatus: 500,
      cause: salesError,
    });
  }

  if (metricCountError || metricRowsError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to inspect metric evidence for decision readiness.",
      publicMessage: "Unable to assess decision readiness right now.",
      httpStatus: 500,
      cause: metricCountError ?? metricRowsError,
    });
  }

  const metricRows = (metrics ?? []) as MetricGrainRow[];
  const grainAlignedKnownDemandCount = countGrainAlignedKnownDemand({
    inventoryGrains: latest,
    metrics: metricRows,
  });

  const presence: EvidencePresence = {
    inventorySnapshotCount: rows.length,
    distinctSkuCount: new Set(latest.map((row) => row.variant_id)).size,
    distinctStoreCount: new Set(latest.map((row) => row.store_id)).size,
    distinctLocationCount: new Set(latest.map((row) => row.location_id)).size,
    knownAvailableSkuCount: latest.filter(
      (row) => row.available_quantity !== null,
    ).length,
    hasSalesHistory: (salesCount ?? 0) > 0,
    hasSkuDailyMetrics: (metricCount ?? 0) > 0,
    grainAlignedKnownDemandCount,
  };

  return assessMerchantDecisionReadiness({
    organizationId,
    presence,
  });
}
