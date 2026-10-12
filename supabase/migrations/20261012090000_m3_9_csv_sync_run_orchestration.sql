-- StoreAgent M3.9D-E
-- Durable CSV SyncRun orchestration.
--
-- Frozen identity:
--   organization_id
--   integration_id
--   idempotency_key
--
-- store_id remains scope metadata and is NOT replay identity.
--
-- Service-role only.
-- Browser mutation authority remains unchanged.

-- ---------------------------------------------------------------------------
-- Begin / acquire one operational CSV SyncRun
-- ---------------------------------------------------------------------------

create or replace function public.csv_begin_sync_run(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_idempotency_key text,
  p_reconciliation_metadata jsonb default null
)
returns table (
  sync_run_id uuid,
  disposition text,
  status text,
  discovered_count integer,
  imported_count integer,
  updated_count integer,
  skipped_count integer,
  quarantined_count integer,
  failed_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_key text;
  integration_row public.integrations%rowtype;
  existing_run public.sync_runs%rowtype;
  created_run public.sync_runs%rowtype;
begin
  normalized_key := pg_catalog.btrim(p_idempotency_key);

  if normalized_key is null
     or pg_catalog.length(normalized_key) = 0
  then
    raise exception
      'CSV SyncRun idempotency key must not be blank';
  end if;

  select i.*
  into integration_row
  from public.integrations i
  where
    i.id = p_integration_id
    and i.organization_id = p_organization_id
    and i.provider = 'csv'
    and i.status = 'active'
  for share;

  if not found then
    raise exception
      'CSV SyncRun requires an active trusted CSV integration';
  end if;

  if integration_row.store_id is distinct from p_store_id then
    raise exception
      'CSV SyncRun store scope does not match integration';
  end if;

  select sr.*
  into existing_run
  from public.sync_runs sr
  where
    sr.organization_id = p_organization_id
    and sr.integration_id = p_integration_id
    and sr.idempotency_key = normalized_key
  for update;

  if found then
    if existing_run.status in (
      'completed',
      'completed_with_errors',
      'failed',
      'cancelled'
    ) then
      return query
      select
        existing_run.id,
        'replayed'::text,
        existing_run.status,
        existing_run.discovered_count,
        existing_run.imported_count,
        existing_run.updated_count,
        existing_run.skipped_count,
        existing_run.quarantined_count,
        existing_run.failed_count;

      return;
    end if;

    return query
    select
      existing_run.id,
      'in_progress'::text,
      existing_run.status,
      existing_run.discovered_count,
      existing_run.imported_count,
      existing_run.updated_count,
      existing_run.skipped_count,
      existing_run.quarantined_count,
      existing_run.failed_count;

    return;
  end if;

  begin
    insert into public.sync_runs (
      organization_id,
      store_id,
      integration_id,
      idempotency_key,
      status,
      discovered_count,
      imported_count,
      updated_count,
      skipped_count,
      quarantined_count,
      failed_count,
      error_summary,
      reconciliation_metadata,
      started_at,
      finished_at
    )
    values (
      p_organization_id,
      p_store_id,
      p_integration_id,
      normalized_key,
      'running',
      0,
      0,
      0,
      0,
      0,
      0,
      null,
      p_reconciliation_metadata,
      pg_catalog.now(),
      null
    )
    returning *
    into created_run;

  exception
    when unique_violation then
      select sr.*
      into existing_run
      from public.sync_runs sr
      where
        sr.organization_id = p_organization_id
        and sr.integration_id = p_integration_id
        and sr.idempotency_key = normalized_key
      for update;

      if not found then
        raise;
      end if;

      if existing_run.status in (
        'completed',
        'completed_with_errors',
        'failed',
        'cancelled'
      ) then
        return query
        select
          existing_run.id,
          'replayed'::text,
          existing_run.status,
          existing_run.discovered_count,
          existing_run.imported_count,
          existing_run.updated_count,
          existing_run.skipped_count,
          existing_run.quarantined_count,
          existing_run.failed_count;

        return;
      end if;

      return query
      select
        existing_run.id,
        'in_progress'::text,
        existing_run.status,
        existing_run.discovered_count,
        existing_run.imported_count,
        existing_run.updated_count,
        existing_run.skipped_count,
        existing_run.quarantined_count,
        existing_run.failed_count;

      return;
  end;

  return query
  select
    created_run.id,
    'started'::text,
    created_run.status,
    created_run.discovered_count,
    created_run.imported_count,
    created_run.updated_count,
    created_run.skipped_count,
    created_run.quarantined_count,
    created_run.failed_count;
end;
$$;

revoke all
on function public.csv_begin_sync_run(
  uuid,
  uuid,
  uuid,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.csv_begin_sync_run(
  uuid,
  uuid,
  uuid,
  text,
  jsonb
)
to service_role;

-- ---------------------------------------------------------------------------
-- Complete one running CSV SyncRun
-- ---------------------------------------------------------------------------

create or replace function public.csv_complete_sync_run(
  p_organization_id uuid,
  p_integration_id uuid,
  p_sync_run_id uuid,
  p_discovered_count integer,
  p_imported_count integer,
  p_updated_count integer,
  p_skipped_count integer,
  p_quarantined_count integer,
  p_failed_count integer,
  p_reconciliation_metadata jsonb default null
)
returns table (
  sync_run_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_run public.sync_runs%rowtype;
  terminal_count integer;
  final_status text;
begin
  if
    p_discovered_count < 0
    or p_imported_count < 0
    or p_updated_count < 0
    or p_skipped_count < 0
    or p_quarantined_count < 0
    or p_failed_count < 0
  then
    raise exception
      'CSV SyncRun counts must be non-negative';
  end if;

  terminal_count :=
    p_imported_count
    + p_updated_count
    + p_skipped_count
    + p_quarantined_count
    + p_failed_count;

  if terminal_count <> p_discovered_count then
    raise exception
      'CSV SyncRun terminal row count must equal discovered count';
  end if;

  select sr.*
  into existing_run
  from public.sync_runs sr
  where
    sr.id = p_sync_run_id
    and sr.organization_id = p_organization_id
    and sr.integration_id = p_integration_id
  for update;

  if not found then
    raise exception
      'CSV SyncRun not found in trusted scope';
  end if;

  if existing_run.status <> 'running' then
    raise exception
      'CSV SyncRun completion requires running status';
  end if;

  final_status :=
    case
      when
        p_quarantined_count > 0
        or p_failed_count > 0
      then 'completed_with_errors'
      else 'completed'
    end;

  update public.sync_runs
  set
    status = final_status,
    discovered_count = p_discovered_count,
    imported_count = p_imported_count,
    updated_count = p_updated_count,
    skipped_count = p_skipped_count,
    quarantined_count = p_quarantined_count,
    failed_count = p_failed_count,
    reconciliation_metadata =
      coalesce(
        p_reconciliation_metadata,
        reconciliation_metadata
      ),
    finished_at = pg_catalog.now()
  where id = existing_run.id;

  return query
  select
    existing_run.id,
    final_status;
end;
$$;

revoke all
on function public.csv_complete_sync_run(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.csv_complete_sync_run(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  jsonb
)
to service_role;

-- ---------------------------------------------------------------------------
-- Fail one queued/running CSV SyncRun
-- ---------------------------------------------------------------------------

create or replace function public.csv_fail_sync_run(
  p_organization_id uuid,
  p_integration_id uuid,
  p_sync_run_id uuid,
  p_error_summary jsonb,
  p_reconciliation_metadata jsonb default null
)
returns table (
  sync_run_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_run public.sync_runs%rowtype;
begin
  if
    p_error_summary is not null
    and pg_catalog.jsonb_typeof(
      p_error_summary
    ) <> 'object'
  then
    raise exception
      'CSV SyncRun error summary must be a JSON object';
  end if;

  select sr.*
  into existing_run
  from public.sync_runs sr
  where
    sr.id = p_sync_run_id
    and sr.organization_id = p_organization_id
    and sr.integration_id = p_integration_id
  for update;

  if not found then
    raise exception
      'CSV SyncRun not found in trusted scope';
  end if;

  if existing_run.status not in (
    'queued',
    'running'
  ) then
    raise exception
      'CSV SyncRun failure requires queued or running status';
  end if;

  update public.sync_runs
  set
    status = 'failed',
    error_summary = p_error_summary,
    reconciliation_metadata =
      coalesce(
        p_reconciliation_metadata,
        reconciliation_metadata
      ),
    finished_at = pg_catalog.now()
  where id = existing_run.id;

  return query
  select
    existing_run.id,
    'failed'::text;
end;
$$;

revoke all
on function public.csv_fail_sync_run(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.csv_fail_sync_run(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb
)
to service_role;
