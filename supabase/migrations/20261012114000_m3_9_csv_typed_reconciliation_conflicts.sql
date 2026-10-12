-- M3.9D-F1
-- Stable typed CSV reconciliation conflicts.
--
-- SA001 is reserved here for an expected source/reconciliation
-- contradiction where an existing durable CSV resource identity
-- attempts to change an immutable canonical relationship.
--
-- Trusted-scope, integrity, infrastructure, and other operational
-- failures deliberately retain their original error codes.

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
    raise exception using
      errcode = 'SA001',
      message =
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
    raise exception using
      errcode = 'SA001',
      message =
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
    raise exception using
      errcode = 'SA001',
      message =
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
