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
 * M7-PB1.h.4.3 — create-evidence fence scaffold dual-TX proof
 * (DISPOSABLE LOCAL PG ONLY).
 *
 * Requires an isolated database where h.4.1 + h.4.2 + h.4.3 have been
 * applied. Connection MUST be supplied explicitly — no silent fallback
 * to existing Supabase DB on 55322.
 *
 * Required env (when RUN_PB1H43_ISOLATED_LIVE=1):
 *   PB1H43_PGHOST, PB1H43_PGPORT, PB1H43_PGDATABASE, PB1H43_PGUSER
 * Optional: PB1H43_PGPASSWORD
 *
 * Authority: docs/M7_PB1_H1_PRODUCTION_EVIDENCE_FENCING_CONTRACT.md §1.2–§1.3 §8.1
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_PB1H43_ISOLATED_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const FORBIDDEN_PORTS = new Set(["55322", "54322"]);

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `PB1.h.4.3 isolated live requires ${name} (no silent 55322 fallback)`,
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
  const host = requiredEnv("PB1H43_PGHOST");
  const port = requiredEnv("PB1H43_PGPORT");
  const database = requiredEnv("PB1H43_PGDATABASE");
  const user = requiredEnv("PB1H43_PGUSER");
  const password = process.env.PB1H43_PGPASSWORD ?? "";

  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(
      `PB1.h.4.3 isolated live refuses port ${port} (existing Supabase DB is read-only)`,
    );
  }
  if (host === "127.0.0.1" && port === "55322") {
    throw new Error("PB1.h.4.3 isolated live refuses 127.0.0.1:55322");
  }

  return { host, port, database, user, password };
}

const TZ = "UTC";
const ALGORITHM = "m5-derived-metrics-v1";

const ORG = "ab143000-0000-4000-8000-000000000001";
const ORG_B = "ab143000-0000-4000-8000-000000000011";
const STORE = "ab143000-0000-4000-8000-000000000002";
const STORE_B = "ab143000-0000-4000-8000-000000000012";
const LOCATION = "ab143000-0000-4000-8000-000000000003";
const LOCATION_B = "ab143000-0000-4000-8000-000000000013";
const PRODUCT = "ab143000-0000-4000-8000-000000000004";
const PRODUCT_B = "ab143000-0000-4000-8000-000000000014";
const VARIANT = "ab143000-0000-4000-8000-000000000005";
const VARIANT_B = "ab143000-0000-4000-8000-000000000015";
const SUPPLIER_1 = "ab143000-0000-4000-8000-000000000006";
const SUPPLIER_2 = "ab143000-0000-4000-8000-000000000007";
const SUPPLIER_B = "ab143000-0000-4000-8000-000000000016";
const PO = "ab143000-0000-4000-8000-000000000008";

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

async function fenceObjectsPresent(): Promise<boolean> {
  const raw = await psql(`
    select (
      to_regprocedure(
        'public.evaluate_pb1_create_evidence_fence(uuid,uuid,uuid,uuid,date,text,text,text,text,uuid,uuid,timestamptz,integer)'
      ) is not null
      and to_regprocedure(
        'public.acquire_sku_daily_metric_grain_xact_lock(uuid,uuid,uuid,uuid,date,text)'
      ) is not null
      and to_regprocedure(
        'public.acquire_supplier_products_org_variant_xact_lock(uuid,uuid)'
      ) is not null
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
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metrics
    where organization_id in ${TENANTS};
    delete from public.purchase_order_items
    where organization_id in ${TENANTS};
    delete from public.purchase_orders
    where organization_id in ${TENANTS};
    delete from public.inventory_snapshots
    where organization_id in ${TENANTS};
    delete from public.order_items
    where organization_id in ${TENANTS};
    delete from public.orders
    where organization_id in ${TENANTS};
    delete from public.store_incoming_evidence_attestations
    where organization_id in ${TENANTS};
    delete from public.supplier_products
    where organization_id in ${TENANTS};
    delete from public.suppliers
    where organization_id in ${TENANTS};
    delete from public.organization_planning_inputs
    where organization_id in ${TENANTS};
    delete from public.inventory_actions
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
      (${quote(ORG)}::uuid, 'PB1.h.4.3 Live A', 'USD', ${quote(TZ)}),
      (${quote(ORG_B)}::uuid, 'PB1.h.4.3 Live B', 'USD', ${quote(TZ)});

    insert into public.stores (id, organization_id, name, status, currency, timezone)
    values
      (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'H43-A', 'active', 'USD', ${quote(TZ)}),
      (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'H43-B', 'active', 'USD', ${quote(TZ)});

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
      (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1H43-A', 'active'),
      (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'PB1H43-B', 'active');

    insert into public.suppliers (id, organization_id, name, currency)
    values
      (${quote(SUPPLIER_1)}::uuid, ${quote(ORG)}::uuid, 'H43 Preferred', 'USD'),
      (${quote(SUPPLIER_2)}::uuid, ${quote(ORG)}::uuid, 'H43 Secondary', 'USD'),
      (${quote(SUPPLIER_B)}::uuid, ${quote(ORG_B)}::uuid, 'H43 OrgB', 'USD');

    insert into public.organization_planning_inputs (
      organization_id, lead_time_days, safety_stock_days, review_period_days
    ) values (
      ${quote(ORG)}::uuid, 7, 0, 14
    );

    ${metricInsertSql(ORG, STORE, LOCATION, VARIANT, metricDate)}
    ${metricInsertSql(ORG_B, STORE_B, LOCATION_B, VARIANT_B, metricDate)}

    insert into public.supplier_products (
      organization_id, supplier_id, variant_id,
      supplier_sku, currency, lead_time_days, preferred
    ) values (
      ${quote(ORG)}::uuid, ${quote(SUPPLIER_1)}::uuid, ${quote(VARIANT)}::uuid,
      'H43-PREF', 'USD', 5, true
    );

    insert into public.supplier_products (
      organization_id, supplier_id, variant_id,
      supplier_sku, currency, lead_time_days, preferred
    ) values (
      ${quote(ORG_B)}::uuid, ${quote(SUPPLIER_B)}::uuid, ${quote(VARIANT_B)}::uuid,
      'H43-B', 'USD', 4, true
    );

    insert into public.purchase_orders (
      id, organization_id, store_id, supplier_id, status, source, currency
    ) values (
      ${quote(PO)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
      ${quote(SUPPLIER_1)}::uuid, 'confirmed', 'other', 'USD'
    );
  `);
}

type FenceEvidence = {
  token: string;
  watermark: string;
  supplierProductId: string;
  supplierUpdatedAt: string;
  leadTimeDays: number;
};

async function loadFenceEvidence(
  org = ORG,
  store = STORE,
  location = LOCATION,
  variant = VARIANT,
  metricDate?: string,
  supplierId = SUPPLIER_1,
): Promise<FenceEvidence> {
  const dateExpr = metricDate
    ? `${quote(metricDate)}::date`
    : `(pg_catalog.timezone('UTC', pg_catalog.now()))::date`;

  const raw = await psql(`
    with snap as (
      select public.sku_daily_metric_source_snapshot(
        ${quote(org)}::uuid,
        ${quote(store)}::uuid,
        ${quote(location)}::uuid,
        ${quote(variant)}::uuid
      ) as j
    ),
    metric as (
      select
        'm7-pb1-metric-source-watermark-v1'
          || '|' || metric_date::text
          || '|' || algorithm_version
          || '|' || (to_jsonb(updated_at) #>> '{}') as watermark
      from public.sku_daily_metrics
      where organization_id = ${quote(org)}::uuid
        and store_id = ${quote(store)}::uuid
        and location_id = ${quote(location)}::uuid
        and variant_id = ${quote(variant)}::uuid
        and metric_date = ${dateExpr}
        and algorithm_version = ${quote(ALGORITHM)}
    ),
    supplier as (
      select
        id::text as id,
        (to_jsonb(updated_at) #>> '{}') as updated_at,
        lead_time_days as lt
      from public.supplier_products
      where organization_id = ${quote(org)}::uuid
        and supplier_id = ${quote(supplierId)}::uuid
        and variant_id = ${quote(variant)}::uuid
    )
    select jsonb_build_object(
      'token', (select j->>'sourceToken' from snap),
      'watermark', (select watermark from metric),
      'supplierProductId', (select id from supplier),
      'supplierUpdatedAt', (select updated_at from supplier),
      'leadTimeDays', (select lt from supplier)
    )::text
  `);

  const parsed = JSON.parse(raw) as {
    token: string;
    watermark: string;
    supplierProductId: string;
    supplierUpdatedAt: string;
    leadTimeDays: number;
  };
  return parsed;
}

function fenceCallSql(
  evidence: FenceEvidence,
  opts: {
    org?: string;
    store?: string;
    location?: string;
    variant?: string;
    metricDate?: string;
    supplierId?: string | null;
    token?: string;
    watermark?: string;
    boundSupplier?: boolean;
    algorithm?: string;
    pinnedTz?: string;
  } = {},
): string {
  const org = opts.org ?? ORG;
  const store = opts.store ?? STORE;
  const location = opts.location ?? LOCATION;
  const variant = opts.variant ?? VARIANT;
  const dateExpr = opts.metricDate
    ? `${quote(opts.metricDate)}::date`
    : `(pg_catalog.timezone('UTC', pg_catalog.now()))::date`;
  const supplierExpr =
    opts.supplierId === null
      ? "null::uuid"
      : opts.supplierId === undefined
        ? "null::uuid"
        : `${quote(opts.supplierId)}::uuid`;
  const bound = opts.boundSupplier !== false;
  return `
    select public.evaluate_pb1_create_evidence_fence(
      ${quote(org)}::uuid,
      ${quote(store)}::uuid,
      ${quote(location)}::uuid,
      ${quote(variant)}::uuid,
      ${dateExpr},
      ${quote(opts.algorithm ?? ALGORITHM)},
      ${quote(opts.pinnedTz ?? TZ)},
      ${quote(opts.token ?? evidence.token)},
      ${quote(opts.watermark ?? evidence.watermark)},
      ${supplierExpr},
      ${bound ? `${quote(evidence.supplierProductId)}::uuid` : "null::uuid"},
      ${bound ? `${quote(evidence.supplierUpdatedAt)}::timestamptz` : "null::timestamptz"},
      ${bound ? `${evidence.leadTimeDays}` : "null::integer"}
    )::text
  `;
}

async function beginFenceHold(
  session: Session,
  marker: string,
  evidence: FenceEvidence,
  opts: Parameters<typeof fenceCallSql>[1] = {},
): Promise<string> {
  const out = await session.run(
    `begin;
     set local lock_timeout = '2s';
     set local statement_timeout = '15s';
     ${fenceCallSql(evidence, opts)};`,
    marker,
  );
  return out;
}

describeLive("M7-PB1.h.4.3 create-evidence fence isolated dual-TX", () => {
  let metricDate = "";

  beforeAll(async () => {
    const conn = isolatedConnection();
    console.log(
      `[PB1.h.4.3] connection=${conn.host}:${conn.port}/${conn.database}`,
    );
    const present = await fenceObjectsPresent();
    if (!present) {
      throw new Error(
        "PB1.h.4.3 objects missing on isolated DB (apply h.4.1+h.4.2+h.4.3 first)",
      );
    }
    metricDate = await metricDateUtc();
  });

  beforeEach(async () => {
    await cleanupFixture();
    await seedFixture(metricDate);
  });

  afterAll(async () => {
    await cleanupFixture();
    console.log("[PB1.h.4.3] results", JSON.stringify(RESULTS, null, 2));
  });

  it("F1 preferred INSERT blocked while fence holds supplier advisory", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      const held = await beginFenceHold(fence, "F1_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });
      expect(held).toMatch(/"disposition"\s*:\s*"PASS"/);

      // Direct INSERT hits BEFORE ROW try-acquire → 55P03 while fence holds 71010401.
      const blockedInsert = await psqlError(`
        set lock_timeout = '2s';
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
          'H43-PHANTOM', 'USD', 9, true
        );
      `);
      expect(blockedInsert.code).toBe("55P03");

      await fence.run("rollback;", "F1_RB");
      record(
        "F1",
        "PASS",
        "preferred INSERT 55P03 under fence-held supplier advisory 71010401",
      );
    } catch (error) {
      record("F1", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 90000);

  it("F2 supplier LT UPDATE/DELETE blocked under fence FOR UPDATE", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      await beginFenceHold(fence, "F2_HOLD", evidence, {
        supplierId: SUPPLIER_1,
      });

      const upd = await psqlError(`
        set lock_timeout = '2s';
        update public.supplier_products
        set lead_time_days = 99
        where id = ${quote(evidence.supplierProductId)}::uuid;
      `);
      expect(upd.code).toBe("55P03");

      const del = await psqlError(`
        set lock_timeout = '2s';
        delete from public.supplier_products
        where id = ${quote(evidence.supplierProductId)}::uuid;
      `);
      expect(del.code).toBe("55P03");

      await fence.run("rollback;", "F2_RB");
      record("F2", "PASS", "LT UPDATE/DELETE 55P03 under fence supplier row lock");
    } catch (error) {
      record("F2", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 60000);

  it("F3 in-window sales source writer blocked by fence SHARE", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      await beginFenceHold(fence, "F3_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });

      const err = await psqlError(`
        set lock_timeout = '2s';
        insert into public.orders (
          id, organization_id, store_id, status, currency, source, ordered_at
        ) values (
          gen_random_uuid(), ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
          'completed', 'USD', 'other', now() - interval '3 days'
        );
      `);
      expect(err.code).toBe("55P03");
      await fence.run("rollback;", "F3_RB");
      record("F3", "PASS", "orders INSERT 55P03 under fence source SHARE");
    } catch (error) {
      record("F3", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 60000);

  it("F4 inventory snapshot blocked + stale token rejects", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      await beginFenceHold(fence, "F4_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });
      const blocked = await psqlError(`
        set lock_timeout = '2s';
        insert into public.inventory_snapshots (
          organization_id, store_id, location_id, variant_id,
          observed_at, available_quantity, source
        ) values (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
          ${quote(VARIANT)}::uuid, now(), 3, 'other'
        );
      `);
      expect(blocked.code).toBe("55P03");
      await fence.run("rollback;", "F4_RB");

      const stale = await psql(`
        ${fenceCallSql(evidence, {
          supplierId: null,
          boundSupplier: false,
          token: "ffffffffffffffffffffffffffffffff",
        })}
      `);
      expect(stale).toMatch(/"code"\s*:\s*"SA008"/);
      expect(await inventoryActionCount()).toBe(0);
      record("F4", "PASS", "snapshot SHARE block + SA008 reject on token drift");
    } catch (error) {
      record("F4", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 60000);

  it("F5 planning dirty-generation race blocked by grain advisory", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      await beginFenceHold(fence, "F5_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });

      const err = await psqlError(`
        set lock_timeout = '2s';
        select public.enqueue_sku_daily_metric_planning_invalidation(
          ${quote(ORG)}::uuid
        );
      `);
      expect(err.code).toBe("55P03");
      await fence.run("rollback;", "F5_RB");
      record("F5", "PASS", "planning enqueue 55P03 under fence grain advisory");
    } catch (error) {
      record("F5", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 60000);

  it("F6 incoming attestation mutation blocked by fence SHARE", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      await beginFenceHold(fence, "F6_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });
      const err = await psqlError(`
        set lock_timeout = '2s';
        insert into public.store_incoming_evidence_attestations (
          organization_id, store_id, evidence_complete
        ) values (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true
        )
        on conflict (organization_id, store_id) do update
        set evidence_complete = excluded.evidence_complete;
      `);
      expect(err.code).toBe("55P03");
      await fence.run("rollback;", "F6_RB");
      record("F6", "PASS", "attestation upsert 55P03 under fence SHARE");
    } catch (error) {
      record("F6", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 60000);

  it("F7 PO/item source mutation blocked by fence SHARE", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      await beginFenceHold(fence, "F7_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });
      const err = await psqlError(`
        set lock_timeout = '2s';
        insert into public.purchase_order_items (
          organization_id, store_id, purchase_order_id, variant_id,
          destination_location_id, ordered_quantity, currency
        ) values (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PO)}::uuid,
          ${quote(VARIANT)}::uuid, ${quote(LOCATION)}::uuid, 2, 'USD'
        );
      `);
      expect(err.code).toBe("55P03");
      await fence.run("rollback;", "F7_RB");
      record("F7", "PASS", "PO item INSERT 55P03 under fence SHARE");
    } catch (error) {
      record("F7", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 60000);

  it("F8 first recompute-request INSERT blocked by grain advisory", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      await beginFenceHold(fence, "F8_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });
      const err = await psqlError(`
        set lock_timeout = '2s';
        insert into public.sku_daily_metric_recompute_requests (
          organization_id, store_id, location_id, variant_id, metric_date,
          algorithm_version, dirty_generation, claimed_generation,
          applied_generation, status, attempt_count, queued_at
        ) values (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
          ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date,
          ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0, now()
        );
      `);
      expect(err.code).toBe("55P03");
      await fence.run("rollback;", "F8_RB");
      record("F8", "PASS", "first request INSERT 55P03 under fence 71010402");
    } catch (error) {
      record("F8", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 60000);

  it("F9 claim skips/busy while fence holds request row; open request rejects", async () => {
    await psql(`
      select public.acquire_sku_daily_metric_grain_xact_lock(
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date, ${quote(ALGORITHM)}
      );
      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id, metric_date,
        algorithm_version, dirty_generation, claimed_generation,
        applied_generation, status, attempt_count, queued_at
      ) values (
        ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date,
        ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0, now()
      );
    `);

    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    try {
      const rejected = await beginFenceHold(fence, "F9_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });
      expect(rejected).toMatch(/"code"\s*:\s*"PENDING_RECOMPUTE"/);

      // Fence still holds request FOR UPDATE after REJECT; claim must SKIP LOCKED → 0.
      const claimed = await psql(`
        select coalesce(count(*)::text, '0')
        from public.claim_sku_daily_metric_recompute_requests(
          'pb1h43-f9', 4, 30, 4, ${quote(ORG)}::uuid
        );
      `);
      expect(Number(claimed)).toBe(0);

      await fence.run("rollback;", "F9_RB");
      record(
        "F9",
        "PASS",
        "PENDING_RECOMPUTE under held request lock; claim returned 0 (SKIP LOCKED)",
      );
    } catch (error) {
      record("F9", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
    }
  }, 90000);

  it("F10 SHARE-before-metric order does not deadlock with commit", async () => {
    const evidence = await loadFenceEvidence();
    const fence = await openSession();
    const commitTx = await openSession();
    try {
      await beginFenceHold(fence, "F10_HOLD", evidence, {
        supplierId: null,
        boundSupplier: false,
      });

      // commit waits on metric row FOR UPDATE held by fence; no deadlock cycle.
      const commitPromise = commitTx.run(
        `begin;
         set local lock_timeout = '5s';
         set local statement_timeout = '15s';
         select public.commit_sku_daily_metric(
           ${quote(ORG)}::uuid,
           ${quote(STORE)}::uuid,
           ${quote(LOCATION)}::uuid,
           ${quote(VARIANT)}::uuid,
           ${quote(metricDate)}::date,
           ${quote(evidence.token)},
           jsonb_build_object(
             'timeZone', ${quote(TZ)},
             'unitsSold', 0,
             'returnedUnits', 0,
             'netUnitsSold', 0,
             'eligibleDays7d', 0,
             'eligibleDays14d', 0,
             'eligibleDays30d', 0,
             'eligibleDays90d', 0,
             'coverageRatio7d', 0,
             'coverageRatio14d', 0,
             'coverageRatio30d', 0,
             'coverageRatio90d', 0,
             'salesVelocity7dReasonCode', 'no_eligible_days',
             'salesVelocity14dReasonCode', 'no_eligible_days',
             'salesVelocity30dReasonCode', 'no_eligible_days',
             'salesVelocity90dReasonCode', 'no_eligible_days',
             'availableQuantity', 5,
             'eligibleIncomingReasonCode', 'incoming_state_unknown',
             'daysOfStockReasonCode', 'demand_unknown',
             'safetyStockReasonCode', 'safety_stock_unknown',
             'reorderPointReasonCode', 'lead_time_unknown',
             'targetStockReasonCode', 'target_stock_unknown',
             'inventoryAgeQuality', 'unavailable',
             'inventoryAgeReasonCode', 'inventory_age_unknown',
             'demandTrend', 'unknown',
             'demandTrendReasonCode', 'trend_input_unknown'
           )
         );`,
        "F10_COMMIT_DONE",
      );

      await new Promise((r) => setTimeout(r, 400));
      let raced = false;
      try {
        await Promise.race([
          commitPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("wait-on-metric")), 1500),
          ),
        ]);
      } catch {
        raced = true;
      }
      expect(raced).toBe(true);

      await fence.run("commit;", "F10_FENCE_COMMIT");
      const commitOut = await commitPromise;
      expect(commitOut).not.toMatch(/40P01|deadlock/i);
      await commitTx.run("commit;", "F10_COMMIT_TX");
      record(
        "F10",
        "PASS",
        "commit waited on fence metric lock; no deadlock under SHARE-before-metric",
      );
    } catch (error) {
      record("F10", "FAIL", String(error));
      throw error;
    } finally {
      await fence.close();
      await commitTx.close();
    }
  }, 90000);

  it("F11 cross-org isolation + timeout/rollback", async () => {
    const evidenceA = await loadFenceEvidence();
    const evidenceB = await loadFenceEvidence(
      ORG_B,
      STORE_B,
      LOCATION_B,
      VARIANT_B,
      metricDate,
      SUPPLIER_B,
    );
    const fenceA = await openSession();
    try {
      await beginFenceHold(fenceA, "F11_HOLD", evidenceA, {
        supplierId: null,
        boundSupplier: false,
      });

      const passB = await psql(
        fenceCallSql(evidenceB, {
          org: ORG_B,
          store: STORE_B,
          location: LOCATION_B,
          variant: VARIANT_B,
          supplierId: null,
          boundSupplier: false,
        }),
      );
      expect(passB).toMatch(/"disposition"\s*:\s*"PASS"/);

      const blocked = await psqlError(`
        set lock_timeout = '2s';
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
          'H43-ISO', 'USD', 8, true
        );
      `);
      expect(blocked.code).toBe("55P03");

      await fenceA.run("rollback;", "F11_RB");
      record("F11", "PASS", "Org-B PASS while Org-A held; Org-A writer 55P03");
    } catch (error) {
      record("F11", "FAIL", String(error));
      throw error;
    } finally {
      await fenceA.close();
    }
  }, 90000);

  it("F12 stale/ambiguous/missing supplier and metric evidence", async () => {
    const evidence = await loadFenceEvidence();

    const missingMetric = await psql(`
      ${fenceCallSql(evidence, {
        metricDate: "2000-01-01",
        supplierId: null,
        boundSupplier: false,
      })}
    `);
    expect(missingMetric).toMatch(
      /"code"\s*:\s*"(METRIC_DATE_NOT_CURRENT|METRIC_EVIDENCE_UNPROVEN)"/,
    );

    await psql(`
      select public.acquire_supplier_products_org_variant_xact_lock(
        ${quote(ORG)}::uuid, ${quote(VARIANT)}::uuid
      );
      insert into public.supplier_products (
        organization_id, supplier_id, variant_id,
        supplier_sku, currency, lead_time_days, preferred
      ) values (
        ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
        'H43-AMB', 'USD', 6, true
      );
    `);
    const amb = await psql(
      fenceCallSql(evidence, { supplierId: null, boundSupplier: false }),
    );
    expect(amb).toMatch(/"code"\s*:\s*"SUPPLIER_FACTS_AMBIGUOUS"/);

    await psql(`
      select public.acquire_supplier_products_org_variant_xact_lock(
        ${quote(ORG)}::uuid, ${quote(VARIANT)}::uuid
      );
      delete from public.supplier_products
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid;
    `);
    const absent = await psql(
      fenceCallSql(evidence, { supplierId: null, boundSupplier: false }),
    );
    expect(absent).toMatch(/"code"\s*:\s*"SUPPLIER_FACTS_ABSENT"/);

    await psql(`
      select public.acquire_supplier_products_org_variant_xact_lock(
        ${quote(ORG)}::uuid, ${quote(VARIANT)}::uuid
      );
      insert into public.supplier_products (
        organization_id, supplier_id, variant_id,
        supplier_sku, currency, lead_time_days, preferred
      ) values (
        ${quote(ORG)}::uuid, ${quote(SUPPLIER_1)}::uuid, ${quote(VARIANT)}::uuid,
        'H43-PREF', 'USD', 5, true
      );
    `);
    const fresh = await loadFenceEvidence();
    const stale = await psql(
      fenceCallSql(fresh, {
        supplierId: SUPPLIER_1,
        boundSupplier: true,
      }).replace(
        `${quote(fresh.supplierUpdatedAt)}::timestamptz`,
        `'2000-01-01T00:00:00.000000+00:00'::timestamptz`,
      ),
    );
    expect(stale).toMatch(/"code"\s*:\s*"SUPPLIER_FACTS_STALE"/);
    expect(await inventoryActionCount()).toBe(0);
    record("F12", "PASS", "missing/ambiguous/absent/stale reject paths");
  }, 90000);

  it("F13 valid synthetic evidence returns PASS with zero actions", async () => {
    const before = await inventoryActionCount();
    const evidence = await loadFenceEvidence();
    const result = await psql(
      fenceCallSql(evidence, { supplierId: null, boundSupplier: false }),
    );
    expect(result).toMatch(/"disposition"\s*:\s*"PASS"/);
    expect(result).toMatch(/"productionCreateEligible"\s*:\s*false/);
    expect(result).toMatch(/"inventoryActionCreated"\s*:\s*false/);
    expect(result).toMatch(/"merchantApprovable"\s*:\s*false/);
    expect(await inventoryActionCount()).toBe(before);
    record("F13", "PASS", "diagnostic PASS; no inventory_actions created");
  }, 60000);

  it("F14 privilege/tenant/fail-closed validation", async () => {
    const evidence = await loadFenceEvidence();

    const anonDenied = await psqlError(`
      set role anon;
      ${fenceCallSql(evidence, { supplierId: null, boundSupplier: false })};
      reset role;
    `);
    expect(anonDenied.message.toLowerCase()).toMatch(
      /permission denied|must be owner/i,
    );

    const authDenied = await psqlError(`
      set role authenticated;
      ${fenceCallSql(evidence, { supplierId: null, boundSupplier: false })};
      reset role;
    `);
    expect(authDenied.message.toLowerCase()).toMatch(
      /permission denied|must be owner/i,
    );

    const cross = await psql(
      fenceCallSql(evidence, {
        org: ORG_B,
        store: STORE,
        location: LOCATION,
        variant: VARIANT,
        supplierId: null,
        boundSupplier: false,
      }),
    );
    expect(cross).toMatch(/"code"\s*:\s*"FOREIGN_TENANT_REJECTED"/);

    const badAlgo = await psql(
      fenceCallSql(evidence, {
        algorithm: "not-a-real-algo",
        supplierId: null,
        boundSupplier: false,
      }),
    );
    expect(badAlgo).toMatch(/"code"\s*:\s*"UNSUPPORTED_METRIC_ALGORITHM"/);

    const srv = await psql(`
      set role service_role;
      ${fenceCallSql(evidence, { supplierId: null, boundSupplier: false })};
      reset role;
    `);
    expect(srv).toMatch(/"disposition"\s*:\s*"PASS"/);
    expect(await inventoryActionCount()).toBe(0);
    record(
      "F14",
      "PASS",
      "anon/auth denied; cross-tenant reject; service_role PASS; no actions",
    );
  }, 90000);
});
