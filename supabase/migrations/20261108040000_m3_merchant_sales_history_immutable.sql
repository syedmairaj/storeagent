-- StoreAgent M3 / Sales History Import V1
-- Immutable commercial fields for merchant-sales-import-v1 CSV orders/items.
--
-- Problem:
--   csv_reconcile_order / csv_reconcile_order_item update commercial fields on
--   identity match. Merchant sales import preflight can lose a TOCTOU race to a
--   concurrent conflicting writer after the first insert commits.
--
-- Fix (scoped):
--   When adapterVersion is merchant-sales-import-v1* (incoming or existing
--   binding), contradictory commercial replay raises SA002 / HISTORY_CONFLICT
--   under the existing csv_lock_reconciliation_identity serialization.
--   Identical replay still returns skipped.
--   Non-merchant CSV order reconciliation retains update semantics.
--
-- Does not change grants, RLS, or inventory history RPCs.

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
  merchant_sales_history boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  perform public.csv_lock_reconciliation_identity(
    p_organization_id,
    p_integration_id,
    'order',
    p_external_id
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

  merchant_sales_history :=
    coalesce(p_source_metadata ->> 'adapterVersion', '')
      like 'merchant-sales-import-v1%'
    or coalesce(
      existing_binding.source_metadata ->> 'adapterVersion',
      ''
    ) like 'merchant-sales-import-v1%';

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

  if canonical_changed and merchant_sales_history then
    raise exception
      using
        errcode = 'SA002',
        message = 'CSV merchant sales order history conflict';
  end if;

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
  merchant_sales_history boolean;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  perform public.csv_lock_reconciliation_identity(
    p_organization_id,
    p_integration_id,
    'order_item',
    p_external_id
  );

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

  merchant_sales_history :=
    coalesce(p_source_metadata ->> 'adapterVersion', '')
      like 'merchant-sales-import-v1%'
    or coalesce(
      existing_binding.source_metadata ->> 'adapterVersion',
      ''
    ) like 'merchant-sales-import-v1%';

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

  if canonical_changed and merchant_sales_history then
    raise exception
      using
        errcode = 'SA002',
        message = 'CSV merchant sales order-item history conflict';
  end if;

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
