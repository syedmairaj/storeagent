import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { holdOrdersLiveLock } from "../support/orders-live-lock";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "56160000-0000-4000-8000-000000000001";
const ORG_B = "56160000-0000-4000-8000-000000000011";
const STORE = "56160000-0000-4000-8000-000000000002";
const STORE_B = "56160000-0000-4000-8000-000000000012";
const LOCATION = "56160000-0000-4000-8000-000000000003";
const LOCATION_OTHER = "56160000-0000-4000-8000-000000000004";
const LOCATION_B = "56160000-0000-4000-8000-000000000013";
const PRODUCT = "56160000-0000-4000-8000-000000000005";
const PRODUCT_B = "56160000-0000-4000-8000-000000000015";
const VARIANT = "56160000-0000-4000-8000-000000000006";
const VARIANT_B = "56160000-0000-4000-8000-000000000016";

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

function eventsFor(organizationId: string): string {
  return `
    select coalesce(string_agg(
      location_id::text || '|' || source_date::text || '|' ||
        variant_id::text || '|' || (consumed_at is null)::text,
      ','
      order by event_id
    ), '')
    from public.sku_daily_metric_source_events
    where organization_id = ${quote(organizationId)}::uuid
  `;
}

describeLive("M5.6A metric source event capture", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseOrdersLock = await holdOrdersLiveLock();
    await psql(`
      alter table public.inventory_snapshots
        disable trigger inventory_snapshots_prevent_delete;
      delete from public.inventory_snapshots
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      alter table public.inventory_snapshots
        enable trigger inventory_snapshots_prevent_delete;
      delete from public.return_refunds
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.order_items
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.orders
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metric_source_events
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
    `);
    await psql(`
      insert into public.organizations
        (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'M56A A', 'USD', 'Asia/Dubai'),
        (${quote(ORG_B)}::uuid, 'M56A B', 'USD', 'Asia/Dubai');
      insert into public.stores
        (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'A', 'active', 'USD', 'Asia/Dubai'),
        (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'B', 'active', 'USD', 'Asia/Dubai');
      insert into public.locations
        (id, organization_id, store_id, name, status)
      values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(LOCATION_OTHER)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'Other', 'active'),
        (${quote(LOCATION_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');
      insert into public.products
        (id, organization_id, store_id, title, status)
      values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'A', 'active'),
        (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'B', 'active');
      insert into public.product_variants
        (id, organization_id, store_id, product_id, sku, status)
      values
        (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'SKU-A', 'active'),
        (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'SKU-B', 'active');
    `);
  }, 180000);

  afterAll(async () => {
    try {
      await psql(`
      alter table public.inventory_snapshots
        disable trigger inventory_snapshots_prevent_delete;
      delete from public.inventory_snapshots
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      alter table public.inventory_snapshots
        enable trigger inventory_snapshots_prevent_delete;
      delete from public.return_refunds
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.order_items
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.orders
      where organization_id in (${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid);
      delete from public.sku_daily_metric_source_events
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
    `);
    } finally {
      await releaseOrdersLock?.();
    }
  }, 180000);

  it("captures status, date, quantity, location, and tenant boundaries", async () => {
    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '56160000-0000-4000-8000-000000000021'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'pending',
        '2026-10-14T19:30:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '56160000-0000-4000-8000-000000000022'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '56160000-0000-4000-8000-000000000021'::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION)}::uuid,
        4
      );
    `);

    expect(await psql(eventsFor(ORG))).toBe(
      `${LOCATION}|2026-10-14|${VARIANT}|true`,
    );

    await psql(`
      update public.orders
      set status = 'completed'
      where id = '56160000-0000-4000-8000-000000000021'::uuid;
    `);
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and source_date = '2026-10-14'
    `)).toBe("2");

    await psql(`
      update public.orders
      set ordered_at = '2026-10-14T20:30:00Z'
      where id = '56160000-0000-4000-8000-000000000021'::uuid;
    `);
    const dates = await psql(`
      select coalesce(string_agg(distinct source_date::text, ',' order by source_date::text), '')
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and variant_id = ${quote(VARIANT)}::uuid
    `);
    expect(dates).toBe("2026-10-14,2026-10-15");

    const beforeQuantity = await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
    `);
    await psql(`
      update public.order_items
      set quantity = 9
      where id = '56160000-0000-4000-8000-000000000022'::uuid;
    `);
    const afterQuantity = await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
    `);
    expect(Number(afterQuantity)).toBe(Number(beforeQuantity) + 1);

    await psql(`
      update public.order_items
      set location_id = ${quote(LOCATION_OTHER)}::uuid
      where id = '56160000-0000-4000-8000-000000000022'::uuid;
    `);
    const moved = await psql(`
      select coalesce(string_agg(distinct location_id::text, ',' order by location_id::text), '')
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and source_date = '2026-10-15'
    `);
    expect(moved.split(",")).toEqual([LOCATION, LOCATION_OTHER].sort());

    await psql(`
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '56160000-0000-4000-8000-000000000031'::uuid,
        ${quote(ORG_B)}::uuid,
        ${quote(STORE_B)}::uuid,
        'completed',
        '2026-10-14T19:30:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '56160000-0000-4000-8000-000000000032'::uuid,
        ${quote(ORG_B)}::uuid,
        ${quote(STORE_B)}::uuid,
        '56160000-0000-4000-8000-000000000031'::uuid,
        ${quote(VARIANT_B)}::uuid,
        ${quote(LOCATION_B)}::uuid,
        2
      );
    `);
    expect(await psql(eventsFor(ORG))).not.toContain(ORG_B);
    expect(await psql(eventsFor(ORG_B))).toContain(LOCATION_B);

    const metrics = await psql(`
      select count(*)::text
      from public.sku_daily_metrics
      where organization_id = ${quote(ORG)}::uuid
    `);
    expect(metrics).toBe("0");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and consumed_at is not null
    `)).toBe("0");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quote(ORG)}::uuid
    `)).toBe("0");
  });

  it("ignores no-op updates, null locations, and purchase-order tables", async () => {
    const before = await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
    `);
    await psql(`
      update public.orders
      set gross_amount = 10
      where id = '56160000-0000-4000-8000-000000000021'::uuid;
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '56160000-0000-4000-8000-000000000041'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-10-14T19:30:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '56160000-0000-4000-8000-000000000042'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '56160000-0000-4000-8000-000000000041'::uuid,
        ${quote(VARIANT)}::uuid,
        null,
        3
      );
      update public.order_items
      set quantity = 8
      where id = '56160000-0000-4000-8000-000000000042'::uuid;
    `);
    const after = await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
    `);
    expect(after).toBe(before);
    expect(await psql(`
      select count(*)::text
      from pg_catalog.pg_trigger
      where tgrelid = 'public.purchase_orders'::regclass
        and not tgisinternal
        and tgname like '%metric_source%'
    `)).toBe("0");
  });

  it("captures return changes and snapshot inserts, including delete", async () => {
    await psql(`
      insert into public.return_refunds (
        id, organization_id, store_id, order_id, variant_id,
        location_id, returned_quantity, occurred_at
      ) values (
        '56160000-0000-4000-8000-000000000051'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '56160000-0000-4000-8000-000000000021'::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION)}::uuid,
        1,
        '2026-10-13T20:30:00Z'
      );
    `);
    expect(await psql(`
      select source_date::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
      order by event_id desc
      limit 1
    `)).toBe("2026-10-14");

    await psql(`
      update public.return_refunds
      set location_id = ${quote(LOCATION_OTHER)}::uuid,
          occurred_at = '2026-10-14T20:30:00Z'
      where id = '56160000-0000-4000-8000-000000000051'::uuid;
    `);
    const returnGrains = await psql(`
      select coalesce(string_agg(
        location_id::text || '|' || source_date::text,
        ','
        order by event_id
      ), '')
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and event_id > (
          select max(event_id) - 2
          from public.sku_daily_metric_source_events
          where organization_id = ${quote(ORG)}::uuid
        )
    `);
    expect(returnGrains).toContain(`${LOCATION}|2026-10-14`);
    expect(returnGrains).toContain(`${LOCATION_OTHER}|2026-10-15`);

    await psql(`
      delete from public.return_refunds
      where id = '56160000-0000-4000-8000-000000000051'::uuid;
    `);
    expect(await psql(`
      select location_id::text || '|' || source_date::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
      order by event_id desc
      limit 1
    `)).toBe(`${LOCATION_OTHER}|2026-10-15`);

    await psql(`
      insert into public.inventory_snapshots (
        id, organization_id, store_id, location_id, variant_id,
        observed_at, available_quantity, source
      ) values (
        '56160000-0000-4000-8000-000000000061'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        ${quote(LOCATION)}::uuid,
        ${quote(VARIANT)}::uuid,
        '2026-10-12T20:30:00Z',
        5,
        'csv'
      );
    `);
    expect(await psql(`
      select source_date::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
      order by event_id desc
      limit 1
    `)).toBe("2026-10-13");

    const updateAttempt = await psql(`
      update public.inventory_snapshots
      set available_quantity = 6
      where id = '56160000-0000-4000-8000-000000000061'::uuid;
    `).then(
      () => "updated",
      (error: { stderr?: string; message?: string }) =>
        `${error.stderr ?? ""} ${error.message}`,
    );
    expect(updateAttempt.toLowerCase()).toContain("immutable");
  });

  it("creates no event when the source transaction rolls back", async () => {
    const during = await psql(`
      begin;
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '56160000-0000-4000-8000-000000000071'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-10-01T08:00:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '56160000-0000-4000-8000-000000000072'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '56160000-0000-4000-8000-000000000071'::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION)}::uuid,
        1
      );
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and source_date = '2026-10-01';
      rollback;
    `);
    expect(during).toContain("1");
    expect(await psql(`
      select count(*)::text
      from public.orders
      where id = '56160000-0000-4000-8000-000000000071'::uuid
    `)).toBe("0");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and source_date = '2026-10-01'
    `)).toBe("0");
  });

  it("keeps an earlier allocated event discoverable after a later id commits first", async () => {
    const slow = psql(`
      begin;
      insert into public.orders (
        id, organization_id, store_id, status, ordered_at, currency, source
      ) values (
        '56160000-0000-4000-8000-000000000081'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-09-01T08:00:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '56160000-0000-4000-8000-000000000082'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '56160000-0000-4000-8000-000000000081'::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION)}::uuid,
        1
      );
      select pg_sleep(4);
      commit;
    `);
    try {
    const started = Date.now();
    let open = "0";
    while (Date.now() - started < 3000) {
      open = await psql(`
        select count(*)::text
        from pg_catalog.pg_stat_activity
        where state = 'active'
          and query like '%pg_sleep(4)%'
          and query like '%56160000-0000-4000-8000-000000000081%'
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
        '56160000-0000-4000-8000-000000000083'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        'completed',
        '2026-09-02T08:00:00Z',
        'USD',
        'csv'
      );
      insert into public.order_items (
        id, organization_id, store_id, order_id, variant_id, location_id, quantity
      ) values (
        '56160000-0000-4000-8000-000000000084'::uuid,
        ${quote(ORG)}::uuid,
        ${quote(STORE)}::uuid,
        '56160000-0000-4000-8000-000000000083'::uuid,
        ${quote(VARIANT)}::uuid,
        ${quote(LOCATION_OTHER)}::uuid,
        1
      );
    `);
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and location_id = ${quote(LOCATION)}::uuid
        and source_date = '2026-09-01'
        and consumed_at is null
    `)).toBe("0");
    expect(await psql(`
      select count(*)::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and location_id = ${quote(LOCATION_OTHER)}::uuid
        and source_date = '2026-09-02'
        and consumed_at is null
    `)).toBe("1");
    await slow;
    const ids = await psql(`
      select location_id::text || ':' || event_id::text
      from public.sku_daily_metric_source_events
      where organization_id = ${quote(ORG)}::uuid
        and source_date in ('2026-09-01', '2026-09-02')
        and consumed_at is null
      order by source_date
    `);
    const [earlier, later] = ids.split("\n").map((line) => {
      const [locationId, eventId] = line.split(":");
      return { locationId, eventId: Number(eventId) };
    });
    expect(earlier?.locationId).toBe(LOCATION);
    expect(later?.locationId).toBe(LOCATION_OTHER);
    expect(earlier?.eventId).toBeLessThan(later?.eventId ?? 0);
    } finally {
      await slow;
    }
  }, 20000);
});
