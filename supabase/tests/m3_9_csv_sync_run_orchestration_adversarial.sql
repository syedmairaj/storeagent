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
values
(
  '61000000-0000-0000-0000-000000000001',
  'M3.9D-E Adversarial Org',
  null,
  'USD',
  'UTC'
),
(
  '61000000-0000-0000-0000-000000000002',
  'M3.9D-E Other Org',
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
values
(
  '62000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  'Primary Store',
  'active',
  'USD',
  'UTC'
),
(
  '62000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000001',
  'Other Store',
  'active',
  'USD',
  'UTC'
),
(
  '62000000-0000-0000-0000-000000000003',
  '61000000-0000-0000-0000-000000000002',
  'Foreign Store',
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
values
(
  '63000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'csv',
  'active',
  'Primary CSV',
  '{}'::jsonb
),
(
  '63000000-0000-0000-0000-000000000002',
  '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'csv',
  'degraded',
  'Degraded CSV',
  '{}'::jsonb
),
(
  '63000000-0000-0000-0000-000000000003',
  '61000000-0000-0000-0000-000000000002',
  '62000000-0000-0000-0000-000000000003',
  'csv',
  'active',
  'Foreign CSV',
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 1. Blank key rejected
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    perform *
    from public.csv_begin_sync_run(
      '61000000-0000-0000-0000-000000000001',
      '62000000-0000-0000-0000-000000000001',
      '63000000-0000-0000-0000-000000000001',
      '   ',
      null
    );

    raise exception
      'expected blank idempotency rejection';

  exception
    when others then
      if sqlerrm not like
        '%idempotency key must not be blank%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Wrong store rejected
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    perform *
    from public.csv_begin_sync_run(
      '61000000-0000-0000-0000-000000000001',
      '62000000-0000-0000-0000-000000000002',
      '63000000-0000-0000-0000-000000000001',
      'wrong-store',
      null
    );

    raise exception
      'expected store scope rejection';

  exception
    when others then
      if sqlerrm not like
        '%store scope does not match integration%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Degraded integration rejected
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    perform *
    from public.csv_begin_sync_run(
      '61000000-0000-0000-0000-000000000001',
      '62000000-0000-0000-0000-000000000001',
      '63000000-0000-0000-0000-000000000002',
      'degraded',
      null
    );

    raise exception
      'expected degraded integration rejection';

  exception
    when others then
      if sqlerrm not like
        '%active trusted CSV integration%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Cross-organization integration rejected
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    perform *
    from public.csv_begin_sync_run(
      '61000000-0000-0000-0000-000000000001',
      '62000000-0000-0000-0000-000000000001',
      '63000000-0000-0000-0000-000000000003',
      'foreign',
      null
    );

    raise exception
      'expected cross-organization rejection';

  exception
    when others then
      if sqlerrm not like
        '%active trusted CSV integration%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create one valid running SyncRun for completion/failure attacks
-- ---------------------------------------------------------------------------

do $$
begin
  perform *
  from public.csv_begin_sync_run(
    '61000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    'valid-run',
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Invalid count reconciliation rejected
-- ---------------------------------------------------------------------------

do $$
declare
  run_id uuid;
begin
  select id
  into run_id
  from public.sync_runs
  where
    organization_id =
      '61000000-0000-0000-0000-000000000001'
    and integration_id =
      '63000000-0000-0000-0000-000000000001'
    and idempotency_key = 'valid-run';

  begin
    perform *
    from public.csv_complete_sync_run(
      '61000000-0000-0000-0000-000000000001',
      '63000000-0000-0000-0000-000000000001',
      run_id,
      1,
      1,
      0,
      0,
      1,
      0,
      null
    );

    raise exception
      'expected terminal count mismatch rejection';

  exception
    when others then
      if sqlerrm not like
        '%terminal row count must equal discovered count%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Wrong trusted scope cannot complete another run
-- ---------------------------------------------------------------------------

do $$
declare
  run_id uuid;
begin
  select id
  into run_id
  from public.sync_runs
  where
    organization_id =
      '61000000-0000-0000-0000-000000000001'
    and integration_id =
      '63000000-0000-0000-0000-000000000001'
    and idempotency_key = 'valid-run';

  begin
    perform *
    from public.csv_complete_sync_run(
      '61000000-0000-0000-0000-000000000002',
      '63000000-0000-0000-0000-000000000003',
      run_id,
      1,
      1,
      0,
      0,
      0,
      0,
      null
    );

    raise exception
      'expected cross-scope completion rejection';

  exception
    when others then
      if sqlerrm not like
        '%not found in trusted scope%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Complete valid run
-- ---------------------------------------------------------------------------

do $$
declare
  run_id uuid;
begin
  select id
  into run_id
  from public.sync_runs
  where
    organization_id =
      '61000000-0000-0000-0000-000000000001'
    and integration_id =
      '63000000-0000-0000-0000-000000000001'
    and idempotency_key = 'valid-run';

  perform *
  from public.csv_complete_sync_run(
    '61000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    run_id,
    1,
    1,
    0,
    0,
    0,
    0,
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Terminal run cannot complete again
-- ---------------------------------------------------------------------------

do $$
declare
  run_id uuid;
begin
  select id
  into run_id
  from public.sync_runs
  where
    organization_id =
      '61000000-0000-0000-0000-000000000001'
    and integration_id =
      '63000000-0000-0000-0000-000000000001'
    and idempotency_key = 'valid-run';

  begin
    perform *
    from public.csv_complete_sync_run(
      '61000000-0000-0000-0000-000000000001',
      '63000000-0000-0000-0000-000000000001',
      run_id,
      1,
      1,
      0,
      0,
      0,
      0,
      null
    );

    raise exception
      'expected terminal completion rejection';

  exception
    when others then
      if sqlerrm not like
        '%completion requires running status%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Terminal run cannot be failed
-- ---------------------------------------------------------------------------

do $$
declare
  run_id uuid;
begin
  select id
  into run_id
  from public.sync_runs
  where
    organization_id =
      '61000000-0000-0000-0000-000000000001'
    and integration_id =
      '63000000-0000-0000-0000-000000000001'
    and idempotency_key = 'valid-run';

  begin
    perform *
    from public.csv_fail_sync_run(
      '61000000-0000-0000-0000-000000000001',
      '63000000-0000-0000-0000-000000000001',
      run_id,
      '{"code":"SHOULD_NOT_APPLY"}'::jsonb,
      null
    );

    raise exception
      'expected terminal fail rejection';

  exception
    when others then
      if sqlerrm not like
        '%failure requires queued or running status%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Browser roles have no execution privilege
-- ---------------------------------------------------------------------------

do $$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.csv_begin_sync_run(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'anon must not execute csv_begin_sync_run';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.csv_begin_sync_run(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'authenticated must not execute csv_begin_sync_run';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.csv_complete_sync_run(uuid,uuid,uuid,integer,integer,integer,integer,integer,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'anon must not execute csv_complete_sync_run';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.csv_complete_sync_run(uuid,uuid,uuid,integer,integer,integer,integer,integer,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'authenticated must not execute csv_complete_sync_run';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.csv_fail_sync_run(uuid,uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'anon must not execute csv_fail_sync_run';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.csv_fail_sync_run(uuid,uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception
      'authenticated must not execute csv_fail_sync_run';
  end if;
end;
$$;

rollback;
