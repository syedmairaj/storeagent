-- StoreAgent M5.7 Phase 2
-- Legitimate deferred completion must not consume the retry budget.
--
-- Forward-only. Does not edit deployed M5.6C / M5.6E.3 migration bodies.
-- Replaces only complete_sku_daily_metric_recompute.
--
-- Before this change, start increments attempt_count and deferred completion
-- requeued the row without resetting attempts. Repeated freshness deferrals
-- could therefore exhaust retries and mark false retry_exhausted.
--
-- Fix: on deferred, set attempt_count = 0 (same accounting as superseded).
-- Fencing (owner/token/status/expiry), generation supersession precedence,
-- success applied_generation, fail-path exhaustion, claim concurrency, and
-- tenant PK scoping are unchanged.

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
    -- Freshness deferral is not a compute failure. Reset attempts so
    -- repeated legitimate deferrals cannot exhaust the retry budget.
    update public.sku_daily_metric_recompute_requests as target
    set
      status = 'queued',
      attempt_count = 0,
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
