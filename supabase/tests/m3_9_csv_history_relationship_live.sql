begin;

-- ---------------------------------------------------------------------------
-- Foundation fixtures
-- ---------------------------------------------------------------------------

insert into public.organizations (
  id,
  name,
  country_code,
  default_currency,
  timezone
)
values (
  '11000000-0000-0000-0000-000000000001',
  'M3.9C Test Org',
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
  '21000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'M3.9C Test Store',
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
values (
  '22000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'Main',
  'active',
  'MAIN'
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
  '31000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'csv',
  'active',
  'M3.9C CSV',
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Product + variant fixture through M3.9B RPCs
-- ---------------------------------------------------------------------------

do $$
declare
  product_id uuid;
  variant_id uuid;
  d text;
begin
  select
    canonical_entity_id,
    disposition
  into
    product_id,
    d
  from public.csv_reconcile_product(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    'PRODUCT-C',
    null,
    '{}'::jsonb,
    'Inventory Product',
    null,
    null,
    'active'
  );

  if d <> 'imported' then
    raise exception
      'product fixture was not imported';
  end if;

  select
    canonical_entity_id,
    disposition
  into
    variant_id,
    d
  from public.csv_reconcile_product_variant(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    'VARIANT-C',
    'PRODUCT-C',
    '{}'::jsonb,
    product_id,
    'SKU-C',
    null,
    null,
    'active',
    null,
    null,
    null
  );

  if d <> 'imported' then
    raise exception
      'variant fixture was not imported';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier fixture
-- ---------------------------------------------------------------------------

do $$
declare
  supplier_id uuid;
  d text;
begin
  select
    canonical_entity_id,
    disposition
  into
    supplier_id,
    d
  from public.csv_reconcile_supplier(
    '11000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    'SUPPLIER-C',
    null,
    '{}'::jsonb,
    'Supplier C',
    5,
    'USD',
    null,
    null
  );

  if d <> 'imported' then
    raise exception
      'supplier fixture was not imported';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Inventory always appends immutable history.
-- ---------------------------------------------------------------------------

do $$
declare
  variant_id uuid;
  first_id uuid;
  second_id uuid;
  d text;
  snapshot_count integer;
begin
  select pb.canonical_entity_id
  into variant_id
  from public.provider_bindings pb
  where
    pb.organization_id =
      '11000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '31000000-0000-0000-0000-000000000001'
    and pb.resource_type = 'product_variant'
    and pb.external_id = 'VARIANT-C';

  select
    canonical_entity_id,
    disposition
  into
    first_id,
    d
  from public.csv_append_inventory_snapshot(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    variant_id,
    '22000000-0000-0000-0000-000000000001',
    '2026-10-11T10:00:00Z',
    10,
    8,
    2,
    null
  );

  if d <> 'imported' then
    raise exception
      'first inventory observation was not imported';
  end if;

  select
    canonical_entity_id,
    disposition
  into
    second_id,
    d
  from public.csv_append_inventory_snapshot(
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    variant_id,
    '22000000-0000-0000-0000-000000000001',
    '2026-10-11T10:00:00Z',
    10,
    8,
    2,
    null
  );

  if d <> 'imported' then
    raise exception
      'second accepted inventory observation was not appended';
  end if;

  if first_id = second_id then
    raise exception
      'inventory append reused historical row identity';
  end if;

  select count(*)
  into snapshot_count
  from public.inventory_snapshots s
  where
    s.organization_id =
      '11000000-0000-0000-0000-000000000001';

  if snapshot_count <> 2 then
    raise exception
      'expected two immutable inventory observations, got %',
      snapshot_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Inventory remains immutable.
-- ---------------------------------------------------------------------------

do $$
declare
  snapshot_id uuid;
  caught boolean := false;
begin
  select s.id
  into snapshot_id
  from public.inventory_snapshots s
  where
    s.organization_id =
      '11000000-0000-0000-0000-000000000001'
  limit 1;

  begin
    update public.inventory_snapshots
    set on_hand_quantity = 999
    where id = snapshot_id;

  exception
    when others then
      if sqlerrm like
        '%inventory_snapshots are immutable historical evidence%'
      then
        caught := true;
      else
        raise;
      end if;
  end;

  if not caught then
    raise exception
      'inventory snapshot mutation was unexpectedly allowed';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Supplier-product import, replay, update.
-- ---------------------------------------------------------------------------

do $$
declare
  v_supplier_id uuid;
  v_variant_id uuid;
  relationship_id uuid;
  replay_id uuid;
  updated_id uuid;
  d text;
  relation_count integer;
  stored_cost numeric;
begin
  select pb.canonical_entity_id
  into v_supplier_id
  from public.provider_bindings pb
  where
    pb.organization_id =
      '11000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '31000000-0000-0000-0000-000000000001'
    and pb.resource_type = 'supplier'
    and pb.external_id = 'SUPPLIER-C';

  select pb.canonical_entity_id
  into v_variant_id
  from public.provider_bindings pb
  where
    pb.organization_id =
      '11000000-0000-0000-0000-000000000001'
    and pb.integration_id =
      '31000000-0000-0000-0000-000000000001'
    and pb.resource_type = 'product_variant'
    and pb.external_id = 'VARIANT-C';

  select
    canonical_entity_id,
    disposition
  into
    relationship_id,
    d
  from public.csv_reconcile_supplier_product(
    '11000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    v_supplier_id,
    v_variant_id,
    'SUP-SKU-C',
    4.25,
    'USD',
    5,
    10,
    2,
    true
  );

  if d <> 'imported' then
    raise exception
      'supplier-product first reconciliation must import';
  end if;

  select
    canonical_entity_id,
    disposition
  into
    replay_id,
    d
  from public.csv_reconcile_supplier_product(
    '11000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    v_supplier_id,
    v_variant_id,
    'SUP-SKU-C',
    4.25,
    'USD',
    5,
    10,
    2,
    true
  );

  if d <> 'skipped' then
    raise exception
      'supplier-product exact replay must skip';
  end if;

  if replay_id is distinct from relationship_id then
    raise exception
      'supplier-product replay changed canonical relationship ID';
  end if;

  select
    canonical_entity_id,
    disposition
  into
    updated_id,
    d
  from public.csv_reconcile_supplier_product(
    '11000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    v_supplier_id,
    v_variant_id,
    'SUP-SKU-C',
    4.75,
    'USD',
    7,
    12,
    3,
    false
  );

  if d <> 'updated' then
    raise exception
      'supplier-product changed terms must update';
  end if;

  if updated_id is distinct from relationship_id then
    raise exception
      'supplier-product update changed canonical relationship ID';
  end if;

  select count(*)
  into relation_count
  from public.supplier_products sp
  where
    sp.organization_id =
      '11000000-0000-0000-0000-000000000001'
    and sp.supplier_id = v_supplier_id
    and sp.variant_id = v_variant_id;

  if relation_count <> 1 then
    raise exception
      'supplier-product reconciliation created duplicate relationship';
  end if;

  select sp.unit_cost_amount
  into stored_cost
  from public.supplier_products sp
  where sp.id = relationship_id;

  if stored_cost <> 4.75 then
    raise exception
      'supplier-product mutable terms did not reconcile';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. No ProviderBinding for inventory or supplier_product.
-- ---------------------------------------------------------------------------

do $$
declare
  unexpected_count integer;
begin
  select count(*)
  into unexpected_count
  from public.provider_bindings pb
  where
    pb.organization_id =
      '11000000-0000-0000-0000-000000000001'
    and pb.resource_type not in (
      'product',
      'product_variant',
      'supplier'
    );

  if unexpected_count <> 0 then
    raise exception
      'M3.9C invented unexpected ProviderBinding records';
  end if;
end;
$$;

rollback;
