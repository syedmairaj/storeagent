-- StoreAgent M2.4
-- Canonical orders, order items, and return/refund evidence.
--
-- Ownership:
--   Organization remains the tenant boundary.
--   Every order belongs to one organization + store.
--   Every order item must belong to the same organization + store as its order.
--   Referenced variants and locations must belong to that same org/store.
--   Return/refund relationships must not cross tenant/store/order/variant
--   ownership.
--
-- Commercial semantics:
--   NULL monetary values remain unknown.
--   Exact persisted money uses PostgreSQL numeric.
--   Provider source records provenance only and never establishes tenancy.
--
-- History/reconciliation:
--   Order state may evolve through deterministic provider reconciliation.
--   Canonical ownership/identity relationships must never be reassigned.
--
-- RLS:
--   Enabled fail-closed in M2.4.
--   Browser policies remain deferred to M2.7.

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------

create table public.orders (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,

  external_reference text null,

  status text not null,

  ordered_at timestamptz not null,

  currency text not null,

  gross_amount numeric null,
  discount_amount numeric null,
  net_amount numeric null,

  source text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint orders_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint orders_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint orders_external_reference_not_blank
    check (
      external_reference is null
      or pg_catalog.length(
        pg_catalog.btrim(external_reference)
      ) > 0
    ),

  constraint orders_status_check
    check (
      status in (
        'pending',
        'open',
        'completed',
        'cancelled',
        'refunded',
        'partially_refunded',
        'unknown'
      )
    ),

  constraint orders_currency_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    ),

  constraint orders_source_check
    check (
      source in (
        'csv',
        'shopify',
        'woocommerce',
        'square',
        'lightspeed',
        'other'
      )
    ),

  constraint orders_organization_store_id_unique
    unique (
      organization_id,
      store_id,
      id
    )
);

create index orders_organization_store_ordered_idx
  on public.orders (
    organization_id,
    store_id,
    ordered_at desc
  );

create index orders_organization_store_status_idx
  on public.orders (
    organization_id,
    store_id,
    status
  );

-- Intentionally non-unique.
-- External references are provider/source evidence, not canonical identity.
create index orders_external_reference_idx
  on public.orders (
    organization_id,
    store_id,
    external_reference
  )
  where external_reference is not null;

-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------

create table public.order_items (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,

  order_id uuid not null,
  variant_id uuid not null,

  location_id uuid null,

  quantity integer not null,

  unit_price_amount numeric null,
  discount_amount numeric null,
  unit_cost_amount numeric null,

  currency text null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint order_items_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint order_items_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint order_items_order_ownership_fk
    foreign key (
      organization_id,
      store_id,
      order_id
    )
    references public.orders (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint order_items_variant_ownership_fk
    foreign key (
      organization_id,
      store_id,
      variant_id
    )
    references public.product_variants (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint order_items_location_ownership_fk
    foreign key (
      organization_id,
      store_id,
      location_id
    )
    references public.locations (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint order_items_quantity_non_negative
    check (
      quantity >= 0
    ),

  constraint order_items_currency_not_blank
    check (
      currency is null
      or pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    ),

  constraint order_items_organization_store_id_unique
    unique (
      organization_id,
      store_id,
      id
    ),

  constraint order_items_refund_ownership_unique
    unique (
      organization_id,
      store_id,
      order_id,
      variant_id,
      id
    )
);

create index order_items_order_idx
  on public.order_items (
    organization_id,
    store_id,
    order_id
  );

create index order_items_variant_idx
  on public.order_items (
    organization_id,
    store_id,
    variant_id
  );

create index order_items_location_idx
  on public.order_items (
    organization_id,
    store_id,
    location_id
  )
  where location_id is not null;

-- -----------------------------------------------------------------------------
-- return_refunds
-- -----------------------------------------------------------------------------

create table public.return_refunds (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,

  order_id uuid not null,
  order_item_id uuid null,
  variant_id uuid not null,

  location_id uuid null,

  returned_quantity integer null,

  refunded_amount numeric null,
  currency text null,

  reason text null,

  occurred_at timestamptz not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint return_refunds_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint return_refunds_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint return_refunds_order_ownership_fk
    foreign key (
      organization_id,
      store_id,
      order_id
    )
    references public.orders (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint return_refunds_variant_ownership_fk
    foreign key (
      organization_id,
      store_id,
      variant_id
    )
    references public.product_variants (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint return_refunds_order_item_ownership_fk
    foreign key (
      organization_id,
      store_id,
      order_id,
      variant_id,
      order_item_id
    )
    references public.order_items (
      organization_id,
      store_id,
      order_id,
      variant_id,
      id
    )
    on delete restrict,

  constraint return_refunds_location_ownership_fk
    foreign key (
      organization_id,
      store_id,
      location_id
    )
    references public.locations (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint return_refunds_returned_quantity_non_negative
    check (
      returned_quantity is null
      or returned_quantity >= 0
    ),

  constraint return_refunds_refunded_amount_non_negative
    check (
      refunded_amount is null
      or refunded_amount >= 0
    ),

  constraint return_refunds_currency_not_blank
    check (
      currency is null
      or pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    ),

  constraint return_refunds_reason_not_blank
    check (
      reason is null
      or pg_catalog.length(
        pg_catalog.btrim(reason)
      ) > 0
    ),

  constraint return_refunds_organization_store_id_unique
    unique (
      organization_id,
      store_id,
      id
    )
);

create index return_refunds_order_occurred_idx
  on public.return_refunds (
    organization_id,
    store_id,
    order_id,
    occurred_at desc
  );

create index return_refunds_variant_occurred_idx
  on public.return_refunds (
    organization_id,
    store_id,
    variant_id,
    occurred_at desc
  );

-- -----------------------------------------------------------------------------
-- Ownership reassignment guard
--
-- Orders may reconcile status/commercial truth, but canonical ownership must
-- never migrate between tenants/stores.
-- -----------------------------------------------------------------------------

create or replace function public.prevent_order_ownership_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
  then
    raise exception
      'order canonical ownership cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger orders_prevent_ownership_reassignment
before update on public.orders
for each row
execute function public.prevent_order_ownership_reassignment();

create or replace function public.prevent_order_item_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
    or new.order_id is distinct from old.order_id
    or new.variant_id is distinct from old.variant_id
  then
    raise exception
      'order item canonical identity cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger order_items_prevent_identity_reassignment
before update on public.order_items
for each row
execute function public.prevent_order_item_identity_reassignment();

create or replace function public.prevent_return_refund_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
    or new.order_id is distinct from old.order_id
    or new.order_item_id is distinct from old.order_item_id
    or new.variant_id is distinct from old.variant_id
  then
    raise exception
      'return/refund canonical identity cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger return_refunds_prevent_identity_reassignment
before update on public.return_refunds
for each row
execute function public.prevent_return_refund_identity_reassignment();

alter table public.orders
enable row level security;

alter table public.order_items
enable row level security;

alter table public.return_refunds
enable row level security;
