import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";
import { recomputeSkuDailyMetric } from "@/lib/persistence/recompute-sku-daily-metric";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { holdOrdersLiveLock } from "../support/orders-live-lock";

/**
 * M7-PB1.e — attestation freshness + invalidation fencing (local).
 *
 * Proves INSERT/UPDATE/DELETE on store_incoming_evidence_attestations
 * dirties store-local current-day grains in the same transaction, that stale
 * known-zero cannot qualify while dirty, and that SA008/claim fencing holds.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "ab1e0000-0000-4000-8000-000000000001";
const ORG_B = "ab1e0000-0000-4000-8000-000000000011";
const STORE = "ab1e0000-0000-4000-8000-000000000002";
const STORE_B = "ab1e0000-0000-4000-8000-000000000012";
const LOCATION = "ab1e0000-0000-4000-8000-000000000003";
const LOCATION_B = "ab1e0000-0000-4000-8000-000000000013";
const PRODUCT = "ab1e0000-0000-4000-8000-000000000004";
const PRODUCT_B = "ab1e0000-0000-4000-8000-000000000014";
const VARIANT = "ab1e0000-0000-4000-8000-000000000005";
const VARIANT_B = "ab1e0000-0000-4000-8000-000000000015";
const TZ = "America/New_York";
const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;

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
      `PB1.e refuses non-local Supabase API URL host "${parsed.hostname}".`,
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
    throw new Error("PB1.e could not resolve local Supabase env from status.");
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
    delete from public.inventory_snapshots
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    delete from public.product_variants
    where organization_id in ${TENANTS};
    delete from public.products
    where organization_id in ${TENANTS};
    delete from public.locations
    where organization_id in ${TENANTS};
    delete from public.stores
    where organization_id in ${TENANTS};
    delete from public.organizations
    where id in ${TENANTS};

    alter table public.inventory_snapshots
      enable trigger inventory_snapshots_prevent_delete;
  `);
}

async function openRequestCount(organizationId: string): Promise<number> {
  const raw = await psql(`
    select count(*)::text
    from public.sku_daily_metric_recompute_requests
    where organization_id = ${quote(organizationId)}::uuid
      and status in ('queued', 'claimed', 'running', 'retry_wait', 'failed')
  `);
  return Number(raw);
}

async function dirtyGeneration(): Promise<number> {
  const raw = await psql(`
    select coalesce(dirty_generation, 0)::text
    from public.sku_daily_metric_recompute_requests
    where organization_id = ${quote(ORG)}::uuid
      and store_id = ${quote(STORE)}::uuid
      and location_id = ${quote(LOCATION)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid
      and metric_date = ${quote(metricDate)}::date
      and algorithm_version = ${quote(SKU_DAILY_METRIC_ALGORITHM_VERSION)}
  `);
  return Number(raw || "0");
}

async function metricIncoming(): Promise<string> {
  return psql(`
    select coalesce(eligible_incoming_quantity::text, 'null')
      || ':' || coalesce(eligible_incoming_reason_code::text, 'null')
    from public.sku_daily_metrics
    where organization_id = ${quote(ORG)}::uuid
      and store_id = ${quote(STORE)}::uuid
      and location_id = ${quote(LOCATION)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid
      and metric_date = ${quote(metricDate)}::date
  `);
}

let metricDate = "";
let releaseLock: (() => Promise<void>) | null = null;

describeLive("M7-PB1.e attestation freshness invalidation live", () => {
  beforeAll(async () => {
    await ensureLocalSupabaseEnv();
    releaseLock = await holdOrdersLiveLock();
    await cleanupFixture();

    metricDate = await psql(`
      select (pg_catalog.timezone(${quote(TZ)}, pg_catalog.now()))::date::text
    `);

    await psql(`
      insert into public.organizations (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'PB1.e Live A', 'USD', ${quote(TZ)}),
        (${quote(ORG_B)}::uuid, 'PB1.e Live B', 'USD', ${quote(TZ)});

      insert into public.stores (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'PB1.e Store A', 'active', 'USD', ${quote(TZ)}),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'PB1.e Store B', 'active', 'USD', ${quote(TZ)});

      insert into public.locations (id, organization_id, store_id, name, status)
      values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'LA', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'LB', 'active');

      insert into public.products (id, organization_id, store_id, title, status)
      values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'PA', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'PB', 'active');

      insert into public.product_variants (
        id, organization_id, store_id, product_id, sku, status
      ) values
        (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'SKU-E', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'SKU-EB', 'active');

      insert into public.inventory_snapshots (
        organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid, ${quote(VARIANT)}::uuid,
        pg_catalog.timezone(
          ${quote(TZ)},
          (${quote(metricDate)}::date + time '12:00:00')
        ),
        10, 'csv'
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

    // Clear fixture noise from snapshot/recompute enqueue so later
    // attestation mutations are the only open requests under test.
    await psql(`
      update public.sku_daily_metric_source_events
      set consumed_at = pg_catalog.now()
      where organization_id = ${quote(ORG)}::uuid
        and consumed_at is null;

      update public.sku_daily_metric_recompute_requests
      set status = 'succeeded',
          applied_generation = dirty_generation,
          lease_owner_id = null,
          lease_claim_token = null,
          lease_claimed_at = null,
          lease_expires_at = null,
          finished_at = pg_catalog.now(),
          updated_at = pg_catalog.now()
      where organization_id = ${quote(ORG)}::uuid
        and status in ('queued', 'claimed', 'running', 'retry_wait', 'failed');
    `);
  }, 180_000);

  afterAll(async () => {
    try {
      await cleanupFixture();
    } finally {
      if (releaseLock) {
        await releaseLock();
      }
    }
  });

  it("INSERT/UPDATE/DELETE attestation each bump dirty_generation for current-day grain", async () => {
    const before = await dirtyGeneration();
    expect(await openRequestCount(ORG)).toBe(0);

    await psql(`
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
      );
    `);
    const afterInsert = await dirtyGeneration();
    expect(afterInsert).toBeGreaterThan(before);
    expect(await openRequestCount(ORG)).toBeGreaterThan(0);

    await psql(`
      update public.store_incoming_evidence_attestations
      set evidence_complete = false, updated_at = pg_catalog.now()
      where organization_id = ${quote(ORG)}::uuid
        and store_id = ${quote(STORE)}::uuid;
    `);
    const afterUpdate = await dirtyGeneration();
    expect(afterUpdate).toBeGreaterThan(afterInsert);

    await psql(`
      delete from public.store_incoming_evidence_attestations
      where organization_id = ${quote(ORG)}::uuid
        and store_id = ${quote(STORE)}::uuid;
    `);
    const afterDelete = await dirtyGeneration();
    expect(afterDelete).toBeGreaterThan(afterUpdate);

    // Cross-org isolation: foreign org must remain untouched.
    expect(await openRequestCount(ORG_B)).toBe(0);
  });

  it("known-zero becomes unknown after DELETE + recompute; historical dates stay unknown", async () => {
    const admin = createSupabaseAdminClient();

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
    expect(await metricIncoming()).toBe("0:null");

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
    expect(await openRequestCount(ORG)).toBeGreaterThan(0);

    // Stale commit with pre-delete token must raise SA008.
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
        availableQuantity: 10,
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
    expect(await metricIncoming()).toBe("null:incoming_state_unknown");

    const past = await psql(`
      select (${quote(metricDate)}::date - 1)::text
    `);
    await recomputeSkuDailyMetric(
      {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate: past,
      },
      admin,
    );
    const historical = await psql(`
      select coalesce(eligible_incoming_quantity::text, 'null')
        || ':' || coalesce(eligible_incoming_reason_code::text, 'null')
      from public.sku_daily_metrics
      where organization_id = ${quote(ORG)}::uuid
        and metric_date = ${quote(past)}::date
    `);
    expect(historical).toBe("null:incoming_state_unknown");
  });

  it("preserves claimed/running lease fencing across attestation DELETE", async () => {
    await psql(`
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete, updated_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
      )
      on conflict on constraint store_incoming_evidence_attestations_pkey
      do update set evidence_complete = true, updated_at = pg_catalog.now();

      update public.sku_daily_metric_recompute_requests
      set status = 'claimed',
          claimed_generation = dirty_generation,
          lease_owner_id = 'pb1e-lease-owner',
          lease_claim_token = 'pb1e-lease-token',
          lease_claimed_at = pg_catalog.now(),
          lease_expires_at = pg_catalog.now() + interval '5 minutes',
          updated_at = pg_catalog.now()
      where organization_id = ${quote(ORG)}::uuid
        and store_id = ${quote(STORE)}::uuid
        and location_id = ${quote(LOCATION)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date;
    `);

    const before = await psql(`
      select status || ':' || dirty_generation::text || ':' || claimed_generation::text
        || ':' || coalesce(lease_owner_id, '')
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    const [, beforeDirty, beforeClaimed, beforeOwner] = before.split(":");
    expect(beforeOwner).toBe("pb1e-lease-owner");

    await psql(`
      delete from public.store_incoming_evidence_attestations
      where organization_id = ${quote(ORG)}::uuid
        and store_id = ${quote(STORE)}::uuid;
    `);

    const after = await psql(`
      select status || ':' || dirty_generation::text || ':' || claimed_generation::text
        || ':' || coalesce(lease_owner_id, '')
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    const [status, dirty, claimed, owner] = after.split(":");
    expect(status).toBe("claimed");
    expect(Number(dirty)).toBeGreaterThan(Number(beforeDirty));
    expect(claimed).toBe(beforeClaimed);
    expect(owner).toBe("pb1e-lease-owner");
  });
});
