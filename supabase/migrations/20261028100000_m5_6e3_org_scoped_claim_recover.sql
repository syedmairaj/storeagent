-- StoreAgent M5.6E.3
-- Optional organization scope for claim and expired-lease recovery.
--
-- Additive only. Does not edit M5.5–M5.6D table definitions.
-- Does not enable workers, consume events, or recalculate metrics.
--
-- Trailing p_organization_id uuid DEFAULT NULL:
--   * NULL  -> existing global candidate / recovery selection (production).
--   * non-NULL -> claim candidates and recover expired leases only for
--     that organization.
-- The active-lease ceiling remains GLOBAL (at most p_max_active unexpired
-- claimed/running leases across all organizations). Advisory lock 5606003,
-- per-grain exclusivity, fencing, retries, backoff, generation supersession,
-- and claim ordering are unchanged.
--
-- Function identity: the prior 4-arg claim and 3-arg recover signatures are
-- dropped explicitly (without cascading dependents) so they cannot remain as
-- callable overloads that bypass the org filter. Callers that omit the new
-- argument resolve to DEFAULT NULL.

-- -----------------------------------------------------------------------------
-- Drop prior identities (fail if unexpected dependents exist)
-- -----------------------------------------------------------------------------

drop function if exists
  public.claim_sku_daily_metric_recompute_requests(
    text,
    integer,
    integer,
    integer
  );

drop function if exists
  public.recover_expired_sku_daily_metric_recompute_leases(
    integer,
    integer,
    integer
  );

-- -----------------------------------------------------------------------------
-- Recover (optional organization scope)
-- -----------------------------------------------------------------------------

create function public.recover_expired_sku_daily_metric_recompute_leases(
  p_max_attempts integer,
  p_base_delay_seconds integer,
  p_max_delay_seconds integer,
  p_organization_id uuid default null
)
returns table (
  requeued integer,
  retry_scheduled integer,
  failed integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now timestamptz;
  v_requeued integer := 0;
  v_retry integer := 0;
  v_failed integer := 0;
begin
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 20
    or p_base_delay_seconds is null
    or p_base_delay_seconds < 1 or p_base_delay_seconds > 3600
    or p_max_delay_seconds is null
    or p_max_delay_seconds < p_base_delay_seconds
    or p_max_delay_seconds > 86400
  then
    raise exception 'invalid metric recompute recovery arguments'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(5606003);

  v_now := pg_catalog.clock_timestamp();

  with picked as (
    select
      request.organization_id,
      request.store_id,
      request.location_id,
      request.variant_id,
      request.metric_date,
      request.algorithm_version,
      case
        when request.status = 'claimed'
          then 'requeue_claimed'
        when request.dirty_generation <> request.claimed_generation
          then 'requeue_superseded'
        when request.attempt_count >= p_max_attempts
          then 'fail'
        else 'retry'
      end as outcome,
      request.dirty_generation <> request.claimed_generation
        as generation_changed,
      least(
        p_base_delay_seconds::numeric
          * pg_catalog.power(
            2::numeric,
            greatest(request.attempt_count, 1) - 1
          ),
        p_max_delay_seconds::numeric
      ) as delay_seconds
    from public.sku_daily_metric_recompute_requests as request
    where request.status in ('claimed', 'running')
      and request.lease_expires_at <= v_now
      and (
        p_organization_id is null
        or request.organization_id = p_organization_id
      )
    order by request.lease_expires_at
    limit 1000
    for update skip locked
  ),
  updated as (
    update public.sku_daily_metric_recompute_requests as request
    set
      status = case picked.outcome
        when 'fail' then 'failed'
        when 'retry' then 'retry_wait'
        else 'queued'
      end,
      attempt_count = case
        when picked.generation_changed then 0
        else request.attempt_count
      end,
      lease_owner_id = null,
      lease_claim_token = null,
      lease_claimed_at = null,
      lease_expires_at = null,
      available_at = case picked.outcome
        when 'retry' then
          v_now + pg_catalog.make_interval(
            secs => picked.delay_seconds::double precision
          )
        else null
      end,
      started_at = case picked.outcome
        when 'requeue_superseded' then null
        else request.started_at
      end,
      finished_at = case picked.outcome
        when 'fail' then v_now
        else null
      end,
      queued_at = case picked.outcome
        when 'requeue_superseded' then v_now
        else request.queued_at
      end,
      failed_reason = case picked.outcome
        when 'fail' then 'retry_exhausted'
        else request.failed_reason
      end,
      last_error_class = case picked.outcome
        when 'requeue_claimed' then request.last_error_class
        else 'lease_expired'
      end,
      last_error_code = case picked.outcome
        when 'requeue_claimed' then request.last_error_code
        else 'LEASE_EXPIRED'
      end,
      last_error_message = case picked.outcome
        when 'requeue_claimed' then request.last_error_message
        else 'lease expired before completion'
      end,
      updated_at = v_now
    from picked
    where request.organization_id = picked.organization_id
      and request.store_id = picked.store_id
      and request.location_id = picked.location_id
      and request.variant_id = picked.variant_id
      and request.metric_date = picked.metric_date
      and request.algorithm_version = picked.algorithm_version
    returning picked.outcome
  )
  select
    pg_catalog.count(*) filter (
      where updated.outcome in ('requeue_claimed', 'requeue_superseded')
    )::integer,
    pg_catalog.count(*) filter (where updated.outcome = 'retry')::integer,
    pg_catalog.count(*) filter (where updated.outcome = 'fail')::integer
  into v_requeued, v_retry, v_failed
  from updated;

  return query select v_requeued, v_retry, v_failed;
end;
$$;

-- -----------------------------------------------------------------------------
-- Claim (optional organization scope; global active-lease ceiling)
-- -----------------------------------------------------------------------------

create function public.claim_sku_daily_metric_recompute_requests(
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

-- -----------------------------------------------------------------------------
-- Privileges (new identities only)
-- -----------------------------------------------------------------------------

revoke all
on function public.recover_expired_sku_daily_metric_recompute_leases(
  integer,
  integer,
  integer,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.recover_expired_sku_daily_metric_recompute_leases(
  integer,
  integer,
  integer,
  uuid
)
to service_role;

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
