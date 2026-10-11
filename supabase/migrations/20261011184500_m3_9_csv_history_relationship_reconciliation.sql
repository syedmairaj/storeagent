-- StoreAgent M3.9C
-- CSV append-only inventory history + supplier-product relationship persistence.
--
-- Inventory:
--   - immutable historical evidence
--   - no ProviderBinding
--   - every accepted observation appends
--   - same-import duplicate handling belongs to orchestration
--   - SyncRun idempotency owns whole-import replay
--
-- SupplierProduct:
--   - canonical relationship, not provider resource identity
--   - no ProviderBinding
--   - unique supplier + variant relationship reconciles mutable terms

-- -----------------------------------------------------------------------------
-- CSV inventory append.
-- -----------------------------------------------------------------------------

create or replace function public.csv_append_inventory_snapshot(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_variant_id uuid,
  p_location_id uuid,
  p_observed_at timestamptz,
  p_on_hand_quantity integer,
  p_available_quantity integer,
  p_committed_quantity integer,
  p_incoming_quantity integer
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
  created_id uuid;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  perform 1
  from public.product_variants pv
  where
    pv.id = p_variant_id
    and pv.organization_id = p_organization_id
    and pv.store_id = p_store_id;

  if not found then
    raise exception
      'CSV inventory variant is outside trusted scope';
  end if;

  perform 1
  from public.locations l
  where
    l.id = p_location_id
    and l.organization_id = p_organization_id
    and l.store_id = p_store_id;

  if not found then
    raise exception
      'CSV inventory location is outside trusted scope';
  end if;

  insert into public.inventory_snapshots (
    organization_id,
    store_id,
    location_id,
    variant_id,
    observed_at,
    on_hand_quantity,
    available_quantity,
    committed_quantity,
    incoming_quantity,
    source
  )
  values (
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_observed_at,
    p_on_hand_quantity,
    p_available_quantity,
    p_committed_quantity,
    p_incoming_quantity,
    'csv'
  )
  returning id
  into created_id;

  return query
  select
    created_id,
    'imported'::text;
end;
$$;

revoke all
on function public.csv_append_inventory_snapshot(
  uuid, uuid, uuid, uuid, uuid, timestamptz,
  integer, integer, integer, integer
)
from public, anon, authenticated;

grant execute
on function public.csv_append_inventory_snapshot(
  uuid, uuid, uuid, uuid, uuid, timestamptz,
  integer, integer, integer, integer
)
to service_role;

-- -----------------------------------------------------------------------------
-- CSV supplier-product relationship reconciliation.
-- -----------------------------------------------------------------------------

create or replace function public.csv_reconcile_supplier_product(
  p_organization_id uuid,
  p_integration_id uuid,
  p_supplier_id uuid,
  p_variant_id uuid,
  p_supplier_sku text,
  p_unit_cost_amount numeric,
  p_currency text,
  p_lead_time_days integer,
  p_minimum_order_quantity integer,
  p_pack_size integer,
  p_preferred boolean
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
  variant_store_id uuid;
  existing_relationship public.supplier_products%rowtype;
  created_id uuid;
  canonical_changed boolean;
begin
  select pv.store_id
  into variant_store_id
  from public.product_variants pv
  where
    pv.id = p_variant_id
    and pv.organization_id = p_organization_id;

  if not found then
    raise exception
      'CSV supplier-product variant is outside trusted organization';
  end if;

  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    variant_store_id,
    false
  );

  perform 1
  from public.suppliers s
  where
    s.id = p_supplier_id
    and s.organization_id = p_organization_id;

  if not found then
    raise exception
      'CSV supplier-product supplier is outside trusted organization';
  end if;

  select sp.*
  into existing_relationship
  from public.supplier_products sp
  where
    sp.organization_id = p_organization_id
    and sp.supplier_id = p_supplier_id
    and sp.variant_id = p_variant_id
  for update;

  if not found then
    begin
      insert into public.supplier_products (
        organization_id,
        supplier_id,
        variant_id,
        supplier_sku,
        unit_cost_amount,
        currency,
        lead_time_days,
        minimum_order_quantity,
        pack_size,
        preferred
      )
      values (
        p_organization_id,
        p_supplier_id,
        p_variant_id,
        p_supplier_sku,
        p_unit_cost_amount,
        p_currency,
        p_lead_time_days,
        p_minimum_order_quantity,
        p_pack_size,
        p_preferred
      )
      returning id
      into created_id;

    exception
      when unique_violation then
        select sp.*
        into existing_relationship
        from public.supplier_products sp
        where
          sp.organization_id = p_organization_id
          and sp.supplier_id = p_supplier_id
          and sp.variant_id = p_variant_id
        for update;

        if not found then
          raise;
        end if;
    end;

    if created_id is not null then
      return query
      select
        created_id,
        'imported'::text;

      return;
    end if;
  end if;

  canonical_changed :=
    existing_relationship.supplier_sku is distinct from p_supplier_sku
    or existing_relationship.unit_cost_amount is distinct from p_unit_cost_amount
    or existing_relationship.currency is distinct from p_currency
    or existing_relationship.lead_time_days is distinct from p_lead_time_days
    or existing_relationship.minimum_order_quantity is distinct from p_minimum_order_quantity
    or existing_relationship.pack_size is distinct from p_pack_size
    or existing_relationship.preferred is distinct from p_preferred;

  if canonical_changed then
    update public.supplier_products
    set
      supplier_sku = p_supplier_sku,
      unit_cost_amount = p_unit_cost_amount,
      currency = p_currency,
      lead_time_days = p_lead_time_days,
      minimum_order_quantity = p_minimum_order_quantity,
      pack_size = p_pack_size,
      preferred = p_preferred
    where id = existing_relationship.id;

    return query
    select
      existing_relationship.id,
      'updated'::text;

    return;
  end if;

  return query
  select
    existing_relationship.id,
    'skipped'::text;
end;
$$;

revoke all
on function public.csv_reconcile_supplier_product(
  uuid, uuid, uuid, uuid,
  text, numeric, text, integer, integer, integer, boolean
)
from public, anon, authenticated;

grant execute
on function public.csv_reconcile_supplier_product(
  uuid, uuid, uuid, uuid,
  text, numeric, text, integer, integer, integer, boolean
)
to service_role;
