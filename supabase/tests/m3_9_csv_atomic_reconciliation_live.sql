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
  '10000000-0000-0000-0000-000000000001',
  'M3.9 Test Org',
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
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'M3.9 Test Store',
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
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'csv',
  'active',
  'M3.9 CSV',
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 1. First import => imported + one product + one binding
-- ---------------------------------------------------------------------------

do $$
declare
  result_id uuid;
  result_disposition text;
  product_count integer;
  binding_count integer;
begin
  select
    canonical_entity_id,
    disposition
  into
    result_id,
    result_disposition
  from public.csv_reconcile_product(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'PROD-001',
    null,
    '{"adapterVersion":"csv-product-v1"}'::jsonb,
    'Original Product',
    'Brand A',
    'Category A',
    'active'
  );

  if result_disposition <> 'imported' then
    raise exception
      'expected imported, got %',
      result_disposition;
  end if;

  select count(*)
  into product_count
  from public.products p
  where
    p.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and p.store_id =
      '20000000-0000-0000-0000-000000000001';

  if product_count <> 1 then
    raise exception
      'expected one product after first import, got %',
      product_count;
  end if;

  select count(*)
  into binding_count
  from public.provider_bindings pb
  where
    pb.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '30000000-0000-0000-0000-000000000001'
    and pb.provider = 'csv'
    and pb.resource_type = 'product'
    and pb.external_id = 'PROD-001'
    and pb.canonical_entity_id = result_id;

  if binding_count <> 1 then
    raise exception
      'expected one product binding after first import, got %',
      binding_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Exact replay => skipped + same canonical ID + no duplicates
-- ---------------------------------------------------------------------------

do $$
declare
  before_id uuid;
  replay_id uuid;
  result_disposition text;
  product_count integer;
  binding_count integer;
begin
  select pb.canonical_entity_id
  into before_id
  from public.provider_bindings pb
  where
    pb.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '30000000-0000-0000-0000-000000000001'
    and pb.provider = 'csv'
    and pb.resource_type = 'product'
    and pb.external_id = 'PROD-001';

  select
    canonical_entity_id,
    disposition
  into
    replay_id,
    result_disposition
  from public.csv_reconcile_product(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'PROD-001',
    null,
    '{"adapterVersion":"csv-product-v1"}'::jsonb,
    'Original Product',
    'Brand A',
    'Category A',
    'active'
  );

  if result_disposition <> 'skipped' then
    raise exception
      'expected skipped on exact replay, got %',
      result_disposition;
  end if;

  if replay_id is distinct from before_id then
    raise exception
      'exact replay changed canonical product ID';
  end if;

  select count(*)
  into product_count
  from public.products p
  where
    p.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and p.store_id =
      '20000000-0000-0000-0000-000000000001';

  if product_count <> 1 then
    raise exception
      'exact replay created duplicate product';
  end if;

  select count(*)
  into binding_count
  from public.provider_bindings pb
  where
    pb.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '30000000-0000-0000-0000-000000000001'
    and pb.provider = 'csv'
    and pb.resource_type = 'product'
    and pb.external_id = 'PROD-001';

  if binding_count <> 1 then
    raise exception
      'exact replay created duplicate binding';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Mutable change => updated + same canonical ID
-- ---------------------------------------------------------------------------

do $$
declare
  before_id uuid;
  updated_id uuid;
  result_disposition text;
  stored_title text;
  product_count integer;
  binding_count integer;
begin
  select pb.canonical_entity_id
  into before_id
  from public.provider_bindings pb
  where
    pb.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '30000000-0000-0000-0000-000000000001'
    and pb.provider = 'csv'
    and pb.resource_type = 'product'
    and pb.external_id = 'PROD-001';

  select
    canonical_entity_id,
    disposition
  into
    updated_id,
    result_disposition
  from public.csv_reconcile_product(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'PROD-001',
    null,
    '{"adapterVersion":"csv-product-v1"}'::jsonb,
    'Updated Product',
    'Brand A',
    'Category A',
    'active'
  );

  if result_disposition <> 'updated' then
    raise exception
      'expected updated, got %',
      result_disposition;
  end if;

  if updated_id is distinct from before_id then
    raise exception
      'mutable update changed canonical product ID';
  end if;

  select p.title
  into stored_title
  from public.products p
  where p.id = updated_id;

  if stored_title <> 'Updated Product' then
    raise exception
      'product mutable field did not reconcile';
  end if;

  select count(*)
  into product_count
  from public.products p
  where
    p.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and p.store_id =
      '20000000-0000-0000-0000-000000000001';

  if product_count <> 1 then
    raise exception
      'update created duplicate product';
  end if;

  select count(*)
  into binding_count
  from public.provider_bindings pb
  where
    pb.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '30000000-0000-0000-0000-000000000001'
    and pb.provider = 'csv'
    and pb.resource_type = 'product'
    and pb.external_id = 'PROD-001';

  if binding_count <> 1 then
    raise exception
      'update created duplicate binding';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Binding failure => canonical insert must roll back
--
-- Force binding creation failure using invalid source_metadata JSON type.
-- Canonical INSERT happens first inside the RPC.
-- ProviderBinding INSERT must reject the JSON array.
-- PostgreSQL statement atomicity must roll back the preceding product insert.
-- ---------------------------------------------------------------------------

do $$
declare
  before_product_count integer;
  after_product_count integer;
  bad_binding_count integer;
  caught boolean := false;
begin
  select count(*)
  into before_product_count
  from public.products p
  where
    p.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and p.store_id =
      '20000000-0000-0000-0000-000000000001';

  begin
    perform *
    from public.csv_reconcile_product(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'PROD-ROLLBACK',
      null,
      '["not-an-object"]'::jsonb,
      'Must Roll Back',
      null,
      null,
      'active'
    );

  exception
    when check_violation then
      caught := true;
  end;

  if not caught then
    raise exception
      'expected ProviderBinding source_metadata constraint failure';
  end if;

  select count(*)
  into after_product_count
  from public.products p
  where
    p.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and p.store_id =
      '20000000-0000-0000-0000-000000000001';

  if after_product_count <> before_product_count then
    raise exception
      'atomicity failure: canonical product survived failed binding creation';
  end if;

  select count(*)
  into bad_binding_count
  from public.provider_bindings pb
  where
    pb.organization_id =
      '10000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '30000000-0000-0000-0000-000000000001'
    and pb.provider = 'csv'
    and pb.resource_type = 'product'
    and pb.external_id = 'PROD-ROLLBACK';

  if bad_binding_count <> 0 then
    raise exception
      'failed binding unexpectedly persisted';
  end if;
end;
$$;

rollback;
