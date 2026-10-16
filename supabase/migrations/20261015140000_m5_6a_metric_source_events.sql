-- StoreAgent M5.6A
-- Durable capture of metric-relevant source dates.
--
-- A committed source change inserts one event per affected grain and
-- store-local date. Rollback removes the event with the source change.
-- This migration does not consume events, enqueue recomputation, or
-- calculate metrics.

create table public.sku_daily_metric_source_events (
  event_id bigint generated always as identity primary key,

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  source_date date not null,

  algorithm_version text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  consumed_at timestamptz null,

  constraint sku_daily_metric_source_events_location_fk
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

  constraint sku_daily_metric_source_events_variant_fk
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

  constraint sku_daily_metric_source_events_algorithm_version_check
    check (
      algorithm_version = 'm5-derived-metrics-v1'
    )
);

create index sku_daily_metric_source_events_unconsumed_idx
  on public.sku_daily_metric_source_events (event_id)
  where consumed_at is null;

create index sku_daily_metric_source_events_grain_date_idx
  on public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date
  );

alter table public.sku_daily_metric_source_events
enable row level security;

revoke all
on table public.sku_daily_metric_source_events
from public, anon, authenticated, service_role;

grant select
on table public.sku_daily_metric_source_events
to service_role;

revoke all
on sequence public.sku_daily_metric_source_events_event_id_seq
from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Orders: status or ordered_at changes expand through current items.
-- -----------------------------------------------------------------------------

create or replace function public.capture_order_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date,
    algorithm_version
  )
  select distinct
    item.organization_id,
    item.store_id,
    item.location_id,
    item.variant_id,
    (pg_catalog.timezone(store.timezone, boundary.ordered_at))::date,
    'm5-derived-metrics-v1'
  from (
    select
      previous_order.id,
      previous_order.organization_id,
      previous_order.store_id,
      previous_order.ordered_at
    from old_orders as previous_order
    join new_orders as next_order
      on next_order.id = previous_order.id
    where
      previous_order.status is distinct from next_order.status
      or previous_order.ordered_at is distinct from next_order.ordered_at
    union
    select
      next_order.id,
      next_order.organization_id,
      next_order.store_id,
      next_order.ordered_at
    from old_orders as previous_order
    join new_orders as next_order
      on next_order.id = previous_order.id
    where
      previous_order.status is distinct from next_order.status
      or previous_order.ordered_at is distinct from next_order.ordered_at
  ) as boundary
  join public.order_items as item
    on item.organization_id = boundary.organization_id
    and item.store_id = boundary.store_id
    and item.order_id = boundary.id
    and item.location_id is not null
  join public.stores as store
    on store.organization_id = boundary.organization_id
    and store.id = boundary.store_id;

  return null;
end;
$$;

create trigger orders_capture_metric_source_events
after update on public.orders
referencing old table as old_orders new table as new_orders
for each statement
execute function public.capture_order_metric_source_events();

-- -----------------------------------------------------------------------------
-- Order items: quantity and location. Null locations are not grains.
-- -----------------------------------------------------------------------------

create or replace function public.capture_order_item_insert_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date,
    algorithm_version
  )
  select
    item.organization_id,
    item.store_id,
    item.location_id,
    item.variant_id,
    (pg_catalog.timezone(store.timezone, sale.ordered_at))::date,
    'm5-derived-metrics-v1'
  from new_order_items as item
  join public.orders as sale
    on sale.organization_id = item.organization_id
    and sale.store_id = item.store_id
    and sale.id = item.order_id
  join public.stores as store
    on store.organization_id = item.organization_id
    and store.id = item.store_id
  where item.location_id is not null;

  return null;
end;
$$;

create trigger order_items_capture_metric_source_events_insert
after insert on public.order_items
referencing new table as new_order_items
for each statement
execute function public.capture_order_item_insert_metric_source_events();

create or replace function public.capture_order_item_update_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date,
    algorithm_version
  )
  select distinct
    grain.organization_id,
    grain.store_id,
    grain.location_id,
    grain.variant_id,
    (pg_catalog.timezone(store.timezone, sale.ordered_at))::date,
    'm5-derived-metrics-v1'
  from (
    select
      previous_item.organization_id,
      previous_item.store_id,
      previous_item.order_id,
      previous_item.variant_id,
      previous_item.location_id
    from old_order_items as previous_item
    join new_order_items as next_item
      on next_item.id = previous_item.id
    where
      previous_item.location_id is not null
      and (
        previous_item.location_id is distinct from next_item.location_id
        or previous_item.quantity is distinct from next_item.quantity
      )
    union
    select
      next_item.organization_id,
      next_item.store_id,
      next_item.order_id,
      next_item.variant_id,
      next_item.location_id
    from old_order_items as previous_item
    join new_order_items as next_item
      on next_item.id = previous_item.id
    where
      next_item.location_id is not null
      and (
        previous_item.location_id is distinct from next_item.location_id
        or previous_item.quantity is distinct from next_item.quantity
      )
  ) as grain
  join public.orders as sale
    on sale.organization_id = grain.organization_id
    and sale.store_id = grain.store_id
    and sale.id = grain.order_id
  join public.stores as store
    on store.organization_id = grain.organization_id
    and store.id = grain.store_id;

  return null;
end;
$$;

create trigger order_items_capture_metric_source_events_update
after update on public.order_items
referencing old table as old_order_items new table as new_order_items
for each statement
execute function public.capture_order_item_update_metric_source_events();

create or replace function public.capture_order_item_delete_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date,
    algorithm_version
  )
  select
    item.organization_id,
    item.store_id,
    item.location_id,
    item.variant_id,
    (pg_catalog.timezone(store.timezone, sale.ordered_at))::date,
    'm5-derived-metrics-v1'
  from old_order_items as item
  join public.orders as sale
    on sale.organization_id = item.organization_id
    and sale.store_id = item.store_id
    and sale.id = item.order_id
  join public.stores as store
    on store.organization_id = item.organization_id
    and store.id = item.store_id
  where item.location_id is not null;

  return null;
end;
$$;

create trigger order_items_capture_metric_source_events_delete
after delete on public.order_items
referencing old table as old_order_items
for each statement
execute function public.capture_order_item_delete_metric_source_events();

-- -----------------------------------------------------------------------------
-- Returns: location, quantity, and occurred_at.
-- -----------------------------------------------------------------------------

create or replace function public.capture_return_refund_insert_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date,
    algorithm_version
  )
  select
    refund.organization_id,
    refund.store_id,
    refund.location_id,
    refund.variant_id,
    (pg_catalog.timezone(store.timezone, refund.occurred_at))::date,
    'm5-derived-metrics-v1'
  from new_return_refunds as refund
  join public.stores as store
    on store.organization_id = refund.organization_id
    and store.id = refund.store_id
  where refund.location_id is not null;

  return null;
end;
$$;

create trigger return_refunds_capture_metric_source_events_insert
after insert on public.return_refunds
referencing new table as new_return_refunds
for each statement
execute function public.capture_return_refund_insert_metric_source_events();

create or replace function public.capture_return_refund_update_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date,
    algorithm_version
  )
  select distinct
    grain.organization_id,
    grain.store_id,
    grain.location_id,
    grain.variant_id,
    (pg_catalog.timezone(store.timezone, grain.occurred_at))::date,
    'm5-derived-metrics-v1'
  from (
    select
      previous_refund.organization_id,
      previous_refund.store_id,
      previous_refund.variant_id,
      previous_refund.location_id,
      previous_refund.occurred_at
    from old_return_refunds as previous_refund
    join new_return_refunds as next_refund
      on next_refund.id = previous_refund.id
    where
      previous_refund.location_id is not null
      and (
        previous_refund.location_id is distinct from next_refund.location_id
        or previous_refund.returned_quantity
          is distinct from next_refund.returned_quantity
        or previous_refund.occurred_at is distinct from next_refund.occurred_at
      )
    union
    select
      next_refund.organization_id,
      next_refund.store_id,
      next_refund.variant_id,
      next_refund.location_id,
      next_refund.occurred_at
    from old_return_refunds as previous_refund
    join new_return_refunds as next_refund
      on next_refund.id = previous_refund.id
    where
      next_refund.location_id is not null
      and (
        previous_refund.location_id is distinct from next_refund.location_id
        or previous_refund.returned_quantity
          is distinct from next_refund.returned_quantity
        or previous_refund.occurred_at is distinct from next_refund.occurred_at
      )
  ) as grain
  join public.stores as store
    on store.organization_id = grain.organization_id
    and store.id = grain.store_id;

  return null;
end;
$$;

create trigger return_refunds_capture_metric_source_events_update
after update on public.return_refunds
referencing old table as old_return_refunds new table as new_return_refunds
for each statement
execute function public.capture_return_refund_update_metric_source_events();

create or replace function public.capture_return_refund_delete_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date,
    algorithm_version
  )
  select
    refund.organization_id,
    refund.store_id,
    refund.location_id,
    refund.variant_id,
    (pg_catalog.timezone(store.timezone, refund.occurred_at))::date,
    'm5-derived-metrics-v1'
  from old_return_refunds as refund
  join public.stores as store
    on store.organization_id = refund.organization_id
    and store.id = refund.store_id
  where refund.location_id is not null;

  return null;
end;
$$;

create trigger return_refunds_capture_metric_source_events_delete
after delete on public.return_refunds
referencing old table as old_return_refunds
for each statement
execute function public.capture_return_refund_delete_metric_source_events();

-- -----------------------------------------------------------------------------
-- Snapshots remain immutable. Only an insert is metric-relevant evidence.
-- -----------------------------------------------------------------------------

create or replace function public.capture_inventory_snapshot_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sku_daily_metric_source_events (
    organization_id,
    store_id,
    location_id,
    variant_id,
    source_date,
    algorithm_version
  )
  select
    snapshot.organization_id,
    snapshot.store_id,
    snapshot.location_id,
    snapshot.variant_id,
    (pg_catalog.timezone(store.timezone, snapshot.observed_at))::date,
    'm5-derived-metrics-v1'
  from new_inventory_snapshots as snapshot
  join public.stores as store
    on store.organization_id = snapshot.organization_id
    and store.id = snapshot.store_id;

  return null;
end;
$$;

create trigger inventory_snapshots_capture_metric_source_events
after insert on public.inventory_snapshots
referencing new table as new_inventory_snapshots
for each statement
execute function public.capture_inventory_snapshot_metric_source_events();

revoke all
on function public.capture_order_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_order_item_insert_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_order_item_update_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_order_item_delete_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_return_refund_insert_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_return_refund_update_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_return_refund_delete_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_inventory_snapshot_metric_source_events()
from public, anon, authenticated;

grant execute
on function public.capture_order_metric_source_events()
to service_role;

grant execute
on function public.capture_order_item_insert_metric_source_events()
to service_role;

grant execute
on function public.capture_order_item_update_metric_source_events()
to service_role;

grant execute
on function public.capture_order_item_delete_metric_source_events()
to service_role;

grant execute
on function public.capture_return_refund_insert_metric_source_events()
to service_role;

grant execute
on function public.capture_return_refund_update_metric_source_events()
to service_role;

grant execute
on function public.capture_return_refund_delete_metric_source_events()
to service_role;

grant execute
on function public.capture_inventory_snapshot_metric_source_events()
to service_role;
