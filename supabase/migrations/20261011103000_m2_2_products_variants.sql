-- StoreAgent M2.2
-- Canonical products and product variants.
--
-- Ownership:
--   Organization remains the tenant boundary.
--   Product belongs to one organization + store.
--   ProductVariant belongs to the same organization + store as Product.
--
-- Important:
--   Provider identifiers do not live on canonical product records.
--   SKU is canonical commercial data but is NOT tenant identity.
--   Duplicate SKUs are intentionally permitted.
--   Unknown money remains NULL.
--   Exact persisted money uses PostgreSQL numeric.
--
-- RLS:
--   Enabled fail-closed in M2.2.
--   Browser policies are intentionally deferred to M2.7.

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------

create table public.products (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,

  title text not null,

  brand text null,
  category text null,

  status text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint products_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint products_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint products_title_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(title)
      ) > 0
    ),

  constraint products_brand_not_blank
    check (
      brand is null
      or pg_catalog.length(
        pg_catalog.btrim(brand)
      ) > 0
    ),

  constraint products_category_not_blank
    check (
      category is null
      or pg_catalog.length(
        pg_catalog.btrim(category)
      ) > 0
    ),

  constraint products_status_check
    check (
      status in (
        'active',
        'draft',
        'archived'
      )
    ),

  constraint products_organization_store_id_unique
    unique (
      organization_id,
      store_id,
      id
    )
);

create index products_organization_store_idx
  on public.products (
    organization_id,
    store_id
  );

create index products_organization_status_idx
  on public.products (
    organization_id,
    status
  );

create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

alter table public.products
enable row level security;

-- -----------------------------------------------------------------------------
-- product_variants
-- -----------------------------------------------------------------------------

create table public.product_variants (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,

  sku text not null,

  barcode text null,
  title text null,

  status text not null,

  cost_amount numeric null,
  selling_price_amount numeric null,
  currency text null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint product_variants_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint product_variants_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint product_variants_product_ownership_fk
    foreign key (
      organization_id,
      store_id,
      product_id
    )
    references public.products (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint product_variants_sku_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(sku)
      ) > 0
    ),

  constraint product_variants_barcode_not_blank
    check (
      barcode is null
      or pg_catalog.length(
        pg_catalog.btrim(barcode)
      ) > 0
    ),

  constraint product_variants_title_not_blank
    check (
      title is null
      or pg_catalog.length(
        pg_catalog.btrim(title)
      ) > 0
    ),

  constraint product_variants_status_check
    check (
      status in (
        'active',
        'inactive',
        'archived'
      )
    ),

  constraint product_variants_cost_non_negative
    check (
      cost_amount is null
      or cost_amount >= 0
    ),

  constraint product_variants_selling_price_non_negative
    check (
      selling_price_amount is null
      or selling_price_amount >= 0
    ),

  constraint product_variants_currency_not_blank
    check (
      currency is null
      or pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    ),

  constraint product_variants_organization_store_id_unique
    unique (
      organization_id,
      store_id,
      id
    )
);

create index product_variants_organization_store_idx
  on public.product_variants (
    organization_id,
    store_id
  );

create index product_variants_product_idx
  on public.product_variants (
    organization_id,
    store_id,
    product_id
  );

-- Intentionally non-unique.
-- Duplicate/messy merchant SKUs remain ingestible and diagnosable.
create index product_variants_organization_store_sku_idx
  on public.product_variants (
    organization_id,
    store_id,
    sku
  );

create trigger product_variants_set_updated_at
before update on public.product_variants
for each row
execute function public.set_updated_at();

alter table public.product_variants
enable row level security;
