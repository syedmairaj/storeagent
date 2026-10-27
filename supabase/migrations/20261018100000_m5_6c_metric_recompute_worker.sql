-- StoreAgent M5.6C
-- Durable claim, lease fencing, and generation-safe completion for
-- sku_daily_metric_recompute_requests.
--
-- This migration is additive. It does not edit M5.5, M5.6A, or M5.6B
-- objects, does not consume events, and does not recalculate metrics.
-- Every request transition goes through a service-role-only
-- security definer function. service_role keeps SELECT only on the
-- request table.
--
-- Global claim and recovery serialize on one transaction-level advisory
-- lock. The key is fixed and distinct from the live-test orders lock.

-- -----------------------------------------------------------------------------
-- Queue columns
-- -----------------------------------------------------------------------------

alter table public.sku_daily_metric_recompute_requests
  add column available_at timestamptz null,
  add column last_error_class text null,
  add column last_error_code text null,
  add column last_error_message text null,
  add column failed_reason text null;

alter table public.sku_daily_metric_recompute_requests
  add constraint sku_daily_metric_recompute_requests_last_error_class_check
    check (
      last_error_class is null
      or last_error_class in (
        'transient_dependency',
        'rate_limited',
        'timeout',
        'lease_expired',
        'validation',
        'authorization',
        'invariant_violation',
        'unsupported',
        'unknown'
      )
    ),
  add constraint sku_daily_metric_recompute_requests_last_error_code_check
    check (
      last_error_code is null
      or last_error_code ~ '^[A-Za-z0-9_.:-]{1,64}$'
    ),
  add constraint sku_daily_metric_recompute_requests_last_error_message_check
    check (
      last_error_message is null
      or pg_catalog.char_length(last_error_message) between 1 and 300
    ),
  add constraint sku_daily_metric_recompute_requests_failed_reason_check
    check (
      failed_reason is null
      or failed_reason in (
        'retry_exhausted',
        'validation_failed',
        'authorization_failed',
        'invariant_violation',
        'unsupported',
        'unknown_failure'
      )
    ),
  add constraint sku_daily_metric_recompute_requests_retry_wait_check
    check (
      status <> 'retry_wait'
      or available_at is not null
    ),
  add constraint sku_daily_metric_recompute_requests_active_lease_check
    check (
      status not in ('claimed', 'running')
      or lease_claim_token is not null
    );

-- Claimable work in fair order.
create index sku_daily_metric_recompute_requests_claimable_idx
  on public.sku_daily_metric_recompute_requests (
    (coalesce(available_at, queued_at))
  )
  where status in ('queued', 'retry_wait');

-- Active leases, for the global cap and expiry recovery.
create index sku_daily_metric_recompute_requests_active_lease_idx
  on public.sku_daily_metric_recompute_requests (lease_expires_at)
  where status in ('claimed', 'running');

-- Active leases per grain, for the one-claim-per-grain rule.
create index sku_daily_metric_recompute_requests_active_grain_idx
  on public.sku_daily_metric_recompute_requests (
    organization_id,
    store_id,
    location_id,
    variant_id
  )
  where status in ('claimed', 'running');

-- Relevant unconsumed events for completion checks.
create index sku_daily_metric_source_events_unconsumed_grain_idx
  on public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date
  )
  where consumed_at is null;

-- -----------------------------------------------------------------------------
-- Expired lease recovery
--
-- Expired claimed: queued. Generation preserved, attempts not incremented.
--   If dirty_generation moved while claimed, attempts reset to 0, because
--   the next claim starts a new logical job.
-- Expired running:
--   dirty_generation <> claimed_generation -> queued, attempt_count 0
--   attempt_count >= p_max_attempts        -> failed (retry_exhausted)
--   otherwise                              -> retry_wait with backoff
-- Generation change is evaluated first, so an older attempt cannot
-- exhaust and fail a newer generation.
-- -----------------------------------------------------------------------------

create or replace function public.recover_expired_sku_daily_metric_recompute_leases(
  p_max_attempts integer,
  p_base_delay_seconds integer,
  p_max_delay_seconds integer
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
-- Claim
--
-- Serialized by the shared advisory lock, so the global cap holds across
-- independent sessions and processes. Counts only unexpired leases.
-- At most one unexpired claimed or running row per grain.
-- claimed_generation is copied from dirty_generation under the row lock.
-- attempt_count is not changed here; it advances when execution starts.
-- -----------------------------------------------------------------------------

create or replace function public.claim_sku_daily_metric_recompute_requests(
  p_owner_id text,
  p_limit integer,
  p_lease_seconds integer,
  p_max_active integer
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
    where request.status = 'queued'
      or (
        request.status = 'retry_wait'
        and request.available_at <= v_now
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
-- Start: claimed -> running, attempt_count + 1, lease renewed.
-- Fenced on full key, owner, token, status, and unexpired lease.
-- Returns no row when fenced.
-- -----------------------------------------------------------------------------

create or replace function public.start_sku_daily_metric_recompute(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_algorithm_version text,
  p_owner_id text,
  p_claim_token text,
  p_lease_seconds integer
)
returns table (
  attempt_count integer,
  claimed_generation bigint,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now timestamptz;
begin
  if p_organization_id is null or p_store_id is null
    or p_location_id is null or p_variant_id is null
    or p_metric_date is null or p_algorithm_version is null
    or p_owner_id is null or p_claim_token is null
    or p_lease_seconds is null
    or p_lease_seconds < 30 or p_lease_seconds > 900
  then
    raise exception 'invalid metric recompute start arguments'
      using errcode = '22023';
  end if;

  v_now := pg_catalog.clock_timestamp();

  return query
  update public.sku_daily_metric_recompute_requests as request
  set
    status = 'running',
    attempt_count = request.attempt_count + 1,
    started_at = v_now,
    finished_at = null,
    lease_expires_at = v_now + pg_catalog.make_interval(
      secs => p_lease_seconds
    ),
    updated_at = v_now
  where request.organization_id = p_organization_id
    and request.store_id = p_store_id
    and request.location_id = p_location_id
    and request.variant_id = p_variant_id
    and request.metric_date = p_metric_date
    and request.algorithm_version = p_algorithm_version
    and request.status = 'claimed'
    and request.lease_owner_id = p_owner_id
    and request.lease_claim_token = p_claim_token
    and request.lease_expires_at > pg_catalog.clock_timestamp()
  returning
    request.attempt_count,
    request.claimed_generation,
    request.lease_expires_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Complete
--
-- fenced:     key, owner, token, status 'running', or unexpired lease fails.
--             No mutation.
-- superseded: dirty_generation <> claimed_generation. Queued, attempts 0,
--             applied_generation unchanged.
-- deferred:   a relevant unconsumed source event is visible. Queued,
--             attempts unchanged, applied_generation unchanged.
-- succeeded:  applied_generation := claimed_generation.
--
-- Relevance: source_date between metric_date - 89 and metric_date. M5.6B
-- expands an event dated D only to dates in D through D + 89.
-- The event read takes no lock, so completion never waits on an event
-- row lock held by consumption.
-- -----------------------------------------------------------------------------

create or replace function public.complete_sku_daily_metric_recompute(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_algorithm_version text,
  p_owner_id text,
  p_claim_token text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request record;
  v_now timestamptz;
begin
  if p_organization_id is null or p_store_id is null
    or p_location_id is null or p_variant_id is null
    or p_metric_date is null or p_algorithm_version is null
    or p_owner_id is null or p_claim_token is null
  then
    raise exception 'invalid metric recompute completion arguments'
      using errcode = '22023';
  end if;

  select *
  into request
  from public.sku_daily_metric_recompute_requests as candidate
  where candidate.organization_id = p_organization_id
    and candidate.store_id = p_store_id
    and candidate.location_id = p_location_id
    and candidate.variant_id = p_variant_id
    and candidate.metric_date = p_metric_date
    and candidate.algorithm_version = p_algorithm_version
  for update;

  v_now := pg_catalog.clock_timestamp();

  if not found
    or request.status <> 'running'
    or request.lease_owner_id is distinct from p_owner_id
    or request.lease_claim_token is distinct from p_claim_token
    or request.lease_expires_at <= v_now
  then
    return 'fenced';
  end if;

  if request.dirty_generation <> request.claimed_generation then
    update public.sku_daily_metric_recompute_requests as target
    set
      status = 'queued',
      attempt_count = 0,
      lease_owner_id = null,
      lease_claim_token = null,
      lease_claimed_at = null,
      lease_expires_at = null,
      available_at = null,
      started_at = null,
      finished_at = null,
      queued_at = v_now,
      updated_at = v_now
    where target.organization_id = p_organization_id
      and target.store_id = p_store_id
      and target.location_id = p_location_id
      and target.variant_id = p_variant_id
      and target.metric_date = p_metric_date
      and target.algorithm_version = p_algorithm_version;

    return 'superseded';
  end if;

  if exists (
    select 1
    from public.sku_daily_metric_source_events as event
    where event.organization_id = p_organization_id
      and event.store_id = p_store_id
      and event.location_id = p_location_id
      and event.variant_id = p_variant_id
      and event.algorithm_version = p_algorithm_version
      and event.consumed_at is null
      and event.source_date >= p_metric_date - 89
      and event.source_date <= p_metric_date
  ) then
    update public.sku_daily_metric_recompute_requests as target
    set
      status = 'queued',
      lease_owner_id = null,
      lease_claim_token = null,
      lease_claimed_at = null,
      lease_expires_at = null,
      available_at = null,
      finished_at = null,
      queued_at = v_now,
      updated_at = v_now
    where target.organization_id = p_organization_id
      and target.store_id = p_store_id
      and target.location_id = p_location_id
      and target.variant_id = p_variant_id
      and target.metric_date = p_metric_date
      and target.algorithm_version = p_algorithm_version;

    return 'deferred';
  end if;

  update public.sku_daily_metric_recompute_requests as target
  set
    status = 'succeeded',
    applied_generation = target.claimed_generation,
    lease_owner_id = null,
    lease_claim_token = null,
    lease_claimed_at = null,
    lease_expires_at = null,
    available_at = null,
    finished_at = v_now,
    failed_reason = null,
    last_error_class = null,
    last_error_code = null,
    last_error_message = null,
    updated_at = v_now
  where target.organization_id = p_organization_id
    and target.store_id = p_store_id
    and target.location_id = p_location_id
    and target.variant_id = p_variant_id
    and target.metric_date = p_metric_date
    and target.algorithm_version = p_algorithm_version;

  return 'succeeded';
end;
$$;

-- -----------------------------------------------------------------------------
-- Fail
--
-- fenced:          as complete. No mutation.
-- superseded:      dirty_generation changed. Queued, attempts 0. Takes
--                  precedence over retry exhaustion.
-- retry_scheduled: retryable class and attempt_count < p_max_attempts.
-- failed:          otherwise. failed_reason follows workers/failure.ts.
--
-- The retryable class set matches workers/retry.ts. Unknown errors are
-- not retryable, so they cannot retry indefinitely.
-- -----------------------------------------------------------------------------

create or replace function public.fail_sku_daily_metric_recompute(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_algorithm_version text,
  p_owner_id text,
  p_claim_token text,
  p_error_class text,
  p_error_code text,
  p_error_message text,
  p_retry_delay_seconds integer,
  p_max_attempts integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request record;
  v_now timestamptz;
  v_retryable boolean;
begin
  if p_organization_id is null or p_store_id is null
    or p_location_id is null or p_variant_id is null
    or p_metric_date is null or p_algorithm_version is null
    or p_owner_id is null or p_claim_token is null
    or p_error_class is null
    or p_error_class not in (
      'transient_dependency',
      'rate_limited',
      'timeout',
      'lease_expired',
      'validation',
      'authorization',
      'invariant_violation',
      'unsupported',
      'unknown'
    )
    or p_error_code is null
    or p_error_code !~ '^[A-Za-z0-9_.:-]{1,64}$'
    or p_error_message is null
    or pg_catalog.char_length(p_error_message) not between 1 and 300
    or p_retry_delay_seconds is null
    or p_retry_delay_seconds < 1 or p_retry_delay_seconds > 86400
    or p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 20
  then
    raise exception 'invalid metric recompute failure arguments'
      using errcode = '22023';
  end if;

  select *
  into request
  from public.sku_daily_metric_recompute_requests as candidate
  where candidate.organization_id = p_organization_id
    and candidate.store_id = p_store_id
    and candidate.location_id = p_location_id
    and candidate.variant_id = p_variant_id
    and candidate.metric_date = p_metric_date
    and candidate.algorithm_version = p_algorithm_version
  for update;

  v_now := pg_catalog.clock_timestamp();

  if not found
    or request.status <> 'running'
    or request.lease_owner_id is distinct from p_owner_id
    or request.lease_claim_token is distinct from p_claim_token
    or request.lease_expires_at <= v_now
  then
    return 'fenced';
  end if;

  if request.dirty_generation <> request.claimed_generation then
    update public.sku_daily_metric_recompute_requests as target
    set
      status = 'queued',
      attempt_count = 0,
      lease_owner_id = null,
      lease_claim_token = null,
      lease_claimed_at = null,
      lease_expires_at = null,
      available_at = null,
      started_at = null,
      finished_at = null,
      queued_at = v_now,
      last_error_class = p_error_class,
      last_error_code = p_error_code,
      last_error_message = p_error_message,
      updated_at = v_now
    where target.organization_id = p_organization_id
      and target.store_id = p_store_id
      and target.location_id = p_location_id
      and target.variant_id = p_variant_id
      and target.metric_date = p_metric_date
      and target.algorithm_version = p_algorithm_version;

    return 'superseded';
  end if;

  v_retryable := p_error_class in (
    'transient_dependency',
    'rate_limited',
    'timeout',
    'lease_expired'
  );

  if v_retryable and request.attempt_count < p_max_attempts then
    update public.sku_daily_metric_recompute_requests as target
    set
      status = 'retry_wait',
      lease_owner_id = null,
      lease_claim_token = null,
      lease_claimed_at = null,
      lease_expires_at = null,
      available_at = v_now + pg_catalog.make_interval(
        secs => p_retry_delay_seconds
      ),
      finished_at = null,
      last_error_class = p_error_class,
      last_error_code = p_error_code,
      last_error_message = p_error_message,
      updated_at = v_now
    where target.organization_id = p_organization_id
      and target.store_id = p_store_id
      and target.location_id = p_location_id
      and target.variant_id = p_variant_id
      and target.metric_date = p_metric_date
      and target.algorithm_version = p_algorithm_version;

    return 'retry_scheduled';
  end if;

  update public.sku_daily_metric_recompute_requests as target
  set
    status = 'failed',
    lease_owner_id = null,
    lease_claim_token = null,
    lease_claimed_at = null,
    lease_expires_at = null,
    available_at = null,
    finished_at = v_now,
    failed_reason = case
      when v_retryable then 'retry_exhausted'
      when p_error_class = 'validation' then 'validation_failed'
      when p_error_class = 'authorization' then 'authorization_failed'
      when p_error_class = 'invariant_violation' then 'invariant_violation'
      when p_error_class = 'unsupported' then 'unsupported'
      else 'unknown_failure'
    end,
    last_error_class = p_error_class,
    last_error_code = p_error_code,
    last_error_message = p_error_message,
    updated_at = v_now
  where target.organization_id = p_organization_id
    and target.store_id = p_store_id
    and target.location_id = p_location_id
    and target.variant_id = p_variant_id
    and target.metric_date = p_metric_date
    and target.algorithm_version = p_algorithm_version;

  return 'failed';
end;
$$;

-- -----------------------------------------------------------------------------
-- Operational counters. Read-only. Counts and ages only; no tenant ids.
-- -----------------------------------------------------------------------------

create or replace function public.sku_daily_metric_recompute_queue_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'queued',
      pg_catalog.count(*) filter (where request.status = 'queued'),
    'claimed',
      pg_catalog.count(*) filter (where request.status = 'claimed'),
    'running',
      pg_catalog.count(*) filter (where request.status = 'running'),
    'retryWaitReady',
      pg_catalog.count(*) filter (
        where request.status = 'retry_wait'
          and request.available_at <= v_now
      ),
    'retryWaitDelayed',
      pg_catalog.count(*) filter (
        where request.status = 'retry_wait'
          and request.available_at > v_now
      ),
    'succeeded',
      pg_catalog.count(*) filter (where request.status = 'succeeded'),
    'failed',
      pg_catalog.count(*) filter (where request.status = 'failed'),
    'cancelled',
      pg_catalog.count(*) filter (where request.status = 'cancelled'),
    'activeLeases',
      pg_catalog.count(*) filter (
        where request.status in ('claimed', 'running')
          and request.lease_expires_at > v_now
      ),
    'expiredLeases',
      pg_catalog.count(*) filter (
        where request.status in ('claimed', 'running')
          and request.lease_expires_at <= v_now
      ),
    'staleGenerations',
      pg_catalog.count(*) filter (
        where request.applied_generation < request.dirty_generation
      ),
    'oldestClaimableAgeSeconds',
      coalesce(
        pg_catalog.floor(
          pg_catalog.max(
            extract(epoch from v_now - request.queued_at)
          ) filter (where request.status = 'queued')
        ),
        0
      )
  )
  into result
  from public.sku_daily_metric_recompute_requests as request;

  select result || pg_catalog.jsonb_build_object(
    'unconsumedEvents', pg_catalog.count(*),
    'oldestUnconsumedEventAgeSeconds',
      coalesce(
        pg_catalog.floor(
          pg_catalog.max(extract(epoch from v_now - event.created_at))
        ),
        0
      )
  )
  into result
  from public.sku_daily_metric_source_events as event
  where event.consumed_at is null;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

revoke all
on function public.recover_expired_sku_daily_metric_recompute_leases(
  integer, integer, integer
)
from public, anon, authenticated;

grant execute
on function public.recover_expired_sku_daily_metric_recompute_leases(
  integer, integer, integer
)
to service_role;

revoke all
on function public.claim_sku_daily_metric_recompute_requests(
  text, integer, integer, integer
)
from public, anon, authenticated;

grant execute
on function public.claim_sku_daily_metric_recompute_requests(
  text, integer, integer, integer
)
to service_role;

revoke all
on function public.start_sku_daily_metric_recompute(
  uuid, uuid, uuid, uuid, date, text, text, text, integer
)
from public, anon, authenticated;

grant execute
on function public.start_sku_daily_metric_recompute(
  uuid, uuid, uuid, uuid, date, text, text, text, integer
)
to service_role;

revoke all
on function public.complete_sku_daily_metric_recompute(
  uuid, uuid, uuid, uuid, date, text, text, text
)
from public, anon, authenticated;

grant execute
on function public.complete_sku_daily_metric_recompute(
  uuid, uuid, uuid, uuid, date, text, text, text
)
to service_role;

revoke all
on function public.fail_sku_daily_metric_recompute(
  uuid, uuid, uuid, uuid, date, text, text, text,
  text, text, text, integer, integer
)
from public, anon, authenticated;

grant execute
on function public.fail_sku_daily_metric_recompute(
  uuid, uuid, uuid, uuid, date, text, text, text,
  text, text, text, integer, integer
)
to service_role;

revoke all
on function public.sku_daily_metric_recompute_queue_stats()
from public, anon, authenticated;

grant execute
on function public.sku_daily_metric_recompute_queue_stats()
to service_role;
