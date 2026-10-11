-- StoreAgent M3.9B
-- Atomic CSV current-state reconciliation.
--
-- Each RPC owns exactly one canonical resource transaction:
--
--   canonical create + first ProviderBinding
--
-- or
--
--   existing ProviderBinding -> same canonical entity reconciliation
--
-- The RPCs are intentionally:
--   - CSV-only
--   - trusted service-role only
--   - explicit per canonical resource
--   - free of dynamic SQL
--   - incapable of silently rebinding ProviderBinding identity
--
-- Parent/relationship IDs supplied to child RPCs must already have been
-- resolved from trusted canonical/provider-binding state by orchestration.
--
-- Inventory snapshots and supplier_products are NOT handled here.

-- -----------------------------------------------------------------------------
-- Shared CSV integration scope assertion.
-- -----------------------------------------------------------------------------

create or replace function public.assert_csv_reconciliation_scope(
  p_organization_id uuid,
  p_integration_id uuid,
  p_store_id uuid,
  p_requires_store boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration_store_id uuid;
  integration_status text;
begin
  select
    i.store_id,
    i.status
  into
    integration_store_id,
    integration_status
  from public.integrations i
  where
    i.id = p_integration_id
    and i.organization_id = p_organization_id
    and i.provider = 'csv';

  if not found then
    raise exception
      'CSV reconciliation integration is not trusted to organization/provider';
  end if;

  if integration_status <> 'active' then
    raise exception
      'CSV reconciliation requires active integration';
  end if;

  if p_requires_store then
    if p_store_id is null then
      raise exception
        'CSV store-scoped reconciliation requires store';
    end if;

    if integration_store_id is null then
      raise exception
        'CSV store-scoped reconciliation requires store-scoped integration';
    end if;

    if integration_store_id is distinct from p_store_id then
      raise exception
        'CSV reconciliation store does not match integration store';
    end if;
  else
    -- Organization-scoped resources may be imported through either an
    -- organization-scoped or store-scoped CSV integration. The integration
    -- still proves organization/provider authority.
    if
      p_store_id is not null
      and integration_store_id is not null
      and integration_store_id is distinct from p_store_id
    then
      raise exception
        'CSV reconciliation store does not match integration store';
    end if;
  end if;
end;
$$;

revoke all
on function public.assert_csv_reconciliation_scope(
  uuid,
  uuid,
  uuid,
  boolean
)
from public, anon, authenticated;

grant execute
on function public.assert_csv_reconciliation_scope(
  uuid,
  uuid,
  uuid,
  boolean
)
to service_role;

-- -----------------------------------------------------------------------------
-- PRODUCT
-- -----------------------------------------------------------------------------

create or replace function public.csv_reconcile_product(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_external_id text,
  p_external_parent_id text,
  p_source_metadata jsonb,
  p_title text,
  p_brand text,
  p_category text,
  p_status text
)
returns table (
  canonical_entity_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_binding public.provider_bindings%rowtype;
  existing_product public.products%rowtype;
  created_id uuid;
  canonical_changed boolean;
  metadata_changed boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  select pb.*
  into existing_binding
  from public.provider_bindings pb
  where
    pb.organization_id = p_organization_id
    and pb.integration_id = p_integration_id
    and pb.provider = 'csv'
    and pb.resource_type = 'product'
    and pb.external_id = p_external_id
  for update;

  if not found then
    insert into public.products (
      organization_id,
      store_id,
      title,
      brand,
      category,
      status
    )
    values (
      p_organization_id,
      p_store_id,
      p_title,
      p_brand,
      p_category,
      p_status
    )
    returning id
    into created_id;

    insert into public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id,
      external_parent_id,
      source_metadata
    )
    values (
      p_organization_id,
      p_integration_id,
      'csv',
      'product',
      created_id,
      p_external_id,
      p_external_parent_id,
      p_source_metadata
    );

    return query
    select created_id, 'imported'::text;

    return;
  end if;

  select p.*
  into existing_product
  from public.products p
  where
    p.id = existing_binding.canonical_entity_id
    and p.organization_id = p_organization_id
    and p.store_id = p_store_id
  for update;

  if not found then
    raise exception
      'CSV product binding canonical target is outside trusted scope';
  end if;

  canonical_changed :=
    existing_product.title is distinct from p_title
    or existing_product.brand is distinct from p_brand
    or existing_product.category is distinct from p_category
    or existing_product.status is distinct from p_status;

  metadata_changed :=
    existing_binding.external_parent_id is distinct from p_external_parent_id
    or existing_binding.source_metadata is distinct from p_source_metadata;

  if canonical_changed then
    update public.products
    set
      title = p_title,
      brand = p_brand,
      category = p_category,
      status = p_status
    where id = existing_product.id;
  end if;

  if metadata_changed then
    update public.provider_bindings
    set
      external_parent_id = p_external_parent_id,
      source_metadata = p_source_metadata
    where id = existing_binding.id;
  end if;

  return query
  select
    existing_product.id,
    case
      when canonical_changed or metadata_changed
        then 'updated'::text
      else 'skipped'::text
    end;
end;
$$;

revoke all
on function public.csv_reconcile_product(
  uuid, uuid, uuid, text, text, jsonb,
  text, text, text, text
)
from public, anon, authenticated;

grant execute
on function public.csv_reconcile_product(
  uuid, uuid, uuid, text, text, jsonb,
  text, text, text, text
)
to service_role;

-- -----------------------------------------------------------------------------
-- PRODUCT VARIANT
-- -----------------------------------------------------------------------------

create or replace function public.csv_reconcile_product_variant(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_external_id text,
  p_external_parent_id text,
  p_source_metadata jsonb,
  p_product_id uuid,
  p_sku text,
  p_barcode text,
  p_title text,
  p_status text,
  p_cost_amount numeric,
  p_selling_price_amount numeric,
  p_currency text
)
returns table (
  canonical_entity_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_binding public.provider_bindings%rowtype;
  existing_variant public.product_variants%rowtype;
  created_id uuid;
  canonical_changed boolean;
  metadata_changed boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  -- Explicit parent proof before mutation.
  perform 1
  from public.products p
  where
    p.id = p_product_id
    and p.organization_id = p_organization_id
    and p.store_id = p_store_id;

  if not found then
    raise exception
      'CSV product variant parent product is outside trusted scope';
  end if;

  select pb.*
  into existing_binding
  from public.provider_bindings pb
  where
    pb.organization_id = p_organization_id
    and pb.integration_id = p_integration_id
    and pb.provider = 'csv'
    and pb.resource_type = 'product_variant'
    and pb.external_id = p_external_id
  for update;

  if not found then
    insert into public.product_variants (
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
    values (
      p_organization_id,
      p_store_id,
      p_product_id,
      p_sku,
      p_barcode,
      p_title,
      p_status,
      p_cost_amount,
      p_selling_price_amount,
      p_currency
    )
    returning id
    into created_id;

    insert into public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id,
      external_parent_id,
      source_metadata
    )
    values (
      p_organization_id,
      p_integration_id,
      'csv',
      'product_variant',
      created_id,
      p_external_id,
      p_external_parent_id,
      p_source_metadata
    );

    return query
    select created_id, 'imported'::text;

    return;
  end if;

  select pv.*
  into existing_variant
  from public.product_variants pv
  where
    pv.id = existing_binding.canonical_entity_id
    and pv.organization_id = p_organization_id
    and pv.store_id = p_store_id
  for update;

  if not found then
    raise exception
      'CSV product variant binding canonical target is outside trusted scope';
  end if;

  -- Canonical parent identity is immutable.
  if existing_variant.product_id is distinct from p_product_id then
    raise exception
      'CSV product variant canonical parent cannot be reassigned';
  end if;

  canonical_changed :=
    existing_variant.sku is distinct from p_sku
    or existing_variant.barcode is distinct from p_barcode
    or existing_variant.title is distinct from p_title
    or existing_variant.status is distinct from p_status
    or existing_variant.cost_amount is distinct from p_cost_amount
    or existing_variant.selling_price_amount is distinct from p_selling_price_amount
    or existing_variant.currency is distinct from p_currency;

  metadata_changed :=
    existing_binding.external_parent_id is distinct from p_external_parent_id
    or existing_binding.source_metadata is distinct from p_source_metadata;

  if canonical_changed then
    update public.product_variants
    set
      sku = p_sku,
      barcode = p_barcode,
      title = p_title,
      status = p_status,
      cost_amount = p_cost_amount,
      selling_price_amount = p_selling_price_amount,
      currency = p_currency
    where id = existing_variant.id;
  end if;

  if metadata_changed then
    update public.provider_bindings
    set
      external_parent_id = p_external_parent_id,
      source_metadata = p_source_metadata
    where id = existing_binding.id;
  end if;

  return query
  select
    existing_variant.id,
    case
      when canonical_changed or metadata_changed
        then 'updated'::text
      else 'skipped'::text
    end;
end;
$$;

revoke all
on function public.csv_reconcile_product_variant(
  uuid, uuid, uuid, text, text, jsonb, uuid,
  text, text, text, text, numeric, numeric, text
)
from public, anon, authenticated;

grant execute
on function public.csv_reconcile_product_variant(
  uuid, uuid, uuid, text, text, jsonb, uuid,
  text, text, text, text, numeric, numeric, text
)
to service_role;

-- -----------------------------------------------------------------------------
-- ORDER
-- -----------------------------------------------------------------------------

create or replace function public.csv_reconcile_order(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_external_id text,
  p_external_parent_id text,
  p_source_metadata jsonb,
  p_external_reference text,
  p_status text,
  p_ordered_at timestamptz,
  p_currency text,
  p_gross_amount numeric,
  p_discount_amount numeric,
  p_net_amount numeric
)
returns table (
  canonical_entity_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_binding public.provider_bindings%rowtype;
  existing_order public.orders%rowtype;
  created_id uuid;
  canonical_changed boolean;
  metadata_changed boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  select pb.*
  into existing_binding
  from public.provider_bindings pb
  where
    pb.organization_id = p_organization_id
    and pb.integration_id = p_integration_id
    and pb.provider = 'csv'
    and pb.resource_type = 'order'
    and pb.external_id = p_external_id
  for update;

  if not found then
    insert into public.orders (
      organization_id,
      store_id,
      external_reference,
      status,
      ordered_at,
      currency,
      gross_amount,
      discount_amount,
      net_amount,
      source
    )
    values (
      p_organization_id,
      p_store_id,
      p_external_reference,
      p_status,
      p_ordered_at,
      p_currency,
      p_gross_amount,
      p_discount_amount,
      p_net_amount,
      'csv'
    )
    returning id
    into created_id;

    insert into public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id,
      external_parent_id,
      source_metadata
    )
    values (
      p_organization_id,
      p_integration_id,
      'csv',
      'order',
      created_id,
      p_external_id,
      p_external_parent_id,
      p_source_metadata
    );

    return query
    select created_id, 'imported'::text;

    return;
  end if;

  select o.*
  into existing_order
  from public.orders o
  where
    o.id = existing_binding.canonical_entity_id
    and o.organization_id = p_organization_id
    and o.store_id = p_store_id
  for update;

  if not found then
    raise exception
      'CSV order binding canonical target is outside trusted scope';
  end if;

  canonical_changed :=
    existing_order.external_reference is distinct from p_external_reference
    or existing_order.status is distinct from p_status
    or existing_order.ordered_at is distinct from p_ordered_at
    or existing_order.currency is distinct from p_currency
    or existing_order.gross_amount is distinct from p_gross_amount
    or existing_order.discount_amount is distinct from p_discount_amount
    or existing_order.net_amount is distinct from p_net_amount;

  metadata_changed :=
    existing_binding.external_parent_id is distinct from p_external_parent_id
    or existing_binding.source_metadata is distinct from p_source_metadata;

  if canonical_changed then
    update public.orders
    set
      external_reference = p_external_reference,
      status = p_status,
      ordered_at = p_ordered_at,
      currency = p_currency,
      gross_amount = p_gross_amount,
      discount_amount = p_discount_amount,
      net_amount = p_net_amount
    where id = existing_order.id;
  end if;

  if metadata_changed then
    update public.provider_bindings
    set
      external_parent_id = p_external_parent_id,
      source_metadata = p_source_metadata
    where id = existing_binding.id;
  end if;

  return query
  select
    existing_order.id,
    case
      when canonical_changed or metadata_changed
        then 'updated'::text
      else 'skipped'::text
    end;
end;
$$;

revoke all
on function public.csv_reconcile_order(
  uuid, uuid, uuid, text, text, jsonb,
  text, text, timestamptz, text, numeric, numeric, numeric
)
from public, anon, authenticated;

grant execute
on function public.csv_reconcile_order(
  uuid, uuid, uuid, text, text, jsonb,
  text, text, timestamptz, text, numeric, numeric, numeric
)
to service_role;

-- -----------------------------------------------------------------------------
-- ORDER ITEM
-- -----------------------------------------------------------------------------

create or replace function public.csv_reconcile_order_item(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_external_id text,
  p_external_parent_id text,
  p_source_metadata jsonb,
  p_order_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_quantity integer,
  p_unit_price_amount numeric,
  p_discount_amount numeric,
  p_unit_cost_amount numeric,
  p_currency text
)
returns table (
  canonical_entity_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_binding public.provider_bindings%rowtype;
  existing_item public.order_items%rowtype;
  created_id uuid;
  canonical_changed boolean;
  metadata_changed boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  -- Parent and variant/location ownership are also enforced by canonical FKs.
  perform 1
  from public.orders o
  where
    o.id = p_order_id
    and o.organization_id = p_organization_id
    and o.store_id = p_store_id;

  if not found then
    raise exception
      'CSV order item parent order is outside trusted scope';
  end if;

  perform 1
  from public.product_variants pv
  where
    pv.id = p_variant_id
    and pv.organization_id = p_organization_id
    and pv.store_id = p_store_id;

  if not found then
    raise exception
      'CSV order item variant is outside trusted scope';
  end if;

  if p_location_id is not null then
    perform 1
    from public.locations l
    where
      l.id = p_location_id
      and l.organization_id = p_organization_id
      and l.store_id = p_store_id;

    if not found then
      raise exception
        'CSV order item location is outside trusted scope';
    end if;
  end if;

  select pb.*
  into existing_binding
  from public.provider_bindings pb
  where
    pb.organization_id = p_organization_id
    and pb.integration_id = p_integration_id
    and pb.provider = 'csv'
    and pb.resource_type = 'order_item'
    and pb.external_id = p_external_id
  for update;

  if not found then
    insert into public.order_items (
      organization_id,
      store_id,
      order_id,
      variant_id,
      location_id,
      quantity,
      unit_price_amount,
      discount_amount,
      unit_cost_amount,
      currency
    )
    values (
      p_organization_id,
      p_store_id,
      p_order_id,
      p_variant_id,
      p_location_id,
      p_quantity,
      p_unit_price_amount,
      p_discount_amount,
      p_unit_cost_amount,
      p_currency
    )
    returning id
    into created_id;

    insert into public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id,
      external_parent_id,
      source_metadata
    )
    values (
      p_organization_id,
      p_integration_id,
      'csv',
      'order_item',
      created_id,
      p_external_id,
      p_external_parent_id,
      p_source_metadata
    );

    return query
    select created_id, 'imported'::text;

    return;
  end if;

  select oi.*
  into existing_item
  from public.order_items oi
  where
    oi.id = existing_binding.canonical_entity_id
    and oi.organization_id = p_organization_id
    and oi.store_id = p_store_id
  for update;

  if not found then
    raise exception
      'CSV order item binding canonical target is outside trusted scope';
  end if;

  if
    existing_item.order_id is distinct from p_order_id
    or existing_item.variant_id is distinct from p_variant_id
  then
    raise exception
      'CSV order item canonical parent/variant cannot be reassigned';
  end if;

  canonical_changed :=
    existing_item.location_id is distinct from p_location_id
    or existing_item.quantity is distinct from p_quantity
    or existing_item.unit_price_amount is distinct from p_unit_price_amount
    or existing_item.discount_amount is distinct from p_discount_amount
    or existing_item.unit_cost_amount is distinct from p_unit_cost_amount
    or existing_item.currency is distinct from p_currency;

  metadata_changed :=
    existing_binding.external_parent_id is distinct from p_external_parent_id
    or existing_binding.source_metadata is distinct from p_source_metadata;

  if canonical_changed then
    update public.order_items
    set
      location_id = p_location_id,
      quantity = p_quantity,
      unit_price_amount = p_unit_price_amount,
      discount_amount = p_discount_amount,
      unit_cost_amount = p_unit_cost_amount,
      currency = p_currency
    where id = existing_item.id;
  end if;

  if metadata_changed then
    update public.provider_bindings
    set
      external_parent_id = p_external_parent_id,
      source_metadata = p_source_metadata
    where id = existing_binding.id;
  end if;

  return query
  select
    existing_item.id,
    case
      when canonical_changed or metadata_changed
        then 'updated'::text
      else 'skipped'::text
    end;
end;
$$;

revoke all
on function public.csv_reconcile_order_item(
  uuid, uuid, uuid, text, text, jsonb,
  uuid, uuid, uuid, integer, numeric, numeric, numeric, text
)
from public, anon, authenticated;

grant execute
on function public.csv_reconcile_order_item(
  uuid, uuid, uuid, text, text, jsonb,
  uuid, uuid, uuid, integer, numeric, numeric, numeric, text
)
to service_role;

-- -----------------------------------------------------------------------------
-- SUPPLIER
-- -----------------------------------------------------------------------------

create or replace function public.csv_reconcile_supplier(
  p_organization_id uuid,
  p_integration_id uuid,
  p_external_id text,
  p_external_parent_id text,
  p_source_metadata jsonb,
  p_name text,
  p_default_lead_time_days integer,
  p_currency text,
  p_email text,
  p_phone text
)
returns table (
  canonical_entity_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_binding public.provider_bindings%rowtype;
  existing_supplier public.suppliers%rowtype;
  created_id uuid;
  canonical_changed boolean;
  metadata_changed boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    null,
    false
  );

  select pb.*
  into existing_binding
  from public.provider_bindings pb
  where
    pb.organization_id = p_organization_id
    and pb.integration_id = p_integration_id
    and pb.provider = 'csv'
    and pb.resource_type = 'supplier'
    and pb.external_id = p_external_id
  for update;

  if not found then
    insert into public.suppliers (
      organization_id,
      name,
      default_lead_time_days,
      currency,
      email,
      phone
    )
    values (
      p_organization_id,
      p_name,
      p_default_lead_time_days,
      p_currency,
      p_email,
      p_phone
    )
    returning id
    into created_id;

    insert into public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id,
      external_parent_id,
      source_metadata
    )
    values (
      p_organization_id,
      p_integration_id,
      'csv',
      'supplier',
      created_id,
      p_external_id,
      p_external_parent_id,
      p_source_metadata
    );

    return query
    select created_id, 'imported'::text;

    return;
  end if;

  select s.*
  into existing_supplier
  from public.suppliers s
  where
    s.id = existing_binding.canonical_entity_id
    and s.organization_id = p_organization_id
  for update;

  if not found then
    raise exception
      'CSV supplier binding canonical target is outside trusted scope';
  end if;

  canonical_changed :=
    existing_supplier.name is distinct from p_name
    or existing_supplier.default_lead_time_days is distinct from p_default_lead_time_days
    or existing_supplier.currency is distinct from p_currency
    or existing_supplier.email is distinct from p_email
    or existing_supplier.phone is distinct from p_phone;

  metadata_changed :=
    existing_binding.external_parent_id is distinct from p_external_parent_id
    or existing_binding.source_metadata is distinct from p_source_metadata;

  if canonical_changed then
    update public.suppliers
    set
      name = p_name,
      default_lead_time_days = p_default_lead_time_days,
      currency = p_currency,
      email = p_email,
      phone = p_phone
    where id = existing_supplier.id;
  end if;

  if metadata_changed then
    update public.provider_bindings
    set
      external_parent_id = p_external_parent_id,
      source_metadata = p_source_metadata
    where id = existing_binding.id;
  end if;

  return query
  select
    existing_supplier.id,
    case
      when canonical_changed or metadata_changed
        then 'updated'::text
      else 'skipped'::text
    end;
end;
$$;

revoke all
on function public.csv_reconcile_supplier(
  uuid, uuid, text, text, jsonb,
  text, integer, text, text, text
)
from public, anon, authenticated;

grant execute
on function public.csv_reconcile_supplier(
  uuid, uuid, text, text, jsonb,
  text, integer, text, text, text
)
to service_role;

-- -----------------------------------------------------------------------------
-- PURCHASE ORDER
-- -----------------------------------------------------------------------------

create or replace function public.csv_reconcile_purchase_order(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_external_id text,
  p_external_parent_id text,
  p_source_metadata jsonb,
  p_supplier_id uuid,
  p_external_reference text,
  p_status text,
  p_ordered_at timestamptz,
  p_expected_at timestamptz,
  p_received_at timestamptz,
  p_currency text
)
returns table (
  canonical_entity_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_binding public.provider_bindings%rowtype;
  existing_po public.purchase_orders%rowtype;
  created_id uuid;
  canonical_changed boolean;
  metadata_changed boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  if p_supplier_id is not null then
    perform 1
    from public.suppliers s
    where
      s.id = p_supplier_id
      and s.organization_id = p_organization_id;

    if not found then
      raise exception
        'CSV purchase order supplier is outside trusted organization';
    end if;
  end if;

  select pb.*
  into existing_binding
  from public.provider_bindings pb
  where
    pb.organization_id = p_organization_id
    and pb.integration_id = p_integration_id
    and pb.provider = 'csv'
    and pb.resource_type = 'purchase_order'
    and pb.external_id = p_external_id
  for update;

  if not found then
    insert into public.purchase_orders (
      organization_id,
      store_id,
      supplier_id,
      external_reference,
      status,
      ordered_at,
      expected_at,
      received_at,
      currency,
      source
    )
    values (
      p_organization_id,
      p_store_id,
      p_supplier_id,
      p_external_reference,
      p_status,
      p_ordered_at,
      p_expected_at,
      p_received_at,
      p_currency,
      'csv'
    )
    returning id
    into created_id;

    insert into public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id,
      external_parent_id,
      source_metadata
    )
    values (
      p_organization_id,
      p_integration_id,
      'csv',
      'purchase_order',
      created_id,
      p_external_id,
      p_external_parent_id,
      p_source_metadata
    );

    return query
    select created_id, 'imported'::text;

    return;
  end if;

  select po.*
  into existing_po
  from public.purchase_orders po
  where
    po.id = existing_binding.canonical_entity_id
    and po.organization_id = p_organization_id
    and po.store_id = p_store_id
  for update;

  if not found then
    raise exception
      'CSV purchase order binding canonical target is outside trusted scope';
  end if;

  canonical_changed :=
    existing_po.supplier_id is distinct from p_supplier_id
    or existing_po.external_reference is distinct from p_external_reference
    or existing_po.status is distinct from p_status
    or existing_po.ordered_at is distinct from p_ordered_at
    or existing_po.expected_at is distinct from p_expected_at
    or existing_po.received_at is distinct from p_received_at
    or existing_po.currency is distinct from p_currency;

  metadata_changed :=
    existing_binding.external_parent_id is distinct from p_external_parent_id
    or existing_binding.source_metadata is distinct from p_source_metadata;

  if canonical_changed then
    update public.purchase_orders
    set
      supplier_id = p_supplier_id,
      external_reference = p_external_reference,
      status = p_status,
      ordered_at = p_ordered_at,
      expected_at = p_expected_at,
      received_at = p_received_at,
      currency = p_currency
    where id = existing_po.id;
  end if;

  if metadata_changed then
    update public.provider_bindings
    set
      external_parent_id = p_external_parent_id,
      source_metadata = p_source_metadata
    where id = existing_binding.id;
  end if;

  return query
  select
    existing_po.id,
    case
      when canonical_changed or metadata_changed
        then 'updated'::text
      else 'skipped'::text
    end;
end;
$$;

revoke all
on function public.csv_reconcile_purchase_order(
  uuid, uuid, uuid, text, text, jsonb,
  uuid, text, text, timestamptz, timestamptz, timestamptz, text
)
from public, anon, authenticated;

grant execute
on function public.csv_reconcile_purchase_order(
  uuid, uuid, uuid, text, text, jsonb,
  uuid, text, text, timestamptz, timestamptz, timestamptz, text
)
to service_role;

-- -----------------------------------------------------------------------------
-- PURCHASE ORDER ITEM
-- -----------------------------------------------------------------------------

create or replace function public.csv_reconcile_purchase_order_item(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_external_id text,
  p_external_parent_id text,
  p_source_metadata jsonb,
  p_purchase_order_id uuid,
  p_variant_id uuid,
  p_destination_location_id uuid,
  p_ordered_quantity integer,
  p_received_quantity integer,
  p_unit_cost_amount numeric,
  p_currency text
)
returns table (
  canonical_entity_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_binding public.provider_bindings%rowtype;
  existing_item public.purchase_order_items%rowtype;
  created_id uuid;
  canonical_changed boolean;
  metadata_changed boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  perform 1
  from public.purchase_orders po
  where
    po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.store_id = p_store_id;

  if not found then
    raise exception
      'CSV purchase order item parent is outside trusted scope';
  end if;

  perform 1
  from public.product_variants pv
  where
    pv.id = p_variant_id
    and pv.organization_id = p_organization_id
    and pv.store_id = p_store_id;

  if not found then
    raise exception
      'CSV purchase order item variant is outside trusted scope';
  end if;

  if p_destination_location_id is not null then
    perform 1
    from public.locations l
    where
      l.id = p_destination_location_id
      and l.organization_id = p_organization_id
      and l.store_id = p_store_id;

    if not found then
      raise exception
        'CSV purchase order item destination location is outside trusted scope';
    end if;
  end if;

  select pb.*
  into existing_binding
  from public.provider_bindings pb
  where
    pb.organization_id = p_organization_id
    and pb.integration_id = p_integration_id
    and pb.provider = 'csv'
    and pb.resource_type = 'purchase_order_item'
    and pb.external_id = p_external_id
  for update;

  if not found then
    insert into public.purchase_order_items (
      organization_id,
      store_id,
      purchase_order_id,
      variant_id,
      destination_location_id,
      ordered_quantity,
      received_quantity,
      unit_cost_amount,
      currency
    )
    values (
      p_organization_id,
      p_store_id,
      p_purchase_order_id,
      p_variant_id,
      p_destination_location_id,
      p_ordered_quantity,
      p_received_quantity,
      p_unit_cost_amount,
      p_currency
    )
    returning id
    into created_id;

    insert into public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id,
      external_parent_id,
      source_metadata
    )
    values (
      p_organization_id,
      p_integration_id,
      'csv',
      'purchase_order_item',
      created_id,
      p_external_id,
      p_external_parent_id,
      p_source_metadata
    );

    return query
    select created_id, 'imported'::text;

    return;
  end if;

  select poi.*
  into existing_item
  from public.purchase_order_items poi
  where
    poi.id = existing_binding.canonical_entity_id
    and poi.organization_id = p_organization_id
    and poi.store_id = p_store_id
  for update;

  if not found then
    raise exception
      'CSV purchase order item binding canonical target is outside trusted scope';
  end if;

  if
    existing_item.purchase_order_id is distinct from p_purchase_order_id
    or existing_item.variant_id is distinct from p_variant_id
  then
    raise exception
      'CSV purchase order item canonical parent/variant cannot be reassigned';
  end if;

  canonical_changed :=
    existing_item.destination_location_id is distinct from p_destination_location_id
    or existing_item.ordered_quantity is distinct from p_ordered_quantity
    or existing_item.received_quantity is distinct from p_received_quantity
    or existing_item.unit_cost_amount is distinct from p_unit_cost_amount
    or existing_item.currency is distinct from p_currency;

  metadata_changed :=
    existing_binding.external_parent_id is distinct from p_external_parent_id
    or existing_binding.source_metadata is distinct from p_source_metadata;

  if canonical_changed then
    update public.purchase_order_items
    set
      destination_location_id = p_destination_location_id,
      ordered_quantity = p_ordered_quantity,
      received_quantity = p_received_quantity,
      unit_cost_amount = p_unit_cost_amount,
      currency = p_currency
    where id = existing_item.id;
  end if;

  if metadata_changed then
    update public.provider_bindings
    set
      external_parent_id = p_external_parent_id,
      source_metadata = p_source_metadata
    where id = existing_binding.id;
  end if;

  return query
  select
    existing_item.id,
    case
      when canonical_changed or metadata_changed
        then 'updated'::text
      else 'skipped'::text
    end;
end;
$$;

revoke all
on function public.csv_reconcile_purchase_order_item(
  uuid, uuid, uuid, text, text, jsonb,
  uuid, uuid, uuid, integer, integer, numeric, text
)
from public, anon, authenticated;

grant execute
on function public.csv_reconcile_purchase_order_item(
  uuid, uuid, uuid, text, text, jsonb,
  uuid, uuid, uuid, integer, integer, numeric, text
)
to service_role;
