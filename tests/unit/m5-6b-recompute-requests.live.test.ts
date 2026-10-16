import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { holdOrdersLiveLock } from "../support/orders-live-lock";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "57160000-0000-4000-8000-000000000001";
const ORG_B = "57160000-0000-4000-8000-000000000011";
const STORE = "57160000-0000-4000-8000-000000000002";
const STORE_B = "57160000-0000-4000-8000-000000000012";
const LOCATION = "57160000-0000-4000-8000-000000000003";
const LOCATION_B = "57160000-0000-4000-8000-000000000013";
const PRODUCT = "57160000-0000-4000-8000-000000000005";
const PRODUCT_B = "57160000-0000-4000-8000-000000000015";
const VARIANT = "57160000-0000-4000-8000-000000000006";
const VARIANT_B = "57160000-0000-4000-8000-000000000016";

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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

function requestsFor(organizationId: string): string {
  return `
    select coalesce(string_agg(
      metric_date::text || ':' || dirty_generation::text || ':' ||
        claimed_generation::text || ':' || applied_generation::text || ':' ||
        status || ':' || attempt_count::text || ':' ||
        coalesce(lease_claim_token, ''),
      ','
      order by metric_date
    ), '')
    from public.sku_daily_metric_recompute_requests
    where organization_id = ${quote(organizationId)}::uuid
  `;
}

async function clearWork(): Promise<void> {
  await psql(`
    delete from public.order_items
    where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
    delete from public.orders
    where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
    delete from public.sku_daily_metric_source_events
    where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
    delete from public.sku_daily_metric_recompute_requests
    where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
    delete from public.sku_daily_metrics
    where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
  `);
}

async function storeToday(): Promise<string> {
  return psql(`
    select (pg_catalog.timezone('UTC', pg_catalog.now()))::date::text
  `);
}

async function shift(days: number): Promise<string> {
  const sign = days < 0 ? "-" : "+";
  return psql(`
    select (
      (pg_catalog.timezone('UTC', pg_catalog.now()))::date
      ${sign} ${Math.abs(days)}
    )::text
  `);
}

async function insertEvent(
  sourceDate: string,
  organizationId = ORG,
): Promise<void> {
  const storeId = organizationId === ORG ? STORE : STORE_B;
  const locationId = organizationId === ORG ? LOCATION : LOCATION_B;
  const variantId = organizationId === ORG ? VARIANT : VARIANT_B;
  await psql(`
    insert into public.sku_daily_metric_source_events (
      organization_id,
      store_id,
      location_id,
      variant_id,
      source_date,
      algorithm_version
    ) values (
      ${quote(organizationId)}::uuid,
      ${quote(storeId)}::uuid,
      ${quote(locationId)}::uuid,
      ${quote(variantId)}::uuid,
      ${quote(sourceDate)}::date,
      'm5-derived-metrics-v1'
    );
  `);
}

async function consume(limit = 100): Promise<string> {
  return psql(`
    select public.consume_sku_daily_metric_source_events(
      ${limit},
      ${quote(ORG)}::uuid
    )::text
  `);
}

function metricInsert(metricDate: string): string {
  return `
    insert into public.sku_daily_metrics (
      organization_id,
      store_id,
      location_id,
      variant_id,
      metric_date,
      algorithm_version,
      units_sold,
      returned_units,
      net_units_sold,
      eligible_days_7d,
      eligible_days_14d,
      eligible_days_30d,
      eligible_days_90d,
      coverage_ratio_7d,
      coverage_ratio_14d,
      coverage_ratio_30d,
      coverage_ratio_90d,
      sales_velocity_7d_reason_code,
      sales_velocity_14d_reason_code,
      sales_velocity_30d_reason_code,
      sales_velocity_90d_reason_code,
      eligible_incoming_reason_code,
      days_of_stock_reason_code,
      safety_stock_reason_code,
      reorder_point_reason_code,
      target_stock_reason_code,
      inventory_age_quality,
      inventory_age_reason_code,
      demand_trend,
      demand_trend_reason_code
    ) values (
      ${quote(ORG)}::uuid,
      ${quote(STORE)}::uuid,
      ${quote(LOCATION)}::uuid,
      ${quote(VARIANT)}::uuid,
      ${quote(metricDate)}::date,
      'm5-derived-metrics-v1',
      0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      'no_eligible_days',
      'no_eligible_days',
      'no_eligible_days',
      'no_eligible_days',
      'incoming_state_unknown',
      'demand_unknown',
      'safety_stock_unknown',
      'lead_time_unknown',
      'target_stock_unknown',
      'unavailable',
      'inventory_age_unknown',
      'unknown',
      'trend_input_unknown'
    );
  `;
}

describeLive("M5.6B event consumption", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseOrdersLock = await holdOrdersLiveLock();
    await psql(`
      delete from public.order_items
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.orders
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metric_source_events
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metric_recompute_requests
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metrics
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.product_variants
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.products
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.locations
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.stores
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.organizations
      where id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      insert into public.organizations
        (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'M56B A', 'USD', 'UTC'),
        (${quote(ORG_B)}::uuid, 'M56B B', 'USD', 'UTC');
      insert into public.stores
        (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'A', 'active', 'USD', 'UTC'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'UTC');
      insert into public.locations
        (id, organization_id, store_id, name, status)
      values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');
      insert into public.products
        (id, organization_id, store_id, title, status)
      values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');
      insert into public.product_variants
        (id, organization_id, store_id, product_id, sku, status)
      values
        (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'A', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'B', 'active');
    `);
  }, 180000);

  afterAll(async () => {
    try {
      await clearWork();
      await psql(`
        delete from public.product_variants
        where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
        delete from public.products
        where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
        delete from public.locations
        where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
        delete from public.stores
        where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
        delete from public.organizations
        where id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      `);
    } finally {
      if (releaseOrdersLock) {
        await releaseOrdersLock();
      }
    }
  }, 180000);

  it("expands two source dates onto one shared grain", async () => {
    await clearWork();
    const older = await shift(-20);
    const newer = await shift(-4);
    const today = await storeToday();
    await insertEvent(older);
    await insertEvent(newer);
    expect(await consume()).toBe("2");
    expect(await psql(requestsFor(ORG))).toBe(
      [
        `${older}:1:0:0:queued:0:`,
        `${newer}:1:0:0:queued:0:`,
        `${today}:2:0:0:queued:0:`,
      ].join(","),
    );
  });

  it("deduplicates overlapping windows and counts duplicate events", async () => {
    await clearWork();
    const duplicated = await shift(-5);
    const other = await shift(-1);
    const today = await storeToday();
    await insertEvent(duplicated);
    await insertEvent(duplicated);
    await insertEvent(other);
    expect(await consume()).toBe("3");
    expect(await psql(requestsFor(ORG))).toBe(
      [
        `${duplicated}:2:0:0:queued:0:`,
        `${other}:1:0:0:queued:0:`,
        `${today}:3:0:0:queued:0:`,
      ].join(","),
    );
  });

  it("consumes a later event before a late-committing earlier event", async () => {
    await clearWork();
    const slow = execFileAsync(
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
        `
          begin;
          insert into public.orders (
            id, organization_id, store_id, status, ordered_at, currency, source
          ) values (
            '57160000-0000-4000-8000-000000000081'::uuid,
            ${quote(ORG)}::uuid,
            ${quote(STORE)}::uuid,
            'completed',
            '2026-09-01T12:00:00Z',
            'USD',
            'csv'
          );
          insert into public.order_items (
            id, organization_id, store_id, order_id, variant_id, location_id, quantity
          ) values (
            '57160000-0000-4000-8000-000000000082'::uuid,
            ${quote(ORG)}::uuid,
            ${quote(STORE)}::uuid,
            '57160000-0000-4000-8000-000000000081'::uuid,
            ${quote(VARIANT)}::uuid,
            ${quote(LOCATION)}::uuid,
            1
          );
          select pg_catalog.pg_sleep(4);
          commit;
        `,
      ],
      {
        env: {
          ...process.env,
          PGPASSWORD: "postgres",
        },
      },
    );

    let open = "0";
    for (let attempt = 0; attempt < 80; attempt += 1) {
      open = await psql(`
        select count(*)::text
        from pg_catalog.pg_stat_activity
        where state = 'active'
          and query like '%pg_sleep(4)%'
          and query like '%57160000-0000-4000-8000-000000000081%'
      `);
      if (open !== "0") {
        break;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    expect(open).not.toBe("0");

    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '57160000-0000-4000-8000-000000000083'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-09-02T12:00:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '57160000-0000-4000-8000-000000000084'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '57160000-0000-4000-8000-000000000083'::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION)}::uuid,
        1
      );
    `);
    expect(await consume()).toBe("1");
    expect(await psql(`
      select coalesce(string_agg(source_date::text, ',' order by event_id), '')
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and consumed_at is not null
    `)).toBe("2026-09-02");

    await slow;
    expect(await consume()).toBe("1");
    expect(await psql(`
      select coalesce(string_agg(
        source_date::text || ':' || (consumed_at is not null)::text,
        ',' order by event_id
      ), '')
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
    `)).toBe("2026-09-01:true,2026-09-02:true");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and metric_date in ('2026-09-01'::date, '2026-09-02'::date)
    `)).toBe("2");
  });

  it("leaves events unconsumed when the transaction rolls back", async () => {
    await clearWork();
    const sourceDate = await shift(-3);
    const visible = await psql(`
      begin;
      insert into public.sku_daily_metric_source_events (
        organization_id, store_id, location_id, variant_id,
        source_date, algorithm_version
      ) values (
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(sourceDate)}::date,
        'm5-derived-metrics-v1'
      );
      select public.consume_sku_daily_metric_source_events(
        10,
        ${quote(ORG)}::uuid
      )::text;
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and consumed_at is not null;
      rollback;
    `);
    expect(visible).toContain("1");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
    `)).toBe("0");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
    `)).toBe("0");
  });

  it("includes a persisted date 89 days ahead and excludes day 90", async () => {
    await clearWork();
    const sourceDate = await shift(-10);
    const included = await psql(`
      select (${quote(sourceDate)}::date + 89)::text
    `);
    const excluded = await psql(`
      select (${quote(sourceDate)}::date + 90)::text
    `);
    const today = await storeToday();
    await psql(`
      ${metricInsert(included)}
      ${metricInsert(excluded)}
    `);
    await insertEvent(sourceDate);
    expect(await consume()).toBe("1");
    const dates = await psql(`
      select coalesce(string_agg(metric_date::text, ',' order by metric_date), '')
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
    `);
    expect(dates.split(",")).toEqual(
      [sourceDate, today, included].sort(),
    );
    expect(dates).not.toContain(excluded);
    expect(await psql(`
      select units_sold::text
      from public.sku_daily_metrics
      where organization_id = ${quote(ORG)}::uuid
        and metric_date = ${quote(included)}::date
    `)).toBe("0");
  });

  it("lets concurrent consumers take disjoint events", async () => {
    await clearWork();
    const sourceDate = await shift(-2);
    await insertEvent(sourceDate);
    await insertEvent(sourceDate);

    const first = execFileAsync(
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
        `
          begin;
          select public.consume_sku_daily_metric_source_events(
            1,
            ${quote(ORG)}::uuid
          );
          select pg_catalog.pg_sleep(3);
          commit;
        `,
      ],
      {
        env: {
          ...process.env,
          PGPASSWORD: "postgres",
        },
      },
    );

    let open = "0";
    for (let attempt = 0; attempt < 80; attempt += 1) {
      open = await psql(`
        select count(*)::text
        from pg_catalog.pg_stat_activity
        where state = 'active'
          and query like '%pg_sleep(3)%'
          and query like '%consume_sku_daily_metric_source_events%'
      `);
      if (open !== "0") {
        break;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    expect(open).not.toBe("0");
    expect(await consume(1)).toBe("1");
    await first;
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and consumed_at is not null
    `)).toBe("2");
    expect(await psql(`
      select dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and metric_date = ${quote(sourceDate)}::date
    `)).toBe("2");
  });

  it("advances a running lease without completing it", async () => {
    await clearWork();
    const sourceDate = await shift(-2);
    const today = await storeToday();
    await psql(`
      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id,
        metric_date, algorithm_version,
        dirty_generation, claimed_generation, applied_generation,
        status, attempt_count,
        lease_owner_id, lease_claim_token, lease_claimed_at, lease_expires_at,
        queued_at, started_at
      ) values (
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(today)}::date,
        'm5-derived-metrics-v1',
        1, 1, 0,
        'running', 2,
        'worker-a', 'claim-token', pg_catalog.now(), pg_catalog.now() + interval '5 minutes',
        pg_catalog.now(), pg_catalog.now()
      );
      insert into public.sku_daily_metric_recompute_requests (
        organization_id, store_id, location_id, variant_id,
        metric_date, algorithm_version,
        dirty_generation, claimed_generation, applied_generation,
        status, attempt_count,
        queued_at, started_at, finished_at
      ) values (
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(sourceDate)}::date,
        'm5-derived-metrics-v1',
        3, 3, 3,
        'succeeded', 5,
        pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
      );
    `);
    await insertEvent(sourceDate);
    expect(await consume()).toBe("1");
    expect(await psql(`
      select status || ':' || dirty_generation::text || ':' ||
        claimed_generation::text || ':' || applied_generation::text || ':' ||
        attempt_count::text || ':' || lease_claim_token
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and metric_date = ${quote(today)}::date
    `)).toBe("running:2:1:0:2:claim-token");
    expect(await psql(`
      select status || ':' || dirty_generation::text || ':' ||
        claimed_generation::text || ':' || applied_generation::text || ':' ||
        attempt_count::text || ':' ||
        (lease_claim_token is null)::text || ':' ||
        (finished_at is null)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and metric_date = ${quote(sourceDate)}::date
    `)).toBe("queued:4:3:3:0:true:true");
  });

  it("keeps another tenant's events and requests separate", async () => {
    await clearWork();
    const sourceDate = await shift(-6);
    await insertEvent(sourceDate, ORG);
    await insertEvent(sourceDate, ORG_B);
    expect(await consume()).toBe("1");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG_B)}::uuid
        and consumed_at is null
    `)).toBe("1");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG_B)}::uuid
    `)).toBe("0");
    expect(await psql(`
      select public.consume_sku_daily_metric_source_events(
        10,
        ${quote(ORG_B)}::uuid
      )::text
    `)).toBe("1");
    expect(await psql(`
      select organization_id::text || ':' || location_id::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG_B)}::uuid
      order by metric_date
      limit 1
    `)).toBe(`${ORG_B}:${LOCATION_B}`);
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
        and location_id = ${quote(LOCATION_B)}::uuid
    `)).toBe("0");
  });

  it("keeps a future date alone and a historical correction bounded", async () => {
    await clearWork();
    const future = await shift(5);
    await insertEvent(future);
    expect(await consume()).toBe("1");
    expect(await psql(requestsFor(ORG))).toBe(
      `${future}:1:0:0:queued:0:`,
    );

    await clearWork();
    const historical = await shift(-40);
    const today = await storeToday();
    await insertEvent(historical);
    expect(await consume()).toBe("1");
    expect(await psql(requestsFor(ORG))).toBe(
      [
        `${historical}:1:0:0:queued:0:`,
        `${today}:1:0:0:queued:0:`,
      ].join(","),
    );
  });
});
