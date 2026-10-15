-- StoreAgent M5.5
-- Service-role recompute boundary for one sku_daily_metrics grain.
--
-- Concurrency:
--   CSV and other source writers take row locks and per-external-id
--   advisory locks. They do not take the metric-grain lock, so a lock
--   held only by recompute calls cannot stop a source commit.
--   PostgreSQL also does not keep one snapshot across separate
--   PostgREST calls, and SERIALIZABLE does not constrain a
--   READ COMMITTED writer.
--
--   commit_sku_daily_metric therefore takes SHARE locks on the source
--   tables before it reads the source token and before it upserts.
--   SHARE conflicts with the ROW EXCLUSIVE lock taken by INSERT,
--   UPDATE, and DELETE. A source mutation cannot commit between token
--   validation and the metric upsert. The TypeScript calculation stays
--   outside this short transaction. If sources changed after it read
--   them, the token does not match and the commit raises SA008.
--
--   The token is every current row for the organization, store,
--   location, and variant. It is not a system-column version and
--   not a time-window subset.
--   Insertion, update, deletion, status, and location changes alter it.

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
  store_timezone text;
  source_token text;
  orders_json jsonb;
  order_items_json jsonb;
  returns_json jsonb;
  snapshots_json jsonb;
begin
  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
  then
    raise exception
      'sku daily metric scope requires organization, store, location, and variant';
  end if;

  select s.timezone
  into store_timezone
  from public.stores s
  where
    s.organization_id = p_organization_id
    and s.id = p_store_id;

  if not found then
    raise exception
      'store is outside trusted scope';
  end if;

  perform 1
  from public.locations l
  where
    l.organization_id = p_organization_id
    and l.store_id = p_store_id
    and l.id = p_location_id;

  if not found then
    raise exception
      'location is outside trusted scope';
  end if;

  perform 1
  from public.product_variants pv
  where
    pv.organization_id = p_organization_id
    and pv.store_id = p_store_id
    and pv.id = p_variant_id;

  if not found then
    raise exception
      'variant is outside trusted scope';
  end if;

  select pg_catalog.md5(
    pg_catalog.concat_ws(
      E'\n',
      'timezone=' || store_timezone,
      coalesce((
        select pg_catalog.string_agg(line, E'\n' order by line)
        from (
          select pg_catalog.concat_ws(
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

          union all

          select pg_catalog.concat_ws(
            '|',
            'return',
            r.id::text,
            r.variant_id::text,
            coalesce(r.location_id::text, ''),
            coalesce(r.returned_quantity::text, ''),
            r.occurred_at::text
          )
          from public.return_refunds r
          where
            r.organization_id = p_organization_id
            and r.store_id = p_store_id
            and r.location_id = p_location_id
            and r.variant_id = p_variant_id

          union all

          select pg_catalog.concat_ws(
            '|',
            'snapshot',
            n.id::text,
            n.variant_id::text,
            n.location_id::text,
            n.observed_at::text,
            coalesce(n.available_quantity::text, '')
          )
          from public.inventory_snapshots n
          where
            n.organization_id = p_organization_id
            and n.store_id = p_store_id
            and n.location_id = p_location_id
            and n.variant_id = p_variant_id
        ) as evidence
      ), '')
    )
  )
  into source_token;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'organizationId', o.organization_id,
        'storeId', o.store_id,
        'status', o.status,
        'orderedAt', o.ordered_at
      )
      order by o.id
    ),
    '[]'::jsonb
  )
  into orders_json
  from public.orders o
  where
    o.organization_id = p_organization_id
    and o.store_id = p_store_id
    and exists (
      select 1
      from public.order_items i
      where
        i.organization_id = o.organization_id
        and i.store_id = o.store_id
        and i.order_id = o.id
        and i.location_id = p_location_id
        and i.variant_id = p_variant_id
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'organizationId', i.organization_id,
        'storeId', i.store_id,
        'orderId', i.order_id,
        'variantId', i.variant_id,
        'locationId', i.location_id,
        'quantity', i.quantity
      )
      order by i.id
    ),
    '[]'::jsonb
  )
  into order_items_json
  from public.order_items i
  where
    i.organization_id = p_organization_id
    and i.store_id = p_store_id
    and i.location_id = p_location_id
    and i.variant_id = p_variant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'organizationId', r.organization_id,
        'storeId', r.store_id,
        'variantId', r.variant_id,
        'locationId', r.location_id,
        'returnedQuantity', r.returned_quantity,
        'occurredAt', r.occurred_at
      )
      order by r.id
    ),
    '[]'::jsonb
  )
  into returns_json
  from public.return_refunds r
  where
    r.organization_id = p_organization_id
    and r.store_id = p_store_id
    and r.location_id = p_location_id
    and r.variant_id = p_variant_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'organizationId', n.organization_id,
        'storeId', n.store_id,
        'locationId', n.location_id,
        'variantId', n.variant_id,
        'observedAt', n.observed_at,
        'availableQuantity', n.available_quantity
      )
      order by n.id
    ),
    '[]'::jsonb
  )
  into snapshots_json
  from public.inventory_snapshots n
  where
    n.organization_id = p_organization_id
    and n.store_id = p_store_id
    and n.location_id = p_location_id
    and n.variant_id = p_variant_id;

  return jsonb_build_object(
    'timeZone', store_timezone,
    'sourceToken', source_token,
    'orders', orders_json,
    'orderItems', order_items_json,
    'returnRefunds', returns_json,
    'inventorySnapshots', snapshots_json
  );
end;
$$;

create or replace function public.commit_sku_daily_metric(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_source_token text,
  p_metric jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_snapshot jsonb;
  metric_id uuid;
  metric_algorithm_version constant text := 'm5-derived-metrics-v1';
begin
  -- Fixed order. SHARE blocks source INSERT, UPDATE, and DELETE
  -- until this transaction commits.
  lock table public.stores in share mode;
  lock table public.orders in share mode;
  lock table public.order_items in share mode;
  lock table public.return_refunds in share mode;
  lock table public.inventory_snapshots in share mode;

  current_snapshot := public.sku_daily_metric_source_snapshot(
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id
  );

  if current_snapshot->>'sourceToken' is distinct from p_source_token
    or current_snapshot->>'timeZone' is distinct from p_metric->>'timeZone'
  then
    raise exception
      'sku daily metric source token mismatch'
      using errcode = 'SA008';
  end if;

  if p_metric_date is null
    or p_metric->>'eligibleIncomingQuantity' is not null
    or p_metric->>'inventoryPosition' is not null
    or p_metric->>'inventoryAgeDays' is not null
    or p_metric->>'eligibleIncomingReasonCode'
      is distinct from 'incoming_state_unknown'
    or p_metric->>'inventoryAgeQuality' is distinct from 'unavailable'
    or p_metric->>'inventoryAgeReasonCode'
      is distinct from 'inventory_age_unknown'
  then
    raise exception
      'sku daily metric persistence rejected an invalid result'
      using errcode = 'SA009';
  end if;

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
    sales_velocity_7d,
    sales_velocity_14d,
    sales_velocity_30d,
    sales_velocity_90d,
    sales_velocity_7d_reason_code,
    sales_velocity_14d_reason_code,
    sales_velocity_30d_reason_code,
    sales_velocity_90d_reason_code,
    available_quantity,
    eligible_incoming_quantity,
    eligible_incoming_reason_code,
    inventory_position,
    days_of_stock,
    days_of_stock_reason_code,
    sell_through_rate,
    sell_through_reason_code,
    inventory_age_days,
    inventory_age_quality,
    inventory_age_reason_code,
    demand_trend,
    demand_trend_reason_code,
    safety_stock,
    safety_stock_reason_code,
    reorder_point,
    reorder_point_reason_code,
    target_stock,
    target_stock_reason_code
  )
  values (
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_metric_date,
    metric_algorithm_version,
    (p_metric->>'unitsSold')::integer,
    (p_metric->>'returnedUnits')::integer,
    (p_metric->>'netUnitsSold')::integer,
    (p_metric->>'eligibleDays7d')::integer,
    (p_metric->>'eligibleDays14d')::integer,
    (p_metric->>'eligibleDays30d')::integer,
    (p_metric->>'eligibleDays90d')::integer,
    (p_metric->>'eligibleDays7d')::numeric / 7,
    (p_metric->>'eligibleDays14d')::numeric / 14,
    (p_metric->>'eligibleDays30d')::numeric / 30,
    (p_metric->>'eligibleDays90d')::numeric / 90,
    (p_metric->>'salesVelocity7d')::numeric,
    (p_metric->>'salesVelocity14d')::numeric,
    (p_metric->>'salesVelocity30d')::numeric,
    (p_metric->>'salesVelocity90d')::numeric,
    (p_metric->>'salesVelocity7dReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'salesVelocity14dReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'salesVelocity30dReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'salesVelocity90dReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'availableQuantity')::integer,
    null,
    'incoming_state_unknown',
    null,
    (p_metric->>'daysOfStock')::numeric,
    (p_metric->>'daysOfStockReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'sellThroughRate')::numeric,
    (p_metric->>'sellThroughReasonCode')::public.sku_daily_metric_reason_code,
    null,
    'unavailable',
    'inventory_age_unknown',
    p_metric->>'demandTrend',
    (p_metric->>'demandTrendReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'safetyStock')::integer,
    (p_metric->>'safetyStockReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'reorderPoint')::integer,
    (p_metric->>'reorderPointReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'targetStock')::integer,
    (p_metric->>'targetStockReasonCode')::public.sku_daily_metric_reason_code
  )
  on conflict (
    organization_id,
    store_id,
    location_id,
    variant_id,
    metric_date,
    algorithm_version
  )
  do update set
    units_sold = excluded.units_sold,
    returned_units = excluded.returned_units,
    net_units_sold = excluded.net_units_sold,
    eligible_days_7d = excluded.eligible_days_7d,
    eligible_days_14d = excluded.eligible_days_14d,
    eligible_days_30d = excluded.eligible_days_30d,
    eligible_days_90d = excluded.eligible_days_90d,
    coverage_ratio_7d = excluded.coverage_ratio_7d,
    coverage_ratio_14d = excluded.coverage_ratio_14d,
    coverage_ratio_30d = excluded.coverage_ratio_30d,
    coverage_ratio_90d = excluded.coverage_ratio_90d,
    sales_velocity_7d = excluded.sales_velocity_7d,
    sales_velocity_14d = excluded.sales_velocity_14d,
    sales_velocity_30d = excluded.sales_velocity_30d,
    sales_velocity_90d = excluded.sales_velocity_90d,
    sales_velocity_7d_reason_code = excluded.sales_velocity_7d_reason_code,
    sales_velocity_14d_reason_code = excluded.sales_velocity_14d_reason_code,
    sales_velocity_30d_reason_code = excluded.sales_velocity_30d_reason_code,
    sales_velocity_90d_reason_code = excluded.sales_velocity_90d_reason_code,
    available_quantity = excluded.available_quantity,
    eligible_incoming_quantity = excluded.eligible_incoming_quantity,
    eligible_incoming_reason_code = excluded.eligible_incoming_reason_code,
    inventory_position = excluded.inventory_position,
    days_of_stock = excluded.days_of_stock,
    days_of_stock_reason_code = excluded.days_of_stock_reason_code,
    sell_through_rate = excluded.sell_through_rate,
    sell_through_reason_code = excluded.sell_through_reason_code,
    inventory_age_days = excluded.inventory_age_days,
    inventory_age_quality = excluded.inventory_age_quality,
    inventory_age_reason_code = excluded.inventory_age_reason_code,
    demand_trend = excluded.demand_trend,
    demand_trend_reason_code = excluded.demand_trend_reason_code,
    safety_stock = excluded.safety_stock,
    safety_stock_reason_code = excluded.safety_stock_reason_code,
    reorder_point = excluded.reorder_point,
    reorder_point_reason_code = excluded.reorder_point_reason_code,
    target_stock = excluded.target_stock,
    target_stock_reason_code = excluded.target_stock_reason_code
  returning id
  into metric_id;

  return metric_id;
end;
$$;

revoke all
on function public.sku_daily_metric_source_snapshot(uuid, uuid, uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.sku_daily_metric_source_snapshot(uuid, uuid, uuid, uuid)
to service_role;

revoke all
on function public.commit_sku_daily_metric(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.commit_sku_daily_metric(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  text,
  jsonb
)
to service_role;
