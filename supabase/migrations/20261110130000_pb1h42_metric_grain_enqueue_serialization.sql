-- StoreAgent M7-PB1.h.4.2
-- Metric-grain transaction serialization for recompute-request enqueue writers.
--
-- Closes the first dirty-request INSERT race (PB1.h.3 C1) and serializes
-- planning / incoming / rollover / source-event consume writers against a
-- future create TX that holds the identical grain advisory (fencing
-- contract §1.2 step 1 / §3.4).
--
-- Deadlock-safe protocol (mandatory preflight result):
--
--   PostgreSQL locks the target row BEFORE firing BEFORE ROW triggers on
--   UPDATE/DELETE. A blocking advisory inside a BEFORE ROW trigger after
--   that row lock therefore acquires (row → advisory). A cooperating
--   selection/create acquires (advisory → request FOR UPDATE). That
--   inversion deadlocks — same class as PB1.h.4.1 supplier serialization.
--
--   Chosen design:
--     1. Blocking helper for future create/test reader + writer prelock
--        BEFORE request INSERT/UPSERT (including absent-row first insert).
--     2. BEFORE INSERT trigger uses pg_try_advisory_xact_lock:
--          - already held by this TX → proceed (writer prelocked)
--          - free → acquire (direct INSERT still joins the protocol)
--          - held by another TX → raise lock_not_available (55P03)
--        INSERT-only: claim/complete/fail UPDATE paths are untouched so
--        M5 worker lease semantics stay compatible. INSERT ... ON CONFLICT
--        DO UPDATE still fires BEFORE INSERT before the conflict update.
--     3. Enumerated enqueue RPCs acquire grain locks in deterministic
--        grain-key order before UPSERT. Multi-grain opposite-order writers
--        that skip sorted prelock fail closed via trigger 55P03 (or 40P01
--        if mixed with other lock orders) — no torn dirty bumps from a
--        single statement.
--
-- Namespace: 71010402 (must not reuse supplier 71010401 or M5 5606003/5606004).
-- Canonical grain_key:
--   organization_id || ':' || store_id || ':' || location_id || ':' ||
--   variant_id || ':' || metric_date::text || ':' || algorithm_version
--
-- Direct-DML bypass:
--   Table remains revoke-all + service_role SELECT only (no INSERT/UPDATE/
--   DELETE grant). SECURITY DEFINER enqueue RPCs write as owner and must
--   prelock. BEFORE INSERT try-trigger covers residual owner/superuser
--   INSERT. Privileged UPDATE of dirty_generation without INSERT remains a
--   residual hole (documented; not used by M5 workers).
--
-- Preserves:
--   dirty/claimed/applied generations, lease fields, statuses, algorithm
--   check, tenant scope, SA008/source-event semantics, enrollment gating.
--
-- Does NOT:
--   - wire production M7 create/approve (test-only blocking helper only)
--   - add create-TX scaffold (reserved h.4.3)
--   - change metric formulas / source tokens
--   - unlock source-of-create or merchant approval
--   - activate workers / cron / HTTP

-- -----------------------------------------------------------------------------
-- Lock namespace + helpers
-- -----------------------------------------------------------------------------

create or replace function public.sku_daily_metric_grain_key(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_algorithm_version text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    p_organization_id::text
    || ':' || p_store_id::text
    || ':' || p_location_id::text
    || ':' || p_variant_id::text
    || ':' || p_metric_date::text
    || ':' || p_algorithm_version;
$$;

comment on function public.sku_daily_metric_grain_key(uuid, uuid, uuid, uuid, date, text) is
  'PB1.h.4.2: canonical metric grain key for advisory fencing (namespace 71010402).';

create or replace function public.sku_daily_metric_grain_xact_lock_key(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_algorithm_version text
)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.hashtext(
    public.sku_daily_metric_grain_key(
      p_organization_id,
      p_store_id,
      p_location_id,
      p_variant_id,
      p_metric_date,
      p_algorithm_version
    )
  );
$$;

comment on function public.sku_daily_metric_grain_xact_lock_key(uuid, uuid, uuid, uuid, date, text) is
  'PB1.h.4.2: int4 advisory key for metric-grain fencing (namespace 71010402).';

create or replace function public.acquire_sku_daily_metric_grain_xact_lock(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_algorithm_version text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
    or p_metric_date is null
    or p_algorithm_version is null
  then
    raise exception
      'sku daily metric grain lock requires organization, store, location, variant, metric_date, algorithm_version';
  end if;

  -- Blocking acquire for future create/test reader and writer prelock
  -- (before request INSERT/UPSERT). Not wired to production M7 create/approve.
  perform pg_catalog.pg_advisory_xact_lock(
    71010402,
    public.sku_daily_metric_grain_xact_lock_key(
      p_organization_id,
      p_store_id,
      p_location_id,
      p_variant_id,
      p_metric_date,
      p_algorithm_version
    )
  );
end;
$$;

comment on function public.acquire_sku_daily_metric_grain_xact_lock(uuid, uuid, uuid, uuid, date, text) is
  'PB1.h.4.2: blocking metric-grain transaction advisory (71010402). Test-only reader protocol for future M7 create fencing and enqueue writer prelock — not wired to production create/approve.';

create or replace function public.try_acquire_sku_daily_metric_grain_xact_lock(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_algorithm_version text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
    or p_metric_date is null
    or p_algorithm_version is null
  then
    raise exception
      'sku daily metric grain lock requires organization, store, location, variant, metric_date, algorithm_version';
  end if;

  return pg_catalog.pg_try_advisory_xact_lock(
    71010402,
    public.sku_daily_metric_grain_xact_lock_key(
      p_organization_id,
      p_store_id,
      p_location_id,
      p_variant_id,
      p_metric_date,
      p_algorithm_version
    )
  );
end;
$$;

comment on function public.try_acquire_sku_daily_metric_grain_xact_lock(uuid, uuid, uuid, uuid, date, text) is
  'PB1.h.4.2: non-blocking grain advisory try. Used by BEFORE INSERT trigger to avoid row→advisory deadlock.';

-- -----------------------------------------------------------------------------
-- BEFORE INSERT enforcement (direct INSERT + DEFINER enqueue paths)
-- -----------------------------------------------------------------------------

create or replace function public.sku_daily_metric_recompute_requests_enforce_grain_xact_lock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.try_acquire_sku_daily_metric_grain_xact_lock(
    new.organization_id,
    new.store_id,
    new.location_id,
    new.variant_id,
    new.metric_date,
    new.algorithm_version
  ) then
    raise exception
      using
        errcode = '55P03',
        message = format(
          'sku_daily_metric_recompute_requests grain lock not available for organization_id=%s store_id=%s location_id=%s variant_id=%s metric_date=%s algorithm_version=%s',
          new.organization_id,
          new.store_id,
          new.location_id,
          new.variant_id,
          new.metric_date,
          new.algorithm_version
        ),
        hint = 'Call acquire_sku_daily_metric_grain_xact_lock before request INSERT/UPSERT, or retry after the cooperating grain transaction ends.';
  end if;

  return new;
end;
$$;

comment on function public.sku_daily_metric_recompute_requests_enforce_grain_xact_lock() is
  'PB1.h.4.2: BEFORE INSERT try-acquire of 71010402 so direct request INSERT cannot silently bypass grain serialization.';

drop trigger if exists sku_daily_metric_recompute_requests_serialize_grain_xact_lock
on public.sku_daily_metric_recompute_requests;

create trigger sku_daily_metric_recompute_requests_serialize_grain_xact_lock
before insert on public.sku_daily_metric_recompute_requests
for each row
execute function public.sku_daily_metric_recompute_requests_enforce_grain_xact_lock();

-- -----------------------------------------------------------------------------
-- Privileges: helpers service_role (+ owner); no browser execute.
-- Reaffirm request-table DML restriction (SELECT only for service_role).
-- -----------------------------------------------------------------------------

revoke all
on function public.sku_daily_metric_grain_key(uuid, uuid, uuid, uuid, date, text)
from public, anon, authenticated;

revoke all
on function public.sku_daily_metric_grain_xact_lock_key(uuid, uuid, uuid, uuid, date, text)
from public, anon, authenticated;

revoke all
on function public.acquire_sku_daily_metric_grain_xact_lock(uuid, uuid, uuid, uuid, date, text)
from public, anon, authenticated;

revoke all
on function public.try_acquire_sku_daily_metric_grain_xact_lock(uuid, uuid, uuid, uuid, date, text)
from public, anon, authenticated;

revoke all
on function public.sku_daily_metric_recompute_requests_enforce_grain_xact_lock()
from public, anon, authenticated;

grant execute
on function public.sku_daily_metric_grain_key(uuid, uuid, uuid, uuid, date, text)
to service_role;

grant execute
on function public.sku_daily_metric_grain_xact_lock_key(uuid, uuid, uuid, uuid, date, text)
to service_role;

grant execute
on function public.acquire_sku_daily_metric_grain_xact_lock(uuid, uuid, uuid, uuid, date, text)
to service_role;

grant execute
on function public.try_acquire_sku_daily_metric_grain_xact_lock(uuid, uuid, uuid, uuid, date, text)
to service_role;

grant execute
on function public.sku_daily_metric_recompute_requests_enforce_grain_xact_lock()
to service_role;

revoke all
on table public.sku_daily_metric_recompute_requests
from public, anon, authenticated, service_role;

grant select
on table public.sku_daily_metric_recompute_requests
to service_role;

-- -----------------------------------------------------------------------------
-- consume_sku_daily_metric_source_events: sorted grain prelock before UPSERT
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
  grain record;
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

  -- PB1.h.4.2: lock every expanded grain in canonical key order before UPSERT.
  -- Source-event row locks are already held (SKIP LOCKED). Create takes grain
  -- advisory before source SHARE and does not FOR UPDATE source_events, so
  -- event→grain order here does not invert create's grain→SHARE protocol.
  for grain in
    select distinct
      affected.organization_id,
      affected.store_id,
      affected.location_id,
      affected.variant_id,
      affected.metric_date,
      affected.algorithm_version
    from (
      select
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
    order by
      affected.organization_id,
      affected.store_id,
      affected.location_id,
      affected.variant_id,
      affected.metric_date,
      affected.algorithm_version
  loop
    perform public.acquire_sku_daily_metric_grain_xact_lock(
      grain.organization_id,
      grain.store_id,
      grain.location_id,
      grain.variant_id,
      grain.metric_date,
      grain.algorithm_version
    );
  end loop;

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

-- -----------------------------------------------------------------------------
-- enqueue_sku_daily_metric_planning_invalidation: sorted grain prelock
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
  grain record;
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

  for grain in
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
    order by
      metric.organization_id,
      metric.store_id,
      metric.location_id,
      metric.variant_id,
      metric.metric_date,
      metric.algorithm_version
  loop
    perform public.acquire_sku_daily_metric_grain_xact_lock(
      grain.organization_id,
      grain.store_id,
      grain.location_id,
      grain.variant_id,
      grain.metric_date,
      grain.algorithm_version
    );
  end loop;

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
  'Dirties store-local current sku_daily_metrics grains for one organization after planning-default changes. Preserves M5.6C lease/dirty_generation semantics. PB1.h.4.2 acquires grain advisory 71010402 in deterministic order before UPSERT. Does not unlock commercial actions.';

revoke all
on function public.enqueue_sku_daily_metric_planning_invalidation(uuid)
from public, anon, authenticated;

grant execute
on function public.enqueue_sku_daily_metric_planning_invalidation(uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- enqueue_sku_daily_metric_store_incoming_invalidation: sorted grain prelock
-- -----------------------------------------------------------------------------

create or replace function public.enqueue_sku_daily_metric_store_incoming_invalidation(
  p_organization_id uuid,
  p_store_id uuid
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
  grain record;
begin
  if p_organization_id is null or p_store_id is null then
    raise exception
      'sku daily metric store incoming invalidation requires organization and store'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.stores as store
    where store.organization_id = p_organization_id
      and store.id = p_store_id
  ) then
    raise exception
      'Store not found.'
      using errcode = 'P0002';
  end if;

  for grain in
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
      and metric.store_id = p_store_id
      and metric.algorithm_version = v_algorithm
      and metric.metric_date =
        (pg_catalog.timezone(store.timezone, v_now))::date
    order by
      metric.organization_id,
      metric.store_id,
      metric.location_id,
      metric.variant_id,
      metric.metric_date,
      metric.algorithm_version
  loop
    perform public.acquire_sku_daily_metric_grain_xact_lock(
      grain.organization_id,
      grain.store_id,
      grain.location_id,
      grain.variant_id,
      grain.metric_date,
      grain.algorithm_version
    );
  end loop;

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
      and metric.store_id = p_store_id
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

comment on function public.enqueue_sku_daily_metric_store_incoming_invalidation(uuid, uuid) is
  'Dirties store-local current sku_daily_metrics grains after incoming-evidence attestation changes. Preserves M5.6C lease/dirty_generation semantics. PB1.h.4.2 acquires grain advisory 71010402 in deterministic order before UPSERT.';

revoke all
on function public.enqueue_sku_daily_metric_store_incoming_invalidation(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.enqueue_sku_daily_metric_store_incoming_invalidation(uuid, uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- enqueue_sku_daily_metric_daily_rollover: sorted grain prelock before UPSERT
-- -----------------------------------------------------------------------------

create or replace function public.enqueue_sku_daily_metric_daily_rollover(
  p_limit integer,
  p_max_stores integer default 4,
  p_organization_id uuid default null,
  p_as_of timestamptz default pg_catalog.clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_algorithm text := 'm5-derived-metrics-v1';
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_as_of timestamptz := coalesce(p_as_of, v_now);
  v_grain_budget integer;
  v_store_count integer;
  v_store_index integer := 0;
  v_runs_opened integer := 0;
  v_runs_resumed integer := 0;
  v_runs_completed integer := 0;
  v_runs_failed integer := 0;
  v_grains_enrolled integer := 0;
  v_per_store integer;
  v_store record;
  v_run public.sku_daily_metric_rollover_runs%rowtype;
  v_metric_date date;
  v_batch_limit integer;
  v_seen integer;
  v_process integer;
  v_enrolled_now integer;
  v_last_location uuid;
  v_last_variant uuid;
  v_remaining_stores integer;
  v_enrolled_locations uuid[];
  v_enrolled_variants uuid[];
  v_lock_i integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception
      using
        errcode = '22023',
        message = 'sku daily metric rollover limit must be between 1 and 5000';
  end if;

  if p_max_stores is null or p_max_stores < 1 or p_max_stores > 16 then
    raise exception
      using
        errcode = '22023',
        message = 'sku daily metric rollover max stores must be between 1 and 16';
  end if;

  -- Distinct from M5.6C claim lock 5606003 and live-test lock 561606.
  perform pg_catalog.pg_advisory_xact_lock(5606004);

  v_grain_budget := p_limit;

  select pg_catalog.count(*)::integer
  into v_store_count
  from (
    with store_base as (
      select
        store.organization_id,
        store.id as store_id,
        store.timezone,
        (
          select run.metric_date
          from public.sku_daily_metric_rollover_runs as run
          where run.organization_id = store.organization_id
            and run.store_id = store.id
            and run.algorithm_version = v_algorithm
            and run.status = 'in_progress'
          order by run.metric_date, run.started_at
          limit 1
        ) as in_progress_metric_date,
        (
          select run.last_progress_at
          from public.sku_daily_metric_rollover_runs as run
          where run.organization_id = store.organization_id
            and run.store_id = store.id
            and run.algorithm_version = v_algorithm
            and run.status = 'in_progress'
          order by run.metric_date, run.started_at
          limit 1
        ) as in_progress_last_progress_at
      from public.stores as store
      where (
        p_organization_id is null
        or store.organization_id = p_organization_id
      )
    ),
    annotated as (
      select
        store_base.*,
        exists (
          select 1
          from pg_catalog.pg_timezone_names as tz
          where tz.name = store_base.timezone
        ) as timezone_recognized,
        case
          when store_base.in_progress_metric_date is not null
            then store_base.in_progress_metric_date
          when exists (
            select 1
            from pg_catalog.pg_timezone_names as tz
            where tz.name = store_base.timezone
          )
            then (pg_catalog.timezone(store_base.timezone, v_as_of))::date
          else (v_as_of at time zone 'UTC')::date
        end as target_metric_date
      from store_base
    ),
    actionable as (
      select annotated.*
      from annotated
      where annotated.in_progress_metric_date is not null
         or not annotated.timezone_recognized
         or not exists (
           select 1
           from public.sku_daily_metric_rollover_runs as run
           where run.organization_id = annotated.organization_id
             and run.store_id = annotated.store_id
             and run.metric_date = annotated.target_metric_date
             and run.algorithm_version = v_algorithm
             and (
               run.status in ('completed', 'in_progress')
               or (
                 run.status = 'failed'
                 and run.fail_reason
                   is distinct from 'invalid_iana_timezone'
               )
             )
         )
      order by
        case
          when annotated.in_progress_metric_date is not null then 0
          when not annotated.timezone_recognized then 1
          else 2
        end,
        coalesce(
          annotated.in_progress_last_progress_at,
          '-infinity'::timestamptz
        ),
        annotated.organization_id,
        annotated.store_id
      limit p_max_stores
    )
    select 1 from actionable
  ) as selected;

  if v_store_count = 0 then
    return pg_catalog.jsonb_build_object(
      'storesSelected', 0,
      'runsOpened', 0,
      'runsResumed', 0,
      'runsCompleted', 0,
      'runsFailed', 0,
      'grainsEnrolled', 0
    );
  end if;

  for v_store in
    with store_base as (
      select
        store.organization_id,
        store.id as store_id,
        store.timezone,
        (
          select run.metric_date
          from public.sku_daily_metric_rollover_runs as run
          where run.organization_id = store.organization_id
            and run.store_id = store.id
            and run.algorithm_version = v_algorithm
            and run.status = 'in_progress'
          order by run.metric_date, run.started_at
          limit 1
        ) as in_progress_metric_date,
        (
          select run.last_progress_at
          from public.sku_daily_metric_rollover_runs as run
          where run.organization_id = store.organization_id
            and run.store_id = store.id
            and run.algorithm_version = v_algorithm
            and run.status = 'in_progress'
          order by run.metric_date, run.started_at
          limit 1
        ) as in_progress_last_progress_at
      from public.stores as store
      where (
        p_organization_id is null
        or store.organization_id = p_organization_id
      )
    ),
    annotated as (
      select
        store_base.*,
        exists (
          select 1
          from pg_catalog.pg_timezone_names as tz
          where tz.name = store_base.timezone
        ) as timezone_recognized,
        case
          when store_base.in_progress_metric_date is not null
            then store_base.in_progress_metric_date
          when exists (
            select 1
            from pg_catalog.pg_timezone_names as tz
            where tz.name = store_base.timezone
          )
            then (pg_catalog.timezone(store_base.timezone, v_as_of))::date
          else (v_as_of at time zone 'UTC')::date
        end as target_metric_date
      from store_base
    )
    select
      annotated.organization_id,
      annotated.store_id,
      annotated.timezone,
      annotated.timezone_recognized,
      annotated.target_metric_date,
      annotated.in_progress_metric_date
    from annotated
    where annotated.in_progress_metric_date is not null
       or not annotated.timezone_recognized
       or not exists (
         select 1
         from public.sku_daily_metric_rollover_runs as run
         where run.organization_id = annotated.organization_id
           and run.store_id = annotated.store_id
           and run.metric_date = annotated.target_metric_date
           and run.algorithm_version = v_algorithm
           and (
             run.status in ('completed', 'in_progress')
             or (
               run.status = 'failed'
               and run.fail_reason
                 is distinct from 'invalid_iana_timezone'
             )
           )
       )
    order by
      -- Drain in-progress runs before opening new store-days, then rotate
      -- fairly by least-recent progress among peers in the same class.
      case
        when annotated.in_progress_metric_date is not null then 0
        when not annotated.timezone_recognized then 1
        else 2
      end,
      coalesce(
        annotated.in_progress_last_progress_at,
        '-infinity'::timestamptz
      ),
      annotated.organization_id,
      annotated.store_id
    limit p_max_stores
  loop
    v_store_index := v_store_index + 1;
    v_remaining_stores := v_store_count - v_store_index + 1;
    v_per_store := greatest(
      0,
      v_grain_budget / greatest(v_remaining_stores, 1)
    );

    if not v_store.timezone_recognized then
      insert into public.sku_daily_metric_rollover_runs (
        organization_id,
        store_id,
        metric_date,
        algorithm_version,
        status,
        eligible_cutoff_at,
        enqueued_count,
        fail_reason,
        started_at,
        last_progress_at,
        created_at,
        updated_at
      ) values (
        v_store.organization_id,
        v_store.store_id,
        v_store.target_metric_date,
        v_algorithm,
        'failed',
        v_as_of,
        0,
        'invalid_iana_timezone',
        v_now,
        v_now,
        v_now,
        v_now
      )
      on conflict do nothing;

      if found then
        v_runs_failed := v_runs_failed + 1;
      end if;

      continue;
    end if;

    v_metric_date := coalesce(
      v_store.in_progress_metric_date,
      v_store.target_metric_date
    );

    select *
    into v_run
    from public.sku_daily_metric_rollover_runs as run
    where run.organization_id = v_store.organization_id
      and run.store_id = v_store.store_id
      and run.metric_date = v_metric_date
      and run.algorithm_version = v_algorithm
    for update;

    if not found then
      insert into public.sku_daily_metric_rollover_runs (
        organization_id,
        store_id,
        metric_date,
        algorithm_version,
        status,
        eligible_cutoff_at,
        enqueued_count,
        started_at,
        last_progress_at,
        created_at,
        updated_at
      ) values (
        v_store.organization_id,
        v_store.store_id,
        v_metric_date,
        v_algorithm,
        'in_progress',
        v_as_of,
        0,
        v_now,
        v_now,
        v_now,
        v_now
      )
      returning * into v_run;

      v_runs_opened := v_runs_opened + 1;
    elsif v_run.status = 'completed' then
      continue;
    elsif v_run.status = 'failed' then
      -- Recover only invalid_iana_timezone failures once the zone is valid.
      -- Unrelated failures stay terminal. Enrollment rows (if any) remain;
      -- dirty bumps stay gated by enrollment uniqueness.
      if v_run.fail_reason is distinct from 'invalid_iana_timezone' then
        continue;
      end if;

      update public.sku_daily_metric_rollover_runs as run
      set
        status = 'in_progress',
        fail_reason = null,
        eligible_cutoff_at = v_as_of,
        cursor_location_id = null,
        cursor_variant_id = null,
        enqueued_count = 0,
        started_at = v_now,
        last_progress_at = v_now,
        completed_at = null,
        updated_at = v_now
      where run.organization_id = v_run.organization_id
        and run.store_id = v_run.store_id
        and run.metric_date = v_run.metric_date
        and run.algorithm_version = v_run.algorithm_version
        and run.status = 'failed'
        and run.fail_reason = 'invalid_iana_timezone'
      returning * into v_run;

      if not found then
        continue;
      end if;

      v_runs_opened := v_runs_opened + 1;
    else
      v_runs_resumed := v_runs_resumed + 1;
    end if;

    if v_per_store <= 0 then
      update public.sku_daily_metric_rollover_runs as run
      set
        last_progress_at = v_now,
        updated_at = v_now
      where run.organization_id = v_run.organization_id
        and run.store_id = v_run.store_id
        and run.metric_date = v_run.metric_date
        and run.algorithm_version = v_run.algorithm_version;

      continue;
    end if;

    v_batch_limit := v_per_store;

    with ranked as (
      select
        grain.location_id,
        grain.variant_id,
        pg_catalog.row_number() over (
          order by grain.location_id, grain.variant_id
        ) as ordinal
      from (
        select distinct
          evidence.location_id,
          evidence.variant_id
        from (
          select
            item.location_id,
            item.variant_id
          from public.order_items as item
          join public.orders as ord
            on ord.organization_id = item.organization_id
            and ord.store_id = item.store_id
            and ord.id = item.order_id
          where item.organization_id = v_run.organization_id
            and item.store_id = v_run.store_id
            and item.location_id is not null
            and ord.ordered_at <= v_run.eligible_cutoff_at
            and ord.ordered_at
              >= ((v_run.metric_date - 90)::timestamp
                at time zone v_store.timezone)
            and (pg_catalog.timezone(v_store.timezone, ord.ordered_at))::date
              >= v_run.metric_date - 89
            and (pg_catalog.timezone(v_store.timezone, ord.ordered_at))::date
              <= v_run.metric_date

          union

          select
            refund.location_id,
            refund.variant_id
          from public.return_refunds as refund
          where refund.organization_id = v_run.organization_id
            and refund.store_id = v_run.store_id
            and refund.location_id is not null
            and refund.occurred_at <= v_run.eligible_cutoff_at
            and refund.occurred_at
              >= ((v_run.metric_date - 90)::timestamp
                at time zone v_store.timezone)
            and (pg_catalog.timezone(v_store.timezone, refund.occurred_at))::date
              >= v_run.metric_date - 89
            and (pg_catalog.timezone(v_store.timezone, refund.occurred_at))::date
              <= v_run.metric_date

          union

          select
            snapshot.location_id,
            snapshot.variant_id
          from public.inventory_snapshots as snapshot
          where snapshot.organization_id = v_run.organization_id
            and snapshot.store_id = v_run.store_id
            and snapshot.location_id is not null
            and snapshot.observed_at <= v_run.eligible_cutoff_at
            and snapshot.observed_at
              >= ((v_run.metric_date - 90)::timestamp
                at time zone v_store.timezone)
            and (pg_catalog.timezone(v_store.timezone, snapshot.observed_at))::date
              >= v_run.metric_date - 89
            and (pg_catalog.timezone(v_store.timezone, snapshot.observed_at))::date
              <= v_run.metric_date
        ) as evidence
        where (
          v_run.cursor_location_id is null
          or (evidence.location_id, evidence.variant_id)
            > (v_run.cursor_location_id, v_run.cursor_variant_id)
        )
      ) as grain
    ),
    limited as (
      select *
      from ranked
      where ranked.ordinal <= v_batch_limit + 1
    ),
    counted as (
      select pg_catalog.count(*)::integer as seen
      from limited
    ),
    to_process as (
      select
        limited.location_id,
        limited.variant_id,
        limited.ordinal
      from limited
      cross join counted
      where limited.ordinal <= least(v_batch_limit, counted.seen)
    ),
    enrolled as (
      insert into public.sku_daily_metric_rollover_enqueues (
        organization_id,
        store_id,
        location_id,
        variant_id,
        metric_date,
        algorithm_version,
        enrolled_at
      )
      select
        v_run.organization_id,
        v_run.store_id,
        to_process.location_id,
        to_process.variant_id,
        v_run.metric_date,
        v_algorithm,
        v_now
      from to_process
      on conflict do nothing
      returning
        location_id,
        variant_id
    )
    select
      (select seen from counted),
      (select pg_catalog.count(*)::integer from enrolled),
      (
        select to_process.location_id
        from to_process
        order by to_process.ordinal desc
        limit 1
      ),
      (
        select to_process.variant_id
        from to_process
        order by to_process.ordinal desc
        limit 1
      ),
      coalesce(
        (
          select pg_catalog.array_agg(enrolled.location_id
            order by enrolled.location_id, enrolled.variant_id)
          from enrolled
        ),
        array[]::uuid[]
      ),
      coalesce(
        (
          select pg_catalog.array_agg(enrolled.variant_id
            order by enrolled.location_id, enrolled.variant_id)
          from enrolled
        ),
        array[]::uuid[]
      )
    into
      v_seen,
      v_enrolled_now,
      v_last_location,
      v_last_variant,
      v_enrolled_locations,
      v_enrolled_variants;

    -- PB1.h.4.2: acquire grain advisories in deterministic order before request UPSERT.
    if v_enrolled_locations is not null then
      for v_lock_i in 1 .. pg_catalog.cardinality(v_enrolled_locations)
      loop
        perform public.acquire_sku_daily_metric_grain_xact_lock(
          v_run.organization_id,
          v_run.store_id,
          v_enrolled_locations[v_lock_i],
          v_enrolled_variants[v_lock_i],
          v_run.metric_date,
          v_algorithm
        );
      end loop;
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
      available_at,
      queued_at,
      updated_at
    )
    select
      v_run.organization_id,
      v_run.store_id,
      loc,
      var,
      v_run.metric_date,
      v_algorithm,
      1,
      0,
      0,
      'queued',
      0,
      null,
      v_now,
      v_now
    from pg_catalog.generate_subscripts(v_enrolled_locations, 1) as g(i)
    cross join lateral (
      select
        v_enrolled_locations[g.i] as loc,
        v_enrolled_variants[g.i] as var
    ) as u
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
      available_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.available_at
        else null
      end,
      queued_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.queued_at
        else v_now
      end,
      updated_at = v_now;

    v_process := least(v_batch_limit, coalesce(v_seen, 0));
    v_enrolled_now := coalesce(v_enrolled_now, 0);

    if v_process > 0 then
      v_grains_enrolled := v_grains_enrolled + v_enrolled_now;
      v_grain_budget := v_grain_budget - v_process;

      update public.sku_daily_metric_rollover_runs as run
      set
        cursor_location_id = v_last_location,
        cursor_variant_id = v_last_variant,
        enqueued_count = run.enqueued_count + v_enrolled_now,
        last_progress_at = v_now,
        updated_at = v_now,
        status = case
          when v_seen <= v_batch_limit then 'completed'
          else 'in_progress'
        end,
        completed_at = case
          when v_seen <= v_batch_limit then v_now
          else null
        end
      where run.organization_id = v_run.organization_id
        and run.store_id = v_run.store_id
        and run.metric_date = v_run.metric_date
        and run.algorithm_version = v_run.algorithm_version;

      if v_seen <= v_batch_limit then
        v_runs_completed := v_runs_completed + 1;
      end if;
    else
      update public.sku_daily_metric_rollover_runs as run
      set
        status = 'completed',
        completed_at = v_now,
        last_progress_at = v_now,
        updated_at = v_now
      where run.organization_id = v_run.organization_id
        and run.store_id = v_run.store_id
        and run.metric_date = v_run.metric_date
        and run.algorithm_version = v_run.algorithm_version
        and run.status = 'in_progress';

      if found then
        v_runs_completed := v_runs_completed + 1;
      end if;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'storesSelected', v_store_index,
    'runsOpened', v_runs_opened,
    'runsResumed', v_runs_resumed,
    'runsCompleted', v_runs_completed,
    'runsFailed', v_runs_failed,
    'grainsEnrolled', v_grains_enrolled
  );
end;
$$;

revoke all
on function public.enqueue_sku_daily_metric_daily_rollover(
  integer,
  integer,
  uuid,
  timestamptz
)
from public, anon, authenticated;

grant execute
on function public.enqueue_sku_daily_metric_daily_rollover(
  integer,
  integer,
  uuid,
  timestamptz
)
to service_role;
