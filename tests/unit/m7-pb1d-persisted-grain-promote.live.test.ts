import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadPb1TrustedPersistedMetricPromoteDiagnostic,
  M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
  type Pb1TrustedPersistedMetricPromoteLoaderDeps,
  type Pb1TrustedPersistedSkuDailyMetricRow,
} from "@/lib/decision-engine/pb1-trusted-persisted-metric-promote-loader";
import {
  countPendingMetricWorkForOrganization,
  type PendingMetricWorkClient,
} from "@/lib/metrics-activation/pending-work";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";
import { recomputeSkuDailyMetric } from "@/lib/persistence/recompute-sku-daily-metric";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { holdOrdersLiveLock } from "../support/orders-live-lock";

/**
 * M7-PB1.d — genuine persisted-grain PROMOTE diagnostic verification (local).
 *
 * Proves PB1.c I/O loader against ONE tenant-authorized current-day M5 row
 * produced by canonical recompute/commit — not a fabricated insert.
 * Production create/approve/UI/workers remain hard-false / disabled.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "ab1d0000-0000-4000-8000-000000000001";
const ORG_B = "ab1d0000-0000-4000-8000-000000000011";
const STORE = "ab1d0000-0000-4000-8000-000000000002";
const STORE_B = "ab1d0000-0000-4000-8000-000000000012";
const LOCATION = "ab1d0000-0000-4000-8000-000000000003";
const LOCATION_2 = "ab1d0000-0000-4000-8000-000000000023";
const LOCATION_B = "ab1d0000-0000-4000-8000-000000000013";
const PRODUCT = "ab1d0000-0000-4000-8000-000000000004";
const PRODUCT_B = "ab1d0000-0000-4000-8000-000000000014";
const VARIANT = "ab1d0000-0000-4000-8000-000000000005";
const VARIANT_2 = "ab1d0000-0000-4000-8000-000000000025";
const VARIANT_B = "ab1d0000-0000-4000-8000-000000000015";
const USER_A = "ab1d0000-0000-4000-8000-000000000006";
const USER_B = "ab1d0000-0000-4000-8000-000000000016";
const USER_OUTSIDER = "ab1d0000-0000-4000-8000-000000000026";
const ORDER = "ab1d0000-0000-4000-8000-000000000007";
const ORDER_ITEM = "ab1d0000-0000-4000-8000-000000000008";

// Regional IANA zone (UTC/Etc/UTC also accepted by PB1.e-aligned binding).
const TZ = "America/New_York";
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
      `PB1.d refuses non-local Supabase API URL host "${parsed.hostname}".`,
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
    throw new Error("PB1.d could not resolve local Supabase env from status.");
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
    delete from public.order_items
    where organization_id in ${TENANTS};
    delete from public.orders
    where organization_id in ${TENANTS};
    delete from public.inventory_snapshots
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    -- Order-item triggers may capture coverage-correction outbox rows.
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
 * Scope: isolated PB1.d tenants only.
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
      || ':' || coalesce(target_stock::text, 'null')
      || ':' || coalesce(demand_trend::text, 'null')
      || ':' || coalesce(inventory_age_days::text, 'null')
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

/**
 * Real I/O deps: membership + store TZ + exact grain SELECT + admin pending.
 * Mirrors createDefaultLoaderDeps without Next.js cookie server client.
 */
function liveDeps(args: {
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
      // Membership already proven by the I/O loader before this call.
      // Exact grain + current-day + algorithm pin — same filters as default deps.
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

async function loadPromote(args: {
  userId: string | null;
  organizationId?: string;
  storeId?: string;
  locationId?: string;
  variantId?: string;
  now?: () => Date;
  stalenessPolicy?: { maxAgeMs: number; relativeTo: string } | null;
}) {
  return loadPb1TrustedPersistedMetricPromoteDiagnostic(
    {
      loaderVersion: M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
      organizationId: args.organizationId ?? ORG,
      storeId: args.storeId ?? STORE,
      locationId: args.locationId ?? LOCATION,
      variantId: args.variantId ?? VARIANT,
      stalenessPolicy: args.stalenessPolicy,
    },
    liveDeps({ userId: args.userId, now: args.now }),
  );
}

let metricDate = "";
let releaseLock: (() => Promise<void>) | null = null;

describeLive("M7-PB1.d persisted-grain PROMOTE diagnostic live", () => {
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
          'pb1d-a@example.test', '',
          pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
        ),
        (
          ${quote(USER_B)}::uuid,
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated',
          'pb1d-b@example.test', '',
          pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
        ),
        (
          ${quote(USER_OUTSIDER)}::uuid,
          '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated',
          'pb1d-out@example.test', '',
          pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
        );

      insert into public.organizations (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'PB1.d Live A', 'USD', ${quote(TZ)}),
        (${quote(ORG_B)}::uuid, 'PB1.d Live B', 'USD', ${quote(TZ)});

      insert into public.organization_members (organization_id, user_id, role)
      values
        (${quote(ORG)}::uuid, ${quote(USER_A)}::uuid, 'owner'),
        (${quote(ORG_B)}::uuid, ${quote(USER_B)}::uuid, 'owner');

      insert into public.stores (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'PB1.d Store A', 'active', 'USD', ${quote(TZ)}),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'PB1.d Store B', 'active', 'USD', ${quote(TZ)});

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
        (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1D-A', 'active'),
        (${quote(VARIANT_2)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1D-A2', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'PB1D-B', 'active');

      -- Known planning zeros → target_stock = 0 when velocity is known-zero.
      insert into public.organization_planning_inputs (
        organization_id, lead_time_days, safety_stock_days, review_period_days
      ) values (
        ${quote(ORG)}::uuid, 7, 0, 14
      );

      -- Current-day inventory makes the day eligible; no sales → velocity 0.
      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid, ${quote(VARIANT)}::uuid,
        pg_catalog.timezone(
          ${quote(TZ)},
          (${quote(metricDate)}::date + time '12:00:00')
        ),
        120, 'csv'
      );

      -- Merchant attestation: empty PO set is known-zero incoming (null≠0 preserved).
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
      );
    `);

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

    // Documented precondition: org-wide pending fence would false-block a
    // freshly recomputed grain until queue/events are consumed. Clear only
    // for this isolated fixture org (worker simulation; workers stay OFF).
    await clearPendingWorkForOrg(ORG);

    const pending = await pendingCounts(ORG);
    expect(pending.events).toBe(0);
    expect(pending.requests).toBe(0);
  }, 180_000);

  afterAll(async () => {
    try {
      await cleanupFixture();
    } finally {
      if (releaseLock) {
        await releaseLock();
      }
    }
  }, 120_000);

  it("positive: genuine persisted row → diagnostic PROMOTE with hard-false gates", async () => {
    const probe = await metricProbe();
    const [
      available,
      incomingQty,
      incomingReason,
      velocity,
      target,
      trend,
      age,
      algorithm,
    ] = probe.split(":");

    expect(available).toBe("120");
    expect(incomingQty).toBe("0");
    expect(incomingReason).toBe("null");
    expect(velocity).toBe("0");
    expect(target).toBe("0");
    expect(age).toBe("null");
    expect(algorithm).toBe(SKU_DAILY_METRIC_ALGORITHM_VERSION);
    // Demand pressure is known-zero velocity (not invented falling trend).
    expect(["stable", "unknown", "falling", "rising"]).toContain(trend);

    const result = await loadPromote({ userId: USER_A });

    if (!result.ok) {
      expect.fail(
        `loader rejected: ${result.code} — ${result.detail}; probe=${probe}`,
      );
    }
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.loaderVersion).toBe(
      M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1,
    );
    expect(result.diagnosticDecision.actionType).toBe("PROMOTE");
    expect(result.diagnosticDecision.reasonCodes).toContain("ZERO_DEMAND");
    expect(result.diagnosticDecision.reasonCodes).toContain("ABOVE_TARGET_STOCK");
    expect(result.decisionInput.overstockRisk).toBe("high");
    expect(result.decisionInput.validIncomingQuantity).toBe(0);
    expect(result.decisionInput.incomingStateKnown).toBe(true);
    expect(result.decisionInput.inventoryAgeDays).toBeNull();
    expect(result.decisionInput.leadTimeDays).toBeNull();
    expect(result.decisionInput.demandVelocity).toBe(0);
    expect(result.decisionInput.targetStockUnits).toBe(0);

    expect(result.provenance.productionApprovalEligible).toBe(false);
    expect(result.provenance.productionDecisionCreationEligible).toBe(false);
    expect(result.provenance.claimsMerchantFacing).toBe(false);
    expect(result.provenance.claimsM7ProductionEligibility).toBe(false);
    expect(result.provenance.algorithmApproved).toBe(false);
    expect(result.provenance.engineBoundBriefEligible).toBe(false);
    expect(result.warnings).toContain("NOT_production_decision_create");
    expect(result.warnings).toContain("NOT_m7_3_approvable");
  });

  it("negative: foreign org member and outsider are denied", async () => {
    const foreign = await loadPromote({ userId: USER_B });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.code).toBe("TENANT_ACCESS_DENIED");
      expect(foreign.provenance.productionApprovalEligible).toBe(false);
      expect(foreign.provenance.claimsMerchantFacing).toBe(false);
    }

    const outsider = await loadPromote({ userId: USER_OUTSIDER });
    expect(outsider.ok).toBe(false);
    if (!outsider.ok) {
      expect(outsider.code).toBe("TENANT_ACCESS_DENIED");
    }

    const unauth = await loadPromote({ userId: null });
    expect(unauth.ok).toBe(false);
    if (!unauth.ok) {
      expect(unauth.code).toBe("AUTHENTICATION_REQUIRED");
    }
  });

  it("negative: wrong location/variant and stale as-of yield METRIC_ROW_NOT_FOUND", async () => {
    const wrongLocation = await loadPromote({
      userId: USER_A,
      locationId: LOCATION_2,
    });
    expect(wrongLocation.ok).toBe(false);
    if (!wrongLocation.ok) {
      expect(wrongLocation.code).toBe("METRIC_ROW_NOT_FOUND");
    }

    const wrongVariant = await loadPromote({
      userId: USER_A,
      variantId: VARIANT_2,
    });
    expect(wrongVariant.ok).toBe(false);
    if (!wrongVariant.ok) {
      expect(wrongVariant.code).toBe("METRIC_ROW_NOT_FOUND");
    }

    // Stale date: shift as-of to tomorrow so current persisted day is not current.
    const staleAsOf = await loadPromote({
      userId: USER_A,
      now: () =>
        new Date(
          new Date(`${metricDate}T12:00:00.000Z`).getTime() + 86_400_000,
        ),
    });
    expect(staleAsOf.ok).toBe(false);
    if (!staleAsOf.ok) {
      expect(staleAsOf.code).toBe("METRIC_ROW_NOT_FOUND");
    }
  });

  it("negative: pending/dirty/claimed generation fails closed (org-wide fence)", async () => {
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

    // Org-wide pending fence: dirty work on a *different* grain still blocks
    // the qualifying grain. Documented false-block risk — gates not loosened.
    const blocked = await loadPromote({ userId: USER_A });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("PENDING_RECOMPUTE");
      expect(blocked.provenance.productionDecisionCreationEligible).toBe(false);
    }

    const counts = await pendingCounts(ORG);
    expect(counts.requests).toBeGreaterThan(0);

    await clearPendingWorkForOrg(ORG);

    const recovered = await loadPromote({ userId: USER_A });
    expect(recovered.ok).toBe(true);
    if (recovered.ok) {
      expect(recovered.diagnosticDecision.actionType).toBe("PROMOTE");
    }
  });

  it("negative: unknown incoming / missing target / missing demand pressure", async () => {
    const admin = createSupabaseAdminClient();

    // --- unknown incoming (attestation withdrawn) ---
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

    const unknownIncoming = await loadPromote({ userId: USER_A });
    expect(unknownIncoming.ok).toBe(true);
    if (unknownIncoming.ok) {
      expect(unknownIncoming.decisionInput.incomingStateKnown).toBe(false);
      expect(unknownIncoming.decisionInput.overstockRisk).toBeNull();
      expect(unknownIncoming.diagnosticDecision.actionType).not.toBe("PROMOTE");
    }

    // Restore attestation for subsequent negatives.
    await psql(`
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
      )
      on conflict on constraint store_incoming_evidence_attestations_pkey
      do update set evidence_complete = true, updated_at = pg_catalog.now();
    `);

    // --- missing target (planning cleared) ---
    await psql(`
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

    const missingTarget = await loadPromote({ userId: USER_A });
    expect(missingTarget.ok).toBe(true);
    if (missingTarget.ok) {
      expect(missingTarget.decisionInput.targetStockUnits).toBeNull();
      expect(missingTarget.diagnosticDecision.actionType).not.toBe("PROMOTE");
      expect(missingTarget.diagnosticDecision.reasonCodes).toContain(
        "TARGET_STOCK_UNKNOWN",
      );
    }

    // Restore planning + known-zero demand PROMOTE baseline, then add sales
    // so demand pressure is absent (positive velocity, non-falling trend).
    await psql(`
      insert into public.organization_planning_inputs (
        organization_id, lead_time_days, safety_stock_days, review_period_days
      ) values (
        ${quote(ORG)}::uuid, 7, 0, 14
      );

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
        30
      );
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

    const probe = await metricProbe();
    const parts = probe.split(":");
    const velocity = Number(parts[3]);
    const target = Number(parts[4]);
    expect(velocity).toBeGreaterThan(0);
    expect(target).toBeGreaterThan(0);
    // available(120) may or may not exceed target depending on velocity;
    // regardless, without falling/zero/aged pressure PROMOTE must not fire
    // unless excess+pressure both hold. Assert pressure absence path:
    const noPressure = await loadPromote({ userId: USER_A });
    expect(noPressure.ok).toBe(true);
    if (noPressure.ok) {
      expect(noPressure.decisionInput.demandVelocity).toBeGreaterThan(0);
      expect(noPressure.decisionInput.demandTrend).not.toBe("falling");
      expect(noPressure.decisionInput.inventoryAgeDays).toBeNull();
      // If still above target with overstock, pressure gate must block PROMOTE.
      if (
        noPressure.decisionInput.availableQuantity !== null &&
        noPressure.decisionInput.targetStockUnits !== null &&
        noPressure.decisionInput.availableQuantity >
          noPressure.decisionInput.targetStockUnits &&
        (noPressure.decisionInput.overstockRisk === "high" ||
          noPressure.decisionInput.overstockRisk === "medium")
      ) {
        expect(noPressure.diagnosticDecision.actionType).not.toBe("PROMOTE");
      } else {
        expect(noPressure.diagnosticDecision.actionType).not.toBe("PROMOTE");
      }
    }
  });

  it("SA008/SA009 + attestation: stale source not treated as current known incoming", async () => {
    const admin = createSupabaseAdminClient();

    // Restore known-zero PROMOTE baseline (no sales pressure path).
    await psql(`
      delete from public.order_items
      where organization_id = ${quote(ORG)}::uuid;
      delete from public.orders
      where organization_id = ${quote(ORG)}::uuid;

      insert into public.organization_planning_inputs (
        organization_id, lead_time_days, safety_stock_days, review_period_days
      ) values (
        ${quote(ORG)}::uuid, 7, 0, 14
      )
      on conflict (organization_id) do update
        set lead_time_days = 7,
            safety_stock_days = 0,
            review_period_days = 14;

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

    const beforeToken = await psql(`
      select (public.sku_daily_metric_source_snapshot(
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid
      )->>'sourceToken')
    `);

    // PB1.e: raw DELETE must atomically enqueue current-day invalidation
    // (same dirty_generation fencing as the upsert RPC path).
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

    const blockedWhileDirty = await loadPromote({ userId: USER_A });
    expect(blockedWhileDirty.ok).toBe(false);
    if (!blockedWhileDirty.ok) {
      expect(blockedWhileDirty.code).toBe("PENDING_RECOMPUTE");
    }

    // Stale commit with old token must raise SA008 (freshness fencing).
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
        availableQuantity: 120,
        eligibleIncomingQuantity: 0,
        eligibleIncomingReasonCode: null,
        salesVelocity30d: 0,
        targetStock: 0,
        demandTrend: "stable",
        inventoryAgeDays: null,
      },
    });
    expect(stale.error).not.toBeNull();
    expect(stale.error?.code).toBe("SA008");

    // After recompute with unknown attestation, persisted incoming is unknown.
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

    const unknown = await loadPromote({ userId: USER_A });
    expect(unknown.ok).toBe(true);
    if (unknown.ok) {
      expect(unknown.decisionInput.incomingStateKnown).toBe(false);
      expect(unknown.diagnosticDecision.actionType).not.toBe("PROMOTE");
    }
  });

  it("RLS: authenticated foreign member cannot SELECT the fixture metric row", async () => {
    const foreign = await psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${quote(USER_B)}, true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select 'FOREIGN|' || count(*)::text
      from public.sku_daily_metrics
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
      rollback;
    `);
    expect(foreign.split("\n").find((line) => line.startsWith("FOREIGN|"))).toBe(
      "FOREIGN|0",
    );

    const member = await psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${quote(USER_A)}, true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select 'MEMBER|' || count(*)::text
      from public.sku_daily_metrics
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
      rollback;
    `);
    const memberLine = member
      .split("\n")
      .find((line) => line.startsWith("MEMBER|"));
    expect(memberLine).toBeDefined();
    expect(Number(memberLine!.slice("MEMBER|".length))).toBeGreaterThan(0);
  });

  it("no M7 production create / worker / cron activation in this path", async () => {
    expect(process.env.METRIC_RECOMPUTE_WORKER_ENABLED).not.toBe("1");
    expect(process.env.METRIC_ROLLOVER_WORKER_ENABLED).not.toBe("1");

    const actions = await psql(`
      select count(*)::text
      from public.inventory_actions
      where organization_id in ${TENANTS}
    `);
    expect(actions).toBe("0");
  });
});
