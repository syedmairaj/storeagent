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
  ForecastPublishForeignGrainError,
  ForecastPublishStaleTokenError,
  publishForecastSkuDemand,
  type ForecastPublishClient,
} from "@/lib/persistence/publish-forecast-sku-demand";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TenantContext } from "@/lib/tenancy/types";

function adminPublishClient(): ForecastPublishClient {
  return createSupabaseAdminClient() as unknown as ForecastPublishClient;
}

/**
 * M6 P3d.2 — local PG17 live publication adapter verification.
 * publishForecastSkuDemand → publish_sku_forecast only.
 * Local Supabase only. No hosted, workers, HTTP, M5/M7, or canary.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "6100c000-0000-4000-8000-000000000001";
const ORG_B = "6100c000-0000-4000-8000-000000000011";
const STORE_A = "6100c000-0000-4000-8000-000000000002";
const STORE_B = "6100c000-0000-4000-8000-000000000012";
const LOCATION_A = "6100c000-0000-4000-8000-000000000003";
const LOCATION_B = "6100c000-0000-4000-8000-000000000013";
const PRODUCT_A = "6100c000-0000-4000-8000-000000000004";
const PRODUCT_B = "6100c000-0000-4000-8000-000000000014";
const VARIANT_A = "6100c000-0000-4000-8000-000000000005";
const VARIANT_B = "6100c000-0000-4000-8000-000000000015";
const USER_A = "6100c000-0000-4000-8000-000000000007";
const ORDER_A = "6100c000-0000-4000-8000-000000000021";
const ITEM_A = "6100c000-0000-4000-8000-000000000022";
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

function assertLocalSupabaseApiUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Live suite requires a local Supabase API URL.");
  }

  const host = parsed.hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  if (!local || parsed.protocol !== "http:") {
    throw new Error(
      `Live suite refuses non-local Supabase API URL host "${host}".`,
    );
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
    if (!match) {
      continue;
    }
    values.set(match[1], match[2].replace(/^"|"$/g, ""));
  }

  const apiUrl = values.get("API_URL");
  const serviceKey = values.get("SERVICE_ROLE_KEY");
  const anonKey = values.get("ANON_KEY") ?? values.get("PUBLISHABLE_KEY");

  if (!apiUrl || !serviceKey || !anonKey) {
    throw new Error(
      "Live suite could not resolve local Supabase API_URL / keys.",
    );
  }

  assertLocalSupabaseApiUrl(apiUrl);
  process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
}

async function wipePublicationAndHistory(): Promise<void> {
  await psql(`
    truncate table public.sku_forecast_current,
      public.sku_forecast_publications,
      public.sku_forecasts,
      public.forecast_runs
    cascade;
  `);
}

async function clearCommerceAndCorrections(): Promise<void> {
  await psql(`
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
    delete from public.return_refunds where organization_id in ${TENANTS};
    delete from public.order_items where organization_id in ${TENANTS};
    delete from public.orders where organization_id in ${TENANTS};
  `);
}

async function seedParentsAndEvidence(): Promise<void> {
  await psql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      ${quote(USER_A)}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', 'm6-p3d2@example.invalid', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    ) on conflict (id) do nothing;

    insert into public.organizations (id, name, default_currency, timezone) values
      (${quote(ORG_A)}::uuid, 'M6 P3d2 A', 'USD', 'UTC'),
      (${quote(ORG_B)}::uuid, 'M6 P3d2 B', 'USD', 'UTC')
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
      'p3d2-orders',
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, null, null,
      ${quote(AS_OF)}::date, 'orders', 'complete', 'verified_merchant_attestation',
      'merchant:attestation',
      '2026-07-02T00:00:00Z'::timestamptz,
      '2026-07-02T00:00:00Z'::timestamptz,
      1, null, null, 'p3d2-orders', null, ${quote(USER_A)}::uuid, null,
      'merchant_day_stream_closure:p3d2-orders'
    ),
    (
      'p3d2-returns',
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date, 'returns', 'complete', 'verified_merchant_attestation',
      'merchant:attestation',
      '2026-07-02T00:00:00Z'::timestamptz,
      '2026-07-02T00:00:00Z'::timestamptz,
      1, null, null, 'p3d2-returns', null, ${quote(USER_A)}::uuid, null,
      'merchant_day_stream_closure:p3d2-returns'
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
    reproducibilityFingerprint: "p3d2live01",
    reasonCodes: [],
    classifiedDays: [],
    parameters: {},
    provenance: { source: "p3d2-live" },
    ...overrides,
  };
  return quote(JSON.stringify(body));
}

async function persistRun(
  payloadOverrides: Record<string, unknown> = {},
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

  return psql(`
    set role service_role;
    select public.persist_forecast_sku_demand_result(
      ${quote(ORG_A)}::uuid,
      ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid,
      ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date,
      ${LOOKBACK},
      ${quote(token)},
      ${basePayload(payloadOverrides)}::jsonb
    )->>'forecastRunId'
  `);
}

function publishInput(forecastRunId: string, tenant: TenantContext = TENANT_A) {
  return {
    tenant,
    locationId: tenant === TENANT_B ? LOCATION_B : LOCATION_A,
    variantId: tenant === TENANT_B ? VARIANT_B : VARIANT_A,
    forecastRunId,
  };
}

describeLive("M6 P3d.2 forecast publish adapter (live)", () => {
  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");
    await ensureLocalSupabaseEnv();

    const def = await psql(`
      select to_regprocedure('public.publish_sku_forecast(uuid)')::text
    `);
    expect(def).toContain("publish_sku_forecast");

    await wipePublicationAndHistory();
    await clearCommerceAndCorrections();
    await seedParentsAndEvidence();
  }, 180000);

  beforeEach(async () => {
    await wipePublicationAndHistory();
    await clearCommerceAndCorrections();
    await seedCommerce();
  }, 120000);

  afterAll(async () => {
    await wipePublicationAndHistory();
    await clearCommerceAndCorrections();
  }, 180000);

  it("successfully publishes a persisted run as current without M7 eligibility", async () => {
    const runId = await persistRun({
      reproducibilityFingerprint: "p3d2pub01",
    });
    const client = adminPublishClient();
    const result = await publishForecastSkuDemand(
      publishInput(runId),
      client,
    );

    expect(result.disposition).toBe("published");
    expect(result.outcome).toBe("published");
    expect(result.published).toBe(true);
    expect(result.isCurrent).toBe(true);
    expect(result.pointerAdvanced).toBe(true);
    expect(result.m7Eligible).toBe(false);
    expect(result.publicationClaimsPostCommitFreshness).toBe(false);
    expect(result.forecastRunId).toBe(runId);
    expect(result.freshnessLimitation).toMatch(/not prove/i);

    expect(
      await psql(`
        select forecast_run_id::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
          and variant_id = ${quote(VARIANT_A)}::uuid
      `),
    ).toBe(runId);
    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_publications
        where forecast_run_id = ${quote(runId)}::uuid
          and outcome = 'published'
      `),
    ).toBe("1");
  }, 120000);

  it("replays the same published run without moving the pointer backward", async () => {
    const runId = await persistRun({
      reproducibilityFingerprint: "p3d2rpl01",
    });
    const client = adminPublishClient();

    const first = await publishForecastSkuDemand(publishInput(runId), client);
    const second = await publishForecastSkuDemand(publishInput(runId), client);

    expect(first.disposition).toBe("published");
    expect(second.disposition).toBe("replayed");
    expect(second.published).toBe(true);
    expect(second.isCurrent).toBe(false);
    expect(second.pointerAdvanced).toBe(false);
    expect(second.publicationId).toBe(first.publicationId);

    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_publications
        where forecast_run_id = ${quote(runId)}::uuid
          and outcome = 'published'
      `),
    ).toBe("1");
    expect(
      await psql(`
        select forecast_run_id::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
          and variant_id = ${quote(VARIANT_A)}::uuid
      `),
    ).toBe(runId);
  }, 120000);

  it("withholds null demand and fails closed on stale source without claiming current", async () => {
    const nullRun = await persistRun({
      reproducibilityFingerprint: "p3d2null1",
      dailyDemand: null,
      mode: "unavailable",
      dataSufficiency: "insufficient",
      confidence: "none",
      weightedDailyDemand: null,
    });
    const client = adminPublishClient();

    const withheld = await publishForecastSkuDemand(
      publishInput(nullRun),
      client,
    );
    expect(withheld.disposition).toBe("withheld");
    expect(withheld.published).toBe(false);
    expect(withheld.isCurrent).toBe(false);
    expect(withheld.m7Eligible).toBe(false);
    expect(["NULL_DEMAND", "MODE_UNAVAILABLE", "INSUFFICIENT_EVIDENCE"]).toContain(
      withheld.withholdReason,
    );
    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
      `),
    ).toBe("0");

    // Change source token so a new persist key is available after the null run.
    await psql(`
      update public.order_items
      set quantity = quantity + 1
      where id = ${quote(ITEM_A)}::uuid;
    `);

    const freshRun = await persistRun({
      reproducibilityFingerprint: "p3d2stale1",
      dailyDemand: 3,
      mode: "standard",
      dataSufficiency: "sufficient",
      confidence: "medium",
      weightedDailyDemand: 3,
    });

    // Invalidate the just-persisted token before publish.
    await psql(`
      update public.order_items
      set quantity = quantity + 1
      where id = ${quote(ITEM_A)}::uuid;
    `);

    await expect(
      publishForecastSkuDemand(publishInput(freshRun), client),
    ).rejects.toBeInstanceOf(ForecastPublishStaleTokenError);

    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
      `),
    ).toBe("0");
    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_publications
        where forecast_run_id = ${quote(freshRun)}::uuid
          and outcome = 'withheld'
          and withhold_reason = 'STALE_SOURCE_TOKEN'
      `),
    ).toBe("1");
  }, 120000);

  it("rejects foreign-tenant grain for another org's forecastRunId", async () => {
    const runId = await persistRun({
      reproducibilityFingerprint: "p3d2frgn1",
    });
    const client = adminPublishClient();

    await expect(
      publishForecastSkuDemand(publishInput(runId, TENANT_B), client),
    ).rejects.toBeInstanceOf(ForecastPublishForeignGrainError);

    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_publications
        where organization_id = ${quote(ORG_A)}::uuid
      `),
    ).toBe("0");
    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
      `),
    ).toBe("0");
  }, 120000);

  it("keeps pointer stable across replay after a successful publish", async () => {
    const runId = await persistRun({
      reproducibilityFingerprint: "p3d2ptr01",
    });
    const client = adminPublishClient();
    await publishForecastSkuDemand(publishInput(runId), client);

    const before = await psql(`
      select publication_id::text || '|' || forecast_run_id::text || '|' || source_token
      from public.sku_forecast_current
      where organization_id = ${quote(ORG_A)}::uuid
        and variant_id = ${quote(VARIANT_A)}::uuid
    `);

    await publishForecastSkuDemand(publishInput(runId), client);

    const after = await psql(`
      select publication_id::text || '|' || forecast_run_id::text || '|' || source_token
      from public.sku_forecast_current
      where organization_id = ${quote(ORG_A)}::uuid
        and variant_id = ${quote(VARIANT_A)}::uuid
    `);

    expect(after).toBe(before);
  }, 120000);

  it("replays historical A after B supersedes without moving pointer back", async () => {
    const client = adminPublishClient();

    const runA = await persistRun({
      reproducibilityFingerprint: "p3d2histA",
      dailyDemand: 2,
      configurationVersion: "forecast-config-v1-hist-a",
    });
    const publishedA = await publishForecastSkuDemand(
      publishInput(runA),
      client,
    );
    expect(publishedA.disposition).toBe("published");
    expect(publishedA.isCurrent).toBe(true);
    expect(publishedA.m7Eligible).toBe(false);
    expect(
      await psql(`
        select forecast_run_id::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
          and variant_id = ${quote(VARIANT_A)}::uuid
      `),
    ).toBe(runA);

    // New source token so B is a distinct eligible persist under the same grain.
    // Clear correction outbox so B remains publication-eligible (same pattern as
    // m6-forecast-publication-concurrency.live.test.ts).
    await psql(`
      update public.order_items
      set quantity = quantity + 1
      where id = ${quote(ITEM_A)}::uuid;
      delete from public.forecast_coverage_correction_events
      where organization_id in ${TENANTS};
    `);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const runB = await persistRun({
      reproducibilityFingerprint: "p3d2histB",
      dailyDemand: 4,
      configurationVersion: "forecast-config-v1-hist-b",
      weightedDailyDemand: 4,
    });
    expect(runB).not.toBe(runA);

    const publishedB = await publishForecastSkuDemand(
      publishInput(runB),
      client,
    );
    expect(publishedB.disposition).toBe("published");
    expect(publishedB.isCurrent).toBe(true);
    expect(publishedB.m7Eligible).toBe(false);
    expect(publishedB.supersedesPublicationId).toBe(publishedA.publicationId);
    expect(
      await psql(`
        select forecast_run_id::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
          and variant_id = ${quote(VARIANT_A)}::uuid
      `),
    ).toBe(runB);

    const replayA = await publishForecastSkuDemand(
      publishInput(runA),
      client,
    );
    expect(replayA.disposition).toBe("replayed");
    expect(replayA.outcome).toBe("published");
    expect(replayA.published).toBe(true);
    expect(replayA.isCurrent).toBe(false);
    expect(replayA.pointerAdvanced).toBe(false);
    expect(replayA.m7Eligible).toBe(false);
    expect(replayA.publicationId).toBe(publishedA.publicationId);

    expect(
      await psql(`
        select forecast_run_id::text from public.sku_forecast_current
        where organization_id = ${quote(ORG_A)}::uuid
          and variant_id = ${quote(VARIANT_A)}::uuid
      `),
    ).toBe(runB);
    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_publications
        where forecast_run_id = ${quote(runA)}::uuid
          and outcome = 'published'
      `),
    ).toBe("1");
    expect(
      await psql(`
        select count(*)::text from public.sku_forecast_publications
        where forecast_run_id = ${quote(runB)}::uuid
          and outcome = 'published'
      `),
    ).toBe("1");
  }, 120000);
});
