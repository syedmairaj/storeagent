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
 * M7-PB1.h.4.2 — metric-grain enqueue serialization adversarial proof
 * (DISPOSABLE LOCAL PG ONLY).
 *
 * Requires an isolated database where migration 20261110130000 has been
 * applied. Connection MUST be supplied explicitly — there is no silent
 * fallback to the existing Supabase DB on 55322.
 *
 * Required env (when RUN_PB1H42_ISOLATED_LIVE=1):
 *   PB1H42_PGHOST, PB1H42_PGPORT, PB1H42_PGDATABASE, PB1H42_PGUSER
 * Optional: PB1H42_PGPASSWORD
 *
 * Authority: docs/M7_PB1_H1_PRODUCTION_EVIDENCE_FENCING_CONTRACT.md §1.2 §3.4 §8.1
 *
 * Does NOT wire production create/approve, workers, or UI.
 * Does NOT touch 127.0.0.1:55322.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_PB1H42_ISOLATED_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const FORBIDDEN_PORTS = new Set(["55322", "54322"]);

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `PB1.h.4.2 isolated live requires ${name} (no silent 55322 fallback)`,
    );
  }
  return value;
}

function isolatedConnection(): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
} {
  const host = requiredEnv("PB1H42_PGHOST");
  const port = requiredEnv("PB1H42_PGPORT");
  const database = requiredEnv("PB1H42_PGDATABASE");
  const user = requiredEnv("PB1H42_PGUSER");
  const password = process.env.PB1H42_PGPASSWORD ?? "";

  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(
      `PB1.h.4.2 isolated live refuses port ${port} (existing Supabase DB is read-only)`,
    );
  }
  if (host === "127.0.0.1" && port === "55322") {
    throw new Error("PB1.h.4.2 isolated live refuses 127.0.0.1:55322");
  }

  return { host, port, database, user, password };
}

const TZ = "UTC";
const ALGORITHM = "m5-derived-metrics-v1";

/** Isolated PB1.h.4.2 synthetic tenants — never merchant data. */
const ORG = "ab142000-0000-4000-8000-000000000001";
const ORG_B = "ab142000-0000-4000-8000-000000000011";
const STORE = "ab142000-0000-4000-8000-000000000002";
const STORE_B = "ab142000-0000-4000-8000-000000000012";
const LOCATION = "ab142000-0000-4000-8000-000000000003";
const LOCATION_2 = "ab142000-0000-4000-8000-000000000013";
const LOCATION_B = "ab142000-0000-4000-8000-000000000023";
const PRODUCT = "ab142000-0000-4000-8000-000000000004";
const PRODUCT_B = "ab142000-0000-4000-8000-000000000014";
const VARIANT = "ab142000-0000-4000-8000-000000000005";
const VARIANT_2 = "ab142000-0000-4000-8000-000000000006";
const VARIANT_B = "ab142000-0000-4000-8000-000000000015";

const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;

type CaseResult = "PASS" | "FAIL" | "SKIP";
const RESULTS: Array<{ id: string; result: CaseResult; detail: string }> = [];

function record(id: string, result: CaseResult, detail: string): void {
  RESULTS.push({ id, result, detail });
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function psqlArgs(): string[] {
  const conn = isolatedConnection();
  return [
    "-h",
    conn.host,
    "-p",
    conn.port,
    "-U",
    conn.user,
    "-d",
    conn.database,
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-q",
    "-t",
    "-A",
  ];
}

function databaseEnv(): NodeJS.ProcessEnv {
  const conn = isolatedConnection();
  return { ...process.env, PGPASSWORD: conn.password };
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync("psql", [...psqlArgs(), "-c", sql], {
    env: databaseEnv(),
  });
  return stdout.trim();
}

async function psqlError(
  sql: string,
): Promise<{ code: string; message: string }> {
  try {
    await psql(sql);
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    const match = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr);
    if (match) {
      return { code: match[1], message: match[2] };
    }
    const soft = /ERROR:\s+([^\n]+)/.exec(stderr);
    if (soft) {
      return { code: "ERROR", message: soft[1] };
    }
    throw error;
  }
  throw new Error("expected SQL to fail");
}

interface Session {
  run: (sql: string, marker: string) => Promise<string>;
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
      const startLen = output.length;
      child.stdin?.write(`${sql}\nselect '${marker}';\n`);
      const started = Date.now();
      while (!output.includes(marker)) {
        if (child.exitCode !== null || Date.now() - started > 60000) {
          throw new Error(`session did not reach ${marker}: ${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return output.slice(startLen);
    },
    async close() {
      child.stdin?.end();
      await exited;
    },
  };
}

async function grainObjectsPresent(): Promise<boolean> {
  const raw = await psql(`
    select (
      to_regprocedure(
        'public.acquire_sku_daily_metric_grain_xact_lock(uuid,uuid,uuid,uuid,date,text)'
      ) is not null
      and exists (
        select 1
        from pg_trigger t
        join pg_class c on t.tgrelid = c.oid
        join pg_namespace n on c.relnamespace = n.oid
        where n.nspname = 'public'
          and c.relname = 'sku_daily_metric_recompute_requests'
          and t.tgname = 'sku_daily_metric_recompute_requests_serialize_grain_xact_lock'
          and not t.tgisinternal
      )
    )::text
  `);
  return raw === "t" || raw === "true";
}

async function inventoryActionCount(): Promise<number> {
  return Number(
    await psql(`
      select count(*)::text
      from public.inventory_actions
      where organization_id in ${TENANTS}
    `),
  );
}

async function metricDateUtc(): Promise<string> {
  return psql(`select (pg_catalog.timezone('UTC', pg_catalog.now()))::date::text`);
}

function metricInsertSql(
  org: string,
  store: string,
  location: string,
  variant: string,
  metricDate: string,
): string {
  return `
    insert into public.sku_daily_metrics (
      organization_id, store_id, location_id, variant_id, metric_date,
      algorithm_version,
      units_sold, returned_units, net_units_sold,
      eligible_days_7d, eligible_days_14d, eligible_days_30d, eligible_days_90d,
      coverage_ratio_7d, coverage_ratio_14d, coverage_ratio_30d, coverage_ratio_90d,
      sales_velocity_7d_reason_code, sales_velocity_14d_reason_code,
      sales_velocity_30d_reason_code, sales_velocity_90d_reason_code,
      eligible_incoming_reason_code,
      days_of_stock_reason_code, safety_stock_reason_code,
      reorder_point_reason_code, target_stock_reason_code,
      inventory_age_quality, inventory_age_reason_code,
      demand_trend, demand_trend_reason_code,
      available_quantity
    ) values (
      ${quote(org)}::uuid, ${quote(store)}::uuid, ${quote(location)}::uuid,
      ${quote(variant)}::uuid, ${quote(metricDate)}::date,
      ${quote(ALGORITHM)},
      0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      'no_eligible_days', 'no_eligible_days', 'no_eligible_days', 'no_eligible_days',
      'incoming_state_unknown',
      'demand_unknown', 'safety_stock_unknown',
      'lead_time_unknown', 'target_stock_unknown',
      'unavailable', 'inventory_age_unknown',
      'unknown', 'trend_input_unknown',
      5
    )
    on conflict do nothing;
  `;
}

async function cleanupFixture(): Promise<void> {
  await psql(`
    delete from public.sku_daily_metric_recompute_requests
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_rollover_enqueues
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_rollover_runs
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metrics
    where organization_id in ${TENANTS};
    delete from public.store_incoming_evidence_attestations
    where organization_id in ${TENANTS};
    delete from public.organization_planning_inputs
    where organization_id in ${TENANTS};
    delete from public.order_items
    where organization_id in ${TENANTS};
    delete from public.orders
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_recompute_requests
    where organization_id in ${TENANTS};
    delete from public.inventory_actions
    where organization_id in ${TENANTS};
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS};
    delete from public.forecast_day_coverage_evidence
    where organization_id in ${TENANTS};
    delete from public.forecast_day_promotion_evidence
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
    delete from public.organizations
    where id in ${TENANTS};
  `);
}

async function seedFixture(metricDate: string): Promise<void> {
  await psql(`
    insert into public.organizations (id, name, default_currency, timezone)
    values
      (${quote(ORG)}::uuid, 'PB1.h.4.2 Live A', 'USD', ${quote(TZ)}),
      (${quote(ORG_B)}::uuid, 'PB1.h.4.2 Live B', 'USD', ${quote(TZ)});

    insert into public.stores (id, organization_id, name, status, currency, timezone)
    values
      (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'H42-A', 'active', 'USD', ${quote(TZ)}),
      (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'H42-B', 'active', 'USD', ${quote(TZ)});

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
      (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1H42-A', 'active'),
      (${quote(VARIANT_2)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1H42-A2', 'active'),
      (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'PB1H42-B', 'active');

    insert into public.organization_planning_inputs (
      organization_id, lead_time_days, safety_stock_days, review_period_days
    ) values (
      ${quote(ORG)}::uuid, 7, 0, 14
    );

    ${metricInsertSql(ORG, STORE, LOCATION, VARIANT, metricDate)}
    ${metricInsertSql(ORG, STORE, LOCATION_2, VARIANT_2, metricDate)}
    ${metricInsertSql(ORG_B, STORE_B, LOCATION_B, VARIANT_B, metricDate)}
  `);
}

async function beginGrainLock(
  session: Session,
  marker: string,
  org = ORG,
  store = STORE,
  location = LOCATION,
  variant = VARIANT,
  metricDate?: string,
): Promise<void> {
  const dateExpr = metricDate
    ? `${quote(metricDate)}::date`
    : `(pg_catalog.timezone('UTC', pg_catalog.now()))::date`;
  await session.run(
    `begin;
     set local lock_timeout = '2s';
     set local statement_timeout = '15s';
     select public.acquire_sku_daily_metric_grain_xact_lock(
       ${quote(org)}::uuid,
       ${quote(store)}::uuid,
       ${quote(location)}::uuid,
       ${quote(variant)}::uuid,
       ${dateExpr},
       ${quote(ALGORITHM)}
     );`,
    marker,
  );
}

function requestInsertSql(
  org: string,
  store: string,
  location: string,
  variant: string,
  metricDate: string,
  dirty = 1,
): string {
  return `
    insert into public.sku_daily_metric_recompute_requests (
      organization_id, store_id, location_id, variant_id, metric_date,
      algorithm_version, dirty_generation, claimed_generation,
      applied_generation, status, attempt_count, queued_at
    ) values (
      ${quote(org)}::uuid, ${quote(store)}::uuid, ${quote(location)}::uuid,
      ${quote(variant)}::uuid, ${quote(metricDate)}::date,
      ${quote(ALGORITHM)}, ${dirty}, 0, 0, 'queued', 0, pg_catalog.now()
    )
  `;
}

let objectsPresent = false;
let suiteConnectionSummary = "";
let metricDate = "";

describeLive("M7-PB1.h.4.2 grain enqueue serialization live", () => {
  beforeAll(async () => {
    const conn = isolatedConnection();
    suiteConnectionSummary = `${conn.host}:${conn.port}/${conn.database}`;
    if (FORBIDDEN_PORTS.has(conn.port)) {
      throw new Error(`refusing forbidden port ${conn.port}`);
    }

    const identity = await psql(`
      select current_database() || '|' || inet_server_port()::text || '|' ||
             (current_setting('data_directory'))
    `);
    process.stdout.write(`\n[PB1.h.4.2] disposable identity: ${identity}\n`);
    if (identity.includes("|55322|") || identity.startsWith("postgres|55322|")) {
      throw new Error("refusing to run against server port 55322");
    }

    objectsPresent = await grainObjectsPresent();
    if (!objectsPresent) {
      process.stdout.write(
        "\n[PB1.h.4.2] UNVERIFIED: grain serialization objects absent on disposable DB. R1–R10 SKIP.\n",
      );
      return;
    }
    metricDate = await metricDateUtc();
    await cleanupFixture();
    await seedFixture(metricDate);
  }, 120000);

  beforeEach(async () => {
    if (!objectsPresent) return;
    await psql(`
      delete from public.sku_daily_metric_recompute_requests
      where organization_id in ${TENANTS};
      delete from public.sku_daily_metric_rollover_enqueues
      where organization_id in ${TENANTS};
      delete from public.sku_daily_metric_rollover_runs
      where organization_id in ${TENANTS};
      delete from public.sku_daily_metric_source_events
      where organization_id in ${TENANTS};
      delete from public.store_incoming_evidence_attestations
      where organization_id in ${TENANTS};
      delete from public.order_items where organization_id in ${TENANTS};
      delete from public.orders where organization_id in ${TENANTS};
    `);
  });

  afterAll(async () => {
    try {
      if (objectsPresent) {
        const actions = await inventoryActionCount();
        expect(actions).toBe(0);
        await cleanupFixture();
      }
    } finally {
      process.stdout.write(
        `\n[PB1.h.4.2] connection=${suiteConnectionSummary}\n[PB1.h.4.2] results:\n${RESULTS.map(
          (row) => `${row.id}\t${row.result}\t${row.detail}`,
        ).join("\n")}\n`,
      );
    }
  }, 120000);

  it("R1 first request INSERT vs held grain lock → 55P03", async () => {
    if (!objectsPresent) {
      record("R1", "SKIP", "objects absent");
      return;
    }
    const holder = await openSession();
    try {
      await beginGrainLock(holder, "r1-held");
      const err = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        ${requestInsertSql(ORG, STORE, LOCATION, VARIANT, metricDate)};
        commit;
      `);
      expect(err.code).toBe("55P03");
      const count = await psql(`
        select count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
          and metric_date = ${quote(metricDate)}::date
      `);
      expect(count).toBe("0");
      record("R1", "PASS", "first INSERT → 55P03 while selection holds 71010402");
    } catch (error) {
      record("R1", "FAIL", String(error));
      throw error;
    } finally {
      await holder.run("rollback;", "r1-rollback");
      await holder.close();
    }
  }, 60000);

  it("R2 existing request UPSERT vs held grain lock → 55P03", async () => {
    if (!objectsPresent) {
      record("R2", "SKIP", "objects absent");
      return;
    }
    await psql(`
      select public.acquire_sku_daily_metric_grain_xact_lock(
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date, ${quote(ALGORITHM)}
      );
      ${requestInsertSql(ORG, STORE, LOCATION, VARIANT, metricDate, 1)};
    `);
    const before = await psql(`
      select dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    expect(before).toBe("1");

    const holder = await openSession();
    try {
      await beginGrainLock(holder, "r2-held");
      const err = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        select public.enqueue_sku_daily_metric_planning_invalidation(
          ${quote(ORG)}::uuid
        );
        commit;
      `);
      expect(err.code).toBe("55P03");
      const after = await psql(`
        select dirty_generation::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
          and metric_date = ${quote(metricDate)}::date
      `);
      expect(after).toBe("1");
      record("R2", "PASS", "planning UPSERT → 55P03; dirty_generation stable");
    } catch (error) {
      record("R2", "FAIL", String(error));
      throw error;
    } finally {
      await holder.run("rollback;", "r2-rollback");
      await holder.close();
    }
  }, 60000);

  it("R3 planning invalidation serializes and bumps dirty generation", async () => {
    if (!objectsPresent) {
      record("R3", "SKIP", "objects absent");
      return;
    }
    const n = await psql(`
      select public.enqueue_sku_daily_metric_planning_invalidation(
        ${quote(ORG)}::uuid
      )::text
    `);
    expect(Number(n)).toBeGreaterThanOrEqual(1);
    const dirty = await psql(`
      select dirty_generation::text || ':' || status
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    expect(dirty).toBe("1:queued");

    const n2 = await psql(`
      select public.enqueue_sku_daily_metric_planning_invalidation(
        ${quote(ORG)}::uuid
      )::text
    `);
    expect(Number(n2)).toBeGreaterThanOrEqual(1);
    const dirty2 = await psql(`
      select dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    expect(dirty2).toBe("2");
    record("R3", "PASS", "planning enqueue serialized; dirty 1→2");
  }, 60000);

  it("R4 incoming/attestation invalidation serializes and bumps dirty", async () => {
    if (!objectsPresent) {
      record("R4", "SKIP", "objects absent");
      return;
    }
    const n = await psql(`
      select public.enqueue_sku_daily_metric_store_incoming_invalidation(
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid
      )::text
    `);
    expect(Number(n)).toBeGreaterThanOrEqual(1);
    const dirty = await psql(`
      select dirty_generation::text || ':' || status
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and store_id = ${quote(STORE)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    expect(dirty).toBe("1:queued");

    await psql(`
      insert into public.store_incoming_evidence_attestations (
        organization_id, store_id, evidence_complete
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true
      )
      on conflict (organization_id, store_id) do update
      set evidence_complete = not public.store_incoming_evidence_attestations.evidence_complete,
          updated_at = pg_catalog.now();
    `);
    const dirty2 = await psql(`
      select dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    expect(Number(dirty2)).toBeGreaterThanOrEqual(2);
    record("R4", "PASS", "incoming/attestation enqueue bumps dirty under grain lock");
  }, 60000);

  it("R5 historical sales consume/enqueue does not miss work", async () => {
    if (!objectsPresent) {
      record("R5", "SKIP", "objects absent");
      return;
    }
    const sourceDate = await psql(
      `select (${quote(metricDate)}::date - 3)::text`,
    );
    await psql(`
      insert into public.sku_daily_metric_source_events (
        organization_id, store_id, location_id, variant_id,
        source_date, algorithm_version
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid, ${quote(sourceDate)}::date, ${quote(ALGORITHM)}
      );
    `);
    const consumed = await psql(`
      select public.consume_sku_daily_metric_source_events(
        10, ${quote(ORG)}::uuid
      )::text
    `);
    expect(Number(consumed)).toBeGreaterThanOrEqual(1);
    const pending = await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and consumed_at is null
    `);
    expect(pending).toBe("0");
    const requests = await psql(`
      select count(*)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and dirty_generation > 0
    `);
    expect(Number(requests)).toBeGreaterThanOrEqual(1);
    record("R5", "PASS", "consume locks grains; no unconsumed events; requests present");
  }, 60000);

  it("R6 daily rollover enrolls without duplicate/lost generation", async () => {
    if (!objectsPresent) {
      record("R6", "SKIP", "objects absent");
      return;
    }
    // Seed commerce evidence so rollover has grains to enroll.
    await psql(`
      insert into public.orders (
        id, organization_id, store_id, external_reference, status,
        ordered_at, currency, source
      ) values (
        'ab142000-0000-4000-8000-000000000071'::uuid,
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'H42-ORD-1', 'completed',
        -- Must be <= rollover eligible_cutoff_at (clock_timestamp); avoid
        -- future local wall times when the suite runs early UTC.
        pg_catalog.now() - interval '1 hour',
        'USD', 'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, location_id, variant_id,
        quantity, unit_price_amount, currency
      ) values (
        'ab142000-0000-4000-8000-000000000072'::uuid,
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'ab142000-0000-4000-8000-000000000071'::uuid,
        ${quote(LOCATION)}::uuid, ${quote(VARIANT)}::uuid,
        1, 10, 'USD'
      );
    `);
    // Clear requests created by order triggers so rollover enrollment is visible.
    await psql(`
      delete from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid;
      delete from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid;
    `);

    const first = await psql(`
      select public.enqueue_sku_daily_metric_daily_rollover(
        50, 4, ${quote(ORG)}::uuid, pg_catalog.now()
      )::text
    `);
    expect(first).toContain("grainsEnrolled");
    const dirty1 = await psql(`
      select coalesce(max(dirty_generation),0)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    expect(Number(dirty1)).toBeGreaterThanOrEqual(1);

    const second = await psql(`
      select public.enqueue_sku_daily_metric_daily_rollover(
        50, 4, ${quote(ORG)}::uuid, pg_catalog.now()
      )::text
    `);
    const dirty2 = await psql(`
      select coalesce(max(dirty_generation),0)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    // Enrollment uniqueness gates second dirty bump for same grain/day.
    expect(dirty2).toBe(dirty1);
    expect(second).toContain("grainsEnrolled");
    record(
      "R6",
      "PASS",
      `rollover enrolled; dirty stable across re-run (${dirty1}); payloads ok`,
    );
  }, 90000);

  it("R7 claim/recompute compatibility — no stale success under open dirty", async () => {
    if (!objectsPresent) {
      record("R7", "SKIP", "objects absent");
      return;
    }
    await psql(`
      select public.acquire_sku_daily_metric_grain_xact_lock(
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date, ${quote(ALGORITHM)}
      );
      ${requestInsertSql(ORG, STORE, LOCATION, VARIANT, metricDate, 3)};
    `);
    const claimed = await psql(`
      select count(*)::text
      from public.claim_sku_daily_metric_recompute_requests(
        'pb1h42-worker', 4, 120, 4, ${quote(ORG)}::uuid
      )
    `);
    expect(Number(claimed)).toBeGreaterThanOrEqual(1);
    const row = await psql(`
      select status || ':' || claimed_generation::text || ':' || dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    expect(row.startsWith("claimed:")).toBe(true);
    expect(row.endsWith(":3")).toBe(true);
    // Further dirty while claimed preserves lease status.
    await psql(`
      select public.enqueue_sku_daily_metric_planning_invalidation(
        ${quote(ORG)}::uuid
      );
    `);
    const after = await psql(`
      select status || ':' || dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and metric_date = ${quote(metricDate)}::date
    `);
    expect(after.startsWith("claimed:")).toBe(true);
    expect(after.endsWith(":4")).toBe(true);
    record("R7", "PASS", "claim works; planning dirty under claimed preserves lease");
  }, 60000);

  it("R8 multi-grain opposite-order writers fail closed or serialize", async () => {
    if (!objectsPresent) {
      record("R8", "SKIP", "objects absent");
      return;
    }
    const a = await openSession();
    const b = await openSession();
    try {
      await a.run(
        `begin;
         set local lock_timeout = '2s';
         set local deadlock_timeout = '100ms';
         select public.acquire_sku_daily_metric_grain_xact_lock(
           ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
           ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date, ${quote(ALGORITHM)}
         );`,
        "r8-a1",
      );
      await b.run(
        `begin;
         set local lock_timeout = '2s';
         set local deadlock_timeout = '100ms';
         select public.acquire_sku_daily_metric_grain_xact_lock(
           ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION_2)}::uuid,
           ${quote(VARIANT_2)}::uuid, ${quote(metricDate)}::date, ${quote(ALGORITHM)}
         );`,
        "r8-b1",
      );

      const a2 = a.run(
        `select public.acquire_sku_daily_metric_grain_xact_lock(
           ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION_2)}::uuid,
           ${quote(VARIANT_2)}::uuid, ${quote(metricDate)}::date, ${quote(ALGORITHM)}
         );
         ${requestInsertSql(ORG, STORE, LOCATION, VARIANT, metricDate, 1)};
         ${requestInsertSql(ORG, STORE, LOCATION_2, VARIANT_2, metricDate, 1)};
         commit;
         select 'r8-a-done';`,
        "r8-a-done",
      );
      await new Promise((r) => setTimeout(r, 50));
      const b2 = b.run(
        `select public.acquire_sku_daily_metric_grain_xact_lock(
           ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
           ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date, ${quote(ALGORITHM)}
         );
         ${requestInsertSql(ORG, STORE, LOCATION_2, VARIANT_2, metricDate, 1)};
         ${requestInsertSql(ORG, STORE, LOCATION, VARIANT, metricDate, 1)};
         commit;
         select 'r8-b-done';`,
        "r8-b-done",
      );

      const settled = await Promise.allSettled([a2, b2]);
      const outputs = settled.map((s) =>
        s.status === "fulfilled" ? s.value : String(s.reason),
      );
      const joined = outputs.join("\n");
      const failClosed =
        /55P03|40P01|lock timeout|deadlock detected|session did not reach/i.test(
          joined,
        );
      const oneCommitted = (joined.match(/r8-[ab]-done/g) ?? []).length >= 1;
      expect(failClosed || oneCommitted).toBe(true);

      const counts = await psql(`
        select count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and metric_date = ${quote(metricDate)}::date
          and variant_id in (${quote(VARIANT)}::uuid, ${quote(VARIANT_2)}::uuid)
      `);
      // At most one TX's full multi-grain write (0 if both aborted, 2 if one committed).
      expect(["0", "2"].includes(counts)).toBe(true);
      record(
        "R8",
        "PASS",
        `opposite-order writers fail-closed/serialize; request count=${counts}`,
      );
    } catch (error) {
      record("R8", "FAIL", String(error));
      throw error;
    } finally {
      try {
        await a.run("rollback;", "r8-a-rb");
      } catch {
        /* session may already be dead */
      }
      try {
        await b.run("rollback;", "r8-b-rb");
      } catch {
        /* session may already be dead */
      }
      await a.close();
      await b.close();
    }
  }, 90000);

  it("R9 cross-org isolation — Org-B commits while Org-A grain locked", async () => {
    if (!objectsPresent) {
      record("R9", "SKIP", "objects absent");
      return;
    }
    const holder = await openSession();
    try {
      await beginGrainLock(holder, "r9-held");
      await psql(`
        begin;
        set local lock_timeout = '2s';
        ${requestInsertSql(ORG_B, STORE_B, LOCATION_B, VARIANT_B, metricDate, 1)};
        commit;
      `);
      const b = await psql(`
        select dirty_generation::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG_B)}::uuid
          and variant_id = ${quote(VARIANT_B)}::uuid
      `);
      expect(b).toBe("1");
      const a = await psql(`
        select count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
      `);
      expect(a).toBe("0");
      record("R9", "PASS", "Org-B INSERT commits while Org-A holds 71010402");
    } catch (error) {
      record("R9", "FAIL", String(error));
      throw error;
    } finally {
      await holder.run("rollback;", "r9-rollback");
      await holder.close();
    }
  }, 60000);

  it("R10 direct DML / permissions / timeout / atomicity fail closed", async () => {
    if (!objectsPresent) {
      record("R10", "SKIP", "objects absent");
      return;
    }
    const holder = await openSession();
    try {
      await beginGrainLock(holder, "r10-held");
      const direct = await psqlError(`
        begin;
        set local lock_timeout = '1s';
        ${requestInsertSql(ORG, STORE, LOCATION, VARIANT, metricDate, 1)};
        commit;
      `);
      expect(direct.code).toBe("55P03");

      // service_role must not have INSERT privilege (fail closed).
      const priv = await psql(`
        select has_table_privilege('service_role',
          'public.sku_daily_metric_recompute_requests', 'INSERT')::text
      `);
      expect(["f", "false"].includes(priv)).toBe(true);
      const sel = await psql(`
        select has_table_privilege('service_role',
          'public.sku_daily_metric_recompute_requests', 'SELECT')::text
      `);
      expect(["t", "true"].includes(sel)).toBe(true);

      const count = await psql(`
        select count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
      `);
      expect(count).toBe("0");
      record(
        "R10",
        "PASS",
        "direct INSERT 55P03; service_role INSERT revoked; SELECT retained; no partial row",
      );
    } catch (error) {
      record("R10", "FAIL", String(error));
      throw error;
    } finally {
      await holder.run("rollback;", "r10-rollback");
      await holder.close();
    }
  }, 60000);
});
