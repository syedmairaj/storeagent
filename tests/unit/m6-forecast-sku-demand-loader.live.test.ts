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

/**
 * M6 P2c.3 — local PG17 end-to-end:
 * forecast_sku_demand_source_snapshot → loadForecastSkuDemand →
 * buildForecastSkuDemandInput → forecastSkuDemand.
 *
 * Local Supabase only (127.0.0.1). No hosted calls, workers, HTTP, or canary ops.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "61008000-0000-4000-8000-000000000001";
const ORG_B = "61008000-0000-4000-8000-000000000011";
const STORE_A = "61008000-0000-4000-8000-000000000002";
const STORE_B = "61008000-0000-4000-8000-000000000012";
const LOCATION_A = "61008000-0000-4000-8000-000000000003";
const LOCATION_B = "61008000-0000-4000-8000-000000000013";
const LOCATION_A2 = "61008000-0000-4000-8000-000000000033";
const PRODUCT_A = "61008000-0000-4000-8000-000000000004";
const PRODUCT_B = "61008000-0000-4000-8000-000000000014";
const VARIANT_A = "61008000-0000-4000-8000-000000000005";
const VARIANT_A2 = "61008000-0000-4000-8000-000000000015";
const VARIANT_B = "61008000-0000-4000-8000-000000000025";
const USER_A = "61008000-0000-4000-8000-000000000007";
const TENANTS = `(${quote(ORG_A)}::uuid, ${quote(ORG_B)}::uuid)`;

const AS_OF = "2026-08-15";
const LOOKBACK = 3;
const DAY_ZERO = "2026-08-15";
const DAY_PRIOR = "2026-08-14";
const DAY_STOCKOUT = "2026-08-13";

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertLocalSupabaseApiUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "Live suite requires a local Supabase API URL; received unparseable value.",
    );
  }

  const host = parsed.hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  if (!local || parsed.protocol !== "http:") {
    throw new Error(
      `Live suite refuses non-local Supabase API URL host "${host}" (protocol ${parsed.protocol}).`,
    );
  }
}

function assertLocalDbHost(): void {
  expect(psqlArgs().slice(0, 4)).toEqual([
    "-h",
    "127.0.0.1",
    "-p",
    "55322",
  ]);
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
      "Live suite could not resolve local Supabase API_URL / keys from supabase status.",
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

async function clearCommerceAndCorrections(): Promise<void> {
  // Evidence is normally append-only; local live cleanup disables immutability
  // triggers only for suite-owned p2c3_* rows so each case starts clean.
  await psql(`
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
    delete from public.return_refunds where organization_id in ${TENANTS};
    delete from public.order_items where organization_id in ${TENANTS};
    delete from public.orders where organization_id in ${TENANTS};
    alter table public.inventory_snapshots
      disable trigger inventory_snapshots_prevent_delete;
    delete from public.inventory_snapshots where organization_id in ${TENANTS};
    alter table public.inventory_snapshots
      enable trigger inventory_snapshots_prevent_delete;

    alter table public.forecast_day_coverage_evidence
      disable trigger forecast_day_coverage_evidence_immutable_body;
    alter table public.forecast_day_promotion_evidence
      disable trigger forecast_day_promotion_evidence_immutable_body;
    delete from public.forecast_day_coverage_evidence
    where organization_id in ${TENANTS}
      and evidence_id like 'p2c3-%';
    delete from public.forecast_day_promotion_evidence
    where organization_id in ${TENANTS}
      and evidence_id like 'p2c3-%';
    alter table public.forecast_day_coverage_evidence
      enable trigger forecast_day_coverage_evidence_immutable_body;
    alter table public.forecast_day_promotion_evidence
      enable trigger forecast_day_promotion_evidence_immutable_body;
  `);
}

async function ensureParents(): Promise<void> {
  await psql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      ${quote(USER_A)}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', 'm6-p2c3@example.invalid', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    ) on conflict (id) do nothing;

    insert into public.organizations (id, name, default_currency, timezone) values
      (${quote(ORG_A)}::uuid, 'M6 P2c3 A', 'USD', 'UTC'),
      (${quote(ORG_B)}::uuid, 'M6 P2c3 B', 'USD', 'UTC')
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
      (${quote(LOCATION_A2)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, 'A2', 'active'),
      (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active')
    on conflict (id) do nothing;

    insert into public.products (id, organization_id, store_id, title, status) values
      (${quote(PRODUCT_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, 'A', 'active'),
      (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active')
    on conflict (id) do nothing;

    insert into public.product_variants (id, organization_id, store_id, product_id, sku, status) values
      (${quote(VARIANT_A)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, ${quote(PRODUCT_A)}::uuid, 'A1', 'active'),
      (${quote(VARIANT_A2)}::uuid, ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, ${quote(PRODUCT_A)}::uuid, 'A2', 'active'),
      (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'B1', 'active')
    on conflict (id) do nothing;
  `);
}

async function insertEvidence(args: {
  evidenceId: string;
  stream: "orders" | "returns";
  localDate: string;
  locationId: string | null;
  variantId: string | null;
  coverage: "complete" | "partial";
  asOf: string;
}): Promise<void> {
  const locationSql =
    args.locationId === null ? "null" : `${quote(args.locationId)}::uuid`;
  const variantSql =
    args.variantId === null ? "null" : `${quote(args.variantId)}::uuid`;

  const closureSql =
    args.coverage === "complete"
      ? quote(`merchant_day_stream_closure:${args.evidenceId}`)
      : "null";

  await psql(`
    insert into public.forecast_day_coverage_evidence (
      evidence_id, organization_id, store_id, location_id, variant_id,
      local_date, stream, coverage, trust, source,
      as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
      idempotency_key, integration_id, actor_user_id, provider, closure_id
    ) values (
      ${quote(args.evidenceId)},
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
      ${locationSql}, ${variantSql},
      ${quote(args.localDate)}::date, ${quote(args.stream)}, ${quote(args.coverage)},
      'verified_merchant_attestation', 'merchant:attestation',
      ${quote(args.asOf)}::timestamptz,
      ${quote(args.asOf)}::timestamptz,
      1, null, null,
      ${quote(`p2c3-${args.evidenceId}`)}, null, ${quote(USER_A)}::uuid, null,
      ${closureSql}
    ) on conflict (evidence_id) do nothing;
  `);
}

async function insertPromotion(args: {
  evidenceId: string;
  localDate: string;
  state: "none" | "promotion";
}): Promise<void> {
  await psql(`
    insert into public.forecast_day_promotion_evidence (
      evidence_id, organization_id, store_id, location_id, variant_id,
      local_date, state, trust, source, observed_at, version,
      invalidated_at, supersedes_evidence_id, idempotency_key,
      integration_id, actor_user_id, provider
    ) values (
      ${quote(args.evidenceId)},
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, null, null,
      ${quote(args.localDate)}::date, ${quote(args.state)},
      'verified_merchant_attestation', 'merchant:attestation',
      '2026-08-16T00:00:00Z'::timestamptz, 1,
      null, null, ${quote(`p2c3-promo-${args.evidenceId}`)},
      null, ${quote(USER_A)}::uuid, null
    ) on conflict (evidence_id) do nothing;
  `);
}

async function seedBaselineCommerce(): Promise<void> {
  // Day with positive sales + available stock.
  await psql(`
    insert into public.orders (
      id, organization_id, store_id, status, ordered_at, currency, source
    ) values (
      '61008000-0000-4000-8000-000000000021'::uuid,
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, 'completed',
      '2026-08-15T12:00:00Z'::timestamptz, 'USD', 'csv'
    );
    insert into public.order_items (
      id, organization_id, store_id, order_id, variant_id, location_id, quantity
    ) values (
      '61008000-0000-4000-8000-000000000022'::uuid,
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
      '61008000-0000-4000-8000-000000000021'::uuid,
      ${quote(VARIANT_A)}::uuid, ${quote(LOCATION_A)}::uuid, 2
    );

    -- Known-zero day: complete coverage + available stock, no sales.
    insert into public.inventory_snapshots (
      organization_id, store_id, location_id, variant_id,
      observed_at, available_quantity, source
    ) values
      (
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
        '2026-08-15T18:00:00Z'::timestamptz, 8, 'csv'
      ),
      (
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
        '2026-08-14T18:00:00Z'::timestamptz, 5, 'csv'
      ),
      (
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        ${quote(LOCATION_A)}::uuid, ${quote(VARIANT_A)}::uuid,
        '2026-08-13T18:00:00Z'::timestamptz, 0, 'csv'
      );

    -- Foreign org commerce must never leak.
    insert into public.orders (
      id, organization_id, store_id, status, ordered_at, currency, source
    ) values (
      '61008000-0000-4000-8000-000000000091'::uuid,
      ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'completed',
      '2026-08-15T12:00:00Z'::timestamptz, 'USD', 'csv'
    );
    insert into public.order_items (
      id, organization_id, store_id, order_id, variant_id, location_id, quantity
    ) values (
      '61008000-0000-4000-8000-000000000092'::uuid,
      ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid,
      '61008000-0000-4000-8000-000000000091'::uuid,
      ${quote(VARIANT_B)}::uuid, ${quote(LOCATION_B)}::uuid, 99
    );

    -- Same-store foreign location/variant.
    insert into public.orders (
      id, organization_id, store_id, status, ordered_at, currency, source
    ) values (
      '61008000-0000-4000-8000-000000000093'::uuid,
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid, 'completed',
      '2026-08-15T13:00:00Z'::timestamptz, 'USD', 'csv'
    );
    insert into public.order_items (
      id, organization_id, store_id, order_id, variant_id, location_id, quantity
    ) values (
      '61008000-0000-4000-8000-000000000094'::uuid,
      ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
      '61008000-0000-4000-8000-000000000093'::uuid,
      ${quote(VARIANT_A2)}::uuid, ${quote(LOCATION_A2)}::uuid, 7
    );

    -- Capture triggers enqueue corrections; clear so tests control pending state.
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
  `);

  for (const day of [DAY_ZERO, DAY_PRIOR, DAY_STOCKOUT]) {
    await insertEvidence({
      evidenceId: `p2c3-orders-${day}`,
      stream: "orders",
      localDate: day,
      locationId: null,
      variantId: null,
      coverage: "complete",
      asOf: "2026-08-16T00:00:00Z",
    });
    await insertEvidence({
      evidenceId: `p2c3-returns-${day}`,
      stream: "returns",
      localDate: day,
      locationId: LOCATION_A,
      variantId: VARIANT_A,
      coverage: "complete",
      asOf: "2026-08-16T00:00:00Z",
    });
    await insertPromotion({
      evidenceId: `p2c3-promo-${day}`,
      localDate: day,
      state: "none",
    });
  }
}

const TENANT = {
  userId: USER_A,
  organizationId: ORG_A,
  role: "owner" as const,
  storeId: STORE_A,
};

describeLive("M6 P2c.3 forecast sku demand loader live E2E", () => {
  beforeAll(async () => {
    assertLocalDbHost();
    await ensureLocalSupabaseEnv();
    await psql("select 1");
    await ensureParents();
  }, 180000);

  beforeEach(async () => {
    await clearCommerceAndCorrections();
    await seedBaselineCommerce();
  }, 120000);

  afterAll(async () => {
    await clearCommerceAndCorrections();
  }, 120000);

  it("loads genuine RPC JSON through the gated loader with grain isolation", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const { loadForecastSkuDemand } = await import(
      "@/lib/persistence/load-forecast-sku-demand"
    );

    const result = await loadForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastAsOf: AS_OF,
        lookbackDays: LOOKBACK,
      },
      createSupabaseAdminClient(),
    );

    expect(result.grain).toEqual({
      organizationId: ORG_A,
      storeId: STORE_A,
      locationId: LOCATION_A,
      variantId: VARIANT_A,
    });
    expect(result.provenance.rpc).toBe(
      "forecast_sku_demand_source_snapshot",
    );
    expect(result.provenance.sourceToken).toMatch(/^[a-f0-9]{32}$/i);
    expect(result.provenance.trustedCompleteDatesUsed).toBe(false);
    expect(result.provenance.sourceTokenFreshness).toMatch(
      /does not prove currency/i,
    );
    expect(result.forecast.dailyDemand === null ||
      typeof result.forecast.dailyDemand === "number").toBe(true);

    const classified = Object.fromEntries(
      result.forecast.classifiedDays.map((day) => [day.date, day]),
    );

    // Known zero with available stock + complete coverage + promo none.
    expect(classified[DAY_PRIOR]?.disposition).toBe("baseline_usable");
    expect(classified[DAY_PRIOR]?.unitsSold).toBe(0);

    // Positive sales day.
    expect(classified[DAY_ZERO]?.disposition).toBe("baseline_usable");
    expect(classified[DAY_ZERO]?.unitsSold).toBe(2);

    // Stockout censoring: zero sold + unavailable inventory.
    expect(classified[DAY_STOCKOUT]?.disposition).toBe("stockout_censored");
    expect(classified[DAY_STOCKOUT]?.reasonCode).toBe("STOCKOUT_CENSORED");

    // Foreign org / location / variant must not inflate units.
    expect(
      result.forecast.classifiedDays.every((day) => day.unitsSold <= 2),
    ).toBe(true);
  }, 120000);

  it("treats missing promotion evidence as unknown and keeps forecasts nullable/fail-closed", async () => {
    await psql(`
      alter table public.forecast_day_promotion_evidence
        disable trigger forecast_day_promotion_evidence_immutable_body;
      delete from public.forecast_day_promotion_evidence
      where organization_id = ${quote(ORG_A)}::uuid
        and evidence_id like 'p2c3-promo-%';
      alter table public.forecast_day_promotion_evidence
        enable trigger forecast_day_promotion_evidence_immutable_body;
    `);

    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const { loadForecastSkuDemand } = await import(
      "@/lib/persistence/load-forecast-sku-demand"
    );

    const result = await loadForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastAsOf: AS_OF,
        lookbackDays: LOOKBACK,
      },
      createSupabaseAdminClient(),
    );

    const asOf = result.forecast.classifiedDays.find(
      (day) => day.date === DAY_ZERO,
    );
    expect(asOf?.disposition).toBe("unusable");
    expect(asOf?.reasonCode).toBe("PROMOTION_STATE_UNKNOWN");
    expect(result.forecast.dailyDemand).toBeNull();
  }, 120000);

  it("fails closed on partial coverage without trustedCompleteDates fallback", async () => {
    await psql(`
      alter table public.forecast_day_coverage_evidence
        disable trigger forecast_day_coverage_evidence_immutable_body;
      delete from public.forecast_day_coverage_evidence
      where evidence_id = ${quote(`p2c3-orders-${DAY_ZERO}`)};
      alter table public.forecast_day_coverage_evidence
        enable trigger forecast_day_coverage_evidence_immutable_body;
    `);

    await insertEvidence({
      evidenceId: `p2c3-orders-partial-${DAY_ZERO}`,
      stream: "orders",
      localDate: DAY_ZERO,
      locationId: null,
      variantId: null,
      coverage: "partial",
      asOf: "2026-08-16T00:00:00Z",
    });

    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const { loadForecastSkuDemand } = await import(
      "@/lib/persistence/load-forecast-sku-demand"
    );

    const result = await loadForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastAsOf: AS_OF,
        lookbackDays: LOOKBACK,
      },
      createSupabaseAdminClient(),
    );

    const asOf = result.forecast.classifiedDays.find(
      (day) => day.date === DAY_ZERO,
    );
    expect(asOf?.disposition).toBe("unusable");
    expect(asOf?.reasonCode).toBe("DATA_INCOMPLETE");
    expect(result.provenance.trustedCompleteDatesUsed).toBe(false);
  }, 120000);

  it("fences pending corrections, clears after process, and rotates sourceToken", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const { loadForecastSkuDemand } = await import(
      "@/lib/persistence/load-forecast-sku-demand"
    );

    const before = await loadForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastAsOf: AS_OF,
        lookbackDays: LOOKBACK,
      },
      createSupabaseAdminClient(),
    );
    expect(before.provenance.pendingCorrectionCount).toBe(0);

    await psql(`
      insert into public.forecast_coverage_correction_events (
        organization_id, store_id, stream, local_date,
        location_id, variant_id, business_at, arrived_at,
        source_table, source_op
      ) values (
        ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
        'orders', ${quote(DAY_ZERO)}::date,
        null, null,
        '2026-08-15T08:00:00Z'::timestamptz,
        '2026-08-17T00:00:00Z'::timestamptz,
        'order_items', 'update'
      );
    `);

    const pending = await loadForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastAsOf: AS_OF,
        lookbackDays: LOOKBACK,
      },
      createSupabaseAdminClient(),
    );

    expect(pending.provenance.pendingCorrectionCount).toBeGreaterThan(0);
    expect(pending.provenance.sourceToken).not.toBe(
      before.provenance.sourceToken,
    );
    expect(
      pending.forecast.classifiedDays.find((day) => day.date === DAY_ZERO)
        ?.reasonCode,
    ).toBe("DATA_INCOMPLETE");

    await psql(`
      update public.forecast_coverage_correction_events
      set processed_at = now()
      where organization_id = ${quote(ORG_A)}::uuid
        and processed_at is null;
    `);

    const after = await loadForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastAsOf: AS_OF,
        lookbackDays: LOOKBACK,
      },
      createSupabaseAdminClient(),
    );

    expect(after.provenance.pendingCorrectionCount).toBe(0);
    expect(
      after.forecast.classifiedDays.find((day) => day.date === DAY_ZERO)
        ?.disposition,
    ).toBe("baseline_usable");
  }, 120000);

  it("applies null-scope pending and documents post-return freshness boundary", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const { loadForecastSkuDemand } = await import(
      "@/lib/persistence/load-forecast-sku-demand"
    );

    const first = await loadForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastAsOf: AS_OF,
        lookbackDays: LOOKBACK,
      },
      createSupabaseAdminClient(),
    );

    const writer = await openSession();
    try {
      await writer.run(
        `
          begin;
          insert into public.forecast_coverage_correction_events (
            organization_id, store_id, stream, local_date,
            location_id, variant_id, business_at, arrived_at,
            source_table, source_op
          ) values (
            ${quote(ORG_A)}::uuid, ${quote(STORE_A)}::uuid,
            'returns', ${quote(DAY_ZERO)}::date,
            null, null,
            '2026-08-14T12:00:00Z'::timestamptz,
            '2026-08-18T00:00:00Z'::timestamptz,
            'return_refunds', 'insert'
          );
        `,
        "corr-uncommitted",
      );

      const mid = await loadForecastSkuDemand(
        {
          tenant: TENANT,
          locationId: LOCATION_A,
          variantId: VARIANT_A,
          forecastAsOf: AS_OF,
          lookbackDays: LOOKBACK,
        },
        createSupabaseAdminClient(),
      );
      expect(mid.provenance.sourceToken).toBe(first.provenance.sourceToken);
      expect(mid.provenance.pendingCorrectionCount).toBe(0);

      await writer.run("commit;", "corr-committed");
    } finally {
      await writer.close();
    }

    const second = await loadForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastAsOf: AS_OF,
        lookbackDays: LOOKBACK,
      },
      createSupabaseAdminClient(),
    );

    // Snapshot consistency holds for each call; post-return commit is a new token.
    expect(second.provenance.sourceToken).not.toBe(first.provenance.sourceToken);
    expect(second.provenance.pendingCorrectionCount).toBeGreaterThan(0);
    expect(second.provenance.sourceTokenFreshness).toMatch(
      /does not prove currency/i,
    );
  }, 120000);

  it("denies unauthorized tenant scope and maps timeout / missing / malformed fail-closed", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const {
      loadForecastSkuDemand,
      ForecastSkuDemandLoaderDeniedError,
      ForecastSkuDemandLoaderTimeoutError,
      ForecastSkuDemandLoaderUnavailableError,
      ForecastSkuDemandLoaderValidationError,
    } = await import("@/lib/persistence/load-forecast-sku-demand");

    await expect(
      loadForecastSkuDemand(
        {
          tenant: { ...TENANT, storeId: null },
          locationId: LOCATION_A,
          variantId: VARIANT_A,
          forecastAsOf: AS_OF,
          lookbackDays: LOOKBACK,
        },
        createSupabaseAdminClient(),
      ),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderDeniedError);

    await expect(
      loadForecastSkuDemand(
        {
          tenant: TENANT,
          locationId: LOCATION_A,
          variantId: VARIANT_A,
          forecastAsOf: AS_OF,
          lookbackDays: LOOKBACK,
        },
        {
          rpc: async () => ({
            data: null,
            error: {
              code: "PGRST202",
              message: "Could not find the function public.forecast_sku_demand_source_snapshot",
            },
          }),
        },
      ),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderUnavailableError);

    await expect(
      loadForecastSkuDemand(
        {
          tenant: TENANT,
          locationId: LOCATION_A,
          variantId: VARIANT_A,
          forecastAsOf: AS_OF,
          lookbackDays: LOOKBACK,
        },
        {
          rpc: async () => ({
            data: { ok: true, timeZone: "UTC" },
            error: null,
          }),
        },
      ),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderValidationError);

    const holder = await openSession();
    try {
      await holder.run(
        `
          begin;
          lock table public.order_items in access exclusive mode;
        `,
        "ae-held",
      );

      await expect(
        loadForecastSkuDemand(
          {
            tenant: TENANT,
            locationId: LOCATION_A,
            variantId: VARIANT_A,
            forecastAsOf: AS_OF,
            lookbackDays: LOOKBACK,
          },
          createSupabaseAdminClient(),
        ),
      ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderTimeoutError);

      await holder.run("rollback;", "ae-released");
    } finally {
      await holder.close();
    }
  }, 180000);
});
