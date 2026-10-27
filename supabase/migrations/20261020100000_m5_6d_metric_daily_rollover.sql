-- StoreAgent M5.6D
-- Resumable store-local daily metric rollover enqueue.
--
-- Additive only. Does not edit M5.5, M5.6A, M5.6B, or M5.6C objects.
-- Does not recalculate metrics. Does not consume source events.
-- Feeds the existing sku_daily_metric_recompute_requests table.
--
-- Progress model:
--   * One run row per (organization, store, metric_date, algorithm).
--   * eligible_cutoff_at and metric_date freeze at run open.
--   * Durable (location_id, variant_id) cursor walks the stable set.
--   * Enrollment ledger gates dirty_generation bumps (once per grain/day).
--   * Lookahead of batch_size + 1 decides completion (exact multiples safe).
--   * Fairness: last_progress_at rotation across up to p_max_stores per call;
--     grain budget is shared; each selected store receives an equal share.
--
-- Late / backdated commerce after the cursor:
--   M5.6A statement triggers insert source events for order, item, return,
--   and snapshot mutations. M5.6B expansion includes store-local today when
--   today lies in [D, D+89]. Rollover does not re-scan before the cursor;
--   event consumption fills that gap. A source-timestamp cutoff alone is
--   not the recovery path for post-cutoff commits.
--
-- Invalid timezone recovery:
--   An unrecognized stores.timezone fails closed (status=failed,
--   fail_reason=invalid_iana_timezone, zero enqueues). After the timezone
--   becomes a recognized IANA name, the next enqueue call may reopen that
--   failed run when the corrected store-local metric_date matches the
--   failed row, or open a new run when the corrected local date differs
--   from the UTC-derived failure key. Unrelated failed reasons are never
--   reopened. Enrollment uniqueness still gates dirty_generation bumps.

-- -----------------------------------------------------------------------------
-- Rollover runs (progress, not a work queue)
-- -----------------------------------------------------------------------------

create table public.sku_daily_metric_rollover_runs (
  organization_id uuid not null,
  store_id uuid not null,
  metric_date date not null,
  algorithm_version text not null,

  status text not null,
  eligible_cutoff_at timestamptz not null,

  cursor_location_id uuid null,
  cursor_variant_id uuid null,

  enqueued_count bigint not null default 0,
  fail_reason text null,

  started_at timestamptz not null,
  last_progress_at timestamptz not null,
  completed_at timestamptz null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint sku_daily_metric_rollover_runs_pkey
    primary key (
      organization_id,
      store_id,
      metric_date,
      algorithm_version
    ),

  constraint sku_daily_metric_rollover_runs_store_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint sku_daily_metric_rollover_runs_algorithm_version_check
    check (algorithm_version = 'm5-derived-metrics-v1'),

  constraint sku_daily_metric_rollover_runs_status_check
    check (
      status in (
        'in_progress',
        'completed',
        'failed'
      )
    ),

  constraint sku_daily_metric_rollover_runs_enqueued_count_check
    check (enqueued_count >= 0),

  constraint sku_daily_metric_rollover_runs_cursor_check
    check (
      (
        cursor_location_id is null
        and cursor_variant_id is null
      )
      or (
        cursor_location_id is not null
        and cursor_variant_id is not null
      )
    ),

  constraint sku_daily_metric_rollover_runs_fail_reason_check
    check (
      fail_reason is null
      or pg_catalog.char_length(fail_reason) between 1 and 200
    ),

  constraint sku_daily_metric_rollover_runs_completed_check
    check (
      (
        status = 'completed'
        and completed_at is not null
      )
      or (
        status <> 'completed'
        and completed_at is null
      )
    ),

  constraint sku_daily_metric_rollover_runs_failed_check
    check (
      (
        status = 'failed'
        and fail_reason is not null
      )
      or (
        status <> 'failed'
        and fail_reason is null
      )
    )
);

create index sku_daily_metric_rollover_runs_progress_idx
  on public.sku_daily_metric_rollover_runs (
    last_progress_at,
    organization_id,
    store_id
  )
  where status = 'in_progress';

alter table public.sku_daily_metric_rollover_runs enable row level security;

revoke all
on table public.sku_daily_metric_rollover_runs
from public, anon, authenticated, service_role;

grant select
on table public.sku_daily_metric_rollover_runs
to service_role;

-- -----------------------------------------------------------------------------
-- Enrollment ledger (idempotency, not a work queue)
-- -----------------------------------------------------------------------------

create table public.sku_daily_metric_rollover_enqueues (
  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,
  metric_date date not null,
  algorithm_version text not null,
  enrolled_at timestamptz not null default pg_catalog.now(),

  constraint sku_daily_metric_rollover_enqueues_pkey
    primary key (
      organization_id,
      store_id,
      location_id,
      variant_id,
      metric_date,
      algorithm_version
    ),

  constraint sku_daily_metric_rollover_enqueues_algorithm_version_check
    check (algorithm_version = 'm5-derived-metrics-v1')
);

create index sku_daily_metric_rollover_enqueues_run_idx
  on public.sku_daily_metric_rollover_enqueues (
    organization_id,
    store_id,
    metric_date,
    algorithm_version
  );

alter table public.sku_daily_metric_rollover_enqueues enable row level security;

revoke all
on table public.sku_daily_metric_rollover_enqueues
from public, anon, authenticated, service_role;

grant select
on table public.sku_daily_metric_rollover_enqueues
to service_role;

-- -----------------------------------------------------------------------------
-- enqueue_sku_daily_metric_daily_rollover
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
        available_at,
        queued_at,
        updated_at
      )
      select
        v_run.organization_id,
        v_run.store_id,
        enrolled.location_id,
        enrolled.variant_id,
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
      from enrolled
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
        updated_at = v_now
      returning 1
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
      -- Reference bumped so the request upsert always executes.
      (select pg_catalog.count(*)::integer from bumped)
    into
      v_seen,
      v_enrolled_now,
      v_last_location,
      v_last_variant,
      v_process;

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

-- -----------------------------------------------------------------------------
-- Read-only operational counts
-- -----------------------------------------------------------------------------

create or replace function public.sku_daily_metric_rollover_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_in_progress bigint;
  v_completed bigint;
  v_failed bigint;
  v_enrollments bigint;
  v_oldest_age bigint;
begin
  select
    pg_catalog.count(*) filter (where run.status = 'in_progress'),
    pg_catalog.count(*) filter (where run.status = 'completed'),
    pg_catalog.count(*) filter (where run.status = 'failed')
  into
    v_in_progress,
    v_completed,
    v_failed
  from public.sku_daily_metric_rollover_runs as run;

  select pg_catalog.count(*)
  into v_enrollments
  from public.sku_daily_metric_rollover_enqueues;

  select coalesce(
    pg_catalog.max(
      pg_catalog.trunc(extract(epoch from (v_now - run.started_at)))
    )::bigint,
    0
  )
  into v_oldest_age
  from public.sku_daily_metric_rollover_runs as run
  where run.status = 'in_progress';

  return pg_catalog.jsonb_build_object(
    'runsInProgress', v_in_progress,
    'runsCompleted', v_completed,
    'runsFailed', v_failed,
    'enrollments', v_enrollments,
    'oldestInProgressAgeSeconds', v_oldest_age
  );
end;
$$;

revoke all
on function public.sku_daily_metric_rollover_stats()
from public, anon, authenticated;

grant execute
on function public.sku_daily_metric_rollover_stats()
to service_role;
