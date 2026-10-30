-- StoreAgent M6 P2b.2c.3b
-- Forecast coverage correction outbox + authorized apply.
--
-- Separate from M5.6A metric source events.
-- Capture is transactional with commerce writes.
-- arrived_at is the DB change watermark; business_at attributes local_date only.
-- Apply requires exactly one of integration_id | actor_user_id (no system agent).
-- Does not publish forecasts or enable workers.
--
-- Reader safety: public.forecast_coverage_has_pending_corrections is the fence.
-- Without callers consulting it, concurrent attestation can appear complete
-- until apply runs. This migration does not wire the fence into forecast readers.

-- -----------------------------------------------------------------------------
-- Outbox
-- -----------------------------------------------------------------------------

create table public.forecast_coverage_correction_events (
  event_id bigint generated always as identity primary key,

  organization_id uuid not null,
  store_id uuid not null,

  stream text not null,
  local_date date not null,

  -- NULL location/variant = unknown/unscoped; apply matches conservatively.
  location_id uuid null,
  variant_id uuid null,

  business_at timestamptz not null,
  arrived_at timestamptz not null
    default pg_catalog.clock_timestamp(),

  source_table text not null,
  source_op text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  processed_at timestamptz null,

  constraint forecast_coverage_correction_events_store_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint forecast_coverage_correction_events_location_fk
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

  constraint forecast_coverage_correction_events_variant_fk
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

  constraint forecast_coverage_correction_events_stream_check
    check (stream in ('orders', 'returns')),

  constraint forecast_coverage_correction_events_source_table_check
    check (
      source_table in ('orders', 'order_items', 'return_refunds')
    ),

  constraint forecast_coverage_correction_events_source_op_check
    check (source_op in ('insert', 'update', 'delete'))
);

create index forecast_coverage_correction_events_unprocessed_idx
  on public.forecast_coverage_correction_events (organization_id, event_id)
  where processed_at is null;

create index forecast_coverage_correction_events_match_idx
  on public.forecast_coverage_correction_events (
    organization_id,
    store_id,
    stream,
    local_date
  )
  where processed_at is null;

alter table public.forecast_coverage_correction_events
enable row level security;

revoke all
on table public.forecast_coverage_correction_events
from public, anon, authenticated, service_role;

grant select
on table public.forecast_coverage_correction_events
to service_role;

revoke all
on sequence public.forecast_coverage_correction_events_event_id_seq
from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.forecast_coverage_store_local_date(
  p_organization_id uuid,
  p_store_id uuid,
  p_business_at timestamptz
)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  store_timezone text;
begin
  if p_business_at is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast coverage correction requires business_at';
  end if;

  select s.timezone
  into store_timezone
  from public.stores as s
  where
    s.organization_id = p_organization_id
    and s.id = p_store_id;

  if store_timezone is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast coverage correction store not found';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as tz
    where tz.name = store_timezone
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast coverage correction invalid_iana_timezone';
  end if;

  return (pg_catalog.timezone(store_timezone, p_business_at))::date;
end;
$$;

revoke all
on function public.forecast_coverage_store_local_date(uuid, uuid, timestamptz)
from public, anon, authenticated;

grant execute
on function public.forecast_coverage_store_local_date(uuid, uuid, timestamptz)
to service_role;

create or replace function public.forecast_coverage_correction_grain_lock(
  p_organization_id uuid,
  p_store_id uuid,
  p_stream text,
  p_local_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    5606203,
    pg_catalog.hashtext(
      p_organization_id::text ||
      pg_catalog.chr(31) ||
      p_store_id::text ||
      pg_catalog.chr(31) ||
      p_stream ||
      pg_catalog.chr(31) ||
      p_local_date::text
    )
  );
end;
$$;

revoke all
on function public.forecast_coverage_correction_grain_lock(
  uuid,
  uuid,
  text,
  date
)
from public, anon, authenticated;

grant execute
on function public.forecast_coverage_correction_grain_lock(
  uuid,
  uuid,
  text,
  date
)
to service_role;

-- Matching: null event location/variant conservatively covers narrower evidence.
create or replace function public.forecast_coverage_correction_matches_evidence(
  p_event_location_id uuid,
  p_event_variant_id uuid,
  p_evidence_location_id uuid,
  p_evidence_variant_id uuid
)
returns boolean
language sql
immutable
as $$
  select
    (
      p_event_location_id is null
      or p_evidence_location_id is null
      or p_event_location_id = p_evidence_location_id
    )
    and (
      p_event_variant_id is null
      or p_evidence_variant_id is null
      or p_event_variant_id = p_evidence_variant_id
    );
$$;

revoke all
on function public.forecast_coverage_correction_matches_evidence(
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.forecast_coverage_correction_matches_evidence(
  uuid,
  uuid,
  uuid,
  uuid
)
to service_role;

-- Reader fence: true when unprocessed corrections would invalidate this watermark.
create or replace function public.forecast_coverage_has_pending_corrections(
  p_organization_id uuid,
  p_store_id uuid,
  p_stream text,
  p_local_date date,
  p_location_id uuid,
  p_variant_id uuid,
  p_as_of timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.forecast_coverage_correction_events as e
    where
      e.organization_id = p_organization_id
      and e.store_id = p_store_id
      and e.stream = p_stream
      and e.local_date = p_local_date
      and e.processed_at is null
      and e.arrived_at > p_as_of
      and public.forecast_coverage_correction_matches_evidence(
        e.location_id,
        e.variant_id,
        p_location_id,
        p_variant_id
      )
  );
end;
$$;

revoke all
on function public.forecast_coverage_has_pending_corrections(
  uuid,
  uuid,
  text,
  date,
  uuid,
  uuid,
  timestamptz
)
from public, anon, authenticated;

grant execute
on function public.forecast_coverage_has_pending_corrections(
  uuid,
  uuid,
  text,
  date,
  uuid,
  uuid,
  timestamptz
)
to service_role;

-- -----------------------------------------------------------------------------
-- Capture triggers
-- -----------------------------------------------------------------------------

create or replace function public.capture_order_forecast_coverage_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.forecast_coverage_correction_events (
    organization_id,
    store_id,
    stream,
    local_date,
    location_id,
    variant_id,
    business_at,
    arrived_at,
    source_table,
    source_op
  )
  select distinct
    boundary.organization_id,
    boundary.store_id,
    'orders',
    public.forecast_coverage_store_local_date(
      boundary.organization_id,
      boundary.store_id,
      boundary.ordered_at
    ),
    item.location_id,
    item.variant_id,
    boundary.ordered_at,
    pg_catalog.clock_timestamp(),
    'orders',
    'update'
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
    and item.order_id = boundary.id;

  return null;
end;
$$;

create trigger orders_capture_forecast_coverage_corrections
after update on public.orders
referencing old table as old_orders new table as new_orders
for each statement
execute function public.capture_order_forecast_coverage_corrections();

create or replace function public.capture_order_item_insert_forecast_coverage_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.forecast_coverage_correction_events (
    organization_id,
    store_id,
    stream,
    local_date,
    location_id,
    variant_id,
    business_at,
    arrived_at,
    source_table,
    source_op
  )
  select
    item.organization_id,
    item.store_id,
    'orders',
    public.forecast_coverage_store_local_date(
      item.organization_id,
      item.store_id,
      sale.ordered_at
    ),
    item.location_id,
    item.variant_id,
    sale.ordered_at,
    pg_catalog.clock_timestamp(),
    'order_items',
    'insert'
  from new_order_items as item
  join public.orders as sale
    on sale.organization_id = item.organization_id
    and sale.store_id = item.store_id
    and sale.id = item.order_id;

  return null;
end;
$$;

create trigger order_items_capture_forecast_coverage_corrections_insert
after insert on public.order_items
referencing new table as new_order_items
for each statement
execute function public.capture_order_item_insert_forecast_coverage_corrections();

create or replace function public.capture_order_item_update_forecast_coverage_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.forecast_coverage_correction_events (
    organization_id,
    store_id,
    stream,
    local_date,
    location_id,
    variant_id,
    business_at,
    arrived_at,
    source_table,
    source_op
  )
  select distinct
    grain.organization_id,
    grain.store_id,
    'orders',
    public.forecast_coverage_store_local_date(
      grain.organization_id,
      grain.store_id,
      sale.ordered_at
    ),
    grain.location_id,
    grain.variant_id,
    sale.ordered_at,
    pg_catalog.clock_timestamp(),
    'order_items',
    'update'
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
      previous_item.location_id is distinct from next_item.location_id
      or previous_item.quantity is distinct from next_item.quantity
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
      previous_item.location_id is distinct from next_item.location_id
      or previous_item.quantity is distinct from next_item.quantity
  ) as grain
  join public.orders as sale
    on sale.organization_id = grain.organization_id
    and sale.store_id = grain.store_id
    and sale.id = grain.order_id;

  return null;
end;
$$;

create trigger order_items_capture_forecast_coverage_corrections_update
after update on public.order_items
referencing old table as old_order_items new table as new_order_items
for each statement
execute function public.capture_order_item_update_forecast_coverage_corrections();

create or replace function public.capture_order_item_delete_forecast_coverage_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.forecast_coverage_correction_events (
    organization_id,
    store_id,
    stream,
    local_date,
    location_id,
    variant_id,
    business_at,
    arrived_at,
    source_table,
    source_op
  )
  select
    item.organization_id,
    item.store_id,
    'orders',
    public.forecast_coverage_store_local_date(
      item.organization_id,
      item.store_id,
      sale.ordered_at
    ),
    item.location_id,
    item.variant_id,
    sale.ordered_at,
    pg_catalog.clock_timestamp(),
    'order_items',
    'delete'
  from old_order_items as item
  join public.orders as sale
    on sale.organization_id = item.organization_id
    and sale.store_id = item.store_id
    and sale.id = item.order_id;

  return null;
end;
$$;

create trigger order_items_capture_forecast_coverage_corrections_delete
after delete on public.order_items
referencing old table as old_order_items
for each statement
execute function public.capture_order_item_delete_forecast_coverage_corrections();

create or replace function public.capture_return_refund_insert_forecast_coverage_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.forecast_coverage_correction_events (
    organization_id,
    store_id,
    stream,
    local_date,
    location_id,
    variant_id,
    business_at,
    arrived_at,
    source_table,
    source_op
  )
  select
    refund.organization_id,
    refund.store_id,
    'returns',
    public.forecast_coverage_store_local_date(
      refund.organization_id,
      refund.store_id,
      refund.occurred_at
    ),
    refund.location_id,
    refund.variant_id,
    refund.occurred_at,
    pg_catalog.clock_timestamp(),
    'return_refunds',
    'insert'
  from new_return_refunds as refund;

  return null;
end;
$$;

create trigger return_refunds_capture_forecast_coverage_corrections_insert
after insert on public.return_refunds
referencing new table as new_return_refunds
for each statement
execute function public.capture_return_refund_insert_forecast_coverage_corrections();

create or replace function public.capture_return_refund_update_forecast_coverage_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.forecast_coverage_correction_events (
    organization_id,
    store_id,
    stream,
    local_date,
    location_id,
    variant_id,
    business_at,
    arrived_at,
    source_table,
    source_op
  )
  select distinct
    grain.organization_id,
    grain.store_id,
    'returns',
    public.forecast_coverage_store_local_date(
      grain.organization_id,
      grain.store_id,
      grain.occurred_at
    ),
    grain.location_id,
    grain.variant_id,
    grain.occurred_at,
    pg_catalog.clock_timestamp(),
    'return_refunds',
    'update'
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
      previous_refund.location_id is distinct from next_refund.location_id
      or previous_refund.returned_quantity
        is distinct from next_refund.returned_quantity
      or previous_refund.occurred_at is distinct from next_refund.occurred_at
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
      previous_refund.location_id is distinct from next_refund.location_id
      or previous_refund.returned_quantity
        is distinct from next_refund.returned_quantity
      or previous_refund.occurred_at is distinct from next_refund.occurred_at
  ) as grain;

  return null;
end;
$$;

create trigger return_refunds_capture_forecast_coverage_corrections_update
after update on public.return_refunds
referencing old table as old_return_refunds new table as new_return_refunds
for each statement
execute function public.capture_return_refund_update_forecast_coverage_corrections();

create or replace function public.capture_return_refund_delete_forecast_coverage_corrections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.forecast_coverage_correction_events (
    organization_id,
    store_id,
    stream,
    local_date,
    location_id,
    variant_id,
    business_at,
    arrived_at,
    source_table,
    source_op
  )
  select
    refund.organization_id,
    refund.store_id,
    'returns',
    public.forecast_coverage_store_local_date(
      refund.organization_id,
      refund.store_id,
      refund.occurred_at
    ),
    refund.location_id,
    refund.variant_id,
    refund.occurred_at,
    pg_catalog.clock_timestamp(),
    'return_refunds',
    'delete'
  from old_return_refunds as refund;

  return null;
end;
$$;

create trigger return_refunds_capture_forecast_coverage_corrections_delete
after delete on public.return_refunds
referencing old table as old_return_refunds
for each statement
execute function public.capture_return_refund_delete_forecast_coverage_corrections();

-- -----------------------------------------------------------------------------
-- Authorized apply (bounded claim + existing invalidate agent rules)
-- -----------------------------------------------------------------------------

create or replace function public.apply_forecast_coverage_correction_events(
  p_organization_id uuid,
  p_limit integer,
  p_integration_id uuid default null,
  p_actor_user_id uuid default null
)
returns table (
  event_id bigint,
  evidence_id text,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_integration boolean := p_integration_id is not null;
  has_actor boolean := p_actor_user_id is not null;
  claimed record;
  target record;
  invalidate_row record;
  v_invalidated_at timestamptz := pg_catalog.now();
begin
  if p_organization_id is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast coverage correction apply requires organization_id';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast coverage correction apply limit must be between 1 and 100';
  end if;

  if has_integration = has_actor then
    raise exception
      using
        errcode = 'P0001',
        message = 'coverage invalidation requires exactly one of integration_id or actor_user_id';
  end if;

  for claimed in
    select e.*
    from public.forecast_coverage_correction_events as e
    where
      e.organization_id = p_organization_id
      and e.processed_at is null
    order by e.event_id
    for update skip locked
    limit p_limit
  loop
    perform public.forecast_coverage_correction_grain_lock(
      claimed.organization_id,
      claimed.store_id,
      claimed.stream,
      claimed.local_date
    );

    if has_integration then
      perform public.forecast_evidence_assert_provider_integration(
        claimed.organization_id,
        claimed.store_id,
        p_integration_id
      );
    else
      perform public.forecast_evidence_assert_merchant_actor(
        claimed.organization_id,
        claimed.store_id,
        p_actor_user_id
      );
    end if;

    for target in
      select c.*
      from public.forecast_day_coverage_evidence as c
      where
        c.organization_id = claimed.organization_id
        and c.store_id = claimed.store_id
        and c.stream = claimed.stream
        and c.local_date = claimed.local_date
        and c.invalidated_at is null
        and claimed.arrived_at > c.as_of
        and public.forecast_coverage_correction_matches_evidence(
          claimed.location_id,
          claimed.variant_id,
          c.location_id,
          c.variant_id
        )
      for update
    loop
      begin
        select *
        into invalidate_row
        from public.invalidate_forecast_day_coverage_evidence(
          claimed.organization_id,
          target.evidence_id,
          v_invalidated_at,
          claimed.arrived_at,
          p_integration_id,
          p_actor_user_id
        );

        event_id := claimed.event_id;
        evidence_id := invalidate_row.evidence_id;
        disposition := invalidate_row.disposition;
        return next;
      exception
        when others then
          if sqlerrm like '%already invalidated%' then
            event_id := claimed.event_id;
            evidence_id := target.evidence_id;
            disposition := 'already_invalidated';
            return next;
          else
            raise;
          end if;
      end;
    end loop;

    update public.forecast_coverage_correction_events as e
    set processed_at = v_invalidated_at
    where e.event_id = claimed.event_id;

    if not found then
      raise exception
        using
          errcode = 'P0001',
          message = 'forecast coverage correction event disappeared during apply';
    end if;
  end loop;
end;
$$;

revoke all
on function public.apply_forecast_coverage_correction_events(
  uuid,
  integer,
  uuid,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.apply_forecast_coverage_correction_events(
  uuid,
  integer,
  uuid,
  uuid
)
to service_role;
