-- StoreAgent M5.6B
-- Turn unconsumed source events into bounded recompute requests.
--
-- Consumption locks individual unconsumed rows. It does not advance a
-- sequence cursor. Creating a request does not mean the metric is current.

create table public.sku_daily_metric_recompute_requests (
  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,
  metric_date date not null,
  algorithm_version text not null,

  dirty_generation bigint not null,
  claimed_generation bigint not null,
  applied_generation bigint not null,

  status text not null,
  attempt_count integer not null,

  lease_owner_id text null,
  lease_claim_token text null,
  lease_claimed_at timestamptz null,
  lease_expires_at timestamptz null,

  queued_at timestamptz not null,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null
    default pg_catalog.now(),
  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint sku_daily_metric_recompute_requests_pkey
    primary key (
      organization_id,
      store_id,
      location_id,
      variant_id,
      metric_date,
      algorithm_version
    ),

  constraint sku_daily_metric_recompute_requests_location_fk
    foreign key (
      organization_id,
      store_id,
      location_id
    )
    references public.locations (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint sku_daily_metric_recompute_requests_variant_fk
    foreign key (
      organization_id,
      store_id,
      variant_id
    )
    references public.product_variants (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint sku_daily_metric_recompute_requests_algorithm_version_check
    check (algorithm_version = 'm5-derived-metrics-v1'),

  constraint sku_daily_metric_recompute_requests_generations_check
    check (
      dirty_generation >= 0
      and claimed_generation >= 0
      and applied_generation >= 0
    ),

  constraint sku_daily_metric_recompute_requests_status_check
    check (
      status in (
        'queued',
        'claimed',
        'running',
        'retry_wait',
        'succeeded',
        'failed',
        'cancelled'
      )
    ),

  constraint sku_daily_metric_recompute_requests_attempt_count_check
    check (attempt_count >= 0),

  constraint sku_daily_metric_recompute_requests_lease_check
    check (
      (
        lease_owner_id is null
        and lease_claim_token is null
        and lease_claimed_at is null
        and lease_expires_at is null
      )
      or (
        lease_owner_id is not null
        and lease_claim_token is not null
        and lease_claimed_at is not null
        and lease_expires_at is not null
      )
    )
);

create index sku_daily_metric_recompute_requests_queued_idx
  on public.sku_daily_metric_recompute_requests (
    queued_at,
    organization_id,
    store_id
  )
  where status in ('queued', 'retry_wait');

alter table public.sku_daily_metric_recompute_requests
enable row level security;

revoke all
on table public.sku_daily_metric_recompute_requests
from public, anon, authenticated, service_role;

grant select
on table public.sku_daily_metric_recompute_requests
to service_role;

-- -----------------------------------------------------------------------------
-- One transaction: lock unconsumed events, expand dates, bump generations,
-- then mark those same events consumed.
-- -----------------------------------------------------------------------------

create or replace function public.consume_sku_daily_metric_source_events(
  p_limit integer,
  p_organization_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_ids bigint[];
begin
  if p_limit is null or p_limit < 1 then
    raise exception
      'sku daily metric event consumption limit must be positive';
  end if;

  select pg_catalog.array_agg(picked.event_id)
  into locked_ids
  from (
    select event.event_id
    from public.sku_daily_metric_source_events as event
    where event.consumed_at is null
      and (
        p_organization_id is null
        or event.organization_id = p_organization_id
      )
    order by event.event_id
    for update skip locked
    limit p_limit
  ) as picked;

  if locked_ids is null then
    return 0;
  end if;

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
    affected.organization_id,
    affected.store_id,
    affected.location_id,
    affected.variant_id,
    affected.metric_date,
    affected.algorithm_version,
    count(distinct affected.event_id),
    0,
    0,
    'queued',
    0,
    pg_catalog.now(),
    pg_catalog.now()
  from (
    select
      event.event_id,
      event.organization_id,
      event.store_id,
      event.location_id,
      event.variant_id,
      event.algorithm_version,
      event.source_date as metric_date
    from public.sku_daily_metric_source_events as event
    where event.event_id = any(locked_ids)
    union
    select
      event.event_id,
      event.organization_id,
      event.store_id,
      event.location_id,
      event.variant_id,
      event.algorithm_version,
      (pg_catalog.timezone(store.timezone, pg_catalog.now()))::date
    from public.sku_daily_metric_source_events as event
    join public.stores as store
      on store.organization_id = event.organization_id
      and store.id = event.store_id
    where event.event_id = any(locked_ids)
      and (pg_catalog.timezone(store.timezone, pg_catalog.now()))::date
        >= event.source_date
      and (pg_catalog.timezone(store.timezone, pg_catalog.now()))::date
        <= event.source_date + 89
    union
    select
      event.event_id,
      event.organization_id,
      event.store_id,
      event.location_id,
      event.variant_id,
      event.algorithm_version,
      metric.metric_date
    from public.sku_daily_metric_source_events as event
    join public.sku_daily_metrics as metric
      on metric.organization_id = event.organization_id
      and metric.store_id = event.store_id
      and metric.location_id = event.location_id
      and metric.variant_id = event.variant_id
      and metric.algorithm_version = event.algorithm_version
      and metric.metric_date >= event.source_date
      and metric.metric_date <= event.source_date + 89
    where event.event_id = any(locked_ids)
  ) as affected
  group by
    affected.organization_id,
    affected.store_id,
    affected.location_id,
    affected.variant_id,
    affected.metric_date,
    affected.algorithm_version
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
      sku_daily_metric_recompute_requests.dirty_generation
      + excluded.dirty_generation,
    status = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.status
      else 'queued'
    end,
    attempt_count = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.attempt_count
      else 0
    end,
    lease_owner_id = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.lease_owner_id
      else null
    end,
    lease_claim_token = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.lease_claim_token
      else null
    end,
    lease_claimed_at = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.lease_claimed_at
      else null
    end,
    lease_expires_at = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.lease_expires_at
      else null
    end,
    started_at = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.started_at
      else null
    end,
    finished_at = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.finished_at
      else null
    end,
    queued_at = case
      when sku_daily_metric_recompute_requests.status
        in ('claimed', 'running')
        then sku_daily_metric_recompute_requests.queued_at
      else pg_catalog.now()
    end,
    updated_at = pg_catalog.now();

  update public.sku_daily_metric_source_events
  set consumed_at = pg_catalog.now()
  where event_id = any(locked_ids);

  return pg_catalog.cardinality(locked_ids);
end;
$$;

revoke all
on function public.consume_sku_daily_metric_source_events(integer, uuid)
from public, anon, authenticated;

grant execute
on function public.consume_sku_daily_metric_source_events(integer, uuid)
to service_role;
