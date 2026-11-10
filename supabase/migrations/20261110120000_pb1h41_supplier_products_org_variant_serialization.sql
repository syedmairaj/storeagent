-- StoreAgent M7-PB1.h.4.1
-- Supplier_products org+variant writer serialization (local SQL only).
--
-- Closes preferred INSERT/UPDATE phantoms against a cooperating selection
-- transaction that holds the identical org+variant transaction advisory lock
-- before preferred-set / explicit mapping reads (fencing contract §2.3).
--
-- Deadlock-safe protocol (mandatory preflight result):
--
--   PostgreSQL locks the target row BEFORE firing BEFORE ROW triggers on
--   UPDATE/DELETE. A trigger that only calls blocking pg_advisory_xact_lock
--   therefore acquires locks in order (row → advisory). A cooperating
--   selection acquires (advisory → row FOR UPDATE). That inversion deadlocks.
--
--   Chosen design:
--     1. Blocking helper for selection + writer prelock BEFORE row locks.
--     2. BEFORE ROW trigger uses pg_try_advisory_xact_lock:
--          - already held by this TX → proceed (writer prelocked)
--          - free → acquire (direct DML still joins the protocol)
--          - held by another TX → raise lock_not_available (55P03)
--        Never block on the advisory while holding a supplier_products row
--        lock. Contenders fail closed or wait only via the blocking helper
--        before taking row locks.
--     3. csv_reconcile_supplier_product performs the blocking acquire before
--        its exact-row FOR UPDATE so CSV vs selection serializes by waiting.
--
-- Namespace: 71010401 (must not reuse M5 5606003/5606004 or forecast keys).
-- Key: hashtext(organization_id::text || ':' || variant_id::text)
--
-- Preserves:
--   - prevent_supplier_product_identity_reassignment
--   - unique(organization_id, supplier_id, variant_id)
--   - multiple-preferred schema allowance (fail-closed at selection time)
--   - csv_reconcile behavioral dispositions (imported/updated/skipped)
--   - authenticated browser DML revoke (M2.7); residual writers covered by
--     trigger + csv prelock
--
-- Does NOT:
--   - wire production M7 create/approve
--   - add grain advisory 71010402 (reserved h.4.2)
--   - unlock source-of-create / merchant approval
--   - change supplier preferred-selection semantics

-- -----------------------------------------------------------------------------
-- Lock namespace + helpers
-- -----------------------------------------------------------------------------

create or replace function public.supplier_products_org_variant_xact_lock_key(
  p_organization_id uuid,
  p_variant_id uuid
)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.hashtext(
    p_organization_id::text || ':' || p_variant_id::text
  );
$$;

comment on function public.supplier_products_org_variant_xact_lock_key(uuid, uuid) is
  'PB1.h.4.1: int4 advisory key for supplier_products org+variant fencing (namespace 71010401).';

create or replace function public.acquire_supplier_products_org_variant_xact_lock(
  p_organization_id uuid,
  p_variant_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_organization_id is null then
    raise exception
      'supplier_products org+variant lock requires organization_id';
  end if;

  if p_variant_id is null then
    raise exception
      'supplier_products org+variant lock requires variant_id';
  end if;

  -- Blocking acquire for selection TX and writer prelock (before row locks).
  perform pg_catalog.pg_advisory_xact_lock(
    71010401,
    public.supplier_products_org_variant_xact_lock_key(
      p_organization_id,
      p_variant_id
    )
  );
end;
$$;

comment on function public.acquire_supplier_products_org_variant_xact_lock(uuid, uuid) is
  'PB1.h.4.1: blocking org+variant transaction advisory (71010401). For future create/approve testing and writer prelock only — not wired to production M7 create/approve.';

create or replace function public.try_acquire_supplier_products_org_variant_xact_lock(
  p_organization_id uuid,
  p_variant_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_organization_id is null then
    raise exception
      'supplier_products org+variant lock requires organization_id';
  end if;

  if p_variant_id is null then
    raise exception
      'supplier_products org+variant lock requires variant_id';
  end if;

  return pg_catalog.pg_try_advisory_xact_lock(
    71010401,
    public.supplier_products_org_variant_xact_lock_key(
      p_organization_id,
      p_variant_id
    )
  );
end;
$$;

comment on function public.try_acquire_supplier_products_org_variant_xact_lock(uuid, uuid) is
  'PB1.h.4.1: non-blocking org+variant advisory try. Used by BEFORE ROW trigger to avoid row→advisory deadlock.';

-- -----------------------------------------------------------------------------
-- BEFORE ROW enforcement (INSERT/UPDATE/DELETE)
-- -----------------------------------------------------------------------------

create or replace function public.supplier_products_enforce_org_variant_xact_lock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lock_organization_id uuid;
  lock_variant_id uuid;
begin
  if tg_op = 'DELETE' then
    lock_organization_id := old.organization_id;
    lock_variant_id := old.variant_id;
  else
    lock_organization_id := new.organization_id;
    lock_variant_id := new.variant_id;
  end if;

  -- Identity reassignment remains forbidden by a separate BEFORE UPDATE
  -- trigger that sorts earlier by name (prevent_*). NEW org/variant therefore
  -- equals OLD for successful UPDATEs; DELETE uses OLD; INSERT uses NEW.

  if not public.try_acquire_supplier_products_org_variant_xact_lock(
    lock_organization_id,
    lock_variant_id
  ) then
    raise exception
      using
        errcode = '55P03',
        message = format(
          'supplier_products org+variant lock not available for organization_id=%s variant_id=%s',
          lock_organization_id,
          lock_variant_id
        ),
        hint = 'Call acquire_supplier_products_org_variant_xact_lock before row locks, or retry after the cooperating selection transaction ends.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.supplier_products_enforce_org_variant_xact_lock() is
  'PB1.h.4.1: BEFORE ROW try-acquire of 71010401 so direct DML cannot silently bypass org+variant serialization.';

-- Name sorts after prevent_identity / before set_updated_at is not required;
-- alphabetical order: prevent_identity < serialize_org_variant < set_updated_at
-- so identity forbid still runs first on UPDATE.
drop trigger if exists supplier_products_serialize_org_variant_xact_lock
on public.supplier_products;

create trigger supplier_products_serialize_org_variant_xact_lock
before insert or update or delete on public.supplier_products
for each row
execute function public.supplier_products_enforce_org_variant_xact_lock();

-- -----------------------------------------------------------------------------
-- Privileges: helpers are service_role (+ owner); no browser execute.
-- Trigger function remains owner-executable; revoke broad EXECUTE.
-- -----------------------------------------------------------------------------

revoke all
on function public.supplier_products_org_variant_xact_lock_key(uuid, uuid)
from public, anon, authenticated;

revoke all
on function public.acquire_supplier_products_org_variant_xact_lock(uuid, uuid)
from public, anon, authenticated;

revoke all
on function public.try_acquire_supplier_products_org_variant_xact_lock(uuid, uuid)
from public, anon, authenticated;

revoke all
on function public.supplier_products_enforce_org_variant_xact_lock()
from public, anon, authenticated;

grant execute
on function public.supplier_products_org_variant_xact_lock_key(uuid, uuid)
to service_role;

grant execute
on function public.acquire_supplier_products_org_variant_xact_lock(uuid, uuid)
to service_role;

grant execute
on function public.try_acquire_supplier_products_org_variant_xact_lock(uuid, uuid)
to service_role;

-- Trigger function must be executable by residual table DML roles (service_role).
grant execute
on function public.supplier_products_enforce_org_variant_xact_lock()
to service_role;

-- -----------------------------------------------------------------------------
-- csv_reconcile_supplier_product: blocking prelock before exact-row FOR UPDATE.
-- Behavioral dispositions unchanged.
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

  -- PB1.h.4.1: acquire org+variant advisory BEFORE exact-row FOR UPDATE so
  -- CSV reconciliation participates in preferred-set serialization without
  -- row→advisory lock-order inversion.
  perform public.acquire_supplier_products_org_variant_xact_lock(
    p_organization_id,
    p_variant_id
  );

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
