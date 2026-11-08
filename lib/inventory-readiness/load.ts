import "server-only";

import { countGrainAlignedKnownDemand } from "@/lib/inventory-readiness/align";
import { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";
import type {
  EvidencePresence,
  MerchantDecisionReadiness,
} from "@/lib/inventory-readiness/types";
import {
  countPendingMetricWorkForOrganization,
  hasPendingMetricWork,
} from "@/lib/metrics-activation/pending-work";
import { storeLocalAsOfDate } from "@/lib/metrics-activation/store-local-as-of";
import { AppError } from "@/lib/observability/app-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

type StoreTimezoneRow = {
  id: string;
  timezone: string;
};

/**
 * Load tenant-scoped inventory evidence and assess decision readiness.
 * Member-scoped reads for merchant tables. Pending metric-queue freshness
 * uses service_role only after organization membership is proven.
 */
export async function loadMerchantDecisionReadiness(
  organizationId: string,
): Promise<MerchantDecisionReadiness> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AppError({
      code: "AUTHENTICATION_REQUIRED",
      kind: "expected",
      message: "Authentication required for decision readiness.",
      publicMessage: "Sign in to assess decision readiness.",
      httpStatus: 401,
      cause: userError,
    });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to verify organization membership for readiness.",
      publicMessage: "Unable to assess decision readiness right now.",
      httpStatus: 500,
      cause: membershipError,
    });
  }

  if (!membership) {
    throw new AppError({
      code: "TENANT_ACCESS_DENIED",
      kind: "expected",
      message: "Caller is not a member of the requested organization.",
      publicMessage: "You do not have access to this organization.",
      httpStatus: 403,
    });
  }

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
    { data: stores, error: storesError },
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
    supabase
      .from("stores")
      .select("id,timezone")
      .eq("organization_id", organizationId)
      .limit(100),
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

  if (storesError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load store timezones for decision readiness.",
      publicMessage: "Unable to assess decision readiness right now.",
      httpStatus: 500,
      cause: storesError,
    });
  }

  const asOfMetricDateByStoreId = new Map<string, string>();
  const now = new Date();
  for (const store of (stores ?? []) as StoreTimezoneRow[]) {
    if (!store.timezone) {
      continue;
    }
    try {
      asOfMetricDateByStoreId.set(
        store.id,
        storeLocalAsOfDate(store.timezone, now),
      );
    } catch {
      // Invalid IANA → fail closed for that store (no as-of → no alignment).
    }
  }

  // Membership already proven above — pending queue tables have no merchant RLS.
  const pending = await countPendingMetricWorkForOrganization(
    createSupabaseAdminClient() as unknown as Parameters<
      typeof countPendingMetricWorkForOrganization
    >[0],
    organizationId,
  );
  const pendingWork = hasPendingMetricWork(pending);

  const metricRows = (metrics ?? []) as MetricGrainRow[];
  const grainAlignedKnownDemandCount = pendingWork
    ? 0
    : countGrainAlignedKnownDemand({
        inventoryGrains: latest,
        metrics: metricRows,
        asOfMetricDateByStoreId,
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
    hasPendingMetricWork: pendingWork,
  };

  return assessMerchantDecisionReadiness({
    organizationId,
    presence,
  });
}
