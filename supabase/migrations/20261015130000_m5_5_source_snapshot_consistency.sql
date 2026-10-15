-- StoreAgent M5.5 torn source-read correction.
--
-- The previous snapshot function calculated the source token in one
-- statement and the four payloads in later statements. Under READ
-- COMMITTED those statements can observe different commits. The token
-- and payloads below come from one SELECT, so they share one snapshot.
-- Commit-time SHARE locks, SA008, and the lock timeout are unchanged.

create or replace function public.sku_daily_metric_source_snapshot(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
  then
    raise exception
      'sku daily metric scope requires organization, store, location, and variant';
  end if;

  with store_row as (
    select s.timezone
    from public.stores s
    where
      s.organization_id = p_organization_id
      and s.id = p_store_id
  ),
  location_ok as (
    select 1 as present
    from public.locations l
    where
      l.organization_id = p_organization_id
      and l.store_id = p_store_id
      and l.id = p_location_id
  ),
  variant_ok as (
    select 1 as present
    from public.product_variants pv
    where
      pv.organization_id = p_organization_id
      and pv.store_id = p_store_id
      and pv.id = p_variant_id
  ),
  scoped_items as (
    select
      i.id as item_id,
      i.organization_id,
      i.store_id,
      i.order_id,
      i.variant_id,
      i.location_id,
      i.quantity,
      o.status,
      o.ordered_at,
      pg_catalog.concat_ws(
        '|',
        'order_item',
        i.id::text,
        o.id::text,
        o.status,
        o.ordered_at::text,
        i.variant_id::text,
        i.location_id::text,
        i.quantity::text
      ) as line
    from public.order_items i
    join public.orders o
      on o.organization_id = i.organization_id
      and o.store_id = i.store_id
      and o.id = i.order_id
    where
      i.organization_id = p_organization_id
      and i.store_id = p_store_id
      and i.location_id = p_location_id
      and i.variant_id = p_variant_id
  ),
  scoped_returns as (
    select
      r.id,
      r.organization_id,
      r.store_id,
      r.variant_id,
      r.location_id,
      r.returned_quantity,
      r.occurred_at,
      pg_catalog.concat_ws(
        '|',
        'return',
        r.id::text,
        r.variant_id::text,
        coalesce(r.location_id::text, ''::text),
        coalesce(r.returned_quantity::text, ''::text),
        r.occurred_at::text
      ) as line
    from public.return_refunds r
    where
      r.organization_id = p_organization_id
      and r.store_id = p_store_id
      and r.location_id = p_location_id
      and r.variant_id = p_variant_id
  ),
  scoped_snapshots as (
    select
      n.id,
      n.organization_id,
      n.store_id,
      n.location_id,
      n.variant_id,
      n.observed_at,
      n.available_quantity,
      pg_catalog.concat_ws(
        '|',
        'snapshot',
        n.id::text,
        n.variant_id::text,
        n.location_id::text,
        n.observed_at::text,
        coalesce(n.available_quantity::text, ''::text)
      ) as line
    from public.inventory_snapshots n
    where
      n.organization_id = p_organization_id
      and n.store_id = p_store_id
      and n.location_id = p_location_id
      and n.variant_id = p_variant_id
  ),
  evidence as (
    select line from scoped_items
    union all
    select line from scoped_returns
    union all
    select line from scoped_snapshots
  )
  select pg_catalog.jsonb_build_object(
    'scopeError',
    case
      when not exists (select 1 from store_row) then 'store'
      when not exists (select 1 from location_ok) then 'location'
      when not exists (select 1 from variant_ok) then 'variant'
      else null
    end,
    'payload',
    case
      when exists (select 1 from store_row)
        and exists (select 1 from location_ok)
        and exists (select 1 from variant_ok)
      then pg_catalog.jsonb_build_object(
        'timeZone', (select store_row.timezone from store_row),
        'sourceToken', pg_catalog.md5(
          pg_catalog.concat_ws(
            E'\n',
            'timezone=' || (select store_row.timezone from store_row),
            coalesce((
              select pg_catalog.string_agg(
                evidence.line,
                E'\n'
                order by evidence.line
              )
              from evidence
            ), ''::text)
          )
        ),
        'orders', coalesce((
          select pg_catalog.jsonb_agg(order_row.payload order by order_row.order_id)
          from (
            select distinct on (scoped_items.order_id)
              scoped_items.order_id,
              pg_catalog.jsonb_build_object(
                'id', scoped_items.order_id,
                'organizationId', scoped_items.organization_id,
                'storeId', scoped_items.store_id,
                'status', scoped_items.status,
                'orderedAt', scoped_items.ordered_at
              ) as payload
            from scoped_items
            order by scoped_items.order_id
          ) as order_row
        ), '[]'::jsonb),
        'orderItems', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', scoped_items.item_id,
              'organizationId', scoped_items.organization_id,
              'storeId', scoped_items.store_id,
              'orderId', scoped_items.order_id,
              'variantId', scoped_items.variant_id,
              'locationId', scoped_items.location_id,
              'quantity', scoped_items.quantity
            )
            order by scoped_items.item_id
          )
          from scoped_items
        ), '[]'::jsonb),
        'returnRefunds', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', scoped_returns.id,
              'organizationId', scoped_returns.organization_id,
              'storeId', scoped_returns.store_id,
              'variantId', scoped_returns.variant_id,
              'locationId', scoped_returns.location_id,
              'returnedQuantity', scoped_returns.returned_quantity,
              'occurredAt', scoped_returns.occurred_at
            )
            order by scoped_returns.id
          )
          from scoped_returns
        ), '[]'::jsonb),
        'inventorySnapshots', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', scoped_snapshots.id,
              'organizationId', scoped_snapshots.organization_id,
              'storeId', scoped_snapshots.store_id,
              'locationId', scoped_snapshots.location_id,
              'variantId', scoped_snapshots.variant_id,
              'observedAt', scoped_snapshots.observed_at,
              'availableQuantity', scoped_snapshots.available_quantity
            )
            order by scoped_snapshots.id
          )
          from scoped_snapshots
        ), '[]'::jsonb)
      )
      else null
    end
  )
  into result
  from (select 1) as snapshot_anchor;

  if result->>'scopeError' = 'store' then
    raise exception
      'store is outside trusted scope';
  end if;

  if result->>'scopeError' = 'location' then
    raise exception
      'location is outside trusted scope';
  end if;

  if result->>'scopeError' = 'variant' then
    raise exception
      'variant is outside trusted scope';
  end if;

  return result->'payload';
end;
$$;

revoke all
on function public.sku_daily_metric_source_snapshot(uuid, uuid, uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.sku_daily_metric_source_snapshot(uuid, uuid, uuid, uuid)
to service_role;
