-- StoreAgent M5.7 Phase 3B
-- Exclude grains that already hold an unexpired claimed/running lease from
-- the claim candidate scan BEFORE LIMIT 500 is applied.
--
-- Forward-only. Does not edit deployed M5.6C / M5.6E.3 / M5.7 F1 bodies.
-- Replaces only claim_sku_daily_metric_recompute_requests (same signature).
--
-- Defect (T4): older queued dates for a busy grain filled the 500-row
-- candidate window; free grains beyond that window were never considered
-- even when global active-lease slots remained.
--
-- Fix: NOT EXISTS unexpired active lease on the same
-- (organization_id, store_id, location_id, variant_id) in the candidate
-- WHERE clause. Keep the in-loop active-lease check so a grain claimed
-- earlier in the same call cannot receive a second lease from a later
-- candidate already locked in the cursor.
--
-- Unchanged: advisory lock 5606003, global active ceiling, org scope
-- default null, FOR UPDATE SKIP LOCKED, ordering, fencing RPCs, recover.

create or replace function public.claim_sku_daily_metric_recompute_requests(
  p_owner_id text,
  p_limit integer,
  p_lease_seconds integer,
  p_max_active integer,
  p_organization_id uuid default null
)
returns table (
  organization_id uuid,
  store_id uuid,
  location_id uuid,
  variant_id uuid,
  metric_date date,
  algorithm_version text,
  claimed_generation bigint,
  attempt_count integer,
  lease_claim_token text,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now timestamptz;
  v_active integer;
  v_slots integer;
  v_picked integer := 0;
  candidate record;
  claimed record;
begin
  if p_owner_id is null
    or p_owner_id !~ '^[A-Za-z0-9_.:-]{1,200}$'
    or p_limit is null or p_limit < 1 or p_limit > 4
    or p_lease_seconds is null
    or p_lease_seconds < 30 or p_lease_seconds > 900
    or p_max_active is null or p_max_active < 1 or p_max_active > 4
  then
    raise exception 'invalid metric recompute claim arguments'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(5606003);

  v_now := pg_catalog.clock_timestamp();

  -- Global active-lease ceiling (unchanged when org-scoped).
  select pg_catalog.count(*)::integer
  into v_active
  from public.sku_daily_metric_recompute_requests as active
  where active.status in ('claimed', 'running')
    and active.lease_expires_at > v_now;

  v_slots := least(p_limit, p_max_active - v_active);

  if v_slots <= 0 then
    return;
  end if;

  for candidate in
    select
      request.organization_id,
      request.store_id,
      request.location_id,
      request.variant_id,
      request.metric_date,
      request.algorithm_version
    from public.sku_daily_metric_recompute_requests as request
    where (
        request.status = 'queued'
        or (
          request.status = 'retry_wait'
          and request.available_at <= v_now
        )
      )
      and (
        p_organization_id is null
        or request.organization_id = p_organization_id
      )
      -- Exclude busy grains before LIMIT so free-grain work remains visible.
      and not exists (
        select 1
        from public.sku_daily_metric_recompute_requests as active
        where active.organization_id = request.organization_id
          and active.store_id = request.store_id
          and active.location_id = request.location_id
          and active.variant_id = request.variant_id
          and active.status in ('claimed', 'running')
          and active.lease_expires_at > v_now
      )
    order by
      coalesce(request.available_at, request.queued_at),
      request.organization_id,
      request.store_id,
      request.location_id,
      request.variant_id,
      request.metric_date
    limit 500
    for update skip locked
  loop
    exit when v_picked >= v_slots;

    -- Defense in depth: a grain claimed earlier in this call must not
    -- receive a second unexpired lease from a later locked candidate.
    if exists (
      select 1
      from public.sku_daily_metric_recompute_requests as active
      where active.organization_id = candidate.organization_id
        and active.store_id = candidate.store_id
        and active.location_id = candidate.location_id
        and active.variant_id = candidate.variant_id
        and active.status in ('claimed', 'running')
        and active.lease_expires_at > v_now
    ) then
      continue;
    end if;

    update public.sku_daily_metric_recompute_requests as request
    set
      status = 'claimed',
      claimed_generation = request.dirty_generation,
      lease_owner_id = p_owner_id,
      lease_claim_token = pg_catalog.gen_random_uuid()::text,
      lease_claimed_at = v_now,
      lease_expires_at = v_now + pg_catalog.make_interval(
        secs => p_lease_seconds
      ),
      available_at = null,
      failed_reason = null,
      updated_at = v_now
    where request.organization_id = candidate.organization_id
      and request.store_id = candidate.store_id
      and request.location_id = candidate.location_id
      and request.variant_id = candidate.variant_id
      and request.metric_date = candidate.metric_date
      and request.algorithm_version = candidate.algorithm_version
    returning
      request.organization_id,
      request.store_id,
      request.location_id,
      request.variant_id,
      request.metric_date,
      request.algorithm_version,
      request.claimed_generation,
      request.attempt_count,
      request.lease_claim_token,
      request.lease_expires_at
    into claimed;

    organization_id := claimed.organization_id;
    store_id := claimed.store_id;
    location_id := claimed.location_id;
    variant_id := claimed.variant_id;
    metric_date := claimed.metric_date;
    algorithm_version := claimed.algorithm_version;
    claimed_generation := claimed.claimed_generation;
    attempt_count := claimed.attempt_count;
    lease_claim_token := claimed.lease_claim_token;
    lease_expires_at := claimed.lease_expires_at;
    return next;

    v_picked := v_picked + 1;
  end loop;
end;
$$;

revoke all
on function public.claim_sku_daily_metric_recompute_requests(
  text,
  integer,
  integer,
  integer,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.claim_sku_daily_metric_recompute_requests(
  text,
  integer,
  integer,
  integer,
  uuid
)
to service_role;
