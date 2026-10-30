import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  FreshPublishedForecastValidationError,
  readFreshPublishedSkuForecast,
  type FreshPublishedForecastClient,
} from "@/lib/persistence/read-fresh-published-sku-forecast";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M6 P3d.3 — local PG17 live freshness-gated reader.
 * Local Supabase only. No hosted, workers, HTTP, M7, or canary.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "6100d100-0000-4000-8000-000000000001";
const ORG_B = "6100d100-0000-4000-8000-000000000011";
const STORE_A = "6100d100-0000-4000-8000-000000000002";
const STORE_B = "6100d100-0000-4000-8000-000000000012";
const LOCATION_A = "6100d100-0000-4000-8000-000000000003";
const LOCATION_B = "6100d100-0000-4000-8000-000000000013";
const PRODUCT_A = "6100d100-0000-4000-8000-000000000004";
const PRODUCT_B = "6100d100-0000-4000-8000-000000000014";
const VARIANT_A = "6100d100-0000-4000-8000-000000000005";
const VARIANT_B = "6100d100-0000-4000-8000-000000000015";
const USER_A = "6100d100-0000-4000-8000-000000000007";
const ORDER_A = "6100d100-0000-4000-8000-000000000021";
const ITEM_A = "6100d100-0000-4000-8000-000000000022";
const TENANTS = `(${quote(ORG_A)}::uuid, ${quote(ORG_B)}::uuid)`;
const AS_OF = "2026-07-01";
const LOOKBACK = 90;

const TENANT_A: TenantContext = {
  userId: USER_A,
  organizationId: ORG_A,
  role: "owner",
  storeId: STORE_A,
};

const TENANT_B: TenantContext = {
  userId: USER_A,
  organizationId: ORG_B,
  role: "owner",
  storeId: STORE_B,
};

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function adminClient(): FreshPublishedForecastClient {
  return createSupabaseAdminClient() as unknown as FreshPublishedForecastClient;
}

function assertLocalSupabaseApiUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Live suite requires a local Supabase API URL.");
  }
  const host = parsed.hostname;
  if (
    !(host === "127.0.0.1" || host === "localhost") ||
    parsed.protocol !== "http:"
  ) {
    throw new Error(`Live suite refuses non-local host "${host}".`);
  }
}

function psqlArgs(): string[] {
  return [
    "-h", "127.0.0.1",
    "-p", "55322",
    "-U", "postgres",
    "-d", "postgres",
    "-v", "ON_ERROR_STOP=1",
    "-v", "VERBOSITY=verbose",
    "-q", "-t", "-A",
  ];
}

function databaseEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: "postgres" };
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync("psql", [...psqlArgs(), "-c", sql], {
    env: databaseEnv(),
  });
  return stdout.trim();
}

async function ensureLocalSupabaseEnv(): Promise<void> {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    assertLocalSupabaseApiUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    return;
  }

  const { stdout } = await execFileAsync(
    "npx",
    ["supabase", "status", "-o", "env"],
    { env: process.env, cwd: process.cwd() },
  );
  const values = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values.set(match[1], match[2].replace(/^"|"$/g, ""));
  }
  const apiUrl = values.get("API_URL");
  const serviceKey = values.get("SERVICE_ROLE_KEY");
  const anonKey = values.get("ANON_KEY") ?? values.get("PUBLISHABLE_KEY");
  if (!apiUrl || !serviceKey || !anonKey) {
    throw new Error("Live suite could not resolve local Supabase env.");
  }
  assertLocalSupabaseApiUrl(apiUrl);
  process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
}

async function wipe(): Promise<void> {
  await psql(`
    truncate table public.sku_forecast_current,
      public.sku_forecast_publications,
      public.sku_forecasts,
      public.forecast_runs
    cascade;
  `);
}

async function clearCommerce(): Promise<void> {
  await psql(`
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
    delete from public.return_refunds where organization_id in ${TENANTS};
    delete from public.order_items where organization_id in ${TENANTS};
    delete from public.orders where organization_id in ${TENANTS};
  `);
}

async function seedParents(): Promise<void> {
  await psql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      ${quote(USER_A)}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', 'm6-fresh-live@example.invalid', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    ) on conflict (id) do nothing;

    insert into public.organizations (id, name, default_currency, timezone) values
      (${quote(ORG_A)}::uuid, 'Fresh Live A', 'USD', 'UTC'),
      (${quote(ORG_B)}::uuid, 'Fresh Live B', 'USD', 'UTC')
    on conflict (id) do nothing;
    insert into public.organization_members (organization_id, user_id, role)
    values (${quote(ORG_A)}::uuid, ${quote(USER_A)}::uuid, 'owner')
    on conflict do nothing;
    insert into public.stores (id, organization_id, name, status, currency, timezone) values
      (${quote(STORE_A)}::uuid, ${quote(ORG_A)}::uuid, 'A', 'active', 'USD', 'UTC'),
      (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'UTC')
    on conflict (id) do nothing;
    insert into public.locations (id, organization_id, store_id, name, status) values
      (${quote(LOCATION_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, 'A', 'active'),
      (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active')
    on conflict (id) do nothing;
    insert into public.products (id, organization_id, store_id, title, status) values
      (${quote(PRODUCT_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, 'A', 'active'),
      (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active')
    on conflict (id) do nothing;
    insert into public.product_variants (id, organization_id, store_id, product_id, sku, status) values
      (${quote(VARIANT_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, ${quote(PRODUCT_A)}::uuid, 'A1', 'active'),
      (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'B1', 'active')
    on conflict (id) do nothing;

    insert into public.forecast_day_coverage_evidence (
      evidence_id, organization_id, store_id, location_id, variant_id,
      local_date, stream, coverage, trust, source,
      as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
      idempotency_key, integration_id, actor_user_id, provider, closure_id
    ) values
    (
      'fresh-live-orders',
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, null, null,
      ${quote(AS_OF)}::date, 'orders', 'complete', 'verified_merchant_attestation',
      'merchant:attestation',
      '2026-07-02T00:00:00Z'::timestamptz,
      '2026-07-02T00:00:00Z'::timestamptz,
      1, null, null, 'fresh-live-orders', null, ${quote(USER_A)}::uuid, null,
      'merchant_day_stream_closure:fresh-live-orders'
    ),
    (
      'fresh-live-returns',
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date, 'returns', 'complete', 'verified_merchant_attestation',
      'merchant:attestation',
      '2026-07-02T00:00:00Z'::timestamptz,
      '2026-07-02T00:00:00Z'::timestamptz,
      1, null, null, 'fresh-live-returns', null, ${quote(USER_A)}::uuid, null,
      'merchant_day_stream_closure:fresh-live-returns'
    )
    on conflict (evidence_id) do nothing;
  `);
}

async function seedCommerce(): Promise<void> {
  await psql(`
    insert into public.orders (
      id, organization_id, store_id, status, ordered_at, currency, source
    ) values (
      ${quote(ORDER_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
      'completed', '2026-07-01T12:00:00Z'::timestamptz, 'USD', 'csv'
    );
    insert into public.order_items (
      id, organization_id, store_id, order_id, variant_id, location_id, quantity
    ) values (
      ${quote(ITEM_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
      ${quote(ORDER_A)}::uuid, ${quote(VARIANT_A)}::uuid, ${quote(LOCATION_A)}::uuid, 3
    );
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
  `);
}

function basePayload(overrides: Record<string, unknown> = {}): string {
  const body = {
    algorithmVersion: "forecast-orchestrator-v1",
    configurationVersion: "forecast-config-v1",
    algorithmVersions: {
      weightedDemand: "weighted-demand-v1",
      trendAdjustment: "trend-adjustment-v1",
      stockoutCensoring: "stockout-censoring-v1",
      promotionTreatment: "promotion-treatment-v1",
      coldStart: "cold-start-v1",
      confidence: "forecast-confidence-v1",
      horizon: "forecast-horizon-v1",
      backtest: "forecast-backtest-v1",
    },
    organizationId: ORG_A,
    storeId: STORE_A,
    locationId: LOCATION_A,
    variantId: VARIANT_A,
    forecastAsOf: AS_OF,
    dailyDemand: 2,
    mode: "standard",
    dataSufficiency: "sufficient",
    confidence: "medium",
    weightedDailyDemand: 2,
    trendApplied: false,
    trendAdjustedDailyDemand: null,
    activeWindows: [],
    quality: { totalDays: 1 },
    horizons: { leadTimeDemand: null },
    reproducibilityFingerprint: "freshlive1",
    reasonCodes: [],
    classifiedDays: [],
    parameters: {},
    provenance: { source: "fresh-live" },
    ...overrides,
  };
  return quote(JSON.stringify(body));
}

async function persistAndPublish(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const token = await psql(`
    set role service_role;
    select public.forecast_sku_demand_source_snapshot(
      ${quote(ORG_A)}::uuid,
      ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid,
      ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date,
      ${LOOKBACK}
    )->>'sourceToken'
  `);
  const runId = await psql(`
    set role service_role;
    select public.persist_forecast_sku_demand_result(
      ${quote(ORG_A)}::uuid,
      ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid,
      ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date,
      ${LOOKBACK},
      ${quote(token)},
      ${basePayload(overrides)}::jsonb
    )->>'forecastRunId'
  `);
  const published = JSON.parse(
    await psql(`
      set role service_role;
      select public.publish_sku_forecast(${quote(runId)}::uuid)::text
    `),
  ) as { disposition: string };
  expect(published.disposition).toBe("published");
  return runId;
}

describeLive("M6 P3d.3 fresh published forecast reader (live)", () => {
  beforeAll(async () => {
    await psql("select 1");
    await ensureLocalSupabaseEnv();
    expect(
      await psql(`
        select to_regprocedure(
          'public.read_fresh_published_sku_forecast(uuid,uuid,uuid,uuid)'
        )::text
      `),
    ).toContain("read_fresh_published_sku_forecast");
    await wipe();
    await clearCommerce();
    await seedParents();
  }, 180000);

  beforeEach(async () => {
    await wipe();
    await clearCommerce();
    await seedCommerce();
  }, 120000);

  afterAll(async () => {
    await wipe();
    await clearCommerce();
  }, 180000);

  it("returns eligible medium/high and known-zero through the TS decoder", async () => {
    await persistAndPublish({
      dailyDemand: 0,
      weightedDailyDemand: 0,
      confidence: "medium",
      reproducibilityFingerprint: "livezero01",
    });
    const zero = await readFreshPublishedSkuForecast(
      {
        tenant: TENANT_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      adminClient(),
    );
    expect(zero.disposition).toBe("eligible");
    if (zero.disposition !== "eligible") throw new Error("expected eligible");
    expect(zero.dailyDemand).toBe(0);
    expect(zero.m7NumericEligible).toBe(true);
    expect(zero.forecastAsOf).toBe(AS_OF);
    expect(zero.freshnessLimitation).toMatch(/forecast age/i);

    await psql(`
      update public.order_items set quantity = quantity + 1
      where id = ${quote(ITEM_A)}::uuid;
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);
    await persistAndPublish({
      dailyDemand: 3,
      weightedDailyDemand: 3,
      confidence: "high",
      reproducibilityFingerprint: "livehigh01",
      configurationVersion: "forecast-config-v1-high",
    });
    const high = await readFreshPublishedSkuForecast(
      {
        tenant: TENANT_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      adminClient(),
    );
    expect(high.disposition).toBe("eligible");
    if (high.disposition !== "eligible") throw new Error("expected eligible");
    expect(high.dailyDemand).toBe(3);
    expect(high.confidence).toBe("high");
  }, 120000);

  it("returns typed misses for low confidence, stale token, pending, absent", async () => {
    await persistAndPublish({
      confidence: "low",
      reproducibilityFingerprint: "livelow001",
      configurationVersion: "forecast-config-v1-low",
    });
    const low = await readFreshPublishedSkuForecast(
      {
        tenant: TENANT_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      adminClient(),
    );
    expect(low.disposition).toBe("FORECAST_CONFIDENCE_LOW");
    expect(low.dailyDemand).toBeNull();
    expect(low.m7NumericEligible).toBe(false);

    await psql(`
      update public.order_items set quantity = quantity + 1
      where id = ${quote(ITEM_A)}::uuid;
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);
    await persistAndPublish({
      confidence: "medium",
      dailyDemand: 2,
      weightedDailyDemand: 2,
      reproducibilityFingerprint: "livestal01",
      configurationVersion: "forecast-config-v1-stale",
    });
    await psql(`
      update public.order_items set quantity = quantity + 1
      where id = ${quote(ITEM_A)}::uuid;
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);
    const stale = await readFreshPublishedSkuForecast(
      {
        tenant: TENANT_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      adminClient(),
    );
    expect(stale.disposition).toBe("STALE");
    expect(stale.dailyDemand).toBeNull();

    await wipe();
    await clearCommerce();
    await seedCommerce();
    await persistAndPublish({
      reproducibilityFingerprint: "livepend01",
      configurationVersion: "forecast-config-v1-pend",
    });
    await psql(`
      insert into public.forecast_coverage_correction_events (
        organization_id, store_id, stream, local_date,
        location_id, variant_id, business_at, arrived_at,
        source_table, source_op
      ) values (
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        'orders', ${quote(AS_OF)}::date,
        null, null,
        '2026-07-01T08:00:00Z'::timestamptz,
        '2026-07-03T00:00:00Z'::timestamptz,
        'order_items', 'update'
      );
    `);
    // Correction events participate in sourceToken; post-publish arrivals
    // fail closed as STALE. PENDING_CORRECTION remains a typed miss in the
    // RPC/decoder contract (unit-tested).
    const pending = await readFreshPublishedSkuForecast(
      {
        tenant: TENANT_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      adminClient(),
    );
    expect(pending.disposition).toBe("STALE");
    expect(pending.dailyDemand).toBeNull();
    expect(pending.m7NumericEligible).toBe(false);

    const absent = await readFreshPublishedSkuForecast(
      {
        tenant: TENANT_B,
        locationId: LOCATION_B,
        variantId: VARIANT_B,
      },
      adminClient(),
    );
    expect(absent.disposition).toBe("ABSENT");
    expect(absent.dailyDemand).toBeNull();
  }, 180000);

  it("rejects foreign grain mismatch in decoded response", async () => {
    await persistAndPublish({
      reproducibilityFingerprint: "livefrgn01",
    });
    const foreignClient: FreshPublishedForecastClient = {
      rpc: async () => {
        const real = adminClient();
        const result = await real.rpc("read_fresh_published_sku_forecast", {
          p_organization_id: ORG_A,
          p_store_id: STORE_A,
          p_location_id: LOCATION_A,
          p_variant_id: VARIANT_A,
        });
        const data = result.data as Record<string, unknown>;
        return {
          data: {
            ...data,
            grain: {
              organizationId: ORG_B,
              storeId: STORE_B,
              locationId: LOCATION_B,
              variantId: VARIANT_B,
            },
          },
          error: null,
        };
      },
    };

    await expect(
      readFreshPublishedSkuForecast(
        {
          tenant: TENANT_A,
          locationId: LOCATION_A,
          variantId: VARIANT_A,
        },
        foreignClient,
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastValidationError);
  }, 120000);
});
