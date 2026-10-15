-- StoreAgent M5.5 coverage identity correction.
--
-- Unconstrained numeric division does not satisfy
-- coverage_ratio_Nd * N = eligible_days_Nd.
-- The replacement accepts eligible_days / N within a residue far
-- below one eligible day, and rejects negative ratios and ratios
-- above 1.
--
-- Recognized states for each identity constraint:
--   exact equality from M5.2
--   abs(coverage * N - eligible_days) < 0.000001
--   that tolerance plus coverage between 0 and 1
-- Any other definition raises. A recognized non-canonical definition
-- is replaced. The canonical definition is left in place.

do $coverage$
declare
  window_days integer;
  constraint_name text;
  definition text;
  normalized text;
  equality_form text;
  tolerance_form text;
  bounded_form text;
begin
  foreach window_days in array array[7, 14, 30, 90]
  loop
    constraint_name := pg_catalog.format(
      'sku_daily_metrics_coverage_%sd_identity',
      window_days
    );

    select pg_catalog.pg_get_constraintdef(pg_constraint.oid)
    into definition
    from pg_catalog.pg_constraint
    where pg_constraint.conrelid = 'public.sku_daily_metrics'::regclass
      and pg_constraint.conname = constraint_name;

    if definition is null then
      raise exception
        'coverage constraint % is missing',
        constraint_name;
    end if;

    normalized := pg_catalog.lower(definition);
    normalized := pg_catalog.replace(normalized, '::numeric', '');
    normalized := pg_catalog.regexp_replace(
      normalized,
      '[[:space:]]',
      '',
      'g'
    );
    normalized := pg_catalog.replace(normalized, '(', '');
    normalized := pg_catalog.replace(normalized, ')', '');

    equality_form := pg_catalog.format(
      'checkcoverage_ratio_%sd*%s=eligible_days_%sd',
      window_days,
      window_days,
      window_days
    );
    tolerance_form := pg_catalog.format(
      'checkabscoverage_ratio_%sd*%s-eligible_days_%sd<0.000001',
      window_days,
      window_days,
      window_days
    );
    bounded_form := pg_catalog.format(
      'checkcoverage_ratio_%sd>=0andcoverage_ratio_%sd<=1andabscoverage_ratio_%sd*%s-eligible_days_%sd<0.000001',
      window_days,
      window_days,
      window_days,
      window_days,
      window_days
    );

    if normalized = bounded_form then
      continue;
    end if;

    if normalized <> equality_form
      and normalized <> tolerance_form
    then
      raise exception
        'unexpected coverage constraint %: %',
        constraint_name,
        definition;
    end if;

    execute pg_catalog.format(
      'alter table public.sku_daily_metrics drop constraint %I',
      constraint_name
    );
    execute pg_catalog.format(
      'alter table public.sku_daily_metrics add constraint %I check (
        coverage_ratio_%sd >= 0
        and coverage_ratio_%sd <= 1
        and abs(coverage_ratio_%sd * %s - eligible_days_%sd) < 0.000001
      )',
      constraint_name,
      window_days,
      window_days,
      window_days,
      window_days,
      window_days
    );
  end loop;
end;
$coverage$;

do $commit_guard$
begin
  if pg_catalog.to_regprocedure(
    'public.commit_sku_daily_metric(uuid,uuid,uuid,uuid,date,text,jsonb)'
  ) is null then
    raise exception
      'commit_sku_daily_metric is missing';
  end if;
end;
$commit_guard$;

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
  -- Fail this recompute instead of waiting indefinitely for SHARE.
  perform pg_catalog.set_config('lock_timeout', '2s', true);

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
