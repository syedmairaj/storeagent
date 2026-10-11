-- StoreAgent M2.5
-- Canonical suppliers, supplier-product relationships,
-- purchase orders, and purchase-order items.
--
-- Ownership:
--   Organization remains the tenant boundary.
--   Supplier is organization-scoped.
--   SupplierProduct links supplier + variant inside the same organization.
--   PurchaseOrder belongs to one organization + store.
--   PurchaseOrderItem belongs to the same organization + store as its PO.
--   Variant and destination location must belong to that same org/store.
--
-- Value semantics:
--   NULL supplier/commercial/logistics data remains unknown.
--   Exact persisted money uses PostgreSQL numeric.
--   Whole-unit quantities use PostgreSQL integer.
--
-- Provider source:
--   Source records provenance only.
--   Source never establishes tenant ownership.
--
-- RLS:
--   Enabled fail-closed in M2.5.
--   Browser policies remain deferred to M2.7.

-- -----------------------------------------------------------------------------
-- Strengthen variant ownership for organization-scoped supplier relationships.
-- -----------------------------------------------------------------------------

alter table public.product_variants
  add constraint product_variants_organization_id_unique
  unique (
    organization_id,
    id
  );

-- -----------------------------------------------------------------------------
-- suppliers
-- -----------------------------------------------------------------------------

create table public.suppliers (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,

  name text not null,

  default_lead_time_days integer null,
  currency text null,

  email text null,
  phone text null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint suppliers_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint suppliers_name_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(name)
      ) > 0
    ),

  constraint suppliers_default_lead_time_non_negative
    check (
      default_lead_time_days is null
      or default_lead_time_days >= 0
    ),

  constraint suppliers_currency_not_blank
    check (
      currency is null
      or pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    ),

  constraint suppliers_email_not_blank
    check (
      email is null
      or pg_catalog.length(
        pg_catalog.btrim(email)
      ) > 0
    ),

  constraint suppliers_phone_not_blank
    check (
      phone is null
      or pg_catalog.length(
        pg_catalog.btrim(phone)
      ) > 0
    ),

  constraint suppliers_organization_id_unique
    unique (
      organization_id,
      id
    )
);

create index suppliers_organization_idx
  on public.suppliers (
    organization_id
  );

create index suppliers_organization_name_idx
  on public.suppliers (
    organization_id,
    name
  );

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- supplier_products
-- -----------------------------------------------------------------------------

create table public.supplier_products (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,

  supplier_id uuid not null,
  variant_id uuid not null,

  supplier_sku text null,

  unit_cost_amount numeric null,
  currency text null,

  lead_time_days integer null,

  minimum_order_quantity integer null,
  pack_size integer null,

  preferred boolean not null
    default false,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint supplier_products_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint supplier_products_supplier_ownership_fk
    foreign key (
      organization_id,
      supplier_id
    )
    references public.suppliers (
      organization_id,
      id
    )
    on delete restrict,

  constraint supplier_products_variant_ownership_fk
    foreign key (
      organization_id,
      variant_id
    )
    references public.product_variants (
      organization_id,
      id
    )
    on delete restrict,

  constraint supplier_products_supplier_sku_not_blank
    check (
      supplier_sku is null
      or pg_catalog.length(
        pg_catalog.btrim(supplier_sku)
      ) > 0
    ),

  constraint supplier_products_currency_not_blank
    check (
      currency is null
      or pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    ),

  constraint supplier_products_lead_time_non_negative
    check (
      lead_time_days is null
      or lead_time_days >= 0
    ),

  constraint supplier_products_moq_positive
    check (
      minimum_order_quantity is null
      or minimum_order_quantity > 0
    ),

  constraint supplier_products_pack_size_positive
    check (
      pack_size is null
      or pack_size > 0
    ),

  constraint supplier_products_supplier_variant_unique
    unique (
      organization_id,
      supplier_id,
      variant_id
    )
);

create index supplier_products_variant_idx
  on public.supplier_products (
    organization_id,
    variant_id
  );

create index supplier_products_supplier_idx
  on public.supplier_products (
    organization_id,
    supplier_id
  );

create trigger supplier_products_set_updated_at
before update on public.supplier_products
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- purchase_orders
-- -----------------------------------------------------------------------------

create table public.purchase_orders (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,

  supplier_id uuid null,

  external_reference text null,

  status text not null,

  ordered_at timestamptz null,
  expected_at timestamptz null,
  received_at timestamptz null,

  currency text null,

  source text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint purchase_orders_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint purchase_orders_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint purchase_orders_supplier_ownership_fk
    foreign key (
      organization_id,
      supplier_id
    )
    references public.suppliers (
      organization_id,
      id
    )
    on delete restrict,

  constraint purchase_orders_external_reference_not_blank
    check (
      external_reference is null
      or pg_catalog.length(
        pg_catalog.btrim(external_reference)
      ) > 0
    ),

  constraint purchase_orders_status_check
    check (
      status in (
        'draft',
        'submitted',
        'confirmed',
        'partially_received',
        'received',
        'cancelled',
        'unknown'
      )
    ),

  constraint purchase_orders_currency_not_blank
    check (
      currency is null
      or pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    ),

  constraint purchase_orders_source_check
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

  constraint purchase_orders_organization_store_id_unique
    unique (
      organization_id,
      store_id,
      id
    )
);

create index purchase_orders_organization_store_idx
  on public.purchase_orders (
    organization_id,
    store_id
  );

create index purchase_orders_supplier_idx
  on public.purchase_orders (
    organization_id,
    supplier_id
  )
  where supplier_id is not null;

create index purchase_orders_status_idx
  on public.purchase_orders (
    organization_id,
    store_id,
    status
  );

create index purchase_orders_expected_idx
  on public.purchase_orders (
    organization_id,
    store_id,
    expected_at
  )
  where expected_at is not null;

-- External reference is provider/source evidence, not canonical identity.
create index purchase_orders_external_reference_idx
  on public.purchase_orders (
    organization_id,
    store_id,
    external_reference
  )
  where external_reference is not null;

create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- purchase_order_items
-- -----------------------------------------------------------------------------

create table public.purchase_order_items (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,

  purchase_order_id uuid not null,
  variant_id uuid not null,

  destination_location_id uuid null,

  ordered_quantity integer not null,
  received_quantity integer null,

  unit_cost_amount numeric null,
  currency text null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint purchase_order_items_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint purchase_order_items_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint purchase_order_items_purchase_order_ownership_fk
    foreign key (
      organization_id,
      store_id,
      purchase_order_id
    )
    references public.purchase_orders (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint purchase_order_items_variant_ownership_fk
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

  constraint purchase_order_items_destination_location_ownership_fk
    foreign key (
      organization_id,
      store_id,
      destination_location_id
    )
    references public.locations (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint purchase_order_items_ordered_quantity_non_negative
    check (
      ordered_quantity >= 0
    ),

  constraint purchase_order_items_received_quantity_non_negative
    check (
      received_quantity is null
      or received_quantity >= 0
    ),

  constraint purchase_order_items_currency_not_blank
    check (
      currency is null
      or pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    )
);

create index purchase_order_items_purchase_order_idx
  on public.purchase_order_items (
    organization_id,
    store_id,
    purchase_order_id
  );

create index purchase_order_items_variant_idx
  on public.purchase_order_items (
    organization_id,
    store_id,
    variant_id
  );

create index purchase_order_items_destination_location_idx
  on public.purchase_order_items (
    organization_id,
    store_id,
    destination_location_id
  )
  where destination_location_id is not null;

create trigger purchase_order_items_set_updated_at
before update on public.purchase_order_items
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Canonical ownership / identity reassignment guards.
--
-- Mutable operational fields may reconcile.
-- Tenant and canonical parent relationships may not migrate silently.
-- -----------------------------------------------------------------------------

create or replace function public.prevent_supplier_ownership_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
  then
    raise exception
      'supplier canonical ownership cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger suppliers_prevent_ownership_reassignment
before update on public.suppliers
for each row
execute function public.prevent_supplier_ownership_reassignment();

create or replace function public.prevent_supplier_product_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.supplier_id is distinct from old.supplier_id
    or new.variant_id is distinct from old.variant_id
  then
    raise exception
      'supplier product canonical identity cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger supplier_products_prevent_identity_reassignment
before update on public.supplier_products
for each row
execute function public.prevent_supplier_product_identity_reassignment();

create or replace function public.prevent_purchase_order_ownership_reassignment()
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
      'purchase order canonical ownership cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger purchase_orders_prevent_ownership_reassignment
before update on public.purchase_orders
for each row
execute function public.prevent_purchase_order_ownership_reassignment();

create or replace function public.prevent_purchase_order_item_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
    or new.purchase_order_id is distinct from old.purchase_order_id
    or new.variant_id is distinct from old.variant_id
  then
    raise exception
      'purchase order item canonical identity cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger purchase_order_items_prevent_identity_reassignment
before update on public.purchase_order_items
for each row
execute function public.prevent_purchase_order_item_identity_reassignment();

alter table public.suppliers
enable row level security;

alter table public.supplier_products
enable row level security;

alter table public.purchase_orders
enable row level security;

alter table public.purchase_order_items
enable row level security;
