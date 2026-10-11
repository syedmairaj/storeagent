begin;

-- ============================================================================
-- M3.9C privilege boundary
-- ============================================================================

do $$
declare
  authenticated_inventory boolean;
  service_inventory boolean;
  authenticated_supplier_product boolean;
  service_supplier_product boolean;
begin
  select has_function_privilege(
    'authenticated',
    'public.csv_append_inventory_snapshot(uuid,uuid,uuid,uuid,uuid,timestamptz,integer,integer,integer,integer)',
    'execute'
  )
  into authenticated_inventory;

  select has_function_privilege(
    'service_role',
    'public.csv_append_inventory_snapshot(uuid,uuid,uuid,uuid,uuid,timestamptz,integer,integer,integer,integer)',
    'execute'
  )
  into service_inventory;

  select has_function_privilege(
    'authenticated',
    'public.csv_reconcile_supplier_product(uuid,uuid,uuid,uuid,text,numeric,text,integer,integer,integer,boolean)',
    'execute'
  )
  into authenticated_supplier_product;

  select has_function_privilege(
    'service_role',
    'public.csv_reconcile_supplier_product(uuid,uuid,uuid,uuid,text,numeric,text,integer,integer,integer,boolean)',
    'execute'
  )
  into service_supplier_product;

  if authenticated_inventory then
    raise exception
      'authenticated must not execute csv_append_inventory_snapshot';
  end if;

  if not service_inventory then
    raise exception
      'service_role must execute csv_append_inventory_snapshot';
  end if;

  if authenticated_supplier_product then
    raise exception
      'authenticated must not execute csv_reconcile_supplier_product';
  end if;

  if not service_supplier_product then
    raise exception
      'service_role must execute csv_reconcile_supplier_product';
  end if;
end;
$$;

-- ============================================================================
-- Two isolated tenant fixtures
-- ============================================================================

insert into public.organizations (
  id,
  name,
  country_code,
  default_currency,
  timezone
)
values
(
  '12000000-0000-0000-0000-000000000001',
  'M3.9C Adversarial Org A',
  null,
  'USD',
  'UTC'
),
(
  '12000000-0000-0000-0000-000000000002',
  'M3.9C Adversarial Org B',
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
  '22000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  'Org A Store',
  'active',
  'USD',
  'UTC'
),
(
  '22000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000002',
  'Org B Store',
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
  '23000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'Org A Main',
  'active',
  'A-MAIN'
),
(
  '23000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  'Org B Main',
  'active',
  'B-MAIN'
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
  '32000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'csv',
  'active',
  'Org A CSV',
  '{}'::jsonb
),
(
  '32000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  'csv',
  'active',
  'Org B CSV',
  '{}'::jsonb
),
(
  '32000000-0000-0000-0000-000000000003',
  '12000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'csv',
  'degraded',
  'Org A Degraded CSV',
  '{}'::jsonb
);

-- ============================================================================
-- Products + variants
-- ============================================================================

insert into public.products (
  id,
  organization_id,
  store_id,
  title,
  brand,
  category,
  status
)
values
(
  '42000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'Org A Product',
  null,
  null,
  'active'
),
(
  '42000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  'Org B Product',
  null,
  null,
  'active'
);

insert into public.product_variants (
  id,
  organization_id,
  store_id,
  product_id,
  sku,
  barcode,
  title,
  status,
  cost_amount,
  selling_price_amount,
  currency
)
values
(
  '43000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'ORG-A-SKU',
  null,
  null,
  'active',
  null,
  null,
  null
),
(
  '43000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  '42000000-0000-0000-0000-000000000002',
  'ORG-B-SKU',
  null,
  null,
  'active',
  null,
  null,
  null
);

-- ============================================================================
-- Suppliers
-- ============================================================================

insert into public.suppliers (
  id,
  organization_id,
  name,
  default_lead_time_days,
  currency,
  email,
  phone
)
values
(
  '52000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  'Org A Supplier',
  5,
  'USD',
  null,
  null
),
(
  '52000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000002',
  'Org B Supplier',
  5,
  'USD',
  null,
  null
);

-- ============================================================================
-- Cross-tenant inventory: Org A scope must not accept Org B variant.
-- ============================================================================

do $$
declare
  caught boolean := false;
begin
  begin
    perform *
    from public.csv_append_inventory_snapshot(
      '12000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      '43000000-0000-0000-0000-000000000002',
      '23000000-0000-0000-0000-000000000001',
      '2026-10-11T12:00:00Z',
      10,
      10,
      0,
      null
    );

  exception
    when others then
      if sqlerrm =
        'CSV inventory variant is outside trusted scope'
      then
        caught := true;
      else
        raise;
      end if;
  end;

  if not caught then
    raise exception
      'cross-tenant inventory variant was unexpectedly accepted';
  end if;
end;
$$;

-- ============================================================================
-- Cross-tenant inventory: Org A scope must not accept Org B location.
-- ============================================================================

do $$
declare
  caught boolean := false;
begin
  begin
    perform *
    from public.csv_append_inventory_snapshot(
      '12000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      '43000000-0000-0000-0000-000000000001',
      '23000000-0000-0000-0000-000000000002',
      '2026-10-11T12:01:00Z',
      10,
      10,
      0,
      null
    );

  exception
    when others then
      if sqlerrm =
        'CSV inventory location is outside trusted scope'
      then
        caught := true;
      else
        raise;
      end if;
  end;

  if not caught then
    raise exception
      'cross-tenant inventory location was unexpectedly accepted';
  end if;
end;
$$;

-- ============================================================================
-- Non-active integration must fail closed.
-- ============================================================================

do $$
declare
  caught boolean := false;
begin
  begin
    perform *
    from public.csv_append_inventory_snapshot(
      '12000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000003',
      '43000000-0000-0000-0000-000000000001',
      '23000000-0000-0000-0000-000000000001',
      '2026-10-11T12:02:00Z',
      10,
      10,
      0,
      null
    );

  exception
    when others then
      if sqlerrm =
        'CSV reconciliation requires active integration'
      then
        caught := true;
      else
        raise;
      end if;
  end;

  if not caught then
    raise exception
      'non-active integration was unexpectedly accepted';
  end if;
end;
$$;

-- ============================================================================
-- Cross-tenant supplier-product: Org A supplier + Org B variant.
-- ============================================================================

do $$
declare
  caught boolean := false;
begin
  begin
    perform *
    from public.csv_reconcile_supplier_product(
      '12000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      '43000000-0000-0000-0000-000000000002',
      'BAD-CROSS-TENANT',
      1.00,
      'USD',
      1,
      1,
      1,
      false
    );

  exception
    when others then
      if sqlerrm =
        'CSV supplier-product variant is outside trusted organization'
      then
        caught := true;
      else
        raise;
      end if;
  end;

  if not caught then
    raise exception
      'cross-tenant supplier-product variant was unexpectedly accepted';
  end if;
end;
$$;

-- ============================================================================
-- Cross-tenant supplier-product: Org B supplier + Org A variant.
-- ============================================================================

do $$
declare
  caught boolean := false;
begin
  begin
    perform *
    from public.csv_reconcile_supplier_product(
      '12000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000002',
      '43000000-0000-0000-0000-000000000001',
      'BAD-CROSS-TENANT',
      1.00,
      'USD',
      1,
      1,
      1,
      false
    );

  exception
    when others then
      if sqlerrm =
        'CSV supplier-product supplier is outside trusted organization'
      then
        caught := true;
      else
        raise;
      end if;
  end;

  if not caught then
    raise exception
      'cross-tenant supplier-product supplier was unexpectedly accepted';
  end if;
end;
$$;

-- ============================================================================
-- Verify failed adversarial attempts persisted nothing.
-- ============================================================================

do $$
declare
  snapshot_count integer;
  supplier_product_count integer;
begin
  select count(*)
  into snapshot_count
  from public.inventory_snapshots s
  where
    s.organization_id in (
      '12000000-0000-0000-0000-000000000001',
      '12000000-0000-0000-0000-000000000002'
    );

  if snapshot_count <> 0 then
    raise exception
      'failed adversarial inventory operations persisted rows';
  end if;

  select count(*)
  into supplier_product_count
  from public.supplier_products sp
  where
    sp.organization_id in (
      '12000000-0000-0000-0000-000000000001',
      '12000000-0000-0000-0000-000000000002'
    );

  if supplier_product_count <> 0 then
    raise exception
      'failed adversarial supplier-product operations persisted rows';
  end if;
end;
$$;

rollback;
