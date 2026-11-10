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

import {
  evaluatePb1MetricFreshnessFence,
  isSourceDateInMetricSalesWindow,
  M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1,
  shiftIsoCalendarDate,
  type Pb1MetricFreshnessFenceRequest,
  type Pb1MetricSourceEventProjection,
} from "@/lib/decision-engine/pb1-metric-freshness-fence";
import {
  evaluatePb1SupplierConcurrencyFence,
  M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
} from "@/lib/decision-engine/pb1-supplier-concurrency-fence";
import type { Pb1SupplierProductLeadTimeRow } from "@/lib/decision-engine/pb1-trusted-supplier-planning-facts";
import { aggregateInventoryMetrics } from "@/lib/metrics/inventory-aggregates";
import {
  aggregateSales,
  type SalesAggregateInventorySnapshot,
  type SalesAggregateOrder,
  type SalesAggregateOrderItem,
  type SalesAggregateReturnRefund,
} from "@/lib/metrics/sales-aggregates";
import {
  SKU_DAILY_METRIC_ALGORITHM_VERSION,
  toPersistedSkuDailyMetric,
} from "@/lib/metrics/sku-daily-metric-record";
import { holdOrdersLiveLock } from "../support/orders-live-lock";

type SourceSnapshot = {
  timeZone: string;
  sourceToken: string;
  orders: SalesAggregateOrder[];
  orderItems: SalesAggregateOrderItem[];
  returnRefunds: SalesAggregateReturnRefund[];
  inventorySnapshots: SalesAggregateInventorySnapshot[];
};

/**
 * M7-PB1.h.3 — adversarial concurrency verification (LOCAL LIVE ONLY).
 *
 * Proves existing supplier-phantom, metric false-ready, and first-dirty-request
 * race boundaries with real dual PostgreSQL transactions. Distinguishes
 * PROVEN protections from UNENFORCED / PROPOSED guarantees.
 *
 * Authority: docs/M7_PB1_H1_PRODUCTION_EVIDENCE_FENCING_CONTRACT.md §1.6 §2.3 §3.2
 *
 * Does NOT implement production create TX, shared supplier-writer protocol,
 * formula changes, workers/cron/HTTP, migrations, or inventory_actions writes.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ALGORITHM = SKU_DAILY_METRIC_ALGORITHM_VERSION;
const TZ = "America/New_York";

/** Isolated PB1.h.3 synthetic tenants — never merchant data. */
const ORG = "ab130000-0000-4000-8000-000000000001";
const ORG_B = "ab130000-0000-4000-8000-000000000011";
const STORE = "ab130000-0000-4000-8000-000000000002";
const STORE_B = "ab130000-0000-4000-8000-000000000012";
const LOCATION = "ab130000-0000-4000-8000-000000000003";
const LOCATION_B = "ab130000-0000-4000-8000-000000000013";
const PRODUCT = "ab130000-0000-4000-8000-000000000004";
const PRODUCT_B = "ab130000-0000-4000-8000-000000000014";
const VARIANT = "ab130000-0000-4000-8000-000000000005";
const VARIANT_B = "ab130000-0000-4000-8000-000000000015";
const SUPPLIER_1 = "ab130000-0000-4000-8000-000000000031";
const SUPPLIER_2 = "ab130000-0000-4000-8000-000000000032";
const SUPPLIER_3 = "ab130000-0000-4000-8000-000000000033";
const INTEGRATION = "ab130000-0000-4000-8000-000000000041";
const PO = "ab130000-0000-4000-8000-000000000051";
const PO_ITEM = "ab130000-0000-4000-8000-000000000052";
const ORDER_HIST = "ab130000-0000-4000-8000-000000000061";
const ORDER_ITEM_HIST = "ab130000-0000-4000-8000-000000000062";
const ORDER_RACE = "ab130000-0000-4000-8000-000000000063";
const SNAPSHOT_RACE = "ab130000-0000-4000-8000-000000000071";

const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;

type TxOutcome = "BLOCKED" | "COMMITTED" | "REJECTED" | "SKIPPED";

type ConcurrentMatrixRow = {
  caseId: string;
  txA: string;
  txB: string;
  outcome: TxOutcome;
  classification: "PROVEN" | "UNENFORCED" | "GAP" | "BOUNDARY";
  detail: string;
};

const MATRIX: ConcurrentMatrixRow[] = [];

/** True when PB1.h.4.1 org+variant serialization objects are present locally. */
let supplierSerializationEnforced = false;

function record(row: ConcurrentMatrixRow): void {
  MATRIX.push(row);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function psqlArgs(): string[] {
  return [
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
    "-v",
    "VERBOSITY=verbose",
    "-q",
    "-t",
    "-A",
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
  /** Runs SQL and returns the chunk produced for this call (result + marker). */
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

async function inventoryActionCount(): Promise<number> {
  return Number(
    await psql(`
      select count(*)::text
      from public.inventory_actions
      where organization_id in ${TENANTS}
    `),
  );
}

async function globalInventoryActionCount(): Promise<number> {
  return Number(await psql(`select count(*)::text from public.inventory_actions`));
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
    -- Source-event triggers may enqueue during commerce deletes above.
    delete from public.sku_daily_metric_source_events
    where organization_id in ${TENANTS};
    delete from public.sku_daily_metric_recompute_requests
    where organization_id in ${TENANTS};
    delete from public.inventory_actions
    where organization_id in ${TENANTS};
    delete from public.action_events
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

    alter table public.inventory_snapshots
      enable trigger inventory_snapshots_prevent_delete;
  `);
}

async function seedBaseFixture(metricDate: string): Promise<void> {
  await psql(`
    insert into public.organizations (id, name, default_currency, timezone)
    values
      (${quote(ORG)}::uuid, 'PB1.h.3 Live A', 'USD', ${quote(TZ)}),
      (${quote(ORG_B)}::uuid, 'PB1.h.3 Live B', 'USD', ${quote(TZ)});

    insert into public.stores (id, organization_id, name, status, currency, timezone)
    values
      (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'H3-A', 'active', 'USD', ${quote(TZ)}),
      (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'H3-B', 'active', 'USD', ${quote(TZ)});

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
      (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1H3-A', 'active'),
      (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'PB1H3-B', 'active');

    insert into public.suppliers (id, organization_id, name, currency)
    values
      (${quote(SUPPLIER_1)}::uuid, ${quote(ORG)}::uuid, 'H3 Preferred', 'USD'),
      (${quote(SUPPLIER_2)}::uuid, ${quote(ORG)}::uuid, 'H3 Secondary', 'USD'),
      (${quote(SUPPLIER_3)}::uuid, ${quote(ORG)}::uuid, 'H3 Tertiary', 'USD');

    insert into public.integrations (id, organization_id, store_id, provider, status)
    values (
      ${quote(INTEGRATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
      'csv', 'active'
    );

    insert into public.organization_planning_inputs (
      organization_id, lead_time_days, safety_stock_days, review_period_days
    ) values (
      ${quote(ORG)}::uuid, 7, 0, 14
    );

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
      ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
      ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date,
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
    );

    insert into public.inventory_snapshots (
      organization_id, store_id, location_id, variant_id,
      observed_at, available_quantity, source
    ) values (
      ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
      ${quote(VARIANT)}::uuid,
      pg_catalog.timezone(${quote(TZ)}, (${quote(metricDate)}::date + time '12:00:00')),
      5, 'csv'
    );
  `);
}

async function ensurePreferredMapping(): Promise<{
  id: string;
  updatedAt: string;
}> {
  await psql(`
    delete from public.supplier_products
    where organization_id = ${quote(ORG)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid;

    insert into public.supplier_products (
      organization_id, supplier_id, variant_id,
      supplier_sku, currency, lead_time_days, preferred
    ) values (
      ${quote(ORG)}::uuid, ${quote(SUPPLIER_1)}::uuid, ${quote(VARIANT)}::uuid,
      'H3-PREF', 'USD', 5, true
    );
  `);

  const raw = await psql(`
    select id::text || '|' || updated_at::text
    from public.supplier_products
    where organization_id = ${quote(ORG)}::uuid
      and supplier_id = ${quote(SUPPLIER_1)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid
  `);
  const [id, updatedAt] = raw.split("|");
  return { id, updatedAt };
}

async function loadSupplierRows(): Promise<Pb1SupplierProductLeadTimeRow[]> {
  const raw = await psql(`
    select coalesce(
      json_agg(row_to_json(t) order by t."supplierId"),
      '[]'::json
    )::text
    from (
      select
        id,
        organization_id as "organizationId",
        supplier_id as "supplierId",
        variant_id as "variantId",
        lead_time_days as "leadTimeDays",
        preferred,
        updated_at as "updatedAt"
      from public.supplier_products
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
    ) t
  `);
  return JSON.parse(raw) as Pb1SupplierProductLeadTimeRow[];
}

async function metricUpdatedAt(): Promise<string> {
  return psql(`
    select updated_at::text
    from public.sku_daily_metrics
    where organization_id = ${quote(ORG)}::uuid
      and store_id = ${quote(STORE)}::uuid
      and location_id = ${quote(LOCATION)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid
      and metric_date = ${quote(metricDate)}::date
      and algorithm_version = ${quote(ALGORITHM)}
  `);
}

async function sourceToken(): Promise<string> {
  return psql(`
    select public.sku_daily_metric_source_snapshot(
      ${quote(ORG)}::uuid,
      ${quote(STORE)}::uuid,
      ${quote(LOCATION)}::uuid,
      ${quote(VARIANT)}::uuid
    )->>'sourceToken'
  `);
}

async function markRequestClean(): Promise<void> {
  await psql(`
    insert into public.sku_daily_metric_recompute_requests (
      organization_id, store_id, location_id, variant_id, metric_date,
      algorithm_version, dirty_generation, claimed_generation, applied_generation,
      status, attempt_count, queued_at
    ) values (
      ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
      ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date,
      ${quote(ALGORITHM)}, 1, 1, 1, 'succeeded', 0, pg_catalog.now()
    )
    on conflict (
      organization_id, store_id, location_id, variant_id, metric_date, algorithm_version
    )
    do update set
      dirty_generation = 1,
      claimed_generation = 1,
      applied_generation = 1,
      status = 'succeeded',
      lease_owner_id = null,
      lease_claim_token = null,
      lease_claimed_at = null,
      lease_expires_at = null,
      updated_at = pg_catalog.now();

    update public.sku_daily_metric_source_events
    set consumed_at = pg_catalog.now()
    where organization_id = ${quote(ORG)}::uuid
      and consumed_at is null;
  `);
}

async function deleteRequestRow(): Promise<void> {
  await psql(`
    delete from public.sku_daily_metric_recompute_requests
    where organization_id = ${quote(ORG)}::uuid
      and store_id = ${quote(STORE)}::uuid
      and location_id = ${quote(LOCATION)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid
      and metric_date = ${quote(metricDate)}::date
      and algorithm_version = ${quote(ALGORITHM)};
  `);
}

async function loadUnconsumedEvents(): Promise<Pb1MetricSourceEventProjection[]> {
  const raw = await psql(`
    select coalesce(json_agg(row_to_json(t)), '[]'::json)::text
    from (
      select
        organization_id as "organizationId",
        store_id as "storeId",
        location_id as "locationId",
        variant_id as "variantId",
        source_date::text as "sourceDate",
        algorithm_version as "algorithmVersion",
        consumed_at::text as "consumedAt"
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and store_id = ${quote(STORE)}::uuid
        and location_id = ${quote(LOCATION)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
        and algorithm_version = ${quote(ALGORITHM)}
        and consumed_at is null
    ) t
  `);
  const rows = JSON.parse(raw) as Array<
    Pb1MetricSourceEventProjection & { consumedAt: string | null }
  >;
  return rows.map((row) => ({
    ...row,
    consumedAt: row.consumedAt,
  }));
}

function cleanFenceRequest(args: {
  updatedAt: string;
  token: string;
  events?: Pb1MetricSourceEventProjection[];
  recompute?: Pb1MetricFreshnessFenceRequest["recomputeRequest"];
}): Pb1MetricFreshnessFenceRequest {
  return {
    fenceVersion: M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1,
    trustedScope: { organizationId: ORG, storeId: STORE },
    grain: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    },
    metric: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
      metricDate,
      algorithmVersion: ALGORITHM,
      updatedAt: args.updatedAt,
    },
    storeLocalAsOfDate: metricDate,
    recomputeRequest: args.recompute ?? {
      kind: "observed",
      dirtyGeneration: 1,
      claimedGeneration: 1,
      appliedGeneration: 1,
      status: "succeeded",
    },
    unconsumedSourceEvents: {
      kind: "observed",
      events: args.events ?? [],
    },
    sourceToken: {
      kind: "observed",
      boundToken: args.token,
      currentToken: args.token,
    },
  };
}

let metricDate = "";
let releaseLock: (() => Promise<void>) | null = null;
let baselineInventoryActions = 0;

describeLive("M7-PB1.h.3 adversarial concurrency live", () => {
  beforeAll(async () => {
    // Hard local-only gate: published Supabase DB port on loopback.
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");

    const preferredUnique = await psql(`
      select count(*)::text
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'supplier_products'
        and indexdef ilike '%preferred%'
    `);
    expect(preferredUnique).toBe("0");

    releaseLock = await holdOrdersLiveLock();
    metricDate = await psql(
      `select (pg_catalog.timezone(${quote(TZ)}, pg_catalog.now()))::date::text`,
    );

    const serializationFlag = await psql(`
      select (
        to_regprocedure(
          'public.acquire_supplier_products_org_variant_xact_lock(uuid,uuid)'
        ) is not null
        and exists (
          select 1
          from pg_trigger t
          join pg_class c on t.tgrelid = c.oid
          join pg_namespace n on c.relnamespace = n.oid
          where n.nspname = 'public'
            and c.relname = 'supplier_products'
            and t.tgname = 'supplier_products_serialize_org_variant_xact_lock'
            and not t.tgisinternal
        )
      )::text
    `);
    supplierSerializationEnforced =
      serializationFlag === "t" || serializationFlag === "true";

    await cleanupFixture();
    await seedBaseFixture(metricDate);
    baselineInventoryActions = await globalInventoryActionCount();
  }, 120000);

  afterAll(async () => {
    try {
      await cleanupFixture();
    } finally {
      if (releaseLock) {
        await releaseLock();
        releaseLock = null;
      }
    }

    process.stdout.write(
      `\n[PB1.h.3] concurrent TX matrix:\n${MATRIX.map(
        (row) =>
          `${row.caseId}\t${row.outcome}\t${row.classification}\t${row.txA} | ${row.txB} → ${row.detail}`,
      ).join("\n")}\n`,
    );
  }, 120000);

  beforeEach(async () => {
    expect(await globalInventoryActionCount()).toBe(baselineInventoryActions);
    expect(await inventoryActionCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // A. SUPPLIER PHANTOMS
  // ---------------------------------------------------------------------------

  describe("A. supplier phantoms", () => {
    it("A1: FOR UPDATE on preferred row does not block phantom preferred INSERT", async () => {
      const preferred = await ensurePreferredMapping();
      const txA = await openSession();
      try {
        await txA.run(
          `begin;
           set local lock_timeout = '2s';
           set local statement_timeout = '15s';
           select id::text
           from public.supplier_products
           where id = ${quote(preferred.id)}::uuid
           for update;`,
          "a1-locked",
        );

        await psql(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          insert into public.supplier_products (
            organization_id, supplier_id, variant_id,
            supplier_sku, currency, lead_time_days, preferred
          ) values (
            ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
            'H3-PHANTOM', 'USD', 9, true
          );
          commit;
        `);

        const recountChunk = await txA.run(
          `select count(*)::text
           from public.supplier_products
           where organization_id = ${quote(ORG)}::uuid
             and variant_id = ${quote(VARIANT)}::uuid
             and preferred = true;`,
          "a1-recount",
        );

        // Under READ COMMITTED a new statement in TX-A sees TX-B's commit.
        expect(recountChunk).toMatch(/2/);

        await txA.run("rollback;", "a1-done");

        const committedPreferred = await psql(`
          select count(*)::text
          from public.supplier_products
          where organization_id = ${quote(ORG)}::uuid
            and variant_id = ${quote(VARIANT)}::uuid
            and preferred = true
        `);
        expect(committedPreferred).toBe("2");

        const fence = evaluatePb1SupplierConcurrencyFence({
          fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
          organizationId: ORG,
          variantId: VARIANT,
          rows: await loadSupplierRows(),
        });
        expect(fence.ok).toBe(false);
        if (!fence.ok) {
          expect(fence.code).toBe("SUPPLIER_FACTS_AMBIGUOUS");
          expect(fence.transactionSafety).toBe("unproven");
          expect(fence.productionCreateEligible).toBe(false);
        }

        record({
          caseId: "A1",
          txA: "FOR UPDATE preferred row",
          txB: "INSERT second preferred same org+variant",
          outcome: "COMMITTED",
          classification: "UNENFORCED",
          detail: supplierSerializationEnforced
            ? "exact-row FOR UPDATE alone still allows phantom INSERT; h.4.1 closes only when selection holds acquire_supplier_products_org_variant_xact_lock (see h.4.1 S1)"
            : "exact-row lock alone does not prevent preferred phantom INSERT",
        });
      } finally {
        await txA.close();
      }
    }, 120000);

    it("A2: FOR UPDATE preferred row does not block preferred UPDATE on sibling", async () => {
      await ensurePreferredMapping();
      await psql(`
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
          'H3-SIB', 'USD', 4, false
        )
        on conflict on constraint supplier_products_supplier_variant_unique
        do update set preferred = false, lead_time_days = 4, updated_at = pg_catalog.now();
      `);

      const preferredId = await psql(`
        select id::text from public.supplier_products
        where organization_id = ${quote(ORG)}::uuid
          and supplier_id = ${quote(SUPPLIER_1)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
      `);

      const txA = await openSession();
      try {
        await txA.run(
          `begin;
           set local lock_timeout = '2s';
           set local statement_timeout = '15s';
           select id::text from public.supplier_products
           where id = ${quote(preferredId)}::uuid
           for update;`,
          "a2-locked",
        );

        await psql(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          update public.supplier_products
          set preferred = true, updated_at = pg_catalog.now()
          where organization_id = ${quote(ORG)}::uuid
            and supplier_id = ${quote(SUPPLIER_2)}::uuid
            and variant_id = ${quote(VARIANT)}::uuid;
          commit;
        `);

        await txA.run("rollback;", "a2-done");

        expect(
          await psql(`
            select count(*)::text from public.supplier_products
            where organization_id = ${quote(ORG)}::uuid
              and variant_id = ${quote(VARIANT)}::uuid
              and preferred = true
          `),
        ).toBe("2");

        record({
          caseId: "A2",
          txA: "FOR UPDATE preferred mapping",
          txB: "UPDATE sibling mapping preferred=true",
          outcome: "COMMITTED",
          classification: "UNENFORCED",
          detail: supplierSerializationEnforced
            ? "sibling preferred flip still commits under FOR UPDATE-only; h.4.1 S2 requires selection advisory"
            : "sibling preferred flip commits while locked preferred row held",
        });
      } finally {
        await txA.close();
      }
    }, 120000);

    it("A3: exact-row FOR UPDATE blocks concurrent UPDATE/DELETE (lock_timeout)", async () => {
      const preferred = await ensurePreferredMapping();
      const txA = await openSession();
      try {
        await txA.run(
          `begin;
           set local lock_timeout = '2s';
           set local statement_timeout = '15s';
           select id::text, lead_time_days::text
           from public.supplier_products
           where id = ${quote(preferred.id)}::uuid
           for update;`,
          "a3-locked",
        );

        const updateErr = await psqlError(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          update public.supplier_products
          set lead_time_days = 99, updated_at = pg_catalog.now()
          where id = ${quote(preferred.id)}::uuid;
        `);
        expect(updateErr.code).toBe("55P03");

        const deleteErr = await psqlError(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          delete from public.supplier_products
          where id = ${quote(preferred.id)}::uuid;
        `);
        expect(deleteErr.code).toBe("55P03");

        const rereadChunk = await txA.run(
          `select lead_time_days::text
           from public.supplier_products
           where id = ${quote(preferred.id)}::uuid;`,
          "a3-reread",
        );
        expect(rereadChunk).toMatch(/5/);

        await txA.run("rollback;", "a3-done");

        record({
          caseId: "A3",
          txA: "FOR UPDATE exact supplier_products row",
          txB: "UPDATE/DELETE same row",
          outcome: "BLOCKED",
          classification: "PROVEN",
          detail: "exact-row LT UPDATE/DELETE wait → lock_timeout 55P03; re-read stable",
        });
      } finally {
        await txA.close();
      }
    }, 120000);

    it("A4: create-side advisory alone does not stop non-participating preferred INSERT", async () => {
      await ensurePreferredMapping();
      const txA = await openSession();
      try {
        await txA.run(
          `begin;
           set local lock_timeout = '2s';
           set local statement_timeout = '15s';
           select pg_catalog.pg_advisory_xact_lock(
             hashtextextended(${quote(ORG)} || ':' || ${quote(VARIANT)}, 0)
           );
           select count(*)::text
           from public.supplier_products
           where organization_id = ${quote(ORG)}::uuid
             and variant_id = ${quote(VARIANT)}::uuid
             and preferred = true;`,
          "a4-adv-held",
        );

        await psql(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          insert into public.supplier_products (
            organization_id, supplier_id, variant_id,
            supplier_sku, currency, lead_time_days, preferred
          ) values (
            ${quote(ORG)}::uuid, ${quote(SUPPLIER_3)}::uuid, ${quote(VARIANT)}::uuid,
            'H3-ADV-PHANTOM', 'USD', 3, true
          );
          commit;
        `);

        await txA.run("rollback;", "a4-done");

        expect(
          Number(
            await psql(`
              select count(*)::text from public.supplier_products
              where organization_id = ${quote(ORG)}::uuid
                and variant_id = ${quote(VARIANT)}::uuid
                and preferred = true
            `),
          ),
        ).toBeGreaterThanOrEqual(2);

        record({
          caseId: "A4",
          txA: "org+variant advisory (create-side only)",
          txB: "INSERT preferred without advisory",
          outcome: "COMMITTED",
          classification: "UNENFORCED",
          detail: supplierSerializationEnforced
            ? "non-namespaced/create-only advisory still insufficient; writers participate only on 71010401 via h.4.1 trigger/helper"
            : "create-side advisory alone insufficient without writer participation",
        });
      } finally {
        await txA.close();
      }
    }, 120000);

    it("A5: explicit selection locks exact mapping; unrelated preferred INSERT still commits", async () => {
      const preferred = await ensurePreferredMapping();
      const txA = await openSession();
      try {
        await txA.run(
          `begin;
           set local lock_timeout = '2s';
           set local statement_timeout = '15s';
           select id::text, lead_time_days::text, updated_at::text
           from public.supplier_products
           where organization_id = ${quote(ORG)}::uuid
             and supplier_id = ${quote(SUPPLIER_1)}::uuid
             and variant_id = ${quote(VARIANT)}::uuid
           for update;`,
          "a5-explicit-locked",
        );

        // Unrelated supplier preferred INSERT (implicit-path phantom) commits.
        await psql(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          insert into public.supplier_products (
            organization_id, supplier_id, variant_id,
            supplier_sku, currency, lead_time_days, preferred
          ) values (
            ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
            'H3-EXPLICIT-SIDE', 'USD', 8, true
          )
          on conflict on constraint supplier_products_supplier_variant_unique
          do update set preferred = true, lead_time_days = 8, updated_at = pg_catalog.now();
          commit;
        `);

        // Same explicit mapping UPDATE is blocked.
        const blocked = await psqlError(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          update public.supplier_products
          set lead_time_days = 11, updated_at = pg_catalog.now()
          where id = ${quote(preferred.id)}::uuid;
        `);
        expect(blocked.code).toBe("55P03");

        const rows = await loadSupplierRows();
        const lockedRow = rows.find((row) => row.supplierId === SUPPLIER_1);
        expect(lockedRow).toBeDefined();
        const explicitFence = evaluatePb1SupplierConcurrencyFence({
          fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
          organizationId: ORG,
          variantId: VARIANT,
          supplierId: SUPPLIER_1,
          rows,
          bound: {
            organizationId: ORG,
            variantId: VARIANT,
            supplierId: SUPPLIER_1,
            supplierProductId: lockedRow!.id,
            supplierProductUpdatedAt: lockedRow!.updatedAt,
            leadTimeDays: 5,
          },
        });
        expect(explicitFence.ok).toBe(true);
        if (explicitFence.ok) {
          expect(explicitFence.selectionMode).toBe("explicit");
          expect(explicitFence.supplierProductId).toBe(preferred.id);
          expect(explicitFence.transactionSafety).toBe("unproven");
          expect(explicitFence.productionCreateEligible).toBe(false);
        }

        const implicitFence = evaluatePb1SupplierConcurrencyFence({
          fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
          organizationId: ORG,
          variantId: VARIANT,
          rows,
        });
        expect(implicitFence.ok).toBe(false);
        if (!implicitFence.ok) {
          expect(implicitFence.code).toBe("SUPPLIER_FACTS_AMBIGUOUS");
        }

        await txA.run("rollback;", "a5-done");

        record({
          caseId: "A5",
          txA: "explicit FOR UPDATE chosen mapping",
          txB: "preferred INSERT other supplier + UPDATE locked row",
          outcome: "COMMITTED",
          classification: "BOUNDARY",
          detail:
            "explicit row lock blocks same-row UPDATE; unrelated preferred INSERT still commits (implicit path UNENFORCED)",
        });
      } finally {
        await txA.close();
      }
    }, 120000);

    it("A6: csv_reconcile_supplier_product only FOR UPDATEs exact supplier+variant", async () => {
      await ensurePreferredMapping();
      const def = await psql(`
        select pg_get_functiondef(
          'public.csv_reconcile_supplier_product(uuid,uuid,uuid,uuid,text,numeric,text,integer,integer,integer,boolean)'::regprocedure
        )
      `);
      expect(def.toLowerCase()).toContain("for update");
      expect(def.toLowerCase()).not.toContain("pg_advisory");
      expect(def).toMatch(/supplier_id = p_supplier_id/);
      expect(def).toMatch(/variant_id = p_variant_id/);

      record({
        caseId: "A6",
        txA: "csv_reconcile_supplier_product definition",
        txB: "n/a (static proof)",
        outcome: "COMMITTED",
        classification: "PROVEN",
        detail: "reconcile locks exact org+supplier+variant only; no org+variant advisory",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // B. METRIC FALSE-READY
  // ---------------------------------------------------------------------------

  describe("B. metric false-ready", () => {
    it("B1: historical in-window sales mutation commits under unlocked validate window", async () => {
      await markRequestClean();
      const updatedAt = await metricUpdatedAt();
      const token = await sourceToken();
      const before = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token, events: [] }),
      );
      expect(before.ok).toBe(true);
      if (before.ok) {
        expect(before.transactionSafety).toBe("unproven");
        expect(before.productionCreateEligible).toBe(false);
      }

      const histDate = shiftIsoCalendarDate(metricDate, -30);
      expect(isSourceDateInMetricSalesWindow(histDate, metricDate)).toBe(true);

      // No source SHARE held → TX-B commits freely (false-ready gap).
      await psql(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        insert into public.orders (
          id, organization_id, store_id, status, ordered_at, currency, source
        ) values (
          ${quote(ORDER_HIST)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
          'completed',
          pg_catalog.timezone(${quote(TZ)}, (${quote(histDate)}::date + time '11:00:00')),
          'USD', 'csv'
        );
        insert into public.order_items (
          id, organization_id, store_id, order_id, variant_id, location_id, quantity
        ) values (
          ${quote(ORDER_ITEM_HIST)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
          ${quote(ORDER_HIST)}::uuid, ${quote(VARIANT)}::uuid, ${quote(LOCATION)}::uuid,
          2
        );
        commit;
      `);

      const events = await loadUnconsumedEvents();
      const inWindow = events.filter((event) =>
        isSourceDateInMetricSalesWindow(event.sourceDate, metricDate),
      );
      expect(inWindow.length).toBeGreaterThan(0);

      // Stale pre-mutation snapshot still PASSes (false-ready).
      const staleStillPass = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token, events: [] }),
      );
      expect(staleStillPass.ok).toBe(true);
      if (staleStillPass.ok) {
        expect(staleStillPass.transactionSafety).toBe("unproven");
      }

      const fresh = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token, events }),
      );
      expect(fresh.ok).toBe(false);
      if (!fresh.ok) {
        expect(fresh.code).toBe("METRIC_SOURCE_WINDOW_DIRTY");
      }

      record({
        caseId: "B1",
        txA: "h.2 fence PASS on clean snapshot (no source locks)",
        txB: "INSERT historical in-window order/item",
        outcome: "COMMITTED",
        classification: "GAP",
        detail:
          "unlocked validate window: TX-B commits; stale snapshot stays PASS; fresh events → METRIC_SOURCE_WINDOW_DIRTY",
      });
    }, 120000);

    it("B2: inventory snapshot mutation changes SA008 token without held SHARE", async () => {
      await markRequestClean();
      const updatedAt = await metricUpdatedAt();
      const tokenBefore = await sourceToken();
      const before = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token: tokenBefore }),
      );
      expect(before.ok).toBe(true);

      await psql(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        insert into public.inventory_snapshots (
          id, organization_id, store_id, location_id, variant_id,
          observed_at, available_quantity, source
        ) values (
          ${quote(SNAPSHOT_RACE)}::uuid,
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
          ${quote(VARIANT)}::uuid,
          pg_catalog.now(), 17, 'csv'
        );
        commit;
      `);

      const tokenAfter = await sourceToken();
      expect(tokenAfter).not.toBe(tokenBefore);

      const stalePass = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token: tokenBefore }),
      );
      expect(stalePass.ok).toBe(true);

      const mismatched = evaluatePb1MetricFreshnessFence({
        ...cleanFenceRequest({ updatedAt, token: tokenBefore }),
        sourceToken: {
          kind: "observed",
          boundToken: tokenBefore,
          currentToken: tokenAfter,
        },
      });
      expect(mismatched.ok).toBe(false);
      if (!mismatched.ok) {
        expect(mismatched.code).toBe("SA008");
      }

      record({
        caseId: "B2",
        txA: "h.2 fence PASS bound to pre-mutation token",
        txB: "INSERT inventory_snapshot",
        outcome: "COMMITTED",
        classification: "GAP",
        detail: "token drifts under unlocked window; stale bound token still PASSes h.2",
      });
    }, 120000);

    it("B3: planning invalidation dirties generation axis (not sales window)", async () => {
      await markRequestClean();
      const updatedAt = await metricUpdatedAt();
      const token = await sourceToken();
      const before = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token }),
      );
      expect(before.ok).toBe(true);

      // Bare table UPDATE has no trigger; the proven writer path calls
      // enqueue_sku_daily_metric_planning_invalidation (upsert RPC).
      await psql(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        update public.organization_planning_inputs
        set lead_time_days = lead_time_days + 1,
            updated_at = pg_catalog.now()
        where organization_id = ${quote(ORG)}::uuid;
        select public.enqueue_sku_daily_metric_planning_invalidation(
          ${quote(ORG)}::uuid
        );
        commit;
      `);

      const gens = await psql(`
        select dirty_generation::text || ':' || applied_generation::text || ':' || status
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and store_id = ${quote(STORE)}::uuid
          and location_id = ${quote(LOCATION)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
          and metric_date = ${quote(metricDate)}::date
      `);
      const [dirty, applied, status] = gens.split(":");
      expect(Number(dirty)).toBeGreaterThan(Number(applied));
      expect(["queued", "claimed", "running", "retry_wait", "failed"]).toContain(
        status,
      );

      const stalePass = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token }),
      );
      expect(stalePass.ok).toBe(true);

      const fresh = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({
          updatedAt,
          token,
          recompute: {
            kind: "observed",
            dirtyGeneration: Number(dirty),
            claimedGeneration: Number(applied),
            appliedGeneration: Number(applied),
            status: status as "queued",
          },
        }),
      );
      expect(fresh.ok).toBe(false);
      if (!fresh.ok) {
        expect(fresh.code).toBe("PENDING_RECOMPUTE");
      }

      record({
        caseId: "B3",
        txA: "h.2 fence PASS on succeeded generations",
        txB: "planning UPDATE + enqueue_sku_daily_metric_planning_invalidation",
        outcome: "COMMITTED",
        classification: "GAP",
        detail:
          "planning dirty bumps generation (not 89-day window); stale gen snapshot stays PASS",
      });
    }, 120000);

    it("B4: attestation INSERT dirties via generation path (PB1.e)", async () => {
      await markRequestClean();
      await psql(`
        delete from public.store_incoming_evidence_attestations
        where organization_id = ${quote(ORG)}::uuid
          and store_id = ${quote(STORE)}::uuid;
      `);

      const updatedAt = await metricUpdatedAt();
      const tokenBefore = await sourceToken();
      const before = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token: tokenBefore }),
      );
      expect(before.ok).toBe(true);

      await psql(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        insert into public.store_incoming_evidence_attestations (
          organization_id, store_id, evidence_complete, updated_at
        ) values (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, true, pg_catalog.now()
        );
        commit;
      `);

      const gens = await psql(`
        select dirty_generation::text || ':' || applied_generation::text || ':' || status
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
          and metric_date = ${quote(metricDate)}::date
      `);
      const [dirty, applied, status] = gens.split(":");
      expect(Number(dirty)).toBeGreaterThan(Number(applied));

      const tokenAfter = await sourceToken();
      expect(tokenAfter).not.toBe(tokenBefore);

      const fresh = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({
          updatedAt,
          token: tokenBefore,
          recompute: {
            kind: "observed",
            dirtyGeneration: Number(dirty),
            claimedGeneration: Number(applied),
            appliedGeneration: Number(applied),
            status: status as "queued",
          },
          events: [],
        }),
      );
      expect(fresh.ok).toBe(false);
      if (!fresh.ok) {
        expect(fresh.code).toBe("PENDING_RECOMPUTE");
      }

      record({
        caseId: "B4",
        txA: "h.2 fence PASS pre-attestation",
        txB: "INSERT store_incoming_evidence_attestations",
        outcome: "COMMITTED",
        classification: "GAP",
        detail:
          "PB1.e dirties generation + token; without held attestation SHARE create remains false-ready",
      });
    }, 120000);

    it("B5: PO item INSERT enqueues events + changes token under unlocked window", async () => {
      await markRequestClean();
      const updatedAt = await metricUpdatedAt();
      const tokenBefore = await sourceToken();

      await psql(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        insert into public.purchase_orders (
          id, organization_id, store_id, supplier_id, status, source, currency
        ) values (
          ${quote(PO)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
          ${quote(SUPPLIER_1)}::uuid, 'submitted', 'other', 'USD'
        )
        on conflict (id) do nothing;
        insert into public.purchase_order_items (
          id, organization_id, store_id, purchase_order_id, variant_id,
          destination_location_id, ordered_quantity
        ) values (
          ${quote(PO_ITEM)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
          ${quote(PO)}::uuid, ${quote(VARIANT)}::uuid, ${quote(LOCATION)}::uuid,
          4
        );
        commit;
      `);

      const events = await loadUnconsumedEvents();
      expect(events.length).toBeGreaterThan(0);
      const tokenAfter = await sourceToken();
      expect(tokenAfter).not.toBe(tokenBefore);

      const stalePass = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token: tokenBefore, events: [] }),
      );
      expect(stalePass.ok).toBe(true);

      const tokenMismatch = evaluatePb1MetricFreshnessFence({
        ...cleanFenceRequest({ updatedAt, token: tokenBefore, events }),
        sourceToken: {
          kind: "observed",
          boundToken: tokenBefore,
          currentToken: tokenAfter,
        },
      });
      expect(tokenMismatch.ok).toBe(false);
      if (!tokenMismatch.ok) {
        expect(["SA008", "METRIC_SOURCE_WINDOW_DIRTY"]).toContain(
          tokenMismatch.code,
        );
      }

      record({
        caseId: "B5",
        txA: "h.2 fence PASS pre-PO",
        txB: "INSERT purchase_order_items",
        outcome: "COMMITTED",
        classification: "GAP",
        detail: "PO mutation commits; events+token drift detectable only on fresh re-read",
      });
    }, 120000);

    it("B6: M5 SHARE on orders blocks concurrent sales INSERT (contrast to false-ready)", async () => {
      const holder = await openSession();
      try {
        await holder.run(
          `begin;
           set local lock_timeout = '2s';
           set local statement_timeout = '15s';
           lock table public.orders in share mode;
           lock table public.order_items in share mode;`,
          "b6-share-held",
        );

        const err = await psqlError(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          insert into public.orders (
            id, organization_id, store_id, status, ordered_at, currency, source
          ) values (
            ${quote(ORDER_RACE)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
            'completed', pg_catalog.now(), 'USD', 'csv'
          );
        `);
        expect(err.code).toBe("55P03");

        await holder.run("rollback;", "b6-released");

        record({
          caseId: "B6",
          txA: "LOCK orders/order_items SHARE (M5 commit pattern)",
          txB: "INSERT orders",
          outcome: "BLOCKED",
          classification: "PROVEN",
          detail:
            "existing M5 SHARE serialization blocks sales writers; not claimed for nonexistent M7 create TX",
        });
      } finally {
        await holder.close();
      }
    }, 120000);
  });

  // ---------------------------------------------------------------------------
  // C. FIRST REQUEST INSERT RACE
  // ---------------------------------------------------------------------------

  describe("C. first dirty-request insert race", () => {
    it("C1: observed_absent can stay PASS while concurrent first dirty request commits", async () => {
      await deleteRequestRow();
      await psql(`
        update public.sku_daily_metric_source_events
        set consumed_at = pg_catalog.now()
        where organization_id = ${quote(ORG)}::uuid
          and consumed_at is null;
      `);

      const absentCount = await psql(`
        select count(*)::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quote(ORG)}::uuid
          and store_id = ${quote(STORE)}::uuid
          and location_id = ${quote(LOCATION)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
          and metric_date = ${quote(metricDate)}::date
          and algorithm_version = ${quote(ALGORITHM)}
      `);
      expect(absentCount).toBe("0");

      const updatedAt = await metricUpdatedAt();
      const token = await sourceToken();
      const observedAbsentPass = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({
          updatedAt,
          token,
          recompute: { kind: "observed_absent" },
        }),
      );
      expect(observedAbsentPass.ok).toBe(true);
      if (observedAbsentPass.ok) {
        expect(observedAbsentPass.generations.requestPresence).toBe(
          "observed_absent",
        );
        expect(observedAbsentPass.transactionSafety).toBe("unproven");
        expect(observedAbsentPass.productionCreateEligible).toBe(false);
      }

      const txA = await openSession();
      try {
        const absentChunk = await txA.run(
          `begin;
           set local lock_timeout = '2s';
           set local statement_timeout = '15s';
           select count(*)::text
           from public.sku_daily_metric_recompute_requests
           where organization_id = ${quote(ORG)}::uuid
             and store_id = ${quote(STORE)}::uuid
             and location_id = ${quote(LOCATION)}::uuid
             and variant_id = ${quote(VARIANT)}::uuid
             and metric_date = ${quote(metricDate)}::date
             and algorithm_version = ${quote(ALGORITHM)};`,
          "c1-absent-seen",
        );
        expect(absentChunk).toMatch(/(^|\n)0(\n|$)/);

        // No shared serialization with empty-check → first insert commits.
        await psql(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          insert into public.sku_daily_metric_recompute_requests (
            organization_id, store_id, location_id, variant_id, metric_date,
            algorithm_version, dirty_generation, claimed_generation,
            applied_generation, status, attempt_count, queued_at
          ) values (
            ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
            ${quote(VARIANT)}::uuid, ${quote(metricDate)}::date,
            ${quote(ALGORITHM)}, 1, 0, 0, 'queued', 0, pg_catalog.now()
          );
          commit;
        `);

        // TX-A's prior observed_absent evidence remains a PASS if reused.
        const staleStillPass = evaluatePb1MetricFreshnessFence(
          cleanFenceRequest({
            updatedAt,
            token,
            recompute: { kind: "observed_absent" },
          }),
        );
        expect(staleStillPass.ok).toBe(true);

        const afterCount = await psql(`
          select dirty_generation::text || ':' || status
          from public.sku_daily_metric_recompute_requests
          where organization_id = ${quote(ORG)}::uuid
            and variant_id = ${quote(VARIANT)}::uuid
            and metric_date = ${quote(metricDate)}::date
        `);
        expect(afterCount).toBe("1:queued");

        const fresh = evaluatePb1MetricFreshnessFence(
          cleanFenceRequest({
            updatedAt,
            token,
            recompute: {
              kind: "observed",
              dirtyGeneration: 1,
              claimedGeneration: 0,
              appliedGeneration: 0,
              status: "queued",
            },
          }),
        );
        expect(fresh.ok).toBe(false);
        if (!fresh.ok) {
          expect(fresh.code).toBe("PENDING_RECOMPUTE");
        }

        await txA.run("rollback;", "c1-done");

        record({
          caseId: "C1",
          txA: "observe no recompute-request row (observed_absent)",
          txB: "INSERT first dirty queued request",
          outcome: "COMMITTED",
          classification: "GAP",
          detail:
            "observed_absent ≠ proven TX safety; first dirty insert races past empty check",
        });
      } finally {
        await txA.close();
      }
    }, 120000);
  });

  // ---------------------------------------------------------------------------
  // D. SA008 / SOURCE FENCING (existing M5 — not M7 create)
  // ---------------------------------------------------------------------------

  describe("D. SA008 / source fencing (M5 commit protection)", () => {
    it("D1: stale source token rejected by commit_sku_daily_metric (SA008)", async () => {
      const staleJson = await psql(`
        set role service_role;
        select public.sku_daily_metric_source_snapshot(
          ${quote(ORG)}::uuid,
          ${quote(STORE)}::uuid,
          ${quote(LOCATION)}::uuid,
          ${quote(VARIANT)}::uuid
        )::text
      `);
      const staleSource = JSON.parse(staleJson) as SourceSnapshot;

      await psql(`
        insert into public.inventory_snapshots (
          organization_id, store_id, location_id, variant_id,
          observed_at, available_quantity, source
        ) values (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
          ${quote(VARIANT)}::uuid, pg_catalog.now(), 42, 'csv'
        );
      `);

      const currentToken = await sourceToken();
      expect(currentToken).not.toBe(staleSource.sourceToken);

      const sales = aggregateSales({
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
        timeZone: staleSource.timeZone,
        orders: staleSource.orders,
        orderItems: staleSource.orderItems,
        returnRefunds: staleSource.returnRefunds,
        inventorySnapshots: staleSource.inventorySnapshots,
      });
      const day = sales.days.find(
        (candidate) => candidate.metricDate === metricDate,
      );
      expect(day).toBeDefined();
      const inventory = aggregateInventoryMetrics({
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        metricDate,
        timeZone: staleSource.timeZone,
        snapshots: staleSource.inventorySnapshots,
        demand: {
          netUnitsSold: day!.netUnitsSold,
          salesVelocity30d: sales.windows[30].velocity,
          days: sales.days,
        },
      });
      const metric = toPersistedSkuDailyMetric(
        metricDate,
        staleSource.timeZone,
        sales,
        inventory,
      );

      const err = await psqlError(`
        set role service_role;
        select public.commit_sku_daily_metric(
          ${quote(ORG)}::uuid,
          ${quote(STORE)}::uuid,
          ${quote(LOCATION)}::uuid,
          ${quote(VARIANT)}::uuid,
          ${quote(metricDate)}::date,
          ${quote(staleSource.sourceToken)},
          ${quote(JSON.stringify(metric))}::jsonb
        );
      `);
      expect(err.code).toBe("SA008");

      record({
        caseId: "D1",
        txA: "commit_sku_daily_metric with stale token",
        txB: "prior inventory_snapshot mutation",
        outcome: "REJECTED",
        classification: "PROVEN",
        detail: "M5 commit SA008 rejects stale source token; does not protect M7 create TX",
      });
    }, 180000);

    it("D2: commit SHARE blocks PO/attestation writers while held", async () => {
      const holder = await openSession();
      try {
        await holder.run(
          `begin;
           set local lock_timeout = '2s';
           set local statement_timeout = '15s';
           lock table public.purchase_orders in share mode;
           lock table public.purchase_order_items in share mode;
           lock table public.store_incoming_evidence_attestations in share mode;`,
          "d2-share-held",
        );

        const poErr = await psqlError(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          update public.purchase_orders
          set status = 'cancelled', updated_at = pg_catalog.now()
          where id = ${quote(PO)}::uuid;
        `);
        expect(poErr.code).toBe("55P03");

        const attErr = await psqlError(`
          begin;
          set local lock_timeout = '2s';
          set local statement_timeout = '15s';
          update public.store_incoming_evidence_attestations
          set evidence_complete = false, updated_at = pg_catalog.now()
          where organization_id = ${quote(ORG)}::uuid
            and store_id = ${quote(STORE)}::uuid;
        `);
        expect(attErr.code).toBe("55P03");

        await holder.run("rollback;", "d2-released");

        record({
          caseId: "D2",
          txA: "SHARE on PO + attestation (M5 commit lock order)",
          txB: "UPDATE purchase_orders / attestation",
          outcome: "BLOCKED",
          classification: "PROVEN",
          detail: "M5 commit-time SHARE blocks PO/attestation writers while held",
        });
      } finally {
        await holder.close();
      }
    }, 120000);

    it("D3: dirty/claimed/applied generation divergence fails h.2; claimed open status fails", async () => {
      const updatedAt = await metricUpdatedAt();
      const token = await sourceToken();

      const dirty = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({
          updatedAt,
          token,
          recompute: {
            kind: "observed",
            dirtyGeneration: 3,
            claimedGeneration: 2,
            appliedGeneration: 2,
            status: "succeeded",
          },
        }),
      );
      expect(dirty.ok).toBe(false);
      if (!dirty.ok) {
        expect(dirty.code).toBe("PENDING_RECOMPUTE");
      }

      const claimed = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({
          updatedAt,
          token,
          recompute: {
            kind: "observed",
            dirtyGeneration: 2,
            claimedGeneration: 2,
            appliedGeneration: 2,
            status: "claimed",
          },
        }),
      );
      expect(claimed.ok).toBe(false);
      if (!claimed.ok) {
        expect(claimed.code).toBe("PENDING_RECOMPUTE");
      }

      record({
        caseId: "D3",
        txA: "h.2 generation axis checks",
        txB: "n/a (projection)",
        outcome: "REJECTED",
        classification: "PROVEN",
        detail:
          "dirty≠applied and open statuses fail fence; still transactionSafety=unproven",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // E. PURE VALIDATOR BOUNDARIES
  // ---------------------------------------------------------------------------

  describe("E. pure validator boundaries", () => {
    it("E1: before/after snapshots — stale inputs can PASS; safety flags hard-false", async () => {
      await markRequestClean();
      const updatedAt = await metricUpdatedAt();
      const token = await sourceToken();
      const preferred = await ensurePreferredMapping();

      const beforeMetric = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token }),
      );
      expect(beforeMetric.ok).toBe(true);
      if (beforeMetric.ok) {
        expect(beforeMetric.transactionSafety).toBe("unproven");
        expect(beforeMetric.productionCreateEligible).toBe(false);
        expect(beforeMetric.commercialActionsEligible).toBe(false);
        expect(beforeMetric.notes).toContain(
          "NOT_create_transaction_serialization_proof",
        );
      }

      const beforeRows = await loadSupplierRows();
      const beforePreferred = beforeRows.find(
        (row) => row.supplierId === SUPPLIER_1,
      );
      expect(beforePreferred).toBeDefined();
      expect(beforePreferred!.id).toBe(preferred.id);

      const beforeSupplier = evaluatePb1SupplierConcurrencyFence({
        fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
        rows: beforeRows,
        bound: {
          organizationId: ORG,
          variantId: VARIANT,
          supplierId: SUPPLIER_1,
          supplierProductId: beforePreferred!.id,
          supplierProductUpdatedAt: beforePreferred!.updatedAt,
          leadTimeDays: 5,
        },
      });
      expect(beforeSupplier.ok).toBe(true);
      if (beforeSupplier.ok) {
        expect(beforeSupplier.transactionSafety).toBe("unproven");
        expect(beforeSupplier.productionCreateEligible).toBe(false);
      }

      // Mutate DB after snapshots were taken.
      await psql(`
        update public.supplier_products
        set lead_time_days = 12, updated_at = pg_catalog.now()
        where id = ${quote(preferred.id)}::uuid;

        insert into public.sku_daily_metric_source_events (
          organization_id, store_id, location_id, variant_id,
          source_date, algorithm_version
        ) values (
          ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(LOCATION)}::uuid,
          ${quote(VARIANT)}::uuid,
          ${quote(shiftIsoCalendarDate(metricDate, -5))}::date,
          ${quote(ALGORITHM)}
        );
      `);

      // Reusing pre-mutation snapshots still PASSes (read-model only).
      expect(
        evaluatePb1MetricFreshnessFence(
          cleanFenceRequest({ updatedAt, token, events: [] }),
        ).ok,
      ).toBe(true);

      expect(
        evaluatePb1SupplierConcurrencyFence({
          fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
          organizationId: ORG,
          variantId: VARIANT,
          rows: beforeRows,
          bound: {
            organizationId: ORG,
            variantId: VARIANT,
            supplierId: SUPPLIER_1,
            supplierProductId: beforePreferred!.id,
            supplierProductUpdatedAt: beforePreferred!.updatedAt,
            leadTimeDays: 5,
          },
        }).ok,
      ).toBe(true);

      // Fresh DB projections fail.
      const afterEvents = await loadUnconsumedEvents();
      const afterMetric = evaluatePb1MetricFreshnessFence(
        cleanFenceRequest({ updatedAt, token, events: afterEvents }),
      );
      expect(afterMetric.ok).toBe(false);

      const afterSupplier = evaluatePb1SupplierConcurrencyFence({
        fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
        organizationId: ORG,
        variantId: VARIANT,
        rows: await loadSupplierRows(),
        bound: {
          organizationId: ORG,
          variantId: VARIANT,
          supplierId: SUPPLIER_1,
          supplierProductId: beforePreferred!.id,
          supplierProductUpdatedAt: beforePreferred!.updatedAt,
          leadTimeDays: 5,
        },
      });
      expect(afterSupplier.ok).toBe(false);
      if (!afterSupplier.ok) {
        expect(afterSupplier.code).toBe("SUPPLIER_FACTS_STALE");
        expect(afterSupplier.transactionSafety).toBe("unproven");
        expect(afterSupplier.productionCreateEligible).toBe(false);
      }

      // Isolation: foreign tenant untouched.
      expect(
        await psql(`
          select count(*)::text from public.sku_daily_metrics
          where organization_id = ${quote(ORG_B)}::uuid
        `),
      ).toBe("0");
      expect(await inventoryActionCount()).toBe(0);
      expect(await globalInventoryActionCount()).toBe(baselineInventoryActions);

      record({
        caseId: "E1",
        txA: "h.2 validators on before-snapshot",
        txB: "DB mutations after snapshot",
        outcome: "COMMITTED",
        classification: "BOUNDARY",
        detail:
          "stale inputs PASS as internally consistent; transactionSafety=unproven; productionCreateEligible=false",
      });
    }, 120000);
  });
});
