import { execFile, spawn, type ChildProcess } from "node:child_process";
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

import { loadForecastSkuDemand } from "@/lib/persistence/load-forecast-sku-demand";
import {
  ForecastPersistStaleTokenError,
  persistForecastSkuDemand,
  persistLoadedForecastSkuDemand,
} from "@/lib/persistence/persist-forecast-sku-demand";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M6 P3c — local PG17 live adapter verification.
 * loadForecastSkuDemand → persist_forecast_sku_demand_result.
 * Local Supabase only. No hosted, workers, HTTP, publication, or canary.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "61009000-0000-4000-8000-000000000001";
const ORG_B = "61009000-0000-4000-8000-000000000011";
const STORE_A = "61009000-0000-4000-8000-000000000002";
const STORE_B = "61009000-0000-4000-8000-000000000012";
const LOCATION_A = "61009000-0000-4000-8000-000000000003";
const LOCATION_B = "61009000-0000-4000-8000-000000000013";
const PRODUCT_A = "61009000-0000-4000-8000-000000000004";
const PRODUCT_B = "61009000-0000-4000-8000-000000000014";
const VARIANT_A = "61009000-0000-4000-8000-000000000005";
const VARIANT_B = "61009000-0000-4000-8000-000000000015";
const USER_A = "61009000-0000-4000-8000-000000000007";
const ORDER_A = "61009000-0000-4000-8000-000000000021";
const ITEM_A = "61009000-0000-4000-8000-000000000022";
const TENANTS = `(${quote(ORG_A)}::uuid, ${quote(ORG_B)}::uuid)`;
const AS_OF = "2026-07-01";
const LOOKBACK = 7;

const TENANT: TenantContext = {
  userId: USER_A,
  organizationId: ORG_A,
  role: "owner",
  storeId: STORE_A,
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

interface Session {
  run: (sql: string, marker: string) => Promise<void>;
  close: () => Promise<void>;
}

async function openSession(): Promise<Session> {
  const child: ChildProcess = spawn("psql", psqlArgs(), {
    env: databaseEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<void>((resolve) => {
    child.on("exit", () => resolve());
  });

  return {
    async run(sql, marker) {
      child.stdin?.write(`${sql}\nselect '${marker}';\n`);
      const started = Date.now();
      while (!output.includes(marker)) {
        if (child.exitCode !== null || Date.now() - started > 60000) {
          throw new Error(`session did not reach ${marker}: ${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    async close() {
      child.stdin?.end();
      await exited;
    },
  };
}

async function wipeForecastHistory(): Promise<void> {
  await psql(`
    truncate table public.sku_forecasts, public.forecast_runs;
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
      'authenticated', 'authenticated', 'm6-p3c@example.invalid', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    ) on conflict (id) do nothing;

    insert into public.organizations (id, name, default_currency, timezone) values
      (${quote(ORG_A)}::uuid, 'M6 P3c A', 'USD', 'UTC'),
      (${quote(ORG_B)}::uuid, 'M6 P3c B', 'USD', 'UTC')
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
      'p3c-orders',
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, null, null,
      ${quote(AS_OF)}::date, 'orders', 'complete', 'verified_merchant_attestation',
      'merchant:attestation',
      '2026-07-02T00:00:00Z'::timestamptz,
      '2026-07-02T00:00:00Z'::timestamptz,
      1, null, null, 'p3c-orders', null, ${quote(USER_A)}::uuid, null,
      'merchant_day_stream_closure:p3c-orders'
    ),
    (
      'p3c-returns',
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
      ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
      ${quote(AS_OF)}::date, 'returns', 'complete', 'verified_merchant_attestation',
      'merchant:attestation',
      '2026-07-02T00:00:00Z'::timestamptz,
      '2026-07-02T00:00:00Z'::timestamptz,
      1, null, null, 'p3c-returns', null, ${quote(USER_A)}::uuid, null,
      'merchant_day_stream_closure:p3c-returns'
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

function baseInput() {
  return {
    tenant: TENANT,
    locationId: LOCATION_A,
    variantId: VARIANT_A,
    forecastAsOf: AS_OF,
    lookbackDays: LOOKBACK,
  };
}

describeLive("M6 P3c forecast persist adapter (live)", () => {
  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");
    await ensureLocalSupabaseEnv();

    const def = await psql(`
      select to_regprocedure(
        'public.persist_forecast_sku_demand_result(uuid,uuid,uuid,uuid,date,integer,text,jsonb)'
      )::text
    `);
    expect(def).toContain("persist_forecast_sku_demand_result");

    await wipeForecastHistory();
    await clearCommerceAndCorrections();
    await seedParentsAndEvidence();
  }, 180000);

  beforeEach(async () => {
    await wipeForecastHistory();
    await clearCommerceAndCorrections();
    await seedCommerce();
  }, 120000);

  afterAll(async () => {
    await wipeForecastHistory();
    await clearCommerceAndCorrections();
  }, 180000);

  it("successfully persists a loaded forecast as historical-only", async () => {
    const client = createSupabaseAdminClient();
    const result = await persistForecastSkuDemand(baseInput(), client);

    expect(result.disposition).toBe("created");
    expect(result.published).toBe(false);
    expect(result.m7Eligible).toBe(false);
    expect(result.persistClaimsPostCommitFreshness).toBe(false);
    expect(result.status).toBe("completed");
    expect(result.sourceToken).toMatch(/^[a-f0-9]{32}$/i);
    expect(result.forecast).toBe(result.load.forecast);

    expect(
      await psql(`
        select count(*)::text from public.forecast_runs
        where organization_id = ${quote(ORG_A)}::uuid
          and id = ${quote(result.forecastRunId)}::uuid
      `),
    ).toBe("1");
    expect(
      await psql(`
        select count(*)::text from public.sku_forecasts
        where forecast_run_id = ${quote(result.forecastRunId)}::uuid
      `),
    ).toBe("1");
  }, 120000);

  it("stores withheld/null dailyDemand without inventing demand", async () => {
    const client = createSupabaseAdminClient();
    const result = await persistForecastSkuDemand(baseInput(), client);

    expect(result.forecast.dailyDemand).toBeNull();
    expect(
      await psql(`
        select coalesce(daily_demand::text, 'null')
        from public.sku_forecasts
        where forecast_run_id = ${quote(result.forecastRunId)}::uuid
      `),
    ).toBe("null");
  }, 120000);

  it("replays identical persist idempotently", async () => {
    const client = createSupabaseAdminClient();
    const first = await persistForecastSkuDemand(baseInput(), client);
    const second = await persistForecastSkuDemand(baseInput(), client);

    expect(first.disposition).toBe("created");
    expect(second.disposition).toBe("replayed");
    expect(second.forecastRunId).toBe(first.forecastRunId);
    expect(second.skuForecastId).toBe(first.skuForecastId);
    expect(
      await psql(`
        select count(*)::text from public.forecast_runs
        where organization_id = ${quote(ORG_A)}::uuid
      `),
    ).toBe("1");
  }, 120000);

  it("creates new history when sourceToken changes", async () => {
    const client = createSupabaseAdminClient();
    const first = await persistForecastSkuDemand(baseInput(), client);

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

    const second = await persistForecastSkuDemand(baseInput(), client);

    expect(second.disposition).toBe("created");
    expect(second.sourceToken).not.toBe(first.sourceToken);
    expect(second.forecastRunId).not.toBe(first.forecastRunId);
    expect(
      await psql(`
        select count(*)::text from public.forecast_runs
        where organization_id = ${quote(ORG_A)}::uuid
      `),
    ).toBe("2");
  }, 120000);

  it("fails closed on stale snapshot without silent retry", async () => {
    const client = createSupabaseAdminClient();
    const loaded = await loadForecastSkuDemand(baseInput(), client);
    const staleToken = loaded.provenance.sourceToken;

    await psql(`
      insert into public.forecast_coverage_correction_events (
        organization_id, store_id, stream, local_date,
        location_id, variant_id, business_at, arrived_at,
        source_table, source_op
      ) values (
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        'orders', ${quote(AS_OF)}::date,
        null, null,
        '2026-07-01T09:00:00Z'::timestamptz,
        '2026-07-03T01:00:00Z'::timestamptz,
        'order_items', 'update'
      );
    `);

    await expect(
      persistLoadedForecastSkuDemand(loaded, client),
    ).rejects.toBeInstanceOf(ForecastPersistStaleTokenError);

    expect(
      await psql(`
        select count(*)::text from public.forecast_runs
        where organization_id = ${quote(ORG_A)}::uuid
          and source_token = ${quote(staleToken)}
      `),
    ).toBe("0");

    // Fresh load+persist after stale failure succeeds as new history.
    const fresh = await persistForecastSkuDemand(baseInput(), client);
    expect(fresh.disposition).toBe("created");
    expect(fresh.sourceToken).not.toBe(staleToken);
  }, 120000);

  it("handles concurrent persist calls with exactly one durable result", async () => {
    const client = createSupabaseAdminClient();
    const loaded = await loadForecastSkuDemand(baseInput(), client);

    const [a, b] = await Promise.all([
      persistLoadedForecastSkuDemand(loaded, client),
      persistLoadedForecastSkuDemand(loaded, client),
    ]);

    const dispositions = [a.disposition, b.disposition].sort();
    expect(dispositions).toEqual(["created", "replayed"]);
    expect(a.forecastRunId).toBe(b.forecastRunId);
    expect(a.skuForecastId).toBe(b.skuForecastId);
    expect(
      await psql(`
        select count(*)::text from public.forecast_runs
        where organization_id = ${quote(ORG_A)}::uuid
          and source_token = ${quote(loaded.provenance.sourceToken)}
      `),
    ).toBe("1");
  }, 120000);

  it("keeps org B commerce available while an org A persist transaction is open", async () => {
    const client = createSupabaseAdminClient();
    const loaded = await loadForecastSkuDemand(baseInput(), client);
    const holder = await openSession();

    try {
      await holder.run(
        `
          begin;
          set role service_role;
          select public.persist_forecast_sku_demand_result(
            ${quote(ORG_A)}::uuid,
            ${quote(STORE_A)}::uuid,
            ${quote(LOCATION_A)}::uuid,
            ${quote(VARIANT_A)}::uuid,
            ${quote(AS_OF)}::date,
            ${LOOKBACK},
            ${quote(loaded.provenance.sourceToken)},
            ${quote(JSON.stringify({
              algorithmVersion: loaded.forecast.algorithmVersion,
              configurationVersion: loaded.forecast.configurationVersion,
              algorithmVersions: loaded.forecast.algorithmVersions,
              organizationId: ORG_A,
              storeId: STORE_A,
              locationId: LOCATION_A,
              variantId: VARIANT_A,
              forecastAsOf: AS_OF,
              dailyDemand: loaded.forecast.dailyDemand,
              mode: loaded.forecast.mode,
              dataSufficiency: loaded.forecast.dataSufficiency,
              confidence: loaded.forecast.confidence,
              weightedDailyDemand: loaded.forecast.weightedDailyDemand,
              trendApplied: loaded.forecast.trendApplied,
              trendAdjustedDailyDemand:
                loaded.forecast.trendAdjustedDailyDemand,
              activeWindows: loaded.forecast.activeWindows,
              quality: loaded.forecast.quality,
              horizons: loaded.forecast.horizons,
              reproducibilityFingerprint:
                loaded.forecast.reproducibilityFingerprint,
              reasonCodes: loaded.forecast.reasonCodes,
              classifiedDays: loaded.forecast.classifiedDays,
              parameters: {},
              provenance: { source: "p3c-live" },
            }))}::jsonb
          );
          select pg_catalog.pg_sleep(2);
        `,
        "persist-held",
      );

      const started = Date.now();
      await psql(`
        insert into public.orders (
          id, organization_id, store_id, status, ordered_at, currency, source
        ) values (
          '61009000-0000-4000-8000-000000000031'::uuid,
          ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid,
          'completed', '2026-07-01T12:00:00Z'::timestamptz, 'USD', 'csv'
        );
      `);
      const elapsedMs = Date.now() - started;

      await holder.run("commit;", "persist-done");
      expect(elapsedMs).toBeLessThan(1500);
      void client;
    } finally {
      await holder.close();
    }
  }, 120000);
});
