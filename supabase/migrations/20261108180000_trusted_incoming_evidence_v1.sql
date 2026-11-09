-- StoreAgent Trusted Incoming Evidence V1
-- Current-day purchase-order incoming for M5 metrics only.
--
-- Contract extensions (smallest necessary):
-- 1) store_incoming_evidence_attestations — explicit completeness so empty
--    destination-scoped PO sets become known zero only when attested.
-- 2) PO/item → sku_daily_metric_source_events for store-local current date.
-- 3) PO facts + attestation in sku_daily_metric_source_snapshot token fence.
-- 4) commit_sku_daily_metric SA009 lifts force-unknown only for qualified
--    current-day incoming; inventory age remains forced unknown.
--
-- Does not unlock M7 commercial actions, workers, cron, or PB1 attestation.
-- Does not change frozen incoming-stock-v1 formulas.

-- -----------------------------------------------------------------------------
-- Completeness attestation (empty set ≠ verified zero without this)
-- -----------------------------------------------------------------------------

create table public.store_incoming_evidence_attestations (
  organization_id uuid not null,
  store_id uuid not null,
  evidence_complete boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by_user_id uuid null,
  constraint store_incoming_evidence_attestations_pkey
    primary key (organization_id, store_id),
  constraint store_incoming_evidence_attestations_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on update restrict
    on delete cascade,
  constraint store_incoming_evidence_attestations_updated_by_user_fk
    foreign key (updated_by_user_id)
    references auth.users (id)
    on update restrict
    on delete set null
);

comment on table public.store_incoming_evidence_attestations is
  'Merchant attestation that destination-scoped PO evidence for a store is complete. Without evidence_complete=true, an empty PO set for a grain remains incoming unknown — never invented verified zero.';

comment on column public.store_incoming_evidence_attestations.evidence_complete is
  'When true, current-day grains with zero destination-scoped PO lines persist known incoming 0. When false/absent, empty sets stay unknown.';

alter table public.store_incoming_evidence_attestations
  enable row level security;

revoke all
on table public.store_incoming_evidence_attestations
from public, anon, authenticated;

grant select
on table public.store_incoming_evidence_attestations
to authenticated;

grant select, insert, update, delete
on table public.store_incoming_evidence_attestations
to service_role;

create policy store_incoming_evidence_attestations_select_member
on public.store_incoming_evidence_attestations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      store_incoming_evidence_attestations.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- Dirty store-local current metric grains for one store (attestation changes)
-- -----------------------------------------------------------------------------

create or replace function public.enqueue_sku_daily_metric_store_incoming_invalidation(
  p_organization_id uuid,
  p_store_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_algorithm text := 'm5-derived-metrics-v1';
  v_now timestamptz := pg_catalog.now();
  v_count integer := 0;
begin
  if p_organization_id is null or p_store_id is null then
    raise exception
      'sku daily metric store incoming invalidation requires organization and store'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.stores as store
    where store.organization_id = p_organization_id
      and store.id = p_store_id
  ) then
    raise exception
      'Store not found.'
      using errcode = 'P0002';
  end if;

  with current_grains as (
    select distinct
      metric.organization_id,
      metric.store_id,
      metric.location_id,
      metric.variant_id,
      metric.metric_date,
      metric.algorithm_version
    from public.sku_daily_metrics as metric
    join public.stores as store
      on store.organization_id = metric.organization_id
      and store.id = metric.store_id
    where metric.organization_id = p_organization_id
      and metric.store_id = p_store_id
      and metric.algorithm_version = v_algorithm
      and metric.metric_date =
        (pg_catalog.timezone(store.timezone, v_now))::date
  ),
  bumped as (
    insert into public.sku_daily_metric_recompute_requests (
      organization_id,
      store_id,
      location_id,
      variant_id,
      metric_date,
      algorithm_version,
      dirty_generation,
      claimed_generation,
      applied_generation,
      status,
      attempt_count,
      queued_at,
      updated_at
    )
    select
      current_grains.organization_id,
      current_grains.store_id,
      current_grains.location_id,
      current_grains.variant_id,
      current_grains.metric_date,
      current_grains.algorithm_version,
      1,
      0,
      0,
      'queued',
      0,
      v_now,
      v_now
    from current_grains
    on conflict (
      organization_id,
      store_id,
      location_id,
      variant_id,
      metric_date,
      algorithm_version
    )
    do update set
      dirty_generation =
        public.sku_daily_metric_recompute_requests.dirty_generation
        + excluded.dirty_generation,
      status = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.status
        else 'queued'
      end,
      attempt_count = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.attempt_count
        else 0
      end,
      lease_owner_id = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.lease_owner_id
        else null
      end,
      lease_claim_token = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.lease_claim_token
        else null
      end,
      lease_claimed_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.lease_claimed_at
        else null
      end,
      lease_expires_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.lease_expires_at
        else null
      end,
      started_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.started_at
        else null
      end,
      finished_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.finished_at
        else null
      end,
      queued_at = case
        when public.sku_daily_metric_recompute_requests.status
          in ('claimed', 'running')
          then public.sku_daily_metric_recompute_requests.queued_at
        else v_now
      end,
      updated_at = v_now
    returning 1
  )
  select count(*)::integer
  into v_count
  from bumped;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.enqueue_sku_daily_metric_store_incoming_invalidation(uuid, uuid) is
  'Dirties store-local current sku_daily_metrics grains after incoming-evidence attestation changes. Preserves M5.6C lease/dirty_generation semantics.';

revoke all
on function public.enqueue_sku_daily_metric_store_incoming_invalidation(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.enqueue_sku_daily_metric_store_incoming_invalidation(uuid, uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- Merchant upsert for completeness attestation (owner/admin)
-- -----------------------------------------------------------------------------

create or replace function public.upsert_current_user_store_incoming_evidence_attestation(
  p_organization_id uuid,
  p_store_id uuid,
  p_evidence_complete boolean
)
returns table (
  organization_id uuid,
  store_id uuid,
  evidence_complete boolean,
  updated_at timestamptz,
  updated_by_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid;
  member_role text;
  written_organization_id uuid;
  written_store_id uuid;
  written_evidence_complete boolean;
  written_updated_at timestamptz;
  written_updated_by_user_id uuid;
begin
  authenticated_user_id := auth.uid();

  if authenticated_user_id is null then
    raise exception
      'Authentication required.'
      using errcode = '42501';
  end if;

  if p_organization_id is null or p_store_id is null then
    raise exception
      'Organization and store are required.'
      using errcode = '22023';
  end if;

  if p_evidence_complete is null then
    raise exception
      'evidence_complete is required.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.stores as store
    where store.organization_id = p_organization_id
      and store.id = p_store_id
  ) then
    raise exception
      'Store not found.'
      using errcode = 'P0002';
  end if;

  select membership.role
  into member_role
  from public.organization_members as membership
  where membership.organization_id = p_organization_id
    and membership.user_id = authenticated_user_id;

  if member_role is null then
    raise exception
      'Organization membership required.'
      using errcode = '42501';
  end if;

  if member_role not in ('owner', 'admin') then
    raise exception
      'Incoming evidence attestation requires owner or admin.'
      using errcode = '42501';
  end if;

  insert into public.store_incoming_evidence_attestations as attestation (
    organization_id,
    store_id,
    evidence_complete,
    updated_at,
    updated_by_user_id
  )
  values (
    p_organization_id,
    p_store_id,
    p_evidence_complete,
    pg_catalog.now(),
    authenticated_user_id
  )
  on conflict on constraint store_incoming_evidence_attestations_pkey do update
  set
    evidence_complete = excluded.evidence_complete,
    updated_at = pg_catalog.now(),
    updated_by_user_id = authenticated_user_id
  where exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = attestation.organization_id
      and membership.user_id = authenticated_user_id
      and membership.role in ('owner', 'admin')
  )
  returning
    attestation.organization_id,
    attestation.store_id,
    attestation.evidence_complete,
    attestation.updated_at,
    attestation.updated_by_user_id
  into
    written_organization_id,
    written_store_id,
    written_evidence_complete,
    written_updated_at,
    written_updated_by_user_id;

  if written_organization_id is null then
    raise exception
      'Incoming evidence attestation requires owner or admin.'
      using errcode = '42501';
  end if;

  perform public.enqueue_sku_daily_metric_store_incoming_invalidation(
    written_organization_id,
    written_store_id
  );

  return query
  select
    written_organization_id,
    written_store_id,
    written_evidence_complete,
    written_updated_at,
    written_updated_by_user_id;
end;
$$;

comment on function public.upsert_current_user_store_incoming_evidence_attestation(
  uuid, uuid, boolean
) is
  'Owner/admin attestation that store PO incoming evidence is complete. Atomic with current-day metric invalidation. Does not unlock commercial actions.';

revoke all
on function public.upsert_current_user_store_incoming_evidence_attestation(
  uuid, uuid, boolean
)
from public, anon, service_role;

grant execute
on function public.upsert_current_user_store_incoming_evidence_attestation(
  uuid, uuid, boolean
)
to authenticated;

-- -----------------------------------------------------------------------------
-- PO → metric source events (store-local current date; null destination excluded)
-- -----------------------------------------------------------------------------

create or replace function public.capture_purchase_order_metric_source_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Header status (or identity-adjacent) changes affect every destination-
  -- scoped item grain under the PO for the store-local current date.
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
    item.destination_location_id,
    item.variant_id,
    (pg_catalog.timezone(store.timezone, pg_catalog.now()))::date,
    'm5-derived-metrics-v1'
  from (
    select
      previous_po.id,
      previous_po.organization_id,
      previous_po.store_id
    from old_purchase_orders as previous_po
    join new_purchase_orders as next_po
      on next_po.id = previous_po.id
    where previous_po.status is distinct from next_po.status
    union
    select
      next_po.id,
      next_po.organization_id,
      next_po.store_id
    from old_purchase_orders as previous_po
    join new_purchase_orders as next_po
      on next_po.id = previous_po.id
    where previous_po.status is distinct from next_po.status
  ) as changed_po
  join public.purchase_order_items as item
    on item.organization_id = changed_po.organization_id
    and item.store_id = changed_po.store_id
    and item.purchase_order_id = changed_po.id
  join public.stores as store
    on store.organization_id = item.organization_id
    and store.id = item.store_id
  where item.destination_location_id is not null;

  return null;
end;
$$;

create trigger purchase_orders_capture_metric_source_events
after update on public.purchase_orders
referencing old table as old_purchase_orders new table as new_purchase_orders
for each statement
execute function public.capture_purchase_order_metric_source_events();

create or replace function public.capture_purchase_order_item_insert_metric_source_events()
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
    item.destination_location_id,
    item.variant_id,
    (pg_catalog.timezone(store.timezone, pg_catalog.now()))::date,
    'm5-derived-metrics-v1'
  from new_purchase_order_items as item
  join public.stores as store
    on store.organization_id = item.organization_id
    and store.id = item.store_id
  where item.destination_location_id is not null;

  return null;
end;
$$;

create trigger purchase_order_items_capture_metric_source_events_insert
after insert on public.purchase_order_items
referencing new table as new_purchase_order_items
for each statement
execute function public.capture_purchase_order_item_insert_metric_source_events();

create or replace function public.capture_purchase_order_item_update_metric_source_events()
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
    (pg_catalog.timezone(store.timezone, pg_catalog.now()))::date,
    'm5-derived-metrics-v1'
  from (
    select
      previous_item.organization_id,
      previous_item.store_id,
      previous_item.destination_location_id as location_id,
      previous_item.variant_id
    from old_purchase_order_items as previous_item
    join new_purchase_order_items as next_item
      on next_item.id = previous_item.id
    where
      previous_item.destination_location_id is not null
      and (
        previous_item.destination_location_id
          is distinct from next_item.destination_location_id
        or previous_item.variant_id is distinct from next_item.variant_id
        or previous_item.ordered_quantity
          is distinct from next_item.ordered_quantity
        or previous_item.received_quantity
          is distinct from next_item.received_quantity
      )
    union
    select
      next_item.organization_id,
      next_item.store_id,
      next_item.destination_location_id as location_id,
      next_item.variant_id
    from old_purchase_order_items as previous_item
    join new_purchase_order_items as next_item
      on next_item.id = previous_item.id
    where
      next_item.destination_location_id is not null
      and (
        previous_item.destination_location_id
          is distinct from next_item.destination_location_id
        or previous_item.variant_id is distinct from next_item.variant_id
        or previous_item.ordered_quantity
          is distinct from next_item.ordered_quantity
        or previous_item.received_quantity
          is distinct from next_item.received_quantity
      )
  ) as grain
  join public.stores as store
    on store.organization_id = grain.organization_id
    and store.id = grain.store_id;

  return null;
end;
$$;

create trigger purchase_order_items_capture_metric_source_events_update
after update on public.purchase_order_items
referencing old table as old_purchase_order_items
  new table as new_purchase_order_items
for each statement
execute function public.capture_purchase_order_item_update_metric_source_events();

create or replace function public.capture_purchase_order_item_delete_metric_source_events()
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
    item.destination_location_id,
    item.variant_id,
    (pg_catalog.timezone(store.timezone, pg_catalog.now()))::date,
    'm5-derived-metrics-v1'
  from old_purchase_order_items as item
  join public.stores as store
    on store.organization_id = item.organization_id
    and store.id = item.store_id
  where item.destination_location_id is not null;

  return null;
end;
$$;

create trigger purchase_order_items_capture_metric_source_events_delete
after delete on public.purchase_order_items
referencing old table as old_purchase_order_items
for each statement
execute function public.capture_purchase_order_item_delete_metric_source_events();

revoke all
on function public.capture_purchase_order_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_purchase_order_item_insert_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_purchase_order_item_update_metric_source_events()
from public, anon, authenticated;

revoke all
on function public.capture_purchase_order_item_delete_metric_source_events()
from public, anon, authenticated;

grant execute
on function public.capture_purchase_order_metric_source_events()
to service_role;

grant execute
on function public.capture_purchase_order_item_insert_metric_source_events()
to service_role;

grant execute
on function public.capture_purchase_order_item_update_metric_source_events()
to service_role;

grant execute
on function public.capture_purchase_order_item_delete_metric_source_events()
to service_role;

-- -----------------------------------------------------------------------------
-- Source snapshot: include destination-scoped PO lines + attestation in token
-- -----------------------------------------------------------------------------

create or replace function public.sku_daily_metric_source_snapshot(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
  then
    raise exception
      'sku daily metric scope requires organization, store, location, and variant';
  end if;

  with store_row as (
    select s.timezone
    from public.stores s
    where
      s.organization_id = p_organization_id
      and s.id = p_store_id
  ),
  location_ok as (
    select 1 as present
    from public.locations l
    where
      l.organization_id = p_organization_id
      and l.store_id = p_store_id
      and l.id = p_location_id
  ),
  variant_ok as (
    select 1 as present
    from public.product_variants pv
    where
      pv.organization_id = p_organization_id
      and pv.store_id = p_store_id
      and pv.id = p_variant_id
  ),
  scoped_items as (
    select
      i.id as item_id,
      i.organization_id,
      i.store_id,
      i.order_id,
      i.variant_id,
      i.location_id,
      i.quantity,
      o.status,
      o.ordered_at,
      pg_catalog.concat_ws(
        '|',
        'order_item',
        i.id::text,
        o.id::text,
        o.status,
        o.ordered_at::text,
        i.variant_id::text,
        i.location_id::text,
        i.quantity::text
      ) as line
    from public.order_items i
    join public.orders o
      on o.organization_id = i.organization_id
      and o.store_id = i.store_id
      and o.id = i.order_id
    where
      i.organization_id = p_organization_id
      and i.store_id = p_store_id
      and i.location_id = p_location_id
      and i.variant_id = p_variant_id
  ),
  scoped_returns as (
    select
      r.id,
      r.organization_id,
      r.store_id,
      r.variant_id,
      r.location_id,
      r.returned_quantity,
      r.occurred_at,
      pg_catalog.concat_ws(
        '|',
        'return',
        r.id::text,
        r.variant_id::text,
        coalesce(r.location_id::text, ''::text),
        coalesce(r.returned_quantity::text, ''::text),
        r.occurred_at::text
      ) as line
    from public.return_refunds r
    where
      r.organization_id = p_organization_id
      and r.store_id = p_store_id
      and r.location_id = p_location_id
      and r.variant_id = p_variant_id
  ),
  scoped_snapshots as (
    select
      n.id,
      n.organization_id,
      n.store_id,
      n.location_id,
      n.variant_id,
      n.observed_at,
      n.available_quantity,
      pg_catalog.concat_ws(
        '|',
        'snapshot',
        n.id::text,
        n.variant_id::text,
        n.location_id::text,
        n.observed_at::text,
        coalesce(n.available_quantity::text, ''::text)
      ) as line
    from public.inventory_snapshots n
    where
      n.organization_id = p_organization_id
      and n.store_id = p_store_id
      and n.location_id = p_location_id
      and n.variant_id = p_variant_id
  ),
  scoped_po_lines as (
    select
      item.id as item_id,
      item.organization_id,
      item.store_id,
      item.purchase_order_id,
      item.variant_id,
      item.destination_location_id as location_id,
      item.ordered_quantity,
      item.received_quantity,
      po.status as purchase_order_status,
      pg_catalog.concat_ws(
        '|',
        'po_item',
        item.id::text,
        po.id::text,
        po.status,
        item.variant_id::text,
        item.destination_location_id::text,
        item.ordered_quantity::text,
        coalesce(item.received_quantity::text, ''::text)
      ) as line
    from public.purchase_order_items as item
    join public.purchase_orders as po
      on po.organization_id = item.organization_id
      and po.store_id = item.store_id
      and po.id = item.purchase_order_id
    where
      item.organization_id = p_organization_id
      and item.store_id = p_store_id
      and item.destination_location_id = p_location_id
      and item.variant_id = p_variant_id
  ),
  attestation_row as (
    select
      coalesce(attestation.evidence_complete, false) as evidence_complete,
      attestation.updated_at
    from public.store_incoming_evidence_attestations as attestation
    where attestation.organization_id = p_organization_id
      and attestation.store_id = p_store_id
  ),
  evidence as (
    select line from scoped_items
    union all
    select line from scoped_returns
    union all
    select line from scoped_snapshots
    union all
    select line from scoped_po_lines
    union all
    select pg_catalog.concat_ws(
      '|',
      'incoming_attestation',
      p_store_id::text,
      case
        when exists (select 1 from attestation_row)
          then (
            select case
              when attestation_row.evidence_complete then 'true'
              else 'false'
            end
            from attestation_row
          )
        else 'absent'
      end,
      coalesce(
        (
          select attestation_row.updated_at::text
          from attestation_row
        ),
        ''::text
      )
    )
  )
  select pg_catalog.jsonb_build_object(
    'scopeError',
    case
      when not exists (select 1 from store_row) then 'store'
      when not exists (select 1 from location_ok) then 'location'
      when not exists (select 1 from variant_ok) then 'variant'
      else null
    end,
    'payload',
    case
      when exists (select 1 from store_row)
        and exists (select 1 from location_ok)
        and exists (select 1 from variant_ok)
      then pg_catalog.jsonb_build_object(
        'timeZone', (select store_row.timezone from store_row),
        'sourceToken', pg_catalog.md5(
          pg_catalog.concat_ws(
            E'\n',
            'timezone=' || (select store_row.timezone from store_row),
            coalesce((
              select pg_catalog.string_agg(
                evidence.line,
                E'\n'
                order by evidence.line
              )
              from evidence
            ), ''::text)
          )
        ),
        'orders', coalesce((
          select pg_catalog.jsonb_agg(order_row.payload order by order_row.order_id)
          from (
            select distinct on (scoped_items.order_id)
              scoped_items.order_id,
              pg_catalog.jsonb_build_object(
                'id', scoped_items.order_id,
                'organizationId', scoped_items.organization_id,
                'storeId', scoped_items.store_id,
                'status', scoped_items.status,
                'orderedAt', scoped_items.ordered_at
              ) as payload
            from scoped_items
            order by scoped_items.order_id
          ) as order_row
        ), '[]'::jsonb),
        'orderItems', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', scoped_items.item_id,
              'organizationId', scoped_items.organization_id,
              'storeId', scoped_items.store_id,
              'orderId', scoped_items.order_id,
              'variantId', scoped_items.variant_id,
              'locationId', scoped_items.location_id,
              'quantity', scoped_items.quantity
            )
            order by scoped_items.item_id
          )
          from scoped_items
        ), '[]'::jsonb),
        'returnRefunds', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', scoped_returns.id,
              'organizationId', scoped_returns.organization_id,
              'storeId', scoped_returns.store_id,
              'variantId', scoped_returns.variant_id,
              'locationId', scoped_returns.location_id,
              'returnedQuantity', scoped_returns.returned_quantity,
              'occurredAt', scoped_returns.occurred_at
            )
            order by scoped_returns.id
          )
          from scoped_returns
        ), '[]'::jsonb),
        'inventorySnapshots', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', scoped_snapshots.id,
              'organizationId', scoped_snapshots.organization_id,
              'storeId', scoped_snapshots.store_id,
              'locationId', scoped_snapshots.location_id,
              'variantId', scoped_snapshots.variant_id,
              'observedAt', scoped_snapshots.observed_at,
              'availableQuantity', scoped_snapshots.available_quantity
            )
            order by scoped_snapshots.id
          )
          from scoped_snapshots
        ), '[]'::jsonb),
        'purchaseOrderLines', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', scoped_po_lines.item_id,
              'organizationId', scoped_po_lines.organization_id,
              'storeId', scoped_po_lines.store_id,
              'purchaseOrderId', scoped_po_lines.purchase_order_id,
              'variantId', scoped_po_lines.variant_id,
              'locationId', scoped_po_lines.location_id,
              'status', scoped_po_lines.purchase_order_status,
              'orderedQuantity', scoped_po_lines.ordered_quantity,
              'receivedQuantity', scoped_po_lines.received_quantity
            )
            order by scoped_po_lines.item_id
          )
          from scoped_po_lines
        ), '[]'::jsonb),
        'incomingEvidenceComplete', coalesce(
          (select attestation_row.evidence_complete from attestation_row),
          false
        )
      )
      else null
    end
  )
  into result
  from (select 1) as snapshot_anchor;

  if result->>'scopeError' = 'store' then
    raise exception
      'store is outside trusted scope';
  end if;

  if result->>'scopeError' = 'location' then
    raise exception
      'location is outside trusted scope';
  end if;

  if result->>'scopeError' = 'variant' then
    raise exception
      'variant is outside trusted scope';
  end if;

  return result->'payload';
end;
$$;

revoke all
on function public.sku_daily_metric_source_snapshot(uuid, uuid, uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.sku_daily_metric_source_snapshot(uuid, uuid, uuid, uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- Commit: fence PO tables; allow qualified current-day incoming only
-- -----------------------------------------------------------------------------

create or replace function public.commit_sku_daily_metric(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_source_token text,
  p_metric jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_snapshot jsonb;
  metric_id uuid;
  metric_algorithm_version constant text := 'm5-derived-metrics-v1';
  v_time_zone text;
  v_as_of date;
  v_incoming_qty integer;
  v_incoming_reason text;
  v_inventory_position integer;
  v_available_qty integer;
  v_incoming_json jsonb;
  v_position_json jsonb;
begin
  perform pg_catalog.set_config('lock_timeout', '2s', true);

  -- Fixed order. SHARE blocks source INSERT, UPDATE, and DELETE
  -- until this transaction commits.
  lock table public.stores in share mode;
  lock table public.orders in share mode;
  lock table public.order_items in share mode;
  lock table public.return_refunds in share mode;
  lock table public.inventory_snapshots in share mode;
  lock table public.purchase_orders in share mode;
  lock table public.purchase_order_items in share mode;
  lock table public.store_incoming_evidence_attestations in share mode;

  current_snapshot := public.sku_daily_metric_source_snapshot(
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id
  );

  if current_snapshot->>'sourceToken' is distinct from p_source_token
    or current_snapshot->>'timeZone' is distinct from p_metric->>'timeZone'
  then
    raise exception
      'sku daily metric source token mismatch'
      using errcode = 'SA008';
  end if;

  v_time_zone := p_metric->>'timeZone';
  if v_time_zone is null or btrim(v_time_zone) = '' then
    raise exception
      'sku daily metric persistence rejected an invalid result'
      using errcode = 'SA009';
  end if;

  begin
    v_as_of := (pg_catalog.timezone(v_time_zone, pg_catalog.now()))::date;
  exception
    when others then
      raise exception
        'sku daily metric persistence rejected an invalid result'
        using errcode = 'SA009';
  end;

  v_incoming_json := p_metric->'eligibleIncomingQuantity';
  v_position_json := p_metric->'inventoryPosition';
  v_incoming_reason := p_metric->>'eligibleIncomingReasonCode';
  v_available_qty := (p_metric->>'availableQuantity')::integer;

  if v_incoming_json is null or jsonb_typeof(v_incoming_json) = 'null' then
    v_incoming_qty := null;
  else
    v_incoming_qty := (p_metric->>'eligibleIncomingQuantity')::integer;
  end if;

  if v_position_json is null or jsonb_typeof(v_position_json) = 'null' then
    v_inventory_position := null;
  else
    v_inventory_position := (p_metric->>'inventoryPosition')::integer;
  end if;

  -- Inventory age remains unavailable on this path.
  if p_metric_date is null
    or p_metric->>'inventoryAgeDays' is not null
    or p_metric->>'inventoryAgeQuality' is distinct from 'unavailable'
    or p_metric->>'inventoryAgeReasonCode'
      is distinct from 'inventory_age_unknown'
  then
    raise exception
      'sku daily metric persistence rejected an invalid result'
      using errcode = 'SA009';
  end if;

  -- Null↔reason coupling for incoming.
  if (v_incoming_qty is null) <> (v_incoming_reason is not null) then
    raise exception
      'sku daily metric persistence rejected an invalid result'
      using errcode = 'SA009';
  end if;

  if v_incoming_qty is not null and v_incoming_qty < 0 then
    raise exception
      'sku daily metric persistence rejected an invalid result'
      using errcode = 'SA009';
  end if;

  -- Historical metric dates: force unknown incoming (no PO as-of history).
  if p_metric_date is distinct from v_as_of then
    if v_incoming_qty is not null
      or v_inventory_position is not null
      or v_incoming_reason is distinct from 'incoming_state_unknown'
    then
      raise exception
        'sku daily metric persistence rejected an invalid result'
        using errcode = 'SA009';
    end if;
  else
    -- Current-day: allow known qty/0 with null reason, or fail-closed reasons.
    if v_incoming_qty is null
      and v_incoming_reason not in (
        'incoming_state_unknown',
        'purchase_order_status_unknown',
        'received_quantity_unknown',
        'received_exceeds_ordered'
      )
    then
      raise exception
        'sku daily metric persistence rejected an invalid result'
        using errcode = 'SA009';
    end if;

    -- inventory_position identity: null unless both available and incoming known.
    if v_available_qty is null or v_incoming_qty is null then
      if v_inventory_position is not null then
        raise exception
          'sku daily metric persistence rejected an invalid result'
          using errcode = 'SA009';
      end if;
    elsif v_inventory_position is distinct from (v_available_qty + v_incoming_qty) then
      raise exception
        'sku daily metric persistence rejected an invalid result'
        using errcode = 'SA009';
    end if;
  end if;

  insert into public.sku_daily_metrics (
    organization_id,
    store_id,
    location_id,
    variant_id,
    metric_date,
    algorithm_version,
    units_sold,
    returned_units,
    net_units_sold,
    eligible_days_7d,
    eligible_days_14d,
    eligible_days_30d,
    eligible_days_90d,
    coverage_ratio_7d,
    coverage_ratio_14d,
    coverage_ratio_30d,
    coverage_ratio_90d,
    sales_velocity_7d,
    sales_velocity_14d,
    sales_velocity_30d,
    sales_velocity_90d,
    sales_velocity_7d_reason_code,
    sales_velocity_14d_reason_code,
    sales_velocity_30d_reason_code,
    sales_velocity_90d_reason_code,
    available_quantity,
    eligible_incoming_quantity,
    eligible_incoming_reason_code,
    inventory_position,
    days_of_stock,
    days_of_stock_reason_code,
    sell_through_rate,
    sell_through_reason_code,
    inventory_age_days,
    inventory_age_quality,
    inventory_age_reason_code,
    demand_trend,
    demand_trend_reason_code,
    safety_stock,
    safety_stock_reason_code,
    reorder_point,
    reorder_point_reason_code,
    target_stock,
    target_stock_reason_code
  )
  values (
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_metric_date,
    metric_algorithm_version,
    (p_metric->>'unitsSold')::integer,
    (p_metric->>'returnedUnits')::integer,
    (p_metric->>'netUnitsSold')::integer,
    (p_metric->>'eligibleDays7d')::integer,
    (p_metric->>'eligibleDays14d')::integer,
    (p_metric->>'eligibleDays30d')::integer,
    (p_metric->>'eligibleDays90d')::integer,
    (p_metric->>'eligibleDays7d')::numeric / 7,
    (p_metric->>'eligibleDays14d')::numeric / 14,
    (p_metric->>'eligibleDays30d')::numeric / 30,
    (p_metric->>'eligibleDays90d')::numeric / 90,
    (p_metric->>'salesVelocity7d')::numeric,
    (p_metric->>'salesVelocity14d')::numeric,
    (p_metric->>'salesVelocity30d')::numeric,
    (p_metric->>'salesVelocity90d')::numeric,
    (p_metric->>'salesVelocity7dReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'salesVelocity14dReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'salesVelocity30dReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'salesVelocity90dReasonCode')::public.sku_daily_metric_reason_code,
    v_available_qty,
    v_incoming_qty,
    v_incoming_reason::public.sku_daily_metric_reason_code,
    v_inventory_position,
    (p_metric->>'daysOfStock')::numeric,
    (p_metric->>'daysOfStockReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'sellThroughRate')::numeric,
    (p_metric->>'sellThroughReasonCode')::public.sku_daily_metric_reason_code,
    null,
    'unavailable',
    'inventory_age_unknown',
    p_metric->>'demandTrend',
    (p_metric->>'demandTrendReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'safetyStock')::integer,
    (p_metric->>'safetyStockReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'reorderPoint')::integer,
    (p_metric->>'reorderPointReasonCode')::public.sku_daily_metric_reason_code,
    (p_metric->>'targetStock')::integer,
    (p_metric->>'targetStockReasonCode')::public.sku_daily_metric_reason_code
  )
  on conflict (
    organization_id,
    store_id,
    location_id,
    variant_id,
    metric_date,
    algorithm_version
  )
  do update set
    units_sold = excluded.units_sold,
    returned_units = excluded.returned_units,
    net_units_sold = excluded.net_units_sold,
    eligible_days_7d = excluded.eligible_days_7d,
    eligible_days_14d = excluded.eligible_days_14d,
    eligible_days_30d = excluded.eligible_days_30d,
    eligible_days_90d = excluded.eligible_days_90d,
    coverage_ratio_7d = excluded.coverage_ratio_7d,
    coverage_ratio_14d = excluded.coverage_ratio_14d,
    coverage_ratio_30d = excluded.coverage_ratio_30d,
    coverage_ratio_90d = excluded.coverage_ratio_90d,
    sales_velocity_7d = excluded.sales_velocity_7d,
    sales_velocity_14d = excluded.sales_velocity_14d,
    sales_velocity_30d = excluded.sales_velocity_30d,
    sales_velocity_90d = excluded.sales_velocity_90d,
    sales_velocity_7d_reason_code = excluded.sales_velocity_7d_reason_code,
    sales_velocity_14d_reason_code = excluded.sales_velocity_14d_reason_code,
    sales_velocity_30d_reason_code = excluded.sales_velocity_30d_reason_code,
    sales_velocity_90d_reason_code = excluded.sales_velocity_90d_reason_code,
    available_quantity = excluded.available_quantity,
    eligible_incoming_quantity = excluded.eligible_incoming_quantity,
    eligible_incoming_reason_code = excluded.eligible_incoming_reason_code,
    inventory_position = excluded.inventory_position,
    days_of_stock = excluded.days_of_stock,
    days_of_stock_reason_code = excluded.days_of_stock_reason_code,
    sell_through_rate = excluded.sell_through_rate,
    sell_through_reason_code = excluded.sell_through_reason_code,
    inventory_age_days = excluded.inventory_age_days,
    inventory_age_quality = excluded.inventory_age_quality,
    inventory_age_reason_code = excluded.inventory_age_reason_code,
    demand_trend = excluded.demand_trend,
    demand_trend_reason_code = excluded.demand_trend_reason_code,
    safety_stock = excluded.safety_stock,
    safety_stock_reason_code = excluded.safety_stock_reason_code,
    reorder_point = excluded.reorder_point,
    reorder_point_reason_code = excluded.reorder_point_reason_code,
    target_stock = excluded.target_stock,
    target_stock_reason_code = excluded.target_stock_reason_code
  returning id
  into metric_id;

  return metric_id;
end;
$$;

comment on function public.commit_sku_daily_metric(
  uuid, uuid, uuid, uuid, date, text, jsonb
) is
  'Persists one sku_daily_metrics grain under source SHARE locks. SA008 fences source token including PO/attestation. SA009 allows qualified current-day trusted incoming only; age stays unknown. Does not unlock commercial actions.';

revoke all
on function public.commit_sku_daily_metric(
  uuid, uuid, uuid, uuid, date, text, jsonb
)
from public, anon, authenticated;

grant execute
on function public.commit_sku_daily_metric(
  uuid, uuid, uuid, uuid, date, text, jsonb
)
to service_role;
