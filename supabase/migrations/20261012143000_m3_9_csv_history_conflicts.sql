-- StoreAgent M3.9D-F3
-- Contradictory immutable CSV inventory history protection.
--
-- CSV inventory observation identity:
--   organization + store + variant + location + observed_at
--
-- Semantics:
--   no existing observation -> append / imported
--   exact persisted replay   -> existing row / skipped
--   contradictory replay     -> SA002 / HISTORY_CONFLICT
--
-- Existing immutable history is never updated or deleted.

-- -----------------------------------------------------------------------------
-- Fail closed if historical CSV duplicates already exist.
--
-- Do not silently delete or merge immutable history during a migration.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.inventory_snapshots s
    where s.source = 'csv'
    group by
      s.organization_id,
      s.store_id,
      s.variant_id,
      s.location_id,
      s.observed_at
    having count(*) > 1
  ) then
    raise exception
      'cannot enforce CSV inventory observation identity: duplicate immutable history already exists';
  end if;
end;
$$;

-- CSV-specific persisted observation identity.
--
-- Keep this partial so D-F3 does not prematurely define replay semantics for
-- Shopify or future providers.
create unique index inventory_snapshots_csv_observation_unique
  on public.inventory_snapshots (
    organization_id,
    store_id,
    variant_id,
    location_id,
    observed_at
  )
  where source = 'csv';

-- -----------------------------------------------------------------------------
-- Atomic CSV inventory history reconciliation.
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

  existing_id uuid;
  existing_on_hand integer;
  existing_available integer;
  existing_committed integer;
  existing_incoming integer;
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
  on conflict (
    organization_id,
    store_id,
    variant_id,
    location_id,
    observed_at
  )
  where source = 'csv'
  do nothing
  returning id
  into created_id;

  if created_id is not null then
    return query
    select
      created_id,
      'imported'::text;

    return;
  end if;

  select
    s.id,
    s.on_hand_quantity,
    s.available_quantity,
    s.committed_quantity,
    s.incoming_quantity
  into
    existing_id,
    existing_on_hand,
    existing_available,
    existing_committed,
    existing_incoming
  from public.inventory_snapshots s
  where
    s.organization_id = p_organization_id
    and s.store_id = p_store_id
    and s.variant_id = p_variant_id
    and s.location_id = p_location_id
    and s.observed_at = p_observed_at
    and s.source = 'csv';

  if not found then
    raise exception
      'CSV inventory history replay could not resolve existing observation';
  end if;

  if
    existing_on_hand is not distinct from p_on_hand_quantity
    and existing_available is not distinct from p_available_quantity
    and existing_committed is not distinct from p_committed_quantity
    and existing_incoming is not distinct from p_incoming_quantity
  then
    return query
    select
      existing_id,
      'skipped'::text;

    return;
  end if;

  raise exception
    using
      errcode = 'SA002',
      message = 'CSV inventory history conflict';
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
