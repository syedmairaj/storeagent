-- StoreAgent M2.3
-- Immutable canonical inventory observation history.
--
-- Ownership:
--   Organization remains the tenant boundary.
--   Snapshot belongs to one organization + store.
--   Location must belong to the same organization + store.
--   Product variant must belong to the same organization + store.
--
-- History:
--   Inventory snapshots are append-only historical evidence.
--   Later observations create later rows.
--   Existing observations are not rewritten or deleted.
--
-- Quantity semantics:
--   NULL = unknown.
--   0 = known zero.
--   Known quantities are non-negative whole units.
--
-- Source:
--   Provider class records provenance only.
--   Source never establishes tenant ownership.
--
-- RLS:
--   Enabled fail-closed in M2.3.
--   Browser policies are intentionally deferred to M2.7.

-- -----------------------------------------------------------------------------
-- Strengthen location ownership for downstream store-scoped canonical records.
--
-- M1 already guarantees:
--   (organization_id, store_id) -> stores
--   (organization_id, id)       -> locations
--
-- M2 needs a direct composite FK target that proves a location belongs to the
-- same organization AND store as inventory/order records.
-- -----------------------------------------------------------------------------

alter table public.locations
  add constraint locations_organization_store_id_unique
  unique (
    organization_id,
    store_id,
    id
  );

-- -----------------------------------------------------------------------------
-- inventory_snapshots
-- -----------------------------------------------------------------------------

create table public.inventory_snapshots (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  observed_at timestamptz not null,

  on_hand_quantity integer null,
  available_quantity integer null,
  committed_quantity integer null,
  incoming_quantity integer null,

  source text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint inventory_snapshots_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint inventory_snapshots_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint inventory_snapshots_location_ownership_fk
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

  constraint inventory_snapshots_variant_ownership_fk
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

  constraint inventory_snapshots_on_hand_non_negative
    check (
      on_hand_quantity is null
      or on_hand_quantity >= 0
    ),

  constraint inventory_snapshots_available_non_negative
    check (
      available_quantity is null
      or available_quantity >= 0
    ),

  constraint inventory_snapshots_committed_non_negative
    check (
      committed_quantity is null
      or committed_quantity >= 0
    ),

  constraint inventory_snapshots_incoming_non_negative
    check (
      incoming_quantity is null
      or incoming_quantity >= 0
    ),

  constraint inventory_snapshots_source_check
    check (
      source in (
        'csv',
        'shopify',
        'woocommerce',
        'square',
        'lightspeed',
        'other'
      )
    )
);

create index inventory_snapshots_organization_store_idx
  on public.inventory_snapshots (
    organization_id,
    store_id
  );

create index inventory_snapshots_variant_observed_idx
  on public.inventory_snapshots (
    organization_id,
    store_id,
    variant_id,
    observed_at desc
  );

create index inventory_snapshots_location_observed_idx
  on public.inventory_snapshots (
    organization_id,
    store_id,
    location_id,
    observed_at desc
  );

-- -----------------------------------------------------------------------------
-- Immutable history guard.
-- -----------------------------------------------------------------------------

create or replace function public.prevent_inventory_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'inventory_snapshots are immutable historical evidence';
end;
$$;

create trigger inventory_snapshots_prevent_update
before update on public.inventory_snapshots
for each row
execute function public.prevent_inventory_snapshot_mutation();

create trigger inventory_snapshots_prevent_delete
before delete on public.inventory_snapshots
for each row
execute function public.prevent_inventory_snapshot_mutation();

alter table public.inventory_snapshots
enable row level security;
