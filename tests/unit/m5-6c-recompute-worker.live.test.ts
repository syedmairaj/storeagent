import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSkuDailyMetricRecomputeExecutor,
  type MetricRecomputeRpcClient,
} from "@/lib/persistence/metric-recompute-queue";

import { holdOrdersLiveLock } from "../support/orders-live-lock";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ALGORITHM = "m5-derived-metrics-v1";
const CLAIM_LOCK_KEY = 5606003;

const ORG = "56c60000-0000-4000-8000-000000000001";
const STORE = "56c60000-0000-4000-8000-000000000002";
const LOCATION = "56c60000-0000-4000-8000-000000000003";
const PRODUCT = "56c60000-0000-4000-8000-000000000004";
const VARIANTS = [
  "56c60000-0000-4000-8000-000000000010",
  "56c60000-0000-4000-8000-000000000011",
  "56c60000-0000-4000-8000-000000000012",
  "56c60000-0000-4000-8000-000000000013",
  "56c60000-0000-4000-8000-000000000014",
  "56c60000-0000-4000-8000-000000000015",
];
const ORG_B = "56c60000-0000-4000-8000-000000000101";
const STORE_B = "56c60000-0000-4000-8000-000000000102";
const LOCATION_B = "56c60000-0000-4000-8000-000000000103";
const PRODUCT_B = "56c60000-0000-4000-8000-000000000104";
const VARIANT_B = "56c60000-0000-4000-8000-000000000110";

const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;

interface Grain {
  organization_id: string;
  store_id: string;
  location_id: string;
  variant_id: string;
  metric_date: string;
}

interface ClaimRow extends Grain {
  algorithm_version: string;
  claimed_generation: number;
  attempt_count: number;
  lease_claim_token: string;
  lease_expires_at: string;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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

async function psqlError(sql: string): Promise<{ code: string; message: string }> {
  try {
    await psql(sql);
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    const match = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr);

    if (match) {
      return { code: match[1], message: match[2] };
    }

    throw error;
  }

  throw new Error("expected SQL to fail");
}

function svc(sql: string): Promise<string> {
  return psql(`set role service_role; ${sql}`);
}

/**
 * A psql-backed client so the frozen M5.5 recompute runs unmodified
 * against the local database as service_role.
 */
const psqlRpcClient: MetricRecomputeRpcClient = {
  rpc(fn, args = {}) {
    const literal = (value: unknown): string => {
      if (value === null || value === undefined) {
        return "null";
      }

      if (typeof value === "number") {
        return String(value);
      }

      if (typeof value === "string") {
        return quote(value);
      }

      return quote(JSON.stringify(value));
    };
    const named = Object.entries(args)
      .map(([key, value]) => `${key} => ${literal(value)}`)
      .join(", ");

    return (async () => {
      try {
        const out = await svc(
          `select pg_catalog.to_jsonb(public.${fn}(${named}))::text`,
        );

        return {
          data: out === "" ? null : JSON.parse(out),
          error: null,
          status: 200,
        };
      } catch (error) {
        const stderr = String((error as { stderr?: string }).stderr ?? "");
        const match = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr);

        return {
          data: null,
          error: {
            code: match?.[1] ?? "",
            message: match?.[2] ?? "psql failed",
          },
          status: 400,
        };
      }
    })();
  },
};

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
        if (child.exitCode !== null || Date.now() - started > 30000) {
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

function grainSql(row: Grain): string {
  return [
    `${quote(row.organization_id)}::uuid`,
    `${quote(row.store_id)}::uuid`,
    `${quote(row.location_id)}::uuid`,
    `${quote(row.variant_id)}::uuid`,
    `${quote(row.metric_date)}::date`,
    quote(ALGORITHM),
  ].join(", ");
}

function grainWhere(row: Grain): string {
  return `
    organization_id = ${quote(row.organization_id)}::uuid
    and store_id = ${quote(row.store_id)}::uuid
    and location_id = ${quote(row.location_id)}::uuid
    and variant_id = ${quote(row.variant_id)}::uuid
    and metric_date = ${quote(row.metric_date)}::date
    and algorithm_version = ${quote(ALGORITHM)}
  `;
}

function grain(variantIndex: number, metricDate: string): Grain {
  return {
    organization_id: ORG,
    store_id: STORE,
    location_id: LOCATION,
    variant_id: VARIANTS[variantIndex],
    metric_date: metricDate,
  };
}

function grainB(metricDate: string): Grain {
  return {
    organization_id: ORG_B,
    store_id: STORE_B,
    location_id: LOCATION_B,
    variant_id: VARIANT_B,
    metric_date: metricDate,
  };
}

async function day(offset: number): Promise<string> {
  return psql(
    `select ((pg_catalog.timezone('UTC', pg_catalog.now()))::date + ${offset})::text`,
  );
}

async function insertRequest(row: Grain, dirty = 1): Promise<void> {
  await psql(`
    insert into public.sku_daily_metric_recompute_requests (
      organization_id, store_id, location_id, variant_id, metric_date,
      algorithm_version, dirty_generation, claimed_generation,
      applied_generation, status, attempt_count, queued_at
    ) values (
      ${grainSql(row)}, ${dirty}, 0, 0, 'queued', 0, pg_catalog.now()
    );
  `);
}

async function insertEvent(row: Grain, sourceDate: string): Promise<void> {
  await psql(`
    insert into public.sku_daily_metric_source_events (
      organization_id, store_id, location_id, variant_id, source_date,
      algorithm_version
    ) values (
      ${quote(row.organization_id)}::uuid, ${quote(row.store_id)}::uuid,
      ${quote(row.location_id)}::uuid, ${quote(row.variant_id)}::uuid,
      ${quote(sourceDate)}::date, ${quote(ALGORITHM)}
    );
  `);
}

async function consume(
  organizationId = ORG,
  limit = 100,
): Promise<number> {
  return Number(
    await svc(
      `select public.consume_sku_daily_metric_source_events(${limit}, ${quote(organizationId)}::uuid)`,
    ),
  );
}

async function claim(
  owner: string,
  limit = 4,
  maxActive = 4,
  organizationId: string | null = null,
): Promise<ClaimRow[]> {
  const orgSql =
    organizationId === null
      ? "null::uuid"
      : `${quote(organizationId)}::uuid`;
  const out = await svc(`
    select coalesce(pg_catalog.json_agg(c), '[]'::json)::text
    from public.claim_sku_daily_metric_recompute_requests(
      ${quote(owner)}, ${limit}, 120, ${maxActive}, ${orgSql}
    ) as c
  `);

  return JSON.parse(out) as ClaimRow[];
}

async function start(row: ClaimRow, owner: string, token = row.lease_claim_token) {
  const out = await svc(`
    select coalesce(pg_catalog.json_agg(s), '[]'::json)::text
    from public.start_sku_daily_metric_recompute(
      ${grainSql(row)}, ${quote(owner)}, ${quote(token)}, 120
    ) as s
  `);

  return JSON.parse(out) as { attempt_count: number }[];
}

function complete(row: Grain, owner: string, token: string): Promise<string> {
  return svc(`
    select public.complete_sku_daily_metric_recompute(
      ${grainSql(row)}, ${quote(owner)}, ${quote(token)}
    )
  `);
}

function fail(
  row: Grain,
  owner: string,
  token: string,
  failureClass = "timeout",
): Promise<string> {
  return svc(`
    select public.fail_sku_daily_metric_recompute(
      ${grainSql(row)}, ${quote(owner)}, ${quote(token)},
      ${quote(failureClass)}, 'TEST_CODE', 'test failure', 30, 5
    )
  `);
}

async function recover(
  organizationId: string | null = null,
): Promise<{ requeued: number; retry_scheduled: number; failed: number }> {
  const orgSql =
    organizationId === null
      ? "null::uuid"
      : `${quote(organizationId)}::uuid`;

  return JSON.parse(
    await svc(`
      select pg_catalog.row_to_json(r)::text
      from public.recover_expired_sku_daily_metric_recompute_leases(
        5, 30, 1800, ${orgSql}
      ) as r
    `),
  );
}

async function expire(row: Grain): Promise<void> {
  await psql(`
    update public.sku_daily_metric_recompute_requests
    set lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
    where ${grainWhere(row)};
  `);
}

async function makeRetryReady(row: Grain): Promise<void> {
  await psql(`
    update public.sku_daily_metric_recompute_requests
    set available_at = pg_catalog.clock_timestamp() - interval '1 second'
    where ${grainWhere(row)} and status = 'retry_wait';
  `);
}

async function setAttempts(row: Grain, attempts: number): Promise<void> {
  await psql(`
    update public.sku_daily_metric_recompute_requests
    set attempt_count = ${attempts}
    where ${grainWhere(row)};
  `);
}

/** status:dirty:claimed:applied:attempts:failed_reason:lease_cleared */
async function state(row: Grain): Promise<string> {
  return psql(`
    select status || ':' || dirty_generation || ':' || claimed_generation
      || ':' || applied_generation || ':' || attempt_count || ':'
      || coalesce(failed_reason, '') || ':' || (lease_claim_token is null)::text
    from public.sku_daily_metric_recompute_requests
    where ${grainWhere(row)}
  `);
}

async function clearWork(): Promise<void> {
  await psql(`
    delete from public.order_items where organization_id in ${TENANTS};
    delete from public.orders where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_source_events where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_recompute_requests where organization_id in ${TENANTS};
    delete from public.sku_daily_metrics where organization_id in ${TENANTS};
  `);
}

async function persistMetric(row: Grain): Promise<void> {
  await psql(`
    insert into public.sku_daily_metrics (
      organization_id, store_id, location_id, variant_id, metric_date,
      algorithm_version, units_sold, returned_units, net_units_sold,
      eligible_days_7d, eligible_days_14d, eligible_days_30d, eligible_days_90d,
      coverage_ratio_7d, coverage_ratio_14d, coverage_ratio_30d, coverage_ratio_90d,
      sales_velocity_7d_reason_code, sales_velocity_14d_reason_code,
      sales_velocity_30d_reason_code, sales_velocity_90d_reason_code,
      eligible_incoming_reason_code, days_of_stock_reason_code,
      safety_stock_reason_code, reorder_point_reason_code,
      target_stock_reason_code, inventory_age_quality,
      inventory_age_reason_code, demand_trend, demand_trend_reason_code
    ) values (
      ${grainSql(row)}, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      'no_eligible_days', 'no_eligible_days', 'no_eligible_days',
      'no_eligible_days', 'incoming_state_unknown', 'demand_unknown',
      'safety_stock_unknown', 'lead_time_unknown', 'target_stock_unknown',
      'unavailable', 'inventory_age_unknown', 'unknown', 'trend_input_unknown'
    );
  `);
}

async function claimOne(owner: string): Promise<ClaimRow> {
  const rows = await claim(owner, 1);
  expect(rows).toHaveLength(1);

  return rows[0];
}

describeLive("M5.6C recompute worker", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseOrdersLock = await holdOrdersLiveLock();
    await clearWork();
    await psql(`
      delete from public.product_variants where organization_id in ${TENANTS};
      delete from public.products where organization_id in ${TENANTS};
      delete from public.locations where organization_id in ${TENANTS};
      delete from public.stores where organization_id in ${TENANTS};
      delete from public.organizations where id in ${TENANTS};
      insert into public.organizations (id, name, default_currency, timezone) values
        (${quote(ORG)}::uuid, 'M56C A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'M56C B', 'USD', 'UTC');
      insert into public.stores (id, organization_id, name, status, currency, timezone) values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'A', 'active', 'USD', 'UTC'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'UTC');
      insert into public.locations (id, organization_id, store_id, name, status) values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');
      insert into public.products (id, organization_id, store_id, title, status) values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');
      insert into public.product_variants (id, organization_id, store_id, product_id, sku, status)
      select v.id::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid,
        'A-' || v.n, 'active'
      from (values ${VARIANTS.map((id, n) => `(${quote(id)}, ${n})`).join(", ")}) as v(id, n);
      insert into public.product_variants (id, organization_id, store_id, product_id, sku, status) values
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'B', 'active');
    `);
  }, 180000);

  beforeEach(async () => {
    await clearWork();
    const foreign = await psql(`
      select pg_catalog.count(*)
      from public.sku_daily_metric_recompute_requests
      where organization_id not in ${TENANTS}
        and status in ('queued', 'claimed', 'running', 'retry_wait')
    `);

    if (foreign !== "0") {
      throw new Error(
        "Local database has claimable or active recompute requests outside the M5.6C test tenants. Reset the local database first.",
      );
    }
  });

  afterAll(async () => {
    try {
      await clearWork();
      await psql(`
        delete from public.product_variants where organization_id in ${TENANTS};
        delete from public.products where organization_id in ${TENANTS};
        delete from public.locations where organization_id in ${TENANTS};
        delete from public.stores where organization_id in ${TENANTS};
        delete from public.organizations where id in ${TENANTS};
      `);
    } finally {
      await releaseOrdersLock?.();
    }
  }, 180000);

  it("keeps request writes behind service-role RPCs only", async () => {
    const today = await day(0);
    await insertRequest(grain(0, today));

    expect(
      (await psqlError(`set role service_role; update public.sku_daily_metric_recompute_requests set status = 'succeeded'`)).code,
    ).toBe("42501");
    expect(
      (await psqlError(`set role service_role; delete from public.sku_daily_metric_recompute_requests`)).code,
    ).toBe("42501");

    const privileges = await psql(`
      select pg_catalog.string_agg(
        p.proname || ':' ||
        pg_catalog.has_function_privilege('anon', p.oid, 'execute') || ':' ||
        pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') || ':' ||
        pg_catalog.has_function_privilege('service_role', p.oid, 'execute') || ':' ||
        p.prosecdef || ':' || pg_catalog.array_to_string(p.proconfig, ','),
        ',' order by p.proname
      )
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'recover_expired_sku_daily_metric_recompute_leases',
          'claim_sku_daily_metric_recompute_requests',
          'start_sku_daily_metric_recompute',
          'complete_sku_daily_metric_recompute',
          'fail_sku_daily_metric_recompute',
          'sku_daily_metric_recompute_queue_stats'
        )
    `);

    expect(privileges.split(",")).toHaveLength(6);
    for (const entry of privileges.split(",")) {
      expect(entry).toMatch(/:false:false:true:true:search_path=""$/);
    }

    for (const role of ["anon", "authenticated"]) {
      expect(
        (await psqlError(`set role ${role}; select * from public.claim_sku_daily_metric_recompute_requests('w', 1, 120, 4)`)).code,
      ).toBe("42501");
      expect(
        (await psqlError(`set role ${role}; select public.sku_daily_metric_recompute_queue_stats()`)).code,
      ).toBe("42501");
    }

    for (const bad of [
      `'w', 5, 120, 4`,
      `'w', 1, 120, 5`,
      `'w', 1, 10, 4`,
      `'bad owner', 1, 120, 4`,
    ]) {
      expect(
        (await psqlError(`set role service_role; select * from public.claim_sku_daily_metric_recompute_requests(${bad})`)).code,
      ).toBe("22023");
    }

    expect(await state(grain(0, today))).toBe("queued:1:0:0:0::true");
  });

  it("lets only one of many concurrent workers claim a request", async () => {
    const today = await day(0);
    await insertRequest(grain(0, today));

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, n) => claim(`worker-${n}`)),
    );

    expect(results.flat()).toHaveLength(1);
    expect(await state(grain(0, today))).toMatch(/^claimed:1:1:0:0::false$/);
  });

  it("never exceeds four active claims across independent sessions", async () => {
    const today = await day(0);
    for (let n = 0; n < 6; n += 1) {
      await insertRequest(grain(n, today));
    }

    // Hold the claim lock so every worker session is waiting at once.
    const holder = await openSession();
    let claimed: ClaimRow[];

    try {
      await holder.run(`begin; select pg_catalog.pg_advisory_xact_lock(${CLAIM_LOCK_KEY});`, "held");
      const pending = Array.from({ length: 6 }, (_, n) => claim(`worker-${n}`, 4, 4));

      let waiting = "0";
      for (let tries = 0; tries < 200 && waiting !== "6"; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        waiting = await psql(`
          select pg_catalog.count(*) from pg_catalog.pg_stat_activity
          where wait_event_type = 'Lock' and wait_event = 'advisory'
            and query like '%claim_sku_daily_metric_recompute_requests%'
        `);
      }

      await holder.run("commit;", "released");
      claimed = (await Promise.all(pending)).flat();
      expect(waiting).toBe("6");
    } finally {
      await holder.close();
    }

    expect(claimed).toHaveLength(4);
    expect(new Set(claimed.map((row) => row.variant_id)).size).toBe(4);
    expect(new Set(claimed.map((row) => row.lease_claim_token)).size).toBe(4);
    expect(await claim("late-worker")).toHaveLength(0);

    // An expired lease no longer counts toward the cap.
    await expire(claimed[0]);
    const refill = await claim("refill-worker");
    expect(refill).toHaveLength(1);
    expect(
      await psql(`
        select pg_catalog.count(*) from public.sku_daily_metric_recompute_requests
        where status in ('claimed', 'running')
          and lease_expires_at > pg_catalog.clock_timestamp()
      `),
    ).toBe("4");
  });

  it("allows only one active claim per grain", async () => {
    const dates = [await day(-2), await day(-1), await day(0)];
    for (const date of dates) {
      await insertRequest(grain(0, date));
    }
    await insertRequest(grain(1, dates[2]));

    const first = await claim("worker-a");
    expect(first).toHaveLength(2);
    expect(new Set(first.map((row) => row.variant_id)).size).toBe(2);
    expect(await claim("worker-b")).toHaveLength(0);

    const grainZero = first.find((row) => row.variant_id === VARIANTS[0])!;
    await start(grainZero, "worker-a");
    expect(await complete(grainZero, "worker-a", grainZero.lease_claim_token)).toBe("succeeded");

    const next = await claim("worker-b");
    expect(next).toHaveLength(1);
    expect(next[0].variant_id).toBe(VARIANTS[0]);
    expect(next[0].metric_date).not.toBe(grainZero.metric_date);
  });

  it("fences an expired lease before recovery runs", async () => {
    const today = await day(0);
    await insertRequest(grain(0, today));
    const row = await claimOne("worker-a");

    await expire(row);
    expect(await start(row, "worker-a")).toEqual([]);

    await psql(`
      update public.sku_daily_metric_recompute_requests
      set lease_expires_at = pg_catalog.clock_timestamp() + interval '2 minutes'
      where ${grainWhere(row)};
    `);
    expect((await start(row, "worker-a"))[0].attempt_count).toBe(1);
    await expire(row);

    expect(await complete(row, "worker-a", row.lease_claim_token)).toBe("fenced");
    expect(await fail(row, "worker-a", row.lease_claim_token)).toBe("fenced");
    expect(await state(row)).toBe("running:1:1:0:1::false");

    expect(await recover()).toEqual({ requeued: 0, retry_scheduled: 1, failed: 0 });
    expect(await state(row)).toBe("retry_wait:1:1:0:1::true");
    expect(await claim("worker-b")).toHaveLength(0);
  });

  it("returns an expired claimed request to queued without counting an attempt", async () => {
    const today = await day(0);
    await insertRequest(grain(0, today));
    const row = await claimOne("worker-a");

    await expire(row);
    expect(await recover()).toEqual({ requeued: 1, retry_scheduled: 0, failed: 0 });
    expect(await state(row)).toBe("queued:1:1:0:0::true");
  });

  it("rejects an old token after a replacement claim", async () => {
    const today = await day(0);
    await insertRequest(grain(0, today));
    const old = await claimOne("worker-a");
    await start(old, "worker-a");
    await expire(old);
    await recover();
    await makeRetryReady(old);

    const replacement = await claimOne("worker-b");
    expect(replacement.lease_claim_token).not.toBe(old.lease_claim_token);
    expect((await start(replacement, "worker-b"))[0].attempt_count).toBe(2);

    expect(await complete(replacement, "worker-a", old.lease_claim_token)).toBe("fenced");
    expect(await complete(replacement, "worker-a", replacement.lease_claim_token)).toBe("fenced");
    expect(await fail(replacement, "worker-a", old.lease_claim_token)).toBe("fenced");
    expect(await complete(replacement, "worker-b", replacement.lease_claim_token)).toBe("succeeded");
    expect(await state(replacement)).toBe("succeeded:1:1:1:2::true");
  });

  it("keeps a newer dirty generation when an older execution completes", async () => {
    const today = await day(0);
    const row = grain(0, today);
    await insertEvent(row, today);
    expect(await consume()).toBe(1);

    const claimed = await claimOne("worker-a");
    expect(claimed.claimed_generation).toBe(1);
    await start(claimed, "worker-a");

    await insertEvent(row, today);
    expect(await consume()).toBe(1);
    expect(await state(row)).toBe("running:2:1:0:1::false");

    expect(await complete(claimed, "worker-a", claimed.lease_claim_token)).toBe("superseded");
    expect(await state(row)).toBe("queued:2:1:0:0::true");

    const again = await claimOne("worker-a");
    expect(again.claimed_generation).toBe(2);
    await start(again, "worker-a");
    expect(await complete(again, "worker-a", again.lease_claim_token)).toBe("succeeded");
    expect(await state(row)).toBe("succeeded:2:2:2:1::true");
  });

  it("does not let retry exhaustion fail a newer generation", async () => {
    const today = await day(0);
    const row = grain(0, today);
    await insertEvent(row, today);
    await consume();

    // Failure report path.
    let claimed = await claimOne("worker-a");
    await start(claimed, "worker-a");
    await setAttempts(row, 5);
    await insertEvent(row, today);
    await consume();
    expect(await fail(claimed, "worker-a", claimed.lease_claim_token)).toBe("superseded");
    expect(await state(row)).toBe("queued:2:1:0:0::true");

    // Lease recovery path.
    claimed = await claimOne("worker-a");
    await start(claimed, "worker-a");
    await setAttempts(row, 5);
    await insertEvent(row, today);
    await consume();
    await expire(row);
    expect(await recover()).toEqual({ requeued: 1, retry_scheduled: 0, failed: 0 });
    expect(await state(row)).toBe("queued:3:2:0:0::true");

    // Crash between claim and start while a new generation arrives.
    claimed = await claimOne("worker-a");
    await setAttempts(row, 4);
    await insertEvent(row, today);
    await consume();
    await expire(row);
    expect(await recover()).toEqual({ requeued: 1, retry_scheduled: 0, failed: 0 });
    expect(await state(row)).toBe("queued:4:3:0:0::true");
    claimed = await claimOne("worker-a");
    await start(claimed, "worker-a");
    expect(await fail(claimed, "worker-a", claimed.lease_claim_token)).toBe("retry_scheduled");
    await makeRetryReady(row);

    // Same generation: exhaustion is terminal dead work.
    claimed = await claimOne("worker-a");
    await start(claimed, "worker-a");
    await setAttempts(row, 5);
    expect(await fail(claimed, "worker-a", claimed.lease_claim_token)).toBe("failed");
    expect(await state(row)).toBe("failed:4:4:0:5:retry_exhausted:true");

    // A later event reopens the failed request as a new generation.
    await insertEvent(row, today);
    await consume();
    expect(await state(row)).toBe("queued:5:4:0:0:retry_exhausted:true");
  });

  it("retries retryable failures with backoff and fails unknown errors once", async () => {
    const today = await day(0);
    const row = grain(0, today);
    await insertRequest(row);

    let claimed = await claimOne("worker-a");
    await start(claimed, "worker-a");
    expect(await fail(claimed, "worker-a", claimed.lease_claim_token, "transient_dependency")).toBe("retry_scheduled");
    expect(await state(row)).toBe("retry_wait:1:1:0:1::true");
    expect(
      await psql(`
        select (available_at > pg_catalog.clock_timestamp() + interval '20 seconds')::text
        from public.sku_daily_metric_recompute_requests where ${grainWhere(row)}
      `),
    ).toBe("true");
    expect(await claim("worker-b")).toHaveLength(0);

    await makeRetryReady(row);
    claimed = await claimOne("worker-b");
    await start(claimed, "worker-b");
    expect(await fail(claimed, "worker-b", claimed.lease_claim_token, "unknown")).toBe("failed");
    expect(await state(row)).toBe("failed:1:1:0:2:unknown_failure:true");
  });

  it("defers completion while a relevant source event is unconsumed", async () => {
    const metricDate = await day(-5);
    const row = grain(0, metricDate);
    await insertRequest(row);
    const claimed = await claimOne("worker-a");
    await start(claimed, "worker-a");

    // Inclusive lower edge of the M5.6B expansion window.
    await insertEvent(row, await day(-5 - 89));
    expect(await complete(claimed, "worker-a", claimed.lease_claim_token)).toBe("deferred");
    // M5.7 Phase 2: deferred resets attempt_count so freshness waits
    // do not consume the failure budget.
    expect(await state(row)).toBe("queued:1:1:0:0::true");

    await consume();
    const again = await claimOne("worker-a");
    await start(again, "worker-a");
    expect(await complete(again, "worker-a", again.lease_claim_token)).toBe("succeeded");
  });

  it("M5.7 F1 T1: repeated deferrals do not cause false retry_exhausted", async () => {
    const metricDate = await day(-5);
    const row = grain(0, metricDate);
    await insertRequest(row);
    await insertEvent(row, metricDate);

    for (let round = 1; round <= 5; round += 1) {
      const claimed = await claimOne(`defer-${round}`);
      const started = await start(claimed, `defer-${round}`);
      expect(started[0].attempt_count).toBe(1);
      expect(
        await complete(claimed, `defer-${round}`, claimed.lease_claim_token),
      ).toBe("deferred");
      expect(await state(row)).toBe("queued:1:1:0:0::true");
    }

    const afterDefers = await claimOne("after-defers");
    await start(afterDefers, "after-defers");
    expect(
      await fail(
        afterDefers,
        "after-defers",
        afterDefers.lease_claim_token,
        "timeout",
      ),
    ).toBe("retry_scheduled");
    expect(await state(row)).toBe("retry_wait:1:1:0:1::true");
  });

  it("M5.7 F1 T2: partial event consumption defers then succeeds", async () => {
    const metricDate = await day(-5);
    const row = grain(1, metricDate);
    await insertEvent(row, metricDate);
    await insertEvent(row, await day(-5 - 10));

    expect(await consume(ORG, 1)).toBe(1);
    expect(
      await psql(`
        select pg_catalog.count(*)::text
        from public.sku_daily_metric_source_events
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANTS[1])}::uuid
          and consumed_at is null
      `),
    ).toBe("1");

    const claimed = await claimOne("partial-a");
    expect(claimed.variant_id).toBe(VARIANTS[1]);
    await start(claimed, "partial-a");
    expect(
      await complete(claimed, "partial-a", claimed.lease_claim_token),
    ).toBe("deferred");
    expect(await state(row)).toBe("queued:1:1:0:0::true");

    expect(await consume(ORG, 10)).toBe(1);
    const again = await claimOne("partial-b");
    await start(again, "partial-b");
    expect(
      await complete(again, "partial-b", again.lease_claim_token),
    ).toBe("succeeded");
    expect(await state(row)).toBe("succeeded:1:1:1:1::true");
  });

  it("M5.7 F1 T3: skipped consumption leaves events and avoids false failure", async () => {
    // Models a tick where consume fails/aborts before claim: events stay
    // unconsumed, claim still runs, complete defers, and a later real
    // transient failure still gets a retry instead of false exhaustion.
    const metricDate = await day(-3);
    const row = grain(2, metricDate);
    await insertRequest(row);
    await insertEvent(row, metricDate);

    expect(
      await psql(`
        select pg_catalog.count(*)::text
        from public.sku_daily_metric_source_events
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANTS[2])}::uuid
          and consumed_at is null
      `),
    ).toBe("1");

    for (let round = 1; round <= 5; round += 1) {
      const claimed = await claimOne(`skip-consume-${round}`);
      await start(claimed, `skip-consume-${round}`);
      expect(
        await complete(
          claimed,
          `skip-consume-${round}`,
          claimed.lease_claim_token,
        ),
      ).toBe("deferred");
    }

    expect(
      await psql(`
        select pg_catalog.count(*)::text
        from public.sku_daily_metric_source_events
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANTS[2])}::uuid
          and consumed_at is null
      `),
    ).toBe("1");
    expect(await state(row)).toBe("queued:1:1:0:0::true");

    const claimed = await claimOne("skip-consume-fail");
    await start(claimed, "skip-consume-fail");
    expect(
      await fail(
        claimed,
        "skip-consume-fail",
        claimed.lease_claim_token,
        "transient_dependency",
      ),
    ).toBe("retry_scheduled");
    expect(await state(row)).toBe("retry_wait:1:1:0:1::true");
  });

  it("ignores source events outside the grain or window", async () => {
    const metricDate = await day(-5);
    const row = grain(0, metricDate);
    await insertRequest(row);
    const claimed = await claimOne("worker-a");
    await start(claimed, "worker-a");

    await insertEvent(row, await day(-4));
    await insertEvent(row, await day(-5 - 90));
    await insertEvent(grain(1, metricDate), metricDate);
    await insertEvent(grainB(metricDate), metricDate);

    expect(await complete(claimed, "worker-a", claimed.lease_claim_token)).toBe("succeeded");
    expect(await state(row)).toBe("succeeded:1:1:1:1::true");
  });

  it("keeps a late-committing event discoverable without a cursor", async () => {
    const metricDate = await day(-5);
    const row = grain(2, metricDate);
    await persistMetric(row);
    await insertRequest(row);

    // Allocate a lower event_id that commits after the completion check.
    const late = await openSession();

    try {
    await late.run(
      `begin;
       insert into public.sku_daily_metric_source_events (
         organization_id, store_id, location_id, variant_id, source_date, algorithm_version
       ) values (
         ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
         ${quote(VARIANTS[2])}::uuid, ${quote(await day(-8))}::date, ${quote(ALGORITHM)}
       );`,
      "inserted",
    );

    // A higher event_id commits and is consumed first.
    await insertEvent(grain(3, await day(0)), await day(0));
    expect(await consume()).toBe(1);

    const claimed = (await claim("worker-a")).find((item) => item.variant_id === VARIANTS[2])!;
    await start(claimed, "worker-a");
    expect(await complete(claimed, "worker-a", claimed.lease_claim_token)).toBe("succeeded");

    await late.run("commit;", "committed");
    } finally {
      await late.close();
    }

    expect(await state(row)).toBe("succeeded:1:1:1:1::true");
    expect(
      await psql(`
        select (pg_catalog.min(event_id) filter (where consumed_at is null)
          < pg_catalog.max(event_id) filter (where consumed_at is not null))::text
        from public.sku_daily_metric_source_events
        where organization_id = ${quote(ORG)}::uuid
      `),
    ).toBe("true");

    expect(await consume()).toBe(1);
    expect(await state(row)).toBe("queued:2:1:1:0::true");
  });

  it("recovers a crash after the metric commit and recomputes idempotently", async () => {
    const today = await day(0);
    const row = grain(4, today);
    const orderId = "56c60000-0000-4000-8000-000000000201";
    await psql(`
      insert into public.orders (id, organization_id, store_id, status, ordered_at, currency, source)
      values (${quote(orderId)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'completed',
        pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC' + interval '1 second',
        'USD', 'csv');
      insert into public.order_items (id, organization_id, store_id, order_id, variant_id, location_id, quantity)
      values ('56c60000-0000-4000-8000-000000000202'::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        ${quote(orderId)}::uuid, ${quote(VARIANTS[4])}::uuid, ${quote(LOCATION)}::uuid, 3);
    `);
    expect(await consume()).toBeGreaterThan(0);

    const execute = createSkuDailyMetricRecomputeExecutor(psqlRpcClient);
    const metricRow = `
      select (pg_catalog.to_jsonb(m) - 'created_at' - 'updated_at')::text
      from public.sku_daily_metrics m
      where ${grainWhere(row)}
    `;

    const first = await claimOne("worker-a");
    expect(first.metric_date).toBe(today);
    await start(first, "worker-a");
    const input = {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANTS[4],
      metricDate: today,
      algorithmVersion: ALGORITHM,
    };
    expect(await execute(input, 20_000)).toEqual({ ok: true });
    const committed = await psql(metricRow);
    expect(JSON.parse(committed)).toMatchObject({ units_sold: 3, net_units_sold: 3 });

    // Crash: no completion. The lease expires and recovery counts the attempt.
    await expire(row);
    expect(await recover()).toEqual({ requeued: 0, retry_scheduled: 1, failed: 0 });
    await makeRetryReady(row);

    const second = await claimOne("worker-b");
    expect((await start(second, "worker-b"))[0].attempt_count).toBe(2);
    expect(await execute(input, 20_000)).toEqual({ ok: true });

    expect(await psql(metricRow)).toBe(committed);
    expect(
      await psql(`select pg_catalog.count(*) from public.sku_daily_metrics where ${grainWhere(row)}`),
    ).toBe("1");
    expect(await complete(second, "worker-b", second.lease_claim_token)).toBe("succeeded");
    expect(await state(row)).toMatch(/^succeeded:(\d+):\1:\1:2::true$/);
  });

  it("isolates tenants across claim, fencing, and counters", async () => {
    const today = await day(0);
    await insertRequest(grainB(today));
    await insertRequest(grain(0, today));

    const rows = await claim("worker-a");
    const rowB = rows.find((row) => row.organization_id === ORG_B)!;
    const rowA = rows.find((row) => row.organization_id === ORG)!;
    expect(rowB).toMatchObject({ store_id: STORE_B, location_id: LOCATION_B, variant_id: VARIANT_B });

    // Another tenant's token cannot move this tenant's row, and vice versa.
    expect(await start({ ...rowA, lease_claim_token: rowB.lease_claim_token }, "worker-a")).toEqual([]);
    await start(rowA, "worker-a");
    await start(rowB, "worker-a");
    expect(await complete(rowA, "worker-a", rowB.lease_claim_token)).toBe("fenced");
    expect(await complete({ ...rowB, organization_id: ORG }, "worker-a", rowB.lease_claim_token)).toBe("fenced");
    expect(await complete(rowB, "worker-a", rowB.lease_claim_token)).toBe("succeeded");
    expect(await state(grain(0, today))).toBe("running:1:1:0:1::false");

    const stats = await svc("select public.sku_daily_metric_recompute_queue_stats()::text");
    expect(stats).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(stats).not.toContain(rowA.lease_claim_token);
    const counters = JSON.parse(stats) as Record<string, number>;
    expect(counters.activeLeases).toBe(1);
    expect(counters.running).toBe(1);
    expect(counters.succeeded).toBeGreaterThanOrEqual(1);
    expect(Object.values(counters).every((value) => typeof value === "number")).toBe(true);
  });

  it("M5.6E.3: org-scoped claim never selects another organization's work", async () => {
    const today = await day(0);
    // Older foreign work would win a global claim; scoped claim must skip it.
    await insertRequest(grainB(today));
    await psql(`
      update public.sku_daily_metric_recompute_requests
      set queued_at = pg_catalog.now() - interval '1 hour'
      where organization_id = ${quote(ORG_B)}::uuid;
    `);
    await insertRequest(grain(0, today));

    const scoped = await claim("scoped-a", 4, 4, ORG);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].organization_id).toBe(ORG);
    expect(scoped[0].variant_id).toBe(VARIANTS[0]);
    expect(await state(grainB(today))).toBe("queued:1:0:0:0::true");

    const signatures = await psql(`
      select pg_catalog.string_agg(
        p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
        '|' order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
      )
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'claim_sku_daily_metric_recompute_requests',
          'recover_expired_sku_daily_metric_recompute_leases'
        )
    `);
    expect(signatures).toBe(
      [
        "claim_sku_daily_metric_recompute_requests(p_owner_id text, p_limit integer, p_lease_seconds integer, p_max_active integer, p_organization_id uuid)",
        "recover_expired_sku_daily_metric_recompute_leases(p_max_attempts integer, p_base_delay_seconds integer, p_max_delay_seconds integer, p_organization_id uuid)",
      ].join("|"),
    );
    expect(signatures).not.toContain(
      "claim_sku_daily_metric_recompute_requests(p_owner_id text, p_limit integer, p_lease_seconds integer, p_max_active integer)",
    );
  });

  it("M5.6E.3: org-scoped recovery never changes another organization's expired leases", async () => {
    const today = await day(0);
    await insertRequest(grain(0, today));
    await insertRequest(grainB(today));

    const [rowA, rowB] = await claim("owner-recover", 4, 4);
    expect(rowA.organization_id).toBe(ORG);
    expect(rowB.organization_id).toBe(ORG_B);
    await start(rowA, "owner-recover");
    await start(rowB, "owner-recover");
    await expire(grain(0, today));
    await expire(grainB(today));

    expect(await recover(ORG)).toEqual({
      requeued: 0,
      retry_scheduled: 1,
      failed: 0,
    });
    expect(await state(grain(0, today))).toMatch(/^retry_wait:/);
    expect(await state(grainB(today))).toMatch(/^running:/);

    expect(await recover(null)).toEqual({
      requeued: 0,
      retry_scheduled: 1,
      failed: 0,
    });
    expect(await state(grainB(today))).toMatch(/^retry_wait:/);
  });

  it("M5.6E.3: null organization claim preserves global ordering across orgs", async () => {
    const today = await day(0);
    await insertRequest(grainB(today));
    await psql(`
      update public.sku_daily_metric_recompute_requests
      set queued_at = pg_catalog.now() - interval '2 hours'
      where organization_id = ${quote(ORG_B)}::uuid;
    `);
    await insertRequest(grain(0, today));

    const rows = await claim("global-null", 1, 4, null);
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(ORG_B);
  });

  it("M5.6E.3: global four-lease cap still applies under org-scoped claim", async () => {
    const today = await day(0);
    for (let n = 0; n < 4; n += 1) {
      await insertRequest(grain(n, today));
    }
    await insertRequest(grainB(today));

    const foreign = await claim("fill-global", 4, 4, ORG);
    expect(foreign).toHaveLength(4);

    expect(await claim("blocked-b", 4, 4, ORG_B)).toHaveLength(0);
    expect(await state(grainB(today))).toBe("queued:1:0:0:0::true");
  });

  it("M5.6E.3: org-scoped claim keeps lease fencing and generation supersession", async () => {
    const today = await day(0);
    await insertRequest(grain(0, today), 2);
    await insertRequest(grainB(today), 9);

    const [row] = await claim("fence-a", 1, 4, ORG);
    expect(row.organization_id).toBe(ORG);
    expect(row.claimed_generation).toBe(2);
    await start(row, "fence-a");

    expect(await complete(row, "fence-a", "not-the-token")).toBe("fenced");
    expect(await state(grain(0, today))).toMatch(/^running:2:2:0:1::false$/);

    await psql(`
      update public.sku_daily_metric_recompute_requests
      set dirty_generation = 5
      where ${grainWhere(grain(0, today))};
    `);
    expect(await complete(row, "fence-a", row.lease_claim_token)).toBe("superseded");
    expect(await state(grain(0, today))).toBe("queued:5:2:0:0::true");
    expect(await state(grainB(today))).toBe("queued:9:0:0:0::true");
  });
});
