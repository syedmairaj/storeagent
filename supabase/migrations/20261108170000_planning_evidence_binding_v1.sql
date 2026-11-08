-- StoreAgent Planning Evidence Binding V1
-- Bind organization_planning_inputs into the trusted M5 threshold path.
--
-- 1) Trusted read RPC for recompute (service_role only).
-- 2) Org-scoped invalidation of store-local current metric grains when
--    planning defaults change, reusing sku_daily_metric_recompute_requests
--    dirty_generation / lease semantics from M5.6B/C.
--
-- Does not change inventory formulas, incoming handling, M7 PB1 attestation,
-- commercial action eligibility, workers, or cron.

-- -----------------------------------------------------------------------------
-- Trusted planning settings read for M5 recompute
-- -----------------------------------------------------------------------------

create or replace function public.sku_daily_metric_organization_planning_settings(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings jsonb;
begin
  if p_organization_id is null then
    raise exception
      'sku daily metric planning settings require organization_id'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'leadTimeDays', planning.lead_time_days,
    'safetyStockDays', planning.safety_stock_days,
    'reviewPeriodDays', planning.review_period_days
  )
  into settings
  from public.organization_planning_inputs as planning
  where planning.organization_id = p_organization_id;

  if settings is null then
    return jsonb_build_object(
      'leadTimeDays', null,
      'safetyStockDays', null,
      'reviewPeriodDays', null
    );
  end if;

  return settings;
end;
$$;

comment on function public.sku_daily_metric_organization_planning_settings(uuid) is
  'Trusted M5 recompute read of organization-default planning days. Missing row returns all-null (unknown). Never invents zeros. Not attested supplier facts.';

revoke all
on function public.sku_daily_metric_organization_planning_settings(uuid)
from public, anon, authenticated;

grant execute
on function public.sku_daily_metric_organization_planning_settings(uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- Dirty current (store-local as-of) metric grains for one organization
-- -----------------------------------------------------------------------------

create or replace function public.enqueue_sku_daily_metric_planning_invalidation(
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_algorithm text := 'm5-derived-metrics-v1';
  v_now timestamptz := pg_catalog.now();
  v_count integer := 0;
begin
  if p_organization_id is null then
    raise exception
      'sku daily metric planning invalidation requires organization_id'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organizations as organization
    where organization.id = p_organization_id
  ) then
    raise exception
      'Organization not found.'
      using errcode = 'P0002';
  end if;

  with current_grains as (
    select distinct
      metric.organization_id,
      metric.store_id,
      metric.location_id,
      metric.variant_id,
      metric.metric_date,
      metric.algorithm_version
    from public.sku_daily_metrics as metric
    join public.stores as store
      on store.organization_id = metric.organization_id
      and store.id = metric.store_id
    where metric.organization_id = p_organization_id
      and metric.algorithm_version = v_algorithm
      and metric.metric_date =
        (pg_catalog.timezone(store.timezone, v_now))::date
  ),
  bumped as (
    insert into public.sku_daily_metric_recompute_requests (
      organization_id,
      store_id,
      location_id,
      variant_id,
      metric_date,
      algorithm_version,
      dirty_generation,
      claimed_generation,
      applied_generation,
      status,
      attempt_count,
      queued_at,
      updated_at
    )
    select
      current_grains.organization_id,
      current_grains.store_id,
      current_grains.location_id,
      current_grains.variant_id,
      current_grains.metric_date,
      current_grains.algorithm_version,
      1,
      0,
      0,
      'queued',
      0,
      v_now,
      v_now
    from current_grains
    on conflict (
      organization_id,
      store_id,
      location_id,
      variant_id,
      metric_date,
      algorithm_version
    )
    do update set
      dirty_generation =
        public.sku_daily_metric_recompute_requests.dirty_generation
        + excluded.dirty_generation,
      status = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.status
        else 'queued'
      end,
      attempt_count = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.attempt_count
        else 0
      end,
      lease_owner_id = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.lease_owner_id
        else null
      end,
      lease_claim_token = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.lease_claim_token
        else null
      end,
      lease_claimed_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.lease_claimed_at
        else null
      end,
      lease_expires_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.lease_expires_at
        else null
      end,
      started_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.started_at
        else null
      end,
      finished_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.finished_at
        else null
      end,
      queued_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.queued_at
        else v_now
      end,
      updated_at = v_now
    returning 1
  )
  select count(*)::integer
  into v_count
  from bumped;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.enqueue_sku_daily_metric_planning_invalidation(uuid) is
  'Dirties store-local current sku_daily_metrics grains for one organization after planning-default changes. Preserves M5.6C lease/dirty_generation semantics. Does not unlock commercial actions.';

revoke all
on function public.enqueue_sku_daily_metric_planning_invalidation(uuid)
from public, anon, authenticated;

grant execute
on function public.enqueue_sku_daily_metric_planning_invalidation(uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- Wire invalidation into the authenticated owner/admin planning upsert
-- -----------------------------------------------------------------------------

create or replace function public.upsert_current_user_organization_planning_inputs(
  p_organization_id uuid,
  p_lead_time_days integer,
  p_safety_stock_days integer,
  p_review_period_days integer
)
returns table (
  organization_id uuid,
  lead_time_days integer,
  safety_stock_days integer,
  review_period_days integer,
  updated_at timestamptz,
  updated_by_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid;
  member_role text;
  org_exists boolean;
  written_organization_id uuid;
  written_lead_time_days integer;
  written_safety_stock_days integer;
  written_review_period_days integer;
  written_updated_at timestamptz;
  written_updated_by_user_id uuid;
begin
  authenticated_user_id := auth.uid();

  if authenticated_user_id is null then
    raise exception
      'Authentication required.'
      using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception
      'Organization is required.'
      using errcode = '22023';
  end if;

  if p_lead_time_days is not null and p_lead_time_days < 0 then
    raise exception
      'Lead time days must be a non-negative integer or null.'
      using errcode = '22023';
  end if;

  if p_safety_stock_days is not null and p_safety_stock_days < 0 then
    raise exception
      'Safety stock days must be a non-negative integer or null.'
      using errcode = '22023';
  end if;

  if p_review_period_days is not null and p_review_period_days < 0 then
    raise exception
      'Review period days must be a non-negative integer or null.'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.organizations as organization
    where organization.id = p_organization_id
  )
  into org_exists;

  if not org_exists then
    raise exception
      'Organization not found.'
      using errcode = 'P0002';
  end if;

  select membership.role
  into member_role
  from public.organization_members as membership
  where membership.organization_id = p_organization_id
    and membership.user_id = authenticated_user_id;

  if member_role is null then
    raise exception
      'Organization membership required.'
      using errcode = '42501';
  end if;

  if member_role not in ('owner', 'admin') then
    raise exception
      'Planning inputs require owner or admin.'
      using errcode = '42501';
  end if;

  insert into public.organization_planning_inputs as planning (
    organization_id,
    lead_time_days,
    safety_stock_days,
    review_period_days,
    updated_at,
    updated_by_user_id
  )
  values (
    p_organization_id,
    p_lead_time_days,
    p_safety_stock_days,
    p_review_period_days,
    pg_catalog.now(),
    authenticated_user_id
  )
  on conflict on constraint organization_planning_inputs_pkey do update
  set
    lead_time_days = excluded.lead_time_days,
    safety_stock_days = excluded.safety_stock_days,
    review_period_days = excluded.review_period_days,
    updated_at = pg_catalog.now(),
    updated_by_user_id = authenticated_user_id
  where exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = planning.organization_id
      and membership.user_id = authenticated_user_id
      and membership.role in ('owner', 'admin')
  )
  returning
    planning.organization_id,
    planning.lead_time_days,
    planning.safety_stock_days,
    planning.review_period_days,
    planning.updated_at,
    planning.updated_by_user_id
  into
    written_organization_id,
    written_lead_time_days,
    written_safety_stock_days,
    written_review_period_days,
    written_updated_at,
    written_updated_by_user_id;

  if written_organization_id is null then
    raise exception
      'Planning inputs require owner or admin.'
      using errcode = '42501';
  end if;

  -- Same-txn dirty of store-local current metrics for this org only.
  perform public.enqueue_sku_daily_metric_planning_invalidation(
    written_organization_id
  );

  return query
  select
    written_organization_id,
    written_lead_time_days,
    written_safety_stock_days,
    written_review_period_days,
    written_updated_at,
    written_updated_by_user_id;
end;
$$;

comment on function public.upsert_current_user_organization_planning_inputs(
  uuid,
  integer,
  integer,
  integer
) is
  'Owner/admin upsert of organization planning defaults. null=unknown; 0=known zero. Dirties current M5 metrics for the same organization. Does not unlock commercial actions or invent incoming.';
