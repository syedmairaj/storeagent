import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  evaluatePb1EvidenceQualifiedReorderFromSupplierFacts,
  loadPb1TrustedSupplierPlanningFacts,
  M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
  type Pb1TrustedSupplierLeadTimeLoaderDeps,
} from "@/lib/decision-engine/pb1-trusted-supplier-lead-time-loader";
import {
  M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
} from "@/lib/decision-engine/pb1-evidence-qualified-reorder-diagnostic";
import {
  loadPb1TrustedPersistedMetricPromoteDiagnostic,
  M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
  type Pb1TrustedPersistedMetricPromoteLoaderDeps,
  type Pb1TrustedPersistedSkuDailyMetricRow,
} from "@/lib/decision-engine/pb1-trusted-persisted-metric-promote-loader";
import type { Pb1SupplierProductLeadTimeRow } from "@/lib/decision-engine/pb1-trusted-supplier-planning-facts";
import {
  countPendingMetricWorkForOrganization,
  hasPendingMetricWork,
  type PendingMetricWorkClient,
} from "@/lib/metrics-activation/pending-work";
import { storeLocalAsOfDate } from "@/lib/metrics-activation/store-local-as-of";
import { calculateRecommendedOrderQuantity } from "@/lib/metrics/inventory-math";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";
import { recomputeSkuDailyMetric } from "@/lib/persistence/recompute-sku-daily-metric";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { holdOrdersLiveLock } from "../support/orders-live-lock";

/**
 * M7-PB1.g — genuine persisted-grain REORDER diagnostic verification (local).
 *
 * Proves PB1.c membership-scoped metric I/O + PB1.f supplier_products stated
 * lead-time loader + existing REORDER diagnostic against ONE current-day M5
 * row produced by canonical recompute/commit — not a fabricated metric INSERT.
 *
 * Production create/approve/UI/workers remain hard-false / disabled.
 * Supplier-fact TOCTOU (metric vs supplier_products read without shared
 * transaction fencing) is documented; no production fencing added in PB1.g.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "ab160000-0000-4000-8000-000000000001";
const ORG_B = "ab160000-0000-4000-8000-000000000011";
const STORE = "ab160000-0000-4000-8000-000000000002";
const STORE_B = "ab160000-0000-4000-8000-000000000012";
const LOCATION = "ab160000-0000-4000-8000-000000000003";
const LOCATION_2 = "ab160000-0000-4000-8000-000000000023";
const LOCATION_B = "ab160000-0000-4000-8000-000000000013";
const PRODUCT = "ab160000-0000-4000-8000-000000000004";
const PRODUCT_B = "ab160000-0000-4000-8000-000000000014";
const VARIANT = "ab160000-0000-4000-8000-000000000005";
const VARIANT_2 = "ab160000-0000-4000-8000-000000000025";
const VARIANT_B = "ab160000-0000-4000-8000-000000000015";
const USER_A = "ab160000-0000-4000-8000-000000000006";
const USER_B = "ab160000-0000-4000-8000-000000000016";
const USER_OUTSIDER = "ab160000-0000-4000-8000-000000000026";
const ORDER = "ab160000-0000-4000-8000-000000000007";
const ORDER_ITEM = "ab160000-0000-4000-8000-000000000008";
const INTEGRATION = "ab160000-0000-4000-8000-000000000009";
const SUPPLIER = "ab160000-0000-4000-8000-000000000031";
const SUPPLIER_2 = "ab160000-0000-4000-8000-000000000032";
const SUPPLIER_B = "ab160000-0000-4000-8000-000000000033";

// Regional IANA zone (UTC/Etc/UTC also accepted by PB1.e-aligned binding).
const TZ = "America/New_York";
const ORG_PLANNING_LEAD_TIME_DAYS = 7;
const ORG_SAFETY_STOCK_DAYS = 0;
const ORG_REVIEW_PERIOD_DAYS = 14;
const SUPPLIER_STATED_LEAD_TIME_DAYS = 5;
const AVAILABLE_UNITS = 3;
const SOLD_UNITS = 2;

const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;
const USERS = `(${quote(USER_A)}::uuid, ${quote(USER_B)}::uuid, ${quote(USER_OUTSIDER)}::uuid)`;

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertLocalApiUrl(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "http:" ||
    (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost")
  ) {
    throw new Error(
      `PB1.g refuses non-local Supabase API URL host "${parsed.hostname}".`,
    );
  }
}

async function ensureLocalSupabaseEnv(): Promise<void> {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    assertLocalApiUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    return;
  }

  const { stdout } = await execFileAsync(
    "/opt/homebrew/bin/supabase",
    ["status", "-o", "env"],
    { env: process.env, cwd: process.cwd() },
  );

  const values = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) {
      continue;
    }
    values.set(match[1], match[2].replace(/^"|"$/g, ""));
  }

  const apiUrl = values.get("API_URL");
  const serviceKey = values.get("SERVICE_ROLE_KEY");
  const anonKey = values.get("ANON_KEY") ?? values.get("PUBLISHABLE_KEY");
  if (!apiUrl || !serviceKey || !anonKey) {
    throw new Error("PB1.g could not resolve local Supabase env from status.");
  }
  assertLocalApiUrl(apiUrl);
  process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: "postgres",
      },
    },
  );
  return stdout.trim();
}

async function cleanupFixture(): Promise<void> {
  await psql(`
    alter table public.inventory_snapshots
      disable trigger inventory_snapshots_prevent_delete;

    delete from public.sku_daily_metric_recompute_requests
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metrics
    where organization_id in ${TENANTS};
    delete from public.store_incoming_evidence_attestations
    where organization_id in ${TENANTS};
    delete from public.organization_planning_inputs
    where organization_id in ${TENANTS};
    delete from public.purchase_order_items
    where organization_id in ${TENANTS};
    delete from public.purchase_orders
    where organization_id in ${TENANTS};
    delete from public.supplier_products
    where organization_id in ${TENANTS};
    delete from public.suppliers
    where organization_id in ${TENANTS};
    delete from public.provider_bindings
    where organization_id in ${TENANTS};
    delete from public.integrations
    where organization_id in ${TENANTS};
    delete from public.order_items
    where organization_id in ${TENANTS};
    delete from public.orders
    where organization_id in ${TENANTS};
    delete from public.inventory_snapshots
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
    delete from public.forecast_day_coverage_evidence
    where organization_id in ${TENANTS};
    delete from public.forecast_day_promotion_evidence
    where organization_id in ${TENANTS};
    delete from public.inventory_actions
    where organization_id in ${TENANTS};
    delete from public.action_events
    where organization_id in ${TENANTS};
    delete from public.data_quality_issues
    where organization_id in ${TENANTS};
    delete from public.product_variants
    where organization_id in ${TENANTS};
    delete from public.products
    where organization_id in ${TENANTS};
    delete from public.locations
    where organization_id in ${TENANTS};
    delete from public.stores
    where organization_id in ${TENANTS};
    delete from public.organization_members
    where organization_id in ${TENANTS};
    delete from public.organizations
    where id in ${TENANTS};
    delete from auth.users
    where id in ${USERS};

    alter table public.inventory_snapshots
      enable trigger inventory_snapshots_prevent_delete;
  `);
}

/**
 * After canonical recompute, clear org pending work the same way a successful
 * worker would leave the queue — without enabling workers/HTTP/cron.
 * Scope: isolated PB1.g tenants only.
 */
async function clearPendingWorkForOrg(organizationId: string): Promise<void> {
  await psql(`
    update public.sku_daily_metric_source_events
    set consumed_at = pg_catalog.now()
    where organization_id = ${quote(organizationId)}::uuid
      and consumed_at is null;

    update public.sku_daily_metric_recompute_requests
    set status = 'succeeded',
        applied_generation = dirty_generation,
        claimed_generation = greatest(claimed_generation, 0),
        lease_owner_id = null,
        lease_claim_token = null,
        lease_claimed_at = null,
        lease_expires_at = null,
        last_error_code = null,
        last_error_message = null,
        finished_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where organization_id = ${quote(organizationId)}::uuid
      and status in ('queued', 'claimed', 'running', 'retry_wait', 'failed');
  `);
}

async function metricProbe(args?: {
  locationId?: string;
  variantId?: string;
  metricDate?: string;
}): Promise<string> {
  const locationId = args?.locationId ?? LOCATION;
  const variantId = args?.variantId ?? VARIANT;
  const dateFilter = args?.metricDate
    ? `and metric_date = ${quote(args.metricDate)}::date`
    : `and metric_date = ${quote(metricDate)}::date`;

  return psql(`
    select coalesce(available_quantity::text, 'null')
      || ':' || coalesce(eligible_incoming_quantity::text, 'null')
      || ':' || coalesce(eligible_incoming_reason_code::text, 'null')
      || ':' || coalesce(sales_velocity_30d::text, 'null')
      || ':' || coalesce(reorder_point::text, 'null')
      || ':' || coalesce(target_stock::text, 'null')
      || ':' || coalesce(safety_stock::text, 'null')
      || ':' || coalesce(demand_trend::text, 'null')
      || ':' || algorithm_version
      || ':' || updated_at::text
    from public.sku_daily_metrics
    where organization_id = ${quote(ORG)}::uuid
      and store_id = ${quote(STORE)}::uuid
      and location_id = ${quote(locationId)}::uuid
      and variant_id = ${quote(variantId)}::uuid
      ${dateFilter}
    limit 1
  `);
}

async function pendingCounts(organizationId: string): Promise<{
  events: number;
  requests: number;
}> {
  const raw = await psql(`
    select
      (select count(*)::text
         from public.sku_daily_metric_source_events
        where organization_id = ${quote(organizationId)}::uuid
          and consumed_at is null)
      || ':' ||
      (select count(*)::text
         from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(organizationId)}::uuid
          and status in ('queued','claimed','running','retry_wait','failed'))
  `);
  const [events, requests] = raw.split(":").map(Number);
  return { events, requests };
}

function mapDbRow(
  data: Record<string, unknown>,
): Pb1TrustedPersistedSkuDailyMetricRow {
  return {
    organizationId: String(data.organization_id),
    storeId: String(data.store_id),
    locationId: String(data.location_id),
    variantId: String(data.variant_id),
    metricDate: String(data.metric_date),
    algorithmVersion: String(data.algorithm_version),
    updatedAt: String(data.updated_at),
    availableQuantity:
      data.available_quantity === null || data.available_quantity === undefined
        ? null
        : Number(data.available_quantity),
    eligibleIncomingQuantity:
      data.eligible_incoming_quantity === null ||
      data.eligible_incoming_quantity === undefined
        ? null
        : Number(data.eligible_incoming_quantity),
    eligibleIncomingReasonCode:
      data.eligible_incoming_reason_code === null ||
      data.eligible_incoming_reason_code === undefined
        ? null
        : String(data.eligible_incoming_reason_code),
    salesVelocity30d:
      data.sales_velocity_30d === null || data.sales_velocity_30d === undefined
        ? null
        : Number(data.sales_velocity_30d),
    daysOfStock:
      data.days_of_stock === null || data.days_of_stock === undefined
        ? null
        : Number(data.days_of_stock),
    safetyStock:
      data.safety_stock === null || data.safety_stock === undefined
        ? null
        : Number(data.safety_stock),
    reorderPoint:
      data.reorder_point === null || data.reorder_point === undefined
        ? null
        : Number(data.reorder_point),
    targetStock:
      data.target_stock === null || data.target_stock === undefined
        ? null
        : Number(data.target_stock),
    inventoryAgeDays: null,
    demandTrend: data.demand_trend as Pb1TrustedPersistedSkuDailyMetricRow["demandTrend"],
  };
}

function mapSupplierProductRow(
  data: Record<string, unknown>,
): Pb1SupplierProductLeadTimeRow {
  return {
    id: String(data.id ?? ""),
    organizationId: String(data.organization_id ?? ""),
    supplierId: String(data.supplier_id ?? ""),
    variantId: String(data.variant_id ?? ""),
    leadTimeDays:
      data.lead_time_days === null || data.lead_time_days === undefined
        ? null
        : Number(data.lead_time_days),
    preferred: data.preferred === true,
    updatedAt: String(data.updated_at ?? ""),
  };
}

/**
 * Real I/O deps mirroring PB1.c default membership + grain SELECT + pending.
 * Avoids Next.js cookie server client inside vitest.
 */
function metricLiveDeps(args: {
  userId: string | null;
  now?: () => Date;
}): Pb1TrustedPersistedMetricPromoteLoaderDeps {
  const admin = createSupabaseAdminClient();

  return {
    getAuthenticatedUserId: async () => args.userId,

    assertOrganizationMembership: async ({ organizationId, userId }) => {
      const { data, error } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw new Error(`membership check failed: ${error.message}`);
      }
      return data !== null;
    },

    loadStoreTimeZone: async ({ organizationId, storeId }) => {
      const { data, error } = await admin
        .from("stores")
        .select("id,timezone")
        .eq("organization_id", organizationId)
        .eq("id", storeId)
        .maybeSingle();
      if (error) {
        throw new Error(`store load failed: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      return typeof data.timezone === "string" ? data.timezone : "";
    },

    loadSkuDailyMetricRow: async ({
      organizationId,
      storeId,
      locationId,
      variantId,
      metricDate: rowDate,
    }) => {
      const { data, error } = await admin
        .from("sku_daily_metrics")
        .select(
          [
            "organization_id",
            "store_id",
            "location_id",
            "variant_id",
            "metric_date",
            "algorithm_version",
            "updated_at",
            "available_quantity",
            "eligible_incoming_quantity",
            "eligible_incoming_reason_code",
            "sales_velocity_30d",
            "days_of_stock",
            "safety_stock",
            "reorder_point",
            "target_stock",
            "inventory_age_days",
            "demand_trend",
          ].join(","),
        )
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .eq("location_id", locationId)
        .eq("variant_id", variantId)
        .eq("metric_date", rowDate)
        .eq("algorithm_version", SKU_DAILY_METRIC_ALGORITHM_VERSION)
        .maybeSingle();

      if (error) {
        throw new Error(`metric load failed: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      return mapDbRow(data as unknown as Record<string, unknown>);
    },

    countPendingMetricWork: async (organizationId) => {
      return countPendingMetricWorkForOrganization(
        admin as unknown as PendingMetricWorkClient,
        organizationId,
      );
    },

    now: args.now,
  };
}

function supplierLiveDeps(args: {
  userId: string | null;
}): Pb1TrustedSupplierLeadTimeLoaderDeps {
  const admin = createSupabaseAdminClient();

  return {
    getAuthenticatedUserId: async () => args.userId,

    assertOrganizationMembership: async ({ organizationId, userId }) => {
      const { data, error } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        throw new Error(`membership check failed: ${error.message}`);
      }
      return data !== null;
    },

    loadSupplierProductRows: async ({
      organizationId,
      variantId,
      supplierId,
    }) => {
      let query = admin
        .from("supplier_products")
        .select(
          [
            "id",
            "organization_id",
            "supplier_id",
            "variant_id",
            "lead_time_days",
            "preferred",
            "updated_at",
          ].join(","),
        )
        .eq("organization_id", organizationId)
        .eq("variant_id", variantId);

      const trimmedSupplierId =
        typeof supplierId === "string" ? supplierId.trim() : "";
      if (trimmedSupplierId.length > 0) {
        query = query.eq("supplier_id", trimmedSupplierId);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`supplier_products load failed: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        mapSupplierProductRow(row as unknown as Record<string, unknown>),
      );
    },
  };
}

type Pb1cMetricLoadSuccess = {
  ok: true;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  storeTimeZone: string;
  metricDate: string;
  row: Pb1TrustedPersistedSkuDailyMetricRow;
  hasPendingMetricWork: boolean;
  asOfInstant: Date;
};

type Pb1cMetricLoadFailure = {
  ok: false;
  code: string;
  detail: string;
};

/**
 * Real PB1.c I/O gates (membership → store TZ → current-day row → pending)
 * without forcing the PROMOTE diagnostic. PB1.c has no load-only export;
 * this mirrors loadPb1TrustedPersistedMetricPromoteDiagnostic's I/O path.
 */
async function loadMetricViaPb1cGates(args: {
  userId: string | null;
  organizationId?: string;
  storeId?: string;
  locationId?: string;
  variantId?: string;
  now?: () => Date;
}): Promise<Pb1cMetricLoadSuccess | Pb1cMetricLoadFailure> {
  const organizationId = args.organizationId ?? ORG;
  const storeId = args.storeId ?? STORE;
  const locationId = args.locationId ?? LOCATION;
  const variantId = args.variantId ?? VARIANT;
  const deps = metricLiveDeps({ userId: args.userId, now: args.now });

  const userId = await deps.getAuthenticatedUserId();
  if (!userId) {
    return {
      ok: false,
      code: "AUTHENTICATION_REQUIRED",
      detail: "Authentication required for trusted persisted-metric diagnostic.",
    };
  }

  const isMember = await deps.assertOrganizationMembership({
    organizationId,
    userId,
  });
  if (!isMember) {
    return {
      ok: false,
      code: "TENANT_ACCESS_DENIED",
      detail: "Caller is not a member of the requested organization.",
    };
  }

  const storeTimeZoneRaw = await deps.loadStoreTimeZone({
    organizationId,
    storeId,
  });
  if (storeTimeZoneRaw === null) {
    return {
      ok: false,
      code: "STORE_NOT_FOUND",
      detail: "Store was not found in the caller's organization scope.",
    };
  }
  const storeTimeZone = storeTimeZoneRaw.trim();
  if (storeTimeZone.length === 0) {
    return {
      ok: false,
      code: "STORE_TIMEZONE_INVALID",
      detail: "stores.timezone is required for PB1.c freshness checks.",
    };
  }

  const asOfInstant = deps.now?.() ?? new Date();
  let currentMetricDate: string;
  try {
    currentMetricDate = storeLocalAsOfDate(storeTimeZone, asOfInstant);
  } catch {
    return {
      ok: false,
      code: "STORE_TIMEZONE_INVALID",
      detail: "stores.timezone must be a recognized IANA timezone.",
    };
  }

  const row = await deps.loadSkuDailyMetricRow({
    organizationId,
    storeId,
    locationId,
    variantId,
    metricDate: currentMetricDate,
  });
  if (row === null) {
    return {
      ok: false,
      code: "METRIC_ROW_NOT_FOUND",
      detail: "No current-day sku_daily_metrics row found for the requested grain.",
    };
  }

  let pending;
  try {
    pending = await deps.countPendingMetricWork(organizationId);
  } catch (error) {
    return {
      ok: false,
      code: "PENDING_WORK_INSPECTION_FAILED",
      detail:
        error instanceof Error
          ? error.message
          : "Unable to inspect pending metric work.",
    };
  }

  if (hasPendingMetricWork(pending)) {
    return {
      ok: false,
      code: "PENDING_RECOMPUTE",
      detail: "Pending metric recompute/source work rejects diagnostic evidence.",
    };
  }

  return {
    ok: true,
    organizationId,
    storeId,
    locationId,
    variantId,
    storeTimeZone,
    metricDate: currentMetricDate,
    row,
    hasPendingMetricWork: false,
    asOfInstant,
  };
}

async function loadSupplierFacts(args: {
  userId: string | null;
  organizationId?: string;
  variantId?: string;
  supplierId?: string | null;
}) {
  return loadPb1TrustedSupplierPlanningFacts(
    {
      loaderVersion: M7_PB1_TRUSTED_SUPPLIER_LEAD_TIME_LOADER_VERSION_V1,
      organizationId: args.organizationId ?? ORG,
      variantId: args.variantId ?? VARIANT,
      supplierId: args.supplierId,
    },
    supplierLiveDeps({ userId: args.userId }),
  );
}

async function evaluateReorderFromLiveLoaders(args: {
  userId: string | null;
  organizationId?: string;
  storeId?: string;
  locationId?: string;
  variantId?: string;
  supplierId?: string | null;
  now?: () => Date;
}) {
  const metric = await loadMetricViaPb1cGates(args);
  if (!metric.ok) {
    return { ok: false as const, stage: "metric" as const, result: metric };
  }

  const supplier = await loadSupplierFacts({
    userId: args.userId,
    organizationId: args.organizationId ?? ORG,
    variantId: args.variantId ?? VARIANT,
    supplierId: args.supplierId,
  });
  if (!supplier.ok) {
    return { ok: false as const, stage: "supplier" as const, result: supplier };
  }

  const diagnostic = evaluatePb1EvidenceQualifiedReorderFromSupplierFacts({
    supplierFacts: supplier,
    diagnostic: {
      trustedScope: {
        organizationId: metric.organizationId,
        storeId: metric.storeId,
        storeTimeZone: metric.storeTimeZone,
      },
      grain: {
        organizationId: metric.organizationId,
        storeId: metric.storeId,
        locationId: metric.locationId,
        variantId: metric.variantId,
      },
      storeLocalAsOfDate: metric.metricDate,
      hasPendingMetricWork: metric.hasPendingMetricWork,
      metricDate: metric.row.metricDate,
      metricUpdatedAt: metric.row.updatedAt,
      pinnedTimeZone: metric.storeTimeZone,
      availableQuantity: metric.row.availableQuantity,
      salesVelocity30d: metric.row.salesVelocity30d,
      daysOfStock: metric.row.daysOfStock,
      safetyStock: metric.row.safetyStock,
      reorderPoint: metric.row.reorderPoint,
      targetStock: metric.row.targetStock,
      inventoryAgeDays: null,
      demandTrend: metric.row.demandTrend,
      incoming: {
        kind: "persisted_eligible_incoming",
        eligibleIncomingQuantity: metric.row.eligibleIncomingQuantity,
        eligibleIncomingReasonCode: metric.row.eligibleIncomingReasonCode,
      },
      asOfInstant: metric.asOfInstant,
    },
  });

  return {
    ok: diagnostic.ok,
    stage: "diagnostic" as const,
    metric,
    supplier,
    diagnostic,
  };
}

/**
 * Persist stated supplier/SKU lead-time terms via the canonical CSV reconcile
 * RPC (service_role SECURITY DEFINER). Does not invent org-default LT into
 * TrustedSupplierPlanningFacts.
 */
async function reconcileSupplierProduct(args: {
  supplierId: string;
  variantId: string;
  leadTimeDays: number | null;
  preferred: boolean;
  supplierSku: string;
}): Promise<string> {
  const lead =
    args.leadTimeDays === null ? "null" : String(args.leadTimeDays);
  return psql(`
    select canonical_entity_id::text || ':' || disposition
    from public.csv_reconcile_supplier_product(
      ${quote(ORG)}::uuid,
      ${quote(INTEGRATION)}::uuid,
      ${quote(args.supplierId)}::uuid,
      ${quote(args.variantId)}::uuid,
      ${quote(args.supplierSku)},
      null::numeric,
      'USD',
      ${lead}::integer,
      null::integer,
      null::integer,
      ${args.preferred ? "true" : "false"}
    );
  `);
}

let metricDate = "";
let releaseLock: (() => Promise<void>) | null = null;
let expectedVelocity = 0;
let expectedRop = 0;
let expectedTarget = 0;
let expectedRoq = 0;

describeLive("M7-PB1.g persisted-grain REORDER diagnostic live", () => {
  beforeAll(async () => {
    await ensureLocalSupabaseEnv();
    releaseLock = await holdOrdersLiveLock();
    metricDate = await psql(
      `select (pg_catalog.timezone(${quote(TZ)}, pg_catalog.now()))::date::text`,
    );

    await cleanupFixture();

    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at
      ) values
        (
          ${quote(USER_A)}::uuid,
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated',
          'pb1g-a@example.test', '',
          pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
        ),
        (
          ${quote(USER_B)}::uuid,
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated',
          'pb1g-b@example.test', '',
          pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
        ),
        (
          ${quote(USER_OUTSIDER)}::uuid,
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated',
          'pb1g-out@example.test', '',
          pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
        );

      insert into public.organizations (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'PB1.g Live A', 'USD', ${quote(TZ)}),
        (${quote(ORG_B)}::uuid, 'PB1.g Live B', 'USD', ${quote(TZ)});

      insert into public.organization_members (organization_id, user_id, role)
      values
        (${quote(ORG)}::uuid, ${quote(USER_A)}::uuid, 'owner'),
        (${quote(ORG_B)}::uuid, ${quote(USER_B)}::uuid, 'owner');

      insert into public.stores (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'PB1.g Store A', 'active', 'USD', ${quote(TZ)}),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'PB1.g Store B', 'active', 'USD', ${quote(TZ)});

      insert into public.locations (id, organization_id, store_id, name, status)
      values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'LA', 'active'),
        (${quote(LOCATION_2)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'LA2', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'LB', 'active');

      insert into public.products (id, organization_id, store_id, title, status)
      values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'PA', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'PB', 'active');

      insert into public.product_variants (
        id, organization_id, store_id, product_id, sku, status
      ) values
        (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1G-A', 'active'),
        (${quote(VARIANT_2)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1G-A2', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'PB1G-B', 'active');

      -- Org planning binds M5 ROP/target (dual-source LT vs supplier_products).
      insert into public.organization_planning_inputs (
        organization_id, lead_time_days, safety_stock_days, review_period_days
      ) values (
        ${quote(ORG)}::uuid,
        ${ORG_PLANNING_LEAD_TIME_DAYS},
        ${ORG_SAFETY_STOCK_DAYS},
        ${ORG_REVIEW_PERIOD_DAYS}
      );

      -- Current-day inventory observation (available below expected ROP).
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid, ${quote(VARIANT)}::uuid,
        pg_catalog.timezone(
          ${quote(TZ)},
          (${quote(metricDate)}::date + time '12:00:00')
        ),
        ${AVAILABLE_UNITS}, 'csv'
      );

      -- Actual demand history on the metric day (eligible day via inventory + sale).
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        ${quote(ORDER)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'completed',
        pg_catalog.timezone(
          ${quote(TZ)},
          (${quote(metricDate)}::date + time '10:00:00')
        ),
        'USD', 'csv'
      );

      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        ${quote(ORDER_ITEM)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        ${quote(ORDER)}::uuid, ${quote(VARIANT)}::uuid, ${quote(LOCATION)}::uuid,
        ${SOLD_UNITS}
      );

      -- Merchant attestation: empty PO set → known-zero incoming (null≠0).
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
      );

      -- Durable suppliers + active CSV integration for reconcile write path.
      insert into public.suppliers (id, organization_id, name, currency)
      values
        (${quote(SUPPLIER)}::uuid, ${quote(ORG)}::uuid, 'PB1.g Preferred', 'USD'),
        (${quote(SUPPLIER_2)}::uuid, ${quote(ORG)}::uuid, 'PB1.g Secondary', 'USD'),
        (${quote(SUPPLIER_B)}::uuid, ${quote(ORG_B)}::uuid, 'PB1.g Foreign', 'USD');

      insert into public.integrations (
        id, organization_id, store_id, provider, status
      ) values (
        ${quote(INTEGRATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'csv', 'active'
      );
    `);

    // Stated supplier/SKU terms via csv_reconcile_supplier_product.
    const reconciled = await reconcileSupplierProduct({
      supplierId: SUPPLIER,
      variantId: VARIANT,
      leadTimeDays: SUPPLIER_STATED_LEAD_TIME_DAYS,
      preferred: true,
      supplierSku: "PB1G-PREFERRED",
    });
    expect(reconciled.split(":")[1]).toMatch(
      /created|updated|unchanged|imported/,
    );

    const admin = createSupabaseAdminClient();
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );

    await clearPendingWorkForOrg(ORG);

    const pending = await pendingCounts(ORG);
    expect(pending.events).toBe(0);
    expect(pending.requests).toBe(0);

    const probe = await metricProbe();
    const [
      available,
      incomingQty,
      incomingReason,
      velocity,
      rop,
      target,
    ] = probe.split(":");

    expect(available).toBe(String(AVAILABLE_UNITS));
    expect(incomingQty).toBe("0");
    expect(incomingReason).toBe("null");
    expect(Number(velocity)).toBeGreaterThan(0);
    expect(Number(rop)).toBeGreaterThan(Number(available));
    expect(Number(target)).toBeGreaterThan(Number(rop));

    expectedVelocity = Number(velocity);
    expectedRop = Number(rop);
    expectedTarget = Number(target);
    expectedRoq = calculateRecommendedOrderQuantity({
      targetStockUnits: expectedTarget,
      availableQuantity: AVAILABLE_UNITS,
      validIncomingQuantity: 0,
      incomingStateKnown: true,
    }).value!;
    expect(expectedRoq).toBeGreaterThan(0);

    // Sanity: one eligible day with SOLD_UNITS → velocity = SOLD_UNITS.
    expect(expectedVelocity).toBe(SOLD_UNITS);
    expect(expectedRop).toBe(
      Math.ceil(
        expectedVelocity * ORG_PLANNING_LEAD_TIME_DAYS +
          expectedVelocity * ORG_SAFETY_STOCK_DAYS,
      ),
    );
    expect(expectedTarget).toBe(
      Math.ceil(
        expectedVelocity *
          (ORG_PLANNING_LEAD_TIME_DAYS + ORG_REVIEW_PERIOD_DAYS) +
          expectedVelocity * ORG_SAFETY_STOCK_DAYS,
      ),
    );
  }, 180_000);

  afterAll(async () => {
    try {
      await cleanupFixture();
      const leftover = await psql(`
        select count(*)::text from public.organizations where id in ${TENANTS}
      `);
      expect(leftover).toBe("0");
    } finally {
      if (releaseLock) {
        await releaseLock();
      }
    }
  }, 120_000);

  it("positive: PB1.c metric + PB1.f supplier → canonical REORDER with hard-false gates", async () => {
    // Cross-check: PB1.c alone (no supplier LT) must not claim merchant REORDER
    // as a production path — lead time stays null → not REORDER.
    const promoteOnly = await loadPb1TrustedPersistedMetricPromoteDiagnostic(
      {
        loaderVersion: M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      metricLiveDeps({ userId: USER_A }),
    );
    expect(promoteOnly.ok).toBe(true);
    if (promoteOnly.ok) {
      expect(promoteOnly.decisionInput.leadTimeDays).toBeNull();
      expect(promoteOnly.diagnosticDecision.actionType).not.toBe("REORDER");
      expect(promoteOnly.provenance.productionDecisionCreationEligible).toBe(
        false,
      );
      expect(promoteOnly.provenance.productionApprovalEligible).toBe(false);
      expect(promoteOnly.provenance.claimsMerchantFacing).toBe(false);
    }

    const composed = await evaluateReorderFromLiveLoaders({ userId: USER_A });
    if (!composed.ok || composed.stage !== "diagnostic") {
      const detail =
        "result" in composed
          ? JSON.stringify(composed.result)
          : "unknown";
      expect.fail(`composed load failed at ${composed.stage}: ${detail}`);
    }

    const { diagnostic, supplier, metric } = composed;
    expect(diagnostic.ok).toBe(true);
    if (!diagnostic.ok) {
      return;
    }

    expect(metric.row.availableQuantity).toBe(AVAILABLE_UNITS);
    expect(metric.row.eligibleIncomingQuantity).toBe(0);
    expect(metric.row.eligibleIncomingReasonCode).toBeNull();
    expect(metric.row.salesVelocity30d).toBe(expectedVelocity);
    expect(metric.row.reorderPoint).toBe(expectedRop);
    expect(metric.row.targetStock).toBe(expectedTarget);

    expect(supplier.ok).toBe(true);
    if (!supplier.ok) {
      return;
    }
    expect(supplier.supplierPlanning.leadTimeDays).toBe(
      SUPPLIER_STATED_LEAD_TIME_DAYS,
    );
    expect(supplier.notVerifiedDeliveryPerformance).toBe(true);
    expect(supplier.provenanceKind).toBe("stated_supplier_product_terms");
    // Dual-source: org planning LT ≠ supplier_products stated LT.
    expect(SUPPLIER_STATED_LEAD_TIME_DAYS).not.toBe(ORG_PLANNING_LEAD_TIME_DAYS);

    expect(diagnostic.diagnosticVersion).toBe(
      M7_PB1_EVIDENCE_QUALIFIED_REORDER_DIAGNOSTIC_VERSION_V1,
    );
    expect(diagnostic.diagnosticDecision.actionType).toBe("REORDER");
    expect(diagnostic.decisionInput.leadTimeDays).toBe(
      SUPPLIER_STATED_LEAD_TIME_DAYS,
    );
    expect(diagnostic.decisionInput.validIncomingQuantity).toBe(0);
    expect(diagnostic.decisionInput.incomingStateKnown).toBe(true);
    expect(diagnostic.decisionInput.recommendedOrderQuantity).toBe(expectedRoq);
    expect(diagnostic.diagnosticDecision.recommendedQuantity).toBe(expectedRoq);
    expect(diagnostic.diagnosticDecision.reasonCodes).toEqual(
      expect.arrayContaining([
        "REORDER_QUANTITY_POSITIVE",
        "BELOW_REORDER_POINT",
      ]),
    );
    expect(diagnostic.mappingNotes).toContain(
      "LEAD_TIME_FROM_TRUSTED_SUPPLIER_FACTS",
    );
    expect(diagnostic.mappingNotes).toContain("ROQ_DERIVED");

    expect(diagnostic.leadTimeProvenance).toMatchObject({
      kind: "stated_supplier_product_terms",
      notVerifiedDeliveryPerformance: true,
      m5ThresholdLeadTimeSource: "organization_planning_inputs_may_differ",
      dualSourceLeadTimeNote:
        "M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS",
    });
    expect(diagnostic.reorderDiagnosticNotes).toEqual(
      expect.arrayContaining([
        "STATED_SUPPLIER_PRODUCT_LEAD_TIME_NOT_VERIFIED_PERFORMANCE",
        "M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS",
        "NOT_production_decision_create",
        "NOT_m7_3_approvable",
      ]),
    );

    expect(diagnostic.provenance.productionDecisionCreationEligible).toBe(false);
    expect(diagnostic.provenance.productionApprovalEligible).toBe(false);
    expect(diagnostic.provenance.claimsMerchantFacing).toBe(false);
    expect(diagnostic.provenance.claimsM7ProductionEligibility).toBe(false);
    expect(diagnostic.provenance.algorithmApproved).toBe(false);
    expect(diagnostic.provenance.engineBoundBriefEligible).toBe(false);
    expect(diagnostic.provenance.forecastEligibility).toBe("ineligible");
  });

  it("negative: foreign member/org, wrong variant/supplier, auth denied", async () => {
    const foreignMember = await evaluateReorderFromLiveLoaders({
      userId: USER_B,
    });
    expect(foreignMember.ok).toBe(false);
    if (!foreignMember.ok && foreignMember.stage === "metric") {
      expect(foreignMember.result.code).toBe("TENANT_ACCESS_DENIED");
    }

    const outsider = await evaluateReorderFromLiveLoaders({
      userId: USER_OUTSIDER,
    });
    expect(outsider.ok).toBe(false);
    if (!outsider.ok && outsider.stage === "metric") {
      expect(outsider.result.code).toBe("TENANT_ACCESS_DENIED");
    }

    const unauth = await evaluateReorderFromLiveLoaders({ userId: null });
    expect(unauth.ok).toBe(false);
    if (!unauth.ok && unauth.stage === "metric") {
      expect(unauth.result.code).toBe("AUTHENTICATION_REQUIRED");
    }

    const wrongVariant = await evaluateReorderFromLiveLoaders({
      userId: USER_A,
      variantId: VARIANT_2,
    });
    expect(wrongVariant.ok).toBe(false);
    if (!wrongVariant.ok && wrongVariant.stage === "metric") {
      expect(wrongVariant.result.code).toBe("METRIC_ROW_NOT_FOUND");
    } else if (!wrongVariant.ok && wrongVariant.stage === "supplier") {
      expect(wrongVariant.result.code).toBe("SUPPLIER_MAPPING_NOT_FOUND");
    }

    const wrongSupplier = await loadSupplierFacts({
      userId: USER_A,
      supplierId: SUPPLIER_2,
    });
    expect(wrongSupplier.ok).toBe(false);
    if (!wrongSupplier.ok) {
      expect(wrongSupplier.code).toBe("SUPPLIER_MAPPING_NOT_FOUND");
      expect(wrongSupplier.provenance.productionDecisionCreationEligible).toBe(
        false,
      );
    }

    const foreignOrgSupplier = await loadSupplierFacts({
      userId: USER_B,
      organizationId: ORG,
      variantId: VARIANT,
    });
    expect(foreignOrgSupplier.ok).toBe(false);
    if (!foreignOrgSupplier.ok) {
      expect(foreignOrgSupplier.code).toBe("TENANT_ACCESS_DENIED");
    }
  });

  it("negative: zero/multi-preferred, null LT, deleted mapping", async () => {
    // Zero preferred with known LT → ABSENT when preferred omitted.
    await psql(`
      update public.supplier_products
      set preferred = false, updated_at = pg_catalog.now()
      where organization_id = ${quote(ORG)}::uuid
        and supplier_id = ${quote(SUPPLIER)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
    `);
    const zeroPreferred = await loadSupplierFacts({ userId: USER_A });
    expect(zeroPreferred.ok).toBe(false);
    if (!zeroPreferred.ok) {
      expect(zeroPreferred.code).toBe("SUPPLIER_FACTS_ABSENT");
    }

    // Multi-preferred with LT → AMBIGUOUS without supplierId.
    await reconcileSupplierProduct({
      supplierId: SUPPLIER,
      variantId: VARIANT,
      leadTimeDays: SUPPLIER_STATED_LEAD_TIME_DAYS,
      preferred: true,
      supplierSku: "PB1G-PREFERRED",
    });
    await reconcileSupplierProduct({
      supplierId: SUPPLIER_2,
      variantId: VARIANT,
      leadTimeDays: 9,
      preferred: true,
      supplierSku: "PB1G-SECOND",
    });
    const multi = await loadSupplierFacts({ userId: USER_A });
    expect(multi.ok).toBe(false);
    if (!multi.ok) {
      expect(multi.code).toBe("SUPPLIER_FACTS_AMBIGUOUS");
    }

    // Explicit supplierId still resolves amid multi-preferred.
    const explicit = await loadSupplierFacts({
      userId: USER_A,
      supplierId: SUPPLIER,
    });
    expect(explicit.ok).toBe(true);

    // Null LT on preferred → ABSENT.
    await psql(`
      delete from public.supplier_products
      where organization_id = ${quote(ORG)}::uuid
        and supplier_id = ${quote(SUPPLIER_2)}::uuid;
      update public.supplier_products
      set lead_time_days = null, preferred = true, updated_at = pg_catalog.now()
      where organization_id = ${quote(ORG)}::uuid
        and supplier_id = ${quote(SUPPLIER)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
    `);
    const nullLt = await loadSupplierFacts({ userId: USER_A });
    expect(nullLt.ok).toBe(false);
    if (!nullLt.ok) {
      expect(nullLt.code).toBe("SUPPLIER_FACTS_ABSENT");
    }

    // Delete mapping → ABSENT / NOT_FOUND.
    await psql(`
      delete from public.supplier_products
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
    `);
    const deleted = await loadSupplierFacts({ userId: USER_A });
    expect(deleted.ok).toBe(false);
    if (!deleted.ok) {
      expect(deleted.code).toBe("SUPPLIER_FACTS_ABSENT");
    }

    // Restore preferred stated terms for subsequent tests.
    await reconcileSupplierProduct({
      supplierId: SUPPLIER,
      variantId: VARIANT,
      leadTimeDays: SUPPLIER_STATED_LEAD_TIME_DAYS,
      preferred: true,
      supplierSku: "PB1G-PREFERRED",
    });
    const restored = await loadSupplierFacts({ userId: USER_A });
    expect(restored.ok).toBe(true);
  });

  it("supplier UPDATE/DELETE re-read (no cache) + TOCTOU documentation", async () => {
    const before = await loadSupplierFacts({ userId: USER_A });
    expect(before.ok).toBe(true);
    if (!before.ok) {
      return;
    }
    expect(before.supplierPlanning.leadTimeDays).toBe(
      SUPPLIER_STATED_LEAD_TIME_DAYS,
    );
    const beforeUpdatedAt = before.supplierProductUpdatedAt;

    await reconcileSupplierProduct({
      supplierId: SUPPLIER,
      variantId: VARIANT,
      leadTimeDays: 11,
      preferred: true,
      supplierSku: "PB1G-PREFERRED",
    });

    const afterUpdate = await loadSupplierFacts({ userId: USER_A });
    expect(afterUpdate.ok).toBe(true);
    if (!afterUpdate.ok) {
      return;
    }
    expect(afterUpdate.supplierPlanning.leadTimeDays).toBe(11);
    expect(afterUpdate.supplierProductUpdatedAt).not.toBe(beforeUpdatedAt);

    // Documented PB1.g limitation: metric row and supplier_products are read
    // in separate statements without a shared transactional fence. A concurrent
    // supplier_products mutation between those reads can produce a TOCTOU mix
    // of metric thresholds (org-planning LT) and a newer/older stated LT.
    // PB1.g does not add production transaction fencing.
    const metricThen = await loadMetricViaPb1cGates({ userId: USER_A });
    expect(metricThen.ok).toBe(true);
    await reconcileSupplierProduct({
      supplierId: SUPPLIER,
      variantId: VARIANT,
      leadTimeDays: SUPPLIER_STATED_LEAD_TIME_DAYS,
      preferred: true,
      supplierSku: "PB1G-PREFERRED",
    });
    const supplierThen = await loadSupplierFacts({ userId: USER_A });
    expect(supplierThen.ok).toBe(true);
    // Reads succeed independently — composition is fail-closed per call, not
    // atomically consistent across the two sources.
    expect(metricThen.ok && supplierThen.ok).toBe(true);
  });

  it("negative: stale/non-current metric, pending/dirty, unknown incoming, missing demand/ROP/target/ROQ", async () => {
    const admin = createSupabaseAdminClient();

    const staleAsOf = await evaluateReorderFromLiveLoaders({
      userId: USER_A,
      now: () =>
        new Date(
          new Date(`${metricDate}T12:00:00.000Z`).getTime() + 86_400_000,
        ),
    });
    expect(staleAsOf.ok).toBe(false);
    if (!staleAsOf.ok && staleAsOf.stage === "metric") {
      expect(staleAsOf.result.code).toBe("METRIC_ROW_NOT_FOUND");
    }

    await psql(`
      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id,
        algorithm_version, metric_date, status,
        dirty_generation, claimed_generation, applied_generation,
        attempt_count, queued_at, created_at, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION_2)}::uuid,
        ${quote(VARIANT_2)}::uuid,
        ${quote(SKU_DAILY_METRIC_ALGORITHM_VERSION)},
        ${quote(metricDate)}::date,
        'queued',
        1, 0, 0,
        0, pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
      )
      on conflict do nothing;
    `);

    const pendingBlocked = await evaluateReorderFromLiveLoaders({
      userId: USER_A,
    });
    expect(pendingBlocked.ok).toBe(false);
    if (!pendingBlocked.ok && pendingBlocked.stage === "metric") {
      expect(pendingBlocked.result.code).toBe("PENDING_RECOMPUTE");
    }
    await clearPendingWorkForOrg(ORG);

    // Unknown incoming (withdraw attestation + recompute).
    await psql(`
      delete from public.store_incoming_evidence_attestations
      where organization_id = ${quote(ORG)}::uuid;
    `);
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );
    await clearPendingWorkForOrg(ORG);

    const unknownIncoming = await evaluateReorderFromLiveLoaders({
      userId: USER_A,
    });
    expect(unknownIncoming.ok).toBe(false);
    if (
      unknownIncoming.ok === false &&
      unknownIncoming.stage === "diagnostic" &&
      "diagnostic" in unknownIncoming
    ) {
      expect(unknownIncoming.diagnostic.ok).toBe(false);
      if (!unknownIncoming.diagnostic.ok) {
        expect(unknownIncoming.diagnostic.code).toBe(
          "INCOMING_EVIDENCE_UNQUALIFIED",
        );
        expect(
          unknownIncoming.diagnostic.provenance.productionDecisionCreationEligible,
        ).toBe(false);
      }
    }

    // Restore attestation + planning baseline.
    await psql(`
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
      )
      on conflict on constraint store_incoming_evidence_attestations_pkey
      do update set evidence_complete = true, updated_at = pg_catalog.now();

      delete from public.organization_planning_inputs
      where organization_id = ${quote(ORG)}::uuid;
    `);
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );
    await clearPendingWorkForOrg(ORG);

    const missingRopTarget = await evaluateReorderFromLiveLoaders({
      userId: USER_A,
    });
    expect(missingRopTarget.ok).toBe(false);
    if (
      missingRopTarget.ok === false &&
      missingRopTarget.stage === "diagnostic" &&
      "diagnostic" in missingRopTarget
    ) {
      expect(missingRopTarget.diagnostic.ok).toBe(false);
      if (!missingRopTarget.diagnostic.ok) {
        expect(missingRopTarget.diagnostic.code).toBe(
          "REORDER_EVIDENCE_INCOMPLETE",
        );
      }
    }

    // Restore planning; remove demand (orders) → velocity/ROP path changes.
    await psql(`
      insert into public.organization_planning_inputs (
        organization_id, lead_time_days, safety_stock_days, review_period_days
      ) values (
        ${quote(ORG)}::uuid,
        ${ORG_PLANNING_LEAD_TIME_DAYS},
        ${ORG_SAFETY_STOCK_DAYS},
        ${ORG_REVIEW_PERIOD_DAYS}
      );

      delete from public.order_items where organization_id = ${quote(ORG)}::uuid;
      delete from public.orders where organization_id = ${quote(ORG)}::uuid;
    `);
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );
    await clearPendingWorkForOrg(ORG);

    const zeroDemandProbe = await metricProbe();
    const zeroVelocity = Number(zeroDemandProbe.split(":")[3]);
    expect(zeroVelocity).toBe(0);
    // velocity 0 → ROP/target 0 → available 3 > ROP → ROQ may be 0 → incomplete.
    const zeroDemand = await evaluateReorderFromLiveLoaders({ userId: USER_A });
    expect(zeroDemand.ok).toBe(false);
    if (
      zeroDemand.ok === false &&
      zeroDemand.stage === "diagnostic" &&
      "diagnostic" in zeroDemand
    ) {
      expect(zeroDemand.diagnostic.ok).toBe(false);
      if (!zeroDemand.diagnostic.ok) {
        expect(zeroDemand.diagnostic.code).toBe("REORDER_EVIDENCE_INCOMPLETE");
      }
    }

    // Restore REORDER baseline for SA008 / isolation tests.
    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        ${quote(ORDER)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'completed',
        pg_catalog.timezone(
          ${quote(TZ)},
          (${quote(metricDate)}::date + time '10:00:00')
        ),
        'USD', 'csv'
      )
      on conflict (id) do nothing;

      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        ${quote(ORDER_ITEM)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        ${quote(ORDER)}::uuid, ${quote(VARIANT)}::uuid, ${quote(LOCATION)}::uuid,
        ${SOLD_UNITS}
      )
      on conflict (id) do nothing;

      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
      )
      on conflict on constraint store_incoming_evidence_attestations_pkey
      do update set evidence_complete = true, updated_at = pg_catalog.now();
    `);
    await reconcileSupplierProduct({
      supplierId: SUPPLIER,
      variantId: VARIANT,
      leadTimeDays: SUPPLIER_STATED_LEAD_TIME_DAYS,
      preferred: true,
      supplierSku: "PB1G-PREFERRED",
    });
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );
    await clearPendingWorkForOrg(ORG);

    const recovered = await evaluateReorderFromLiveLoaders({ userId: USER_A });
    expect(recovered.ok).toBe(true);
    if (recovered.ok && recovered.stage === "diagnostic" && recovered.diagnostic.ok) {
      expect(recovered.diagnostic.diagnosticDecision.actionType).toBe("REORDER");
    }
  });

  it("PB1.e attestation invalidation + SA008 source-token fencing", async () => {
    const admin = createSupabaseAdminClient();

    const beforeToken = await psql(`
      select (public.sku_daily_metric_source_snapshot(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid
      )->>'sourceToken')
    `);

    await psql(`
      delete from public.store_incoming_evidence_attestations
      where organization_id = ${quote(ORG)}::uuid
        and store_id = ${quote(STORE)}::uuid;
    `);

    const afterToken = await psql(`
      select (public.sku_daily_metric_source_snapshot(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid
      )->>'sourceToken')
    `);
    expect(afterToken).not.toBe(beforeToken);

    const pendingAfterRawDelete = await pendingCounts(ORG);
    expect(
      pendingAfterRawDelete.events + pendingAfterRawDelete.requests,
    ).toBeGreaterThan(0);

    const blockedWhileDirty = await evaluateReorderFromLiveLoaders({
      userId: USER_A,
    });
    expect(blockedWhileDirty.ok).toBe(false);
    if (!blockedWhileDirty.ok && blockedWhileDirty.stage === "metric") {
      expect(blockedWhileDirty.result.code).toBe("PENDING_RECOMPUTE");
    }

    const stale = await admin.rpc("commit_sku_daily_metric", {
      p_organization_id: ORG,
      p_store_id: STORE,
      p_location_id: LOCATION,
      p_variant_id: VARIANT,
      p_metric_date: metricDate,
      p_source_token: beforeToken,
      p_metric: {
        timeZone: TZ,
        algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
        availableQuantity: AVAILABLE_UNITS,
        eligibleIncomingQuantity: 0,
        eligibleIncomingReasonCode: null,
        salesVelocity30d: expectedVelocity,
        reorderPoint: expectedRop,
        targetStock: expectedTarget,
        demandTrend: "stable",
        inventoryAgeDays: null,
      },
    });
    expect(stale.error).not.toBeNull();
    expect(stale.error?.code).toBe("SA008");

    // Fresh recompute with unknown attestation → not REORDER-qualified.
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );
    await clearPendingWorkForOrg(ORG);

    const afterRecompute = await metricProbe();
    expect(afterRecompute.split(":")[1]).toBe("null");
    expect(afterRecompute.split(":")[2]).toBe("incoming_state_unknown");

    const unknown = await evaluateReorderFromLiveLoaders({ userId: USER_A });
    expect(unknown.ok).toBe(false);

    // Restore attestation + REORDER baseline for final isolation checks.
    await psql(`
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
      )
      on conflict on constraint store_incoming_evidence_attestations_pkey
      do update set evidence_complete = true, updated_at = pg_catalog.now();
    `);
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
      },
      admin,
    );
    await clearPendingWorkForOrg(ORG);
  });

  it("RLS isolation + fixture isolation + no M7 create/persist/approve", async () => {
    const foreign = await psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${quote(USER_B)}, true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select 'FOREIGN_METRIC|' || count(*)::text
      from public.sku_daily_metrics
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
      select 'FOREIGN_SUPPLIER|' || count(*)::text
      from public.supplier_products
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
      rollback;
    `);
    expect(
      foreign.split("\n").find((line) => line.startsWith("FOREIGN_METRIC|")),
    ).toBe("FOREIGN_METRIC|0");
    expect(
      foreign.split("\n").find((line) => line.startsWith("FOREIGN_SUPPLIER|")),
    ).toBe("FOREIGN_SUPPLIER|0");

    const member = await psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${quote(USER_A)}, true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select 'MEMBER_METRIC|' || count(*)::text
      from public.sku_daily_metrics
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
      select 'MEMBER_SUPPLIER|' || count(*)::text
      from public.supplier_products
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
      rollback;
    `);
    const memberMetric = member
      .split("\n")
      .find((line) => line.startsWith("MEMBER_METRIC|"));
    const memberSupplier = member
      .split("\n")
      .find((line) => line.startsWith("MEMBER_SUPPLIER|"));
    expect(Number(memberMetric!.slice("MEMBER_METRIC|".length))).toBeGreaterThan(
      0,
    );
    expect(
      Number(memberSupplier!.slice("MEMBER_SUPPLIER|".length)),
    ).toBeGreaterThan(0);

    // No collision with PB1.d / PB1.e synthetic tenants.
    const foreignSuites = await psql(`
      select count(*)::text from public.organizations
      where id in (
        'ab1d0000-0000-4000-8000-000000000001'::uuid,
        'ab1e0000-0000-4000-8000-000000000001'::uuid
      )
      and id in ${TENANTS}
    `);
    expect(foreignSuites).toBe("0");

    expect(process.env.METRIC_RECOMPUTE_WORKER_ENABLED).not.toBe("1");
    expect(process.env.METRIC_ROLLOVER_WORKER_ENABLED).not.toBe("1");

    const actions = await psql(`
      select count(*)::text
      from public.inventory_actions
      where organization_id in ${TENANTS}
    `);
    expect(actions).toBe("0");

    // Final positive still holds after SA008 path restore.
    const finalPass = await evaluateReorderFromLiveLoaders({ userId: USER_A });
    expect(finalPass.ok).toBe(true);
    if (finalPass.ok && finalPass.stage === "diagnostic" && finalPass.diagnostic.ok) {
      expect(finalPass.diagnostic.diagnosticDecision.actionType).toBe("REORDER");
      expect(
        finalPass.diagnostic.provenance.productionDecisionCreationEligible,
      ).toBe(false);
      expect(finalPass.diagnostic.provenance.productionApprovalEligible).toBe(
        false,
      );
      expect(finalPass.diagnostic.provenance.claimsMerchantFacing).toBe(false);
    }
  });
});
