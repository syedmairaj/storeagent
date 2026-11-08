import "server-only";

import {
  classifyInventoryCoverStatus,
  coverEvidenceLabel,
} from "@/lib/inventory-intelligence/classify-cover";
import { prioritizeIntelligenceRows } from "@/lib/inventory-intelligence/prioritize";
import type {
  MerchantInventoryIntelligenceResult,
  MerchantInventoryIntelligenceRow,
} from "@/lib/inventory-intelligence/types";
import {
  countPendingMetricWorkForOrganization,
  hasPendingMetricWork,
} from "@/lib/metrics-activation/pending-work";
import { storeLocalAsOfDate } from "@/lib/metrics-activation/store-local-as-of";
import { AppError } from "@/lib/observability/app-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SnapshotRow = {
  id: string;
  observed_at: string;
  available_quantity: number | null;
  on_hand_quantity: number | null;
  store_id: string;
  location_id: string;
  variant_id: string;
};

type MetricRow = {
  store_id: string;
  location_id: string;
  variant_id: string;
  metric_date: string;
  sales_velocity_30d: number | null;
  sales_velocity_30d_reason_code: string | null;
  eligible_days_30d: number | null;
  coverage_ratio_30d: number | null;
  days_of_stock: number | null;
  days_of_stock_reason_code: string | null;
};

type NamedRow = {
  id: string;
  name?: string;
  sku?: string;
  title?: string | null;
  timezone?: string;
  product_id?: string;
};

function grainKey(storeId: string, locationId: string, variantId: string): string {
  return `${storeId}:${locationId}:${variantId}`;
}

/**
 * Member-scoped inventory intelligence rows joined to current M5 metrics.
 * Never recomputes velocity or days-of-stock.
 */
export async function loadMerchantInventoryIntelligence(
  organizationId: string,
): Promise<MerchantInventoryIntelligenceResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AppError({
      code: "AUTHENTICATION_REQUIRED",
      kind: "expected",
      message: "Authentication required for inventory intelligence.",
      publicMessage: "Sign in to view inventory intelligence.",
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
      message: "Unable to verify membership for inventory intelligence.",
      publicMessage: "Unable to load inventory intelligence right now.",
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
      "id,observed_at,available_quantity,on_hand_quantity,store_id,location_id,variant_id",
    )
    .eq("organization_id", organizationId)
    .order("observed_at", { ascending: false })
    .limit(500);

  if (snapshotError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load inventory snapshots for intelligence.",
      publicMessage: "Unable to load inventory intelligence right now.",
      httpStatus: 500,
      cause: snapshotError,
    });
  }

  const snapshotRows = (snapshots ?? []) as SnapshotRow[];
  // Latest observation per exact store/location/variant grain (org already filtered).
  const latestByGrain = new Map<string, SnapshotRow>();
  for (const row of snapshotRows) {
    const key = grainKey(row.store_id, row.location_id, row.variant_id);
    if (!latestByGrain.has(key)) {
      latestByGrain.set(key, row);
    }
  }
  const latest = [...latestByGrain.values()];

  if (latest.length === 0) {
    return {
      organizationId,
      hasPendingMetricWork: false,
      rows: [],
    };
  }

  const variantIds = [...new Set(latest.map((row) => row.variant_id))];
  const storeIds = [...new Set(latest.map((row) => row.store_id))];
  const locationIds = [...new Set(latest.map((row) => row.location_id))];

  const [
    { data: variants, error: variantError },
    { data: stores, error: storeError },
    { data: locations, error: locationError },
    { data: metrics, error: metricError },
  ] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id,sku,title,product_id")
      .eq("organization_id", organizationId)
      .in("id", variantIds),
    supabase
      .from("stores")
      .select("id,name,timezone")
      .eq("organization_id", organizationId)
      .in("id", storeIds),
    supabase
      .from("locations")
      .select("id,name")
      .eq("organization_id", organizationId)
      .in("id", locationIds),
    supabase
      .from("sku_daily_metrics")
      .select(
        "store_id,location_id,variant_id,metric_date,sales_velocity_30d,sales_velocity_30d_reason_code,eligible_days_30d,coverage_ratio_30d,days_of_stock,days_of_stock_reason_code",
      )
      .eq("organization_id", organizationId)
      .in("store_id", storeIds)
      .in("location_id", locationIds)
      .in("variant_id", variantIds)
      .order("metric_date", { ascending: false })
      .limit(2000),
  ]);

  if (variantError || storeError || locationError || metricError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to join inventory intelligence evidence.",
      publicMessage: "Unable to load inventory intelligence right now.",
      httpStatus: 500,
      cause: variantError ?? storeError ?? locationError ?? metricError,
    });
  }

  const productIds = [
    ...new Set(
      ((variants ?? []) as NamedRow[])
        .map((row) => row.product_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: products, error: productError } =
    productIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("products")
          .select("id,title")
          .eq("organization_id", organizationId)
          .in("id", productIds);

  if (productError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to join product titles for inventory intelligence.",
      publicMessage: "Unable to load inventory intelligence right now.",
      httpStatus: 500,
      cause: productError,
    });
  }

  const pending = await countPendingMetricWorkForOrganization(
    createSupabaseAdminClient() as unknown as Parameters<
      typeof countPendingMetricWorkForOrganization
    >[0],
    organizationId,
  );
  const pendingWork = hasPendingMetricWork(pending);

  const now = new Date();
  const asOfByStoreId = new Map<string, string>();
  const storeById = new Map<string, NamedRow>();
  for (const store of (stores ?? []) as NamedRow[]) {
    storeById.set(store.id, store);
    if (store.timezone) {
      try {
        asOfByStoreId.set(store.id, storeLocalAsOfDate(store.timezone, now));
      } catch {
        // Invalid IANA → fail closed (no as-of).
      }
    }
  }

  const variantById = new Map(
    ((variants ?? []) as NamedRow[]).map((row) => [row.id, row]),
  );
  const productTitleById = new Map(
    ((products ?? []) as NamedRow[]).map((row) => [row.id, row.title ?? null]),
  );
  const locationById = new Map(
    ((locations ?? []) as NamedRow[]).map((row) => [row.id, row]),
  );

  const currentMetricByGrain = new Map<string, MetricRow>();
  const latestMetricByGrain = new Map<string, MetricRow>();
  for (const metric of (metrics ?? []) as MetricRow[]) {
    const key = grainKey(metric.store_id, metric.location_id, metric.variant_id);
    const asOf = asOfByStoreId.get(metric.store_id);
    if (!latestMetricByGrain.has(key)) {
      latestMetricByGrain.set(key, metric);
    }
    if (asOf !== undefined && metric.metric_date === asOf) {
      if (!currentMetricByGrain.has(key)) {
        currentMetricByGrain.set(key, metric);
      }
    }
  }

  const rows: MerchantInventoryIntelligenceRow[] = latest.map((snapshot) => {
    const key = grainKey(
      snapshot.store_id,
      snapshot.location_id,
      snapshot.variant_id,
    );
    const asOf = asOfByStoreId.get(snapshot.store_id) ?? null;
    const current = currentMetricByGrain.get(key) ?? null;
    const latestMetric = latestMetricByGrain.get(key) ?? null;
    const metric = current ?? latestMetric;

    const coverStatus = classifyInventoryCoverStatus({
      availableQuantity: snapshot.available_quantity,
      hasPendingMetricWork: pendingWork,
      asOfMetricDate: asOf,
      metricDate: metric?.metric_date ?? null,
      salesVelocity30d: metric?.sales_velocity_30d ?? null,
      salesVelocity30dReasonCode: metric?.sales_velocity_30d_reason_code ?? null,
      eligibleDays30d: metric?.eligible_days_30d ?? null,
      daysOfStock: metric?.days_of_stock ?? null,
      daysOfStockReasonCode: metric?.days_of_stock_reason_code ?? null,
    });

    // For stale classification we may be showing a non-as-of metric — keep fields honest.
    const displayMetric =
      coverStatus === "stale" ? latestMetric : (current ?? metric);

    const variant = variantById.get(snapshot.variant_id);
    const store = storeById.get(snapshot.store_id);
    const location = locationById.get(snapshot.location_id);

    return {
      grainKey: key,
      snapshotId: snapshot.id,
      organizationId,
      storeId: snapshot.store_id,
      locationId: snapshot.location_id,
      variantId: snapshot.variant_id,
      sku: variant?.sku ?? "—",
      productTitle:
        variant?.title ??
        (variant?.product_id
          ? (productTitleById.get(variant.product_id) ?? null)
          : null),
      storeName: store?.name ?? "—",
      locationName: location?.name ?? "—",
      availableQuantity: snapshot.available_quantity,
      onHandQuantity: snapshot.on_hand_quantity,
      observedAt: snapshot.observed_at,
      asOfMetricDate: asOf,
      metricDate: displayMetric?.metric_date ?? null,
      salesVelocity30d: displayMetric?.sales_velocity_30d ?? null,
      salesVelocity30dReasonCode:
        displayMetric?.sales_velocity_30d_reason_code ?? null,
      eligibleDays30d: displayMetric?.eligible_days_30d ?? null,
      coverageRatio30d: displayMetric?.coverage_ratio_30d ?? null,
      daysOfStock: displayMetric?.days_of_stock ?? null,
      daysOfStockReasonCode: displayMetric?.days_of_stock_reason_code ?? null,
      coverStatus,
      evidenceLabel: coverEvidenceLabel({
        status: coverStatus,
        daysOfStock: displayMetric?.days_of_stock ?? null,
        salesVelocity30d: displayMetric?.sales_velocity_30d ?? null,
        eligibleDays30d: displayMetric?.eligible_days_30d ?? null,
        metricDate: displayMetric?.metric_date ?? null,
        asOfMetricDate: asOf,
      }),
    };
  });

  return {
    organizationId,
    hasPendingMetricWork: pendingWork,
    rows: prioritizeIntelligenceRows(rows),
  };
}
