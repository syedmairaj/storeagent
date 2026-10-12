begin;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into public.organizations (
  id,
  name,
  country_code,
  default_currency,
  timezone
)
values (
  '51000000-0000-0000-0000-000000000001',
  'M3.9D-E Live Org',
  null,
  'USD',
  'UTC'
);

insert into public.stores (
  id,
  organization_id,
  name,
  status,
  currency,
  timezone
)
values (
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  'M3.9D-E Live Store',
  'active',
  'USD',
  'UTC'
);

insert into public.integrations (
  id,
  organization_id,
  store_id,
  provider,
  status,
  display_name,
  configuration
)
values (
  '53000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  'csv',
  'active',
  'M3.9D-E Live CSV',
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 1. First acquisition => started + running
-- ---------------------------------------------------------------------------

do $$
declare
  result_id uuid;
  result_disposition text;
  result_status text;
begin
  select
    sync_run_id,
    disposition,
    status
  into
    result_id,
    result_disposition,
    result_status
  from public.csv_begin_sync_run(
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    'import-001',
    '{"source":"live-test"}'::jsonb
  );

  if result_id is null then
    raise exception
      'expected created SyncRun id';
  end if;

  if result_disposition <> 'started' then
    raise exception
      'expected started, got %',
      result_disposition;
  end if;

  if result_status <> 'running' then
    raise exception
      'expected running, got %',
      result_status;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Same key while running => in_progress, same durable SyncRun
-- ---------------------------------------------------------------------------

do $$
declare
  original_id uuid;
  replay_id uuid;
  result_disposition text;
  result_status text;
begin
  select id
  into original_id
  from public.sync_runs
  where
    organization_id =
      '51000000-0000-0000-0000-000000000001'
    and integration_id =
      '53000000-0000-0000-0000-000000000001'
    and idempotency_key = 'import-001';

  select
    sync_run_id,
    disposition,
    status
  into
    replay_id,
    result_disposition,
    result_status
  from public.csv_begin_sync_run(
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    'import-001',
    null
  );

  if replay_id is distinct from original_id then
    raise exception
      'in-progress replay returned different SyncRun';
  end if;

  if result_disposition <> 'in_progress' then
    raise exception
      'expected in_progress, got %',
      result_disposition;
  end if;

  if result_status <> 'running' then
    raise exception
      'expected running, got %',
      result_status;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Complete clean run => completed with exact counts
-- ---------------------------------------------------------------------------

do $$
declare
  run_id uuid;
  result_status text;
begin
  select id
  into run_id
  from public.sync_runs
  where
    organization_id =
      '51000000-0000-0000-0000-000000000001'
    and integration_id =
      '53000000-0000-0000-0000-000000000001'
    and idempotency_key = 'import-001';

  select status
  into result_status
  from public.csv_complete_sync_run(
    '51000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    run_id,
    9,
    9,
    0,
    0,
    0,
    0,
    '{"phase":"complete"}'::jsonb
  );

  if result_status <> 'completed' then
    raise exception
      'expected completed, got %',
      result_status;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Same terminal key => replayed, no new SyncRun
-- ---------------------------------------------------------------------------

do $$
declare
  original_id uuid;
  replay_id uuid;
  result_disposition text;
  result_status text;
  run_count integer;
  imported_count integer;
begin
  select id
  into original_id
  from public.sync_runs
  where
    organization_id =
      '51000000-0000-0000-0000-000000000001'
    and integration_id =
      '53000000-0000-0000-0000-000000000001'
    and idempotency_key = 'import-001';

  select
    sync_run_id,
    disposition,
    status,
    csv_begin_sync_run.imported_count
  into
    replay_id,
    result_disposition,
    result_status,
    imported_count
  from public.csv_begin_sync_run(
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    'import-001',
    null
  );

  if replay_id is distinct from original_id then
    raise exception
      'terminal replay returned different SyncRun';
  end if;

  if result_disposition <> 'replayed' then
    raise exception
      'expected replayed, got %',
      result_disposition;
  end if;

  if result_status <> 'completed' then
    raise exception
      'expected completed replay, got %',
      result_status;
  end if;

  if imported_count <> 9 then
    raise exception
      'expected persisted imported_count 9, got %',
      imported_count;
  end if;

  select count(*)
  into run_count
  from public.sync_runs
  where
    organization_id =
      '51000000-0000-0000-0000-000000000001'
    and integration_id =
      '53000000-0000-0000-0000-000000000001'
    and idempotency_key = 'import-001';

  if run_count <> 1 then
    raise exception
      'expected one durable SyncRun, got %',
      run_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. New key + quarantine => completed_with_errors
-- ---------------------------------------------------------------------------

do $$
declare
  run_id uuid;
  result_status text;
begin
  select sync_run_id
  into run_id
  from public.csv_begin_sync_run(
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    'import-002',
    null
  );

  select status
  into result_status
  from public.csv_complete_sync_run(
    '51000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    run_id,
    9,
    7,
    0,
    1,
    1,
    0,
    null
  );

  if result_status <> 'completed_with_errors' then
    raise exception
      'expected completed_with_errors, got %',
      result_status;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. New key + orchestration failure => failed
-- ---------------------------------------------------------------------------

do $$
declare
  run_id uuid;
  result_status text;
begin
  select sync_run_id
  into run_id
  from public.csv_begin_sync_run(
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    'import-003',
    null
  );

  select status
  into result_status
  from public.csv_fail_sync_run(
    '51000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    run_id,
    '{"code":"TEST_FAILURE"}'::jsonb,
    null
  );

  if result_status <> 'failed' then
    raise exception
      'expected failed, got %',
      result_status;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Final durable state
-- ---------------------------------------------------------------------------

do $$
declare
  run_count integer;
begin
  select count(*)
  into run_count
  from public.sync_runs
  where
    organization_id =
      '51000000-0000-0000-0000-000000000001'
    and integration_id =
      '53000000-0000-0000-0000-000000000001';

  if run_count <> 3 then
    raise exception
      'expected exactly three durable SyncRuns, got %',
      run_count;
  end if;
end;
$$;

rollback;
