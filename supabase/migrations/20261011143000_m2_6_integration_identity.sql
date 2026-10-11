-- StoreAgent M2.6
-- Provider-neutral integrations, durable provider bindings, and sync-run
-- operational history.
--
-- Security:
--   Organization is authoritative tenant scope.
--   Provider/external identifiers never establish tenant ownership.
--   Integration must already belong to the organization.
--   Binding provider must match integration provider.
--   Canonical binding target must exist inside the same organization.
--   For store-scoped integrations, store-scoped canonical targets must also
--   belong to that same store.
--
-- Provider identity:
--   Durable uniqueness:
--     organization_id
--     integration_id
--     provider
--     resource_type
--     external_id
--
--   external_id is trimmed but case-preserving.
--   external_parent_id is metadata, never hidden uniqueness.
--
-- Credentials:
--   integrations.configuration stores non-secret configuration only.
--   Credentials/tokens are intentionally absent from canonical commerce
--   persistence.
--
-- RLS:
--   Enabled fail-closed in M2.6.
--   Browser policies remain deferred to M2.7.

-- -----------------------------------------------------------------------------
-- integrations
-- -----------------------------------------------------------------------------

create table public.integrations (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid null,

  provider text not null,

  status text not null,

  display_name text null,

  configuration jsonb null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint integrations_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint integrations_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint integrations_provider_check
    check (
      provider in (
        'csv',
        'shopify',
        'woocommerce',
        'square',
        'lightspeed',
        'other'
      )
    ),

  constraint integrations_status_check
    check (
      status in (
        'pending',
        'active',
        'degraded',
        'disconnected',
        'revoked',
        'error'
      )
    ),

  constraint integrations_display_name_not_blank
    check (
      display_name is null
      or pg_catalog.length(
        pg_catalog.btrim(display_name)
      ) > 0
    ),

  constraint integrations_configuration_object
    check (
      configuration is null
      or pg_catalog.jsonb_typeof(configuration) = 'object'
    ),

  constraint integrations_organization_id_unique
    unique (
      organization_id,
      id
    ),

  constraint integrations_organization_id_provider_unique
    unique (
      organization_id,
      id,
      provider
    )
);

create index integrations_organization_idx
  on public.integrations (
    organization_id
  );

create index integrations_organization_store_idx
  on public.integrations (
    organization_id,
    store_id
  )
  where store_id is not null;

create index integrations_organization_provider_status_idx
  on public.integrations (
    organization_id,
    provider,
    status
  );

create trigger integrations_set_updated_at
before update on public.integrations
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- provider_bindings
-- -----------------------------------------------------------------------------

create table public.provider_bindings (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,

  integration_id uuid not null,

  provider text not null,
  resource_type text not null,

  canonical_entity_id uuid not null,

  external_id text not null,
  external_parent_id text null,

  source_metadata jsonb null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint provider_bindings_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  -- Provider equality is part of the FK, so a Shopify binding cannot be
  -- attached to an integration whose provider is CSV, etc.
  constraint provider_bindings_integration_provider_ownership_fk
    foreign key (
      organization_id,
      integration_id,
      provider
    )
    references public.integrations (
      organization_id,
      id,
      provider
    )
    on delete restrict,

  constraint provider_bindings_provider_check
    check (
      provider in (
        'csv',
        'shopify',
        'woocommerce',
        'square',
        'lightspeed',
        'other'
      )
    ),

  constraint provider_bindings_resource_type_check
    check (
      resource_type in (
        'store',
        'location',
        'product',
        'product_variant',
        'order',
        'order_item',
        'return_refund',
        'supplier',
        'purchase_order',
        'purchase_order_item'
      )
    ),

  constraint provider_bindings_external_id_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(external_id)
      ) > 0
      and external_id = pg_catalog.btrim(external_id)
    ),

  constraint provider_bindings_external_parent_id_not_blank
    check (
      external_parent_id is null
      or (
        pg_catalog.length(
          pg_catalog.btrim(external_parent_id)
        ) > 0
        and external_parent_id =
          pg_catalog.btrim(external_parent_id)
      )
    ),

  constraint provider_bindings_source_metadata_object
    check (
      source_metadata is null
      or pg_catalog.jsonb_typeof(source_metadata) = 'object'
    ),

  constraint provider_bindings_durable_identity_unique
    unique (
      organization_id,
      integration_id,
      provider,
      resource_type,
      external_id
    )
);

create index provider_bindings_canonical_entity_idx
  on public.provider_bindings (
    organization_id,
    resource_type,
    canonical_entity_id
  );

create index provider_bindings_integration_idx
  on public.provider_bindings (
    organization_id,
    integration_id
  );

-- -----------------------------------------------------------------------------
-- Polymorphic canonical-target validation.
--
-- canonical_entity_id intentionally remains separate from provider identity.
-- A trigger validates the target against the canonical table selected by
-- resource_type.
-- -----------------------------------------------------------------------------

create or replace function public.validate_provider_binding_canonical_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  integration_store_id uuid;
  target_store_id uuid;
  target_exists boolean := false;
begin
  select i.store_id
  into integration_store_id
  from public.integrations i
  where
    i.id = new.integration_id
    and i.organization_id = new.organization_id
    and i.provider = new.provider;

  if not found then
    raise exception
      'provider binding integration is not trusted to this organization/provider';
  end if;

  case new.resource_type

    when 'store' then
      select s.store_id, s.target_exists
      into target_store_id, target_exists
      from (
        select
          st.id as store_id,
          true as target_exists
        from public.stores st
        where
          st.id = new.canonical_entity_id
          and st.organization_id = new.organization_id
      ) s;

    when 'location' then
      select l.store_id, true
      into target_store_id, target_exists
      from public.locations l
      where
        l.id = new.canonical_entity_id
        and l.organization_id = new.organization_id;

    when 'product' then
      select p.store_id, true
      into target_store_id, target_exists
      from public.products p
      where
        p.id = new.canonical_entity_id
        and p.organization_id = new.organization_id;

    when 'product_variant' then
      select pv.store_id, true
      into target_store_id, target_exists
      from public.product_variants pv
      where
        pv.id = new.canonical_entity_id
        and pv.organization_id = new.organization_id;

    when 'order' then
      select o.store_id, true
      into target_store_id, target_exists
      from public.orders o
      where
        o.id = new.canonical_entity_id
        and o.organization_id = new.organization_id;

    when 'order_item' then
      select oi.store_id, true
      into target_store_id, target_exists
      from public.order_items oi
      where
        oi.id = new.canonical_entity_id
        and oi.organization_id = new.organization_id;

    when 'return_refund' then
      select rr.store_id, true
      into target_store_id, target_exists
      from public.return_refunds rr
      where
        rr.id = new.canonical_entity_id
        and rr.organization_id = new.organization_id;

    when 'supplier' then
      select null::uuid, true
      into target_store_id, target_exists
      from public.suppliers s
      where
        s.id = new.canonical_entity_id
        and s.organization_id = new.organization_id;

    when 'purchase_order' then
      select po.store_id, true
      into target_store_id, target_exists
      from public.purchase_orders po
      where
        po.id = new.canonical_entity_id
        and po.organization_id = new.organization_id;

    when 'purchase_order_item' then
      select poi.store_id, true
      into target_store_id, target_exists
      from public.purchase_order_items poi
      where
        poi.id = new.canonical_entity_id
        and poi.organization_id = new.organization_id;

    else
      raise exception
        'unsupported provider binding resource type';
  end case;

  if target_exists is distinct from true then
    raise exception
      'provider binding canonical target does not exist in this organization';
  end if;

  -- Supplier is organization-scoped and therefore has no store to compare.
  if
    integration_store_id is not null
    and target_store_id is not null
    and target_store_id is distinct from integration_store_id
  then
    raise exception
      'provider binding canonical target does not belong to integration store';
  end if;

  return new;
end;
$$;

create trigger provider_bindings_validate_canonical_target
before insert or update on public.provider_bindings
for each row
execute function public.validate_provider_binding_canonical_target();

-- Durable provider identity cannot silently rebind to another canonical entity.
create or replace function public.prevent_provider_binding_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.integration_id is distinct from old.integration_id
    or new.provider is distinct from old.provider
    or new.resource_type is distinct from old.resource_type
    or new.external_id is distinct from old.external_id
    or new.canonical_entity_id is distinct from old.canonical_entity_id
  then
    raise exception
      'provider binding durable identity cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger provider_bindings_prevent_identity_reassignment
before update on public.provider_bindings
for each row
execute function public.prevent_provider_binding_identity_reassignment();

create trigger provider_bindings_set_updated_at
before update on public.provider_bindings
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Prevent canonical deletes from orphaning polymorphic provider bindings.
-- -----------------------------------------------------------------------------

create or replace function public.prevent_bound_canonical_entity_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  binding_exists boolean;
  expected_resource_type text;
begin
  expected_resource_type := TG_ARGV[0];

  select exists (
    select 1
    from public.provider_bindings pb
    where
      pb.organization_id = old.organization_id
      and pb.resource_type = expected_resource_type
      and pb.canonical_entity_id = old.id
  )
  into binding_exists;

  if binding_exists then
    raise exception
      'canonical entity has provider bindings and cannot be deleted';
  end if;

  return old;
end;
$$;

create trigger stores_prevent_bound_delete
before delete on public.stores
for each row
execute function public.prevent_bound_canonical_entity_delete('store');

create trigger locations_prevent_bound_delete
before delete on public.locations
for each row
execute function public.prevent_bound_canonical_entity_delete('location');

create trigger products_prevent_bound_delete
before delete on public.products
for each row
execute function public.prevent_bound_canonical_entity_delete('product');

create trigger product_variants_prevent_bound_delete
before delete on public.product_variants
for each row
execute function public.prevent_bound_canonical_entity_delete('product_variant');

create trigger orders_prevent_bound_delete
before delete on public.orders
for each row
execute function public.prevent_bound_canonical_entity_delete('order');

create trigger order_items_prevent_bound_delete
before delete on public.order_items
for each row
execute function public.prevent_bound_canonical_entity_delete('order_item');

create trigger return_refunds_prevent_bound_delete
before delete on public.return_refunds
for each row
execute function public.prevent_bound_canonical_entity_delete('return_refund');

create trigger suppliers_prevent_bound_delete
before delete on public.suppliers
for each row
execute function public.prevent_bound_canonical_entity_delete('supplier');

create trigger purchase_orders_prevent_bound_delete
before delete on public.purchase_orders
for each row
execute function public.prevent_bound_canonical_entity_delete('purchase_order');

create trigger purchase_order_items_prevent_bound_delete
before delete on public.purchase_order_items
for each row
execute function public.prevent_bound_canonical_entity_delete('purchase_order_item');

-- -----------------------------------------------------------------------------
-- integrations identity guard.
-- -----------------------------------------------------------------------------

create or replace function public.prevent_integration_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
    or new.provider is distinct from old.provider
  then
    raise exception
      'integration canonical scope cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger integrations_prevent_identity_reassignment
before update on public.integrations
for each row
execute function public.prevent_integration_identity_reassignment();

-- -----------------------------------------------------------------------------
-- sync_runs
-- -----------------------------------------------------------------------------

create table public.sync_runs (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid null,

  integration_id uuid not null,

  idempotency_key text not null,

  status text not null,

  cursor_before text null,
  cursor_after text null,

  discovered_count integer not null
    default 0,
  imported_count integer not null
    default 0,
  updated_count integer not null
    default 0,
  skipped_count integer not null
    default 0,
  quarantined_count integer not null
    default 0,
  failed_count integer not null
    default 0,

  error_summary jsonb null,
  reconciliation_metadata jsonb null,

  started_at timestamptz not null,
  finished_at timestamptz null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint sync_runs_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint sync_runs_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint sync_runs_integration_ownership_fk
    foreign key (
      organization_id,
      integration_id
    )
    references public.integrations (
      organization_id,
      id
    )
    on delete restrict,

  constraint sync_runs_idempotency_key_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(idempotency_key)
      ) > 0
      and idempotency_key =
        pg_catalog.btrim(idempotency_key)
    ),

  constraint sync_runs_status_check
    check (
      status in (
        'queued',
        'running',
        'completed',
        'completed_with_errors',
        'failed',
        'cancelled'
      )
    ),

  constraint sync_runs_counts_non_negative
    check (
      discovered_count >= 0
      and imported_count >= 0
      and updated_count >= 0
      and skipped_count >= 0
      and quarantined_count >= 0
      and failed_count >= 0
    ),

  constraint sync_runs_error_summary_object
    check (
      error_summary is null
      or pg_catalog.jsonb_typeof(error_summary) = 'object'
    ),

  constraint sync_runs_reconciliation_metadata_object
    check (
      reconciliation_metadata is null
      or pg_catalog.jsonb_typeof(reconciliation_metadata) = 'object'
    ),

  constraint sync_runs_finished_after_started
    check (
      finished_at is null
      or finished_at >= started_at
    ),

  constraint sync_runs_idempotency_unique
    unique (
      organization_id,
      integration_id,
      idempotency_key
    )
);

create index sync_runs_integration_started_idx
  on public.sync_runs (
    organization_id,
    integration_id,
    started_at desc
  );

create index sync_runs_store_started_idx
  on public.sync_runs (
    organization_id,
    store_id,
    started_at desc
  )
  where store_id is not null;

create index sync_runs_status_idx
  on public.sync_runs (
    organization_id,
    status
  );

-- Validate optional sync store against store-scoped integration.
create or replace function public.validate_sync_run_integration_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  integration_store_id uuid;
begin
  select i.store_id
  into integration_store_id
  from public.integrations i
  where
    i.id = new.integration_id
    and i.organization_id = new.organization_id;

  if not found then
    raise exception
      'sync run integration is not trusted to this organization';
  end if;

  if
    integration_store_id is not null
    and new.store_id is distinct from integration_store_id
  then
    raise exception
      'sync run store does not match store-scoped integration';
  end if;

  return new;
end;
$$;

create trigger sync_runs_validate_integration_scope
before insert or update on public.sync_runs
for each row
execute function public.validate_sync_run_integration_scope();

-- Operational state may advance, but tenant/integration/idempotency identity
-- cannot be reassigned.
create or replace function public.prevent_sync_run_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
    or new.integration_id is distinct from old.integration_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.started_at is distinct from old.started_at
  then
    raise exception
      'sync run canonical identity cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger sync_runs_prevent_identity_reassignment
before update on public.sync_runs
for each row
execute function public.prevent_sync_run_identity_reassignment();

create or replace function public.prevent_sync_run_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'sync runs are operational history and cannot be deleted';
end;
$$;

create trigger sync_runs_prevent_delete
before delete on public.sync_runs
for each row
execute function public.prevent_sync_run_delete();

alter table public.integrations
enable row level security;

alter table public.provider_bindings
enable row level security;

alter table public.sync_runs
enable row level security;
