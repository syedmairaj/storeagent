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
  '41000000-0000-0000-0000-000000000001',
  'M3.9D-D0 Org',
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
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'Primary Store',
  'active',
  'USD',
  'UTC'
),
(
  '42000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000001',
  'Other Store',
  'active',
  'USD',
  'UTC'
);

insert into public.locations (
  id,
  organization_id,
  store_id,
  name,
  status,
  code
)
values
(
  '43000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'Main Warehouse',
  'active',
  'MAIN'
),
(
  '43000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000002',
  'Other Warehouse',
  'active',
  'OTHER'
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
  '44000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'csv',
  'active',
  'Primary CSV',
  '{}'::jsonb
),
(
  '44000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'csv',
  'degraded',
  'Degraded CSV',
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 1. First bind => imported
-- ---------------------------------------------------------------------------

do $$
declare
  result_id uuid;
  result_disposition text;
begin
  select
    canonical_entity_id,
    disposition
  into
    result_id,
    result_disposition
  from public.csv_bind_location(
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'WAREHOUSE-DXB',
    '43000000-0000-0000-0000-000000000001',
    '{"configuredBy":"merchant"}'::jsonb
  );

  if result_id is distinct from
    '43000000-0000-0000-0000-000000000001'
  then
    raise exception
      'expected canonical location id, got %',
      result_id;
  end if;

  if result_disposition <> 'imported' then
    raise exception
      'expected imported, got %',
      result_disposition;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Exact replay => skipped, no duplicate
-- ---------------------------------------------------------------------------

do $$
declare
  result_id uuid;
  result_disposition text;
  binding_count integer;
begin
  select
    canonical_entity_id,
    disposition
  into
    result_id,
    result_disposition
  from public.csv_bind_location(
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'WAREHOUSE-DXB',
    '43000000-0000-0000-0000-000000000001',
    '{"configuredBy":"merchant"}'::jsonb
  );

  if result_disposition <> 'skipped' then
    raise exception
      'expected skipped on replay, got %',
      result_disposition;
  end if;

  select count(*)
  into binding_count
  from public.provider_bindings pb
  where
    pb.organization_id =
      '41000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '44000000-0000-0000-0000-000000000001'
    and pb.provider = 'csv'
    and pb.resource_type = 'location'
    and pb.external_id = 'WAREHOUSE-DXB';

  if binding_count <> 1 then
    raise exception
      'expected one durable location binding, got %',
      binding_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Metadata reconciliation allowed, identity still skipped
-- ---------------------------------------------------------------------------

do $$
declare
  result_disposition text;
  metadata jsonb;
begin
  select disposition
  into result_disposition
  from public.csv_bind_location(
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'WAREHOUSE-DXB',
    '43000000-0000-0000-0000-000000000001',
    '{"configuredBy":"merchant","label":"Main"}'::jsonb
  );

  if result_disposition <> 'skipped' then
    raise exception
      'expected skipped during metadata reconciliation, got %',
      result_disposition;
  end if;

  select pb.source_metadata
  into metadata
  from public.provider_bindings pb
  where
    pb.organization_id =
      '41000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '44000000-0000-0000-0000-000000000001'
    and pb.provider = 'csv'
    and pb.resource_type = 'location'
    and pb.external_id = 'WAREHOUSE-DXB';

  if metadata is distinct from
    '{"configuredBy":"merchant","label":"Main"}'::jsonb
  then
    raise exception
      'expected metadata reconciliation, got %',
      metadata;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Same durable identity -> different canonical location => rejected
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    perform *
    from public.csv_bind_location(
      '41000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000001',
      'WAREHOUSE-DXB',
      '43000000-0000-0000-0000-000000000002',
      null
    );

    raise exception
      'expected rebind conflict';
  exception
    when others then
      if sqlerrm not like
        '%already bound to another canonical location%'
        and sqlerrm not like
        '%outside trusted store scope%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Cross-store target => rejected
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    perform *
    from public.csv_bind_location(
      '41000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000001',
      'OTHER-LOCATION',
      '43000000-0000-0000-0000-000000000002',
      null
    );

    raise exception
      'expected cross-store rejection';
  exception
    when others then
      if sqlerrm not like
        '%outside trusted store scope%'
      then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Degraded integration => rejected
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    perform *
    from public.csv_bind_location(
      '41000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000002',
      'DEGRADED-LOCATION',
      '43000000-0000-0000-0000-000000000001',
      null
    );

    raise exception
      'expected degraded integration rejection';
  exception
    when others then
      if sqlerrm not like
        '%requires active integration%'
      then
        raise;
      end if;
  end;
end;
$$;

rollback;
