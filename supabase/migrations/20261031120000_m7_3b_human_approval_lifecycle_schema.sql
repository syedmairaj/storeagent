-- StoreAgent M7.3b
-- LOCAL-ONLY human approval lifecycle SCHEMA FOUNDATION.
--
-- Contract authority: docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md
-- Preserves: docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md
--
-- In scope:
--   - Expand inventory_actions.status vocabulary to frozen domain statuses
--   - Add superseded_by_action_id with tenant-safe FK + coherence CHECKs
--   - Create append-only public.action_events with grain linkage + constraints
--   - Cross-table editedQuantity / event-type validation on event INSERT
--   - Member-scoped SELECT RLS; no browser DML grants
--
-- Explicitly OUT of scope / deferred (do NOT weaken here):
--   - Narrowing inventory_actions UPDATE immutability
--   - Merchant/system lifecycle transition RPCs
--   - HTTP / workers / cron / UI / production writer
--   - Backfilling created ActionEvents onto harness rows
--   - Purchase / supplier / payment / inventory mutation
--
-- Rationale: a generic UPDATE path that allows status/superseded_by changes
-- without a trusted SECURITY DEFINER RPC authorization boundary would bypass
-- merchant eligibility and role checks. Full-row immutability on
-- inventory_actions is PRESERVED until RPC + gated mutability ship together.

-- -----------------------------------------------------------------------------
-- 1) inventory_actions: status vocabulary (additive; existing rows stay 'new')
-- -----------------------------------------------------------------------------

alter table public.inventory_actions
  drop constraint inventory_actions_status_new_only;

alter table public.inventory_actions
  add constraint inventory_actions_status_check
  check (
    status in (
      'new',
      'accepted',
      'accepted_with_edit',
      'dismissed',
      'completed',
      'expired',
      'superseded'
    )
  );

-- -----------------------------------------------------------------------------
-- 2) inventory_actions: superseded_by_action_id (tenant-safe composite FK)
-- -----------------------------------------------------------------------------

alter table public.inventory_actions
  add column superseded_by_action_id uuid null;

-- Supports composite FK (id, organization_id) without weakening PK(id).
alter table public.inventory_actions
  add constraint inventory_actions_id_org_key
  unique (id, organization_id);

alter table public.inventory_actions
  add constraint inventory_actions_superseded_by_fk
  foreign key (superseded_by_action_id, organization_id)
  references public.inventory_actions (id, organization_id)
  on delete restrict;

alter table public.inventory_actions
  add constraint inventory_actions_supersede_not_self
  check (superseded_by_action_id is distinct from id);

alter table public.inventory_actions
  add constraint inventory_actions_supersede_status_coherence
  check (
    (
      status = 'superseded'
      and superseded_by_action_id is not null
    )
    or (
      status is distinct from 'superseded'
      and superseded_by_action_id is null
    )
  );

comment on column public.inventory_actions.superseded_by_action_id is
  'M7.3 lifecycle: set only via future trusted supersede RPC. '
  'Full-row immutability still blocks UPDATE in M7.3b.';

-- -----------------------------------------------------------------------------
-- 3) action_events: append-only merchant/system decision timeline
-- -----------------------------------------------------------------------------

create table public.action_events (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,
  variant_id uuid not null,

  inventory_action_id uuid not null,

  event_type text not null,

  edited_quantity integer null,
  note text null,

  actor_user_id uuid null,

  from_status text not null,
  to_status text not null,

  idempotency_key text not null,
  event_body_hash text not null,

  occurred_at timestamptz not null
    default pg_catalog.now(),
  created_at timestamptz not null
    default pg_catalog.now(),

  constraint action_events_event_type_check
    check (
      event_type in (
        'created',
        'accepted',
        'accepted_with_edit',
        'dismissed',
        'completed',
        'expired',
        'superseded'
      )
    ),

  constraint action_events_from_status_check
    check (
      from_status in (
        'new',
        'accepted',
        'accepted_with_edit',
        'dismissed',
        'completed',
        'expired',
        'superseded'
      )
    ),

  constraint action_events_to_status_check
    check (
      to_status in (
        'new',
        'accepted',
        'accepted_with_edit',
        'dismissed',
        'completed',
        'expired',
        'superseded'
      )
    ),

  constraint action_events_event_to_status_map
    check (
      (event_type = 'created' and to_status = 'new')
      or (event_type = 'accepted' and to_status = 'accepted')
      or (
        event_type = 'accepted_with_edit'
        and to_status = 'accepted_with_edit'
      )
      or (event_type = 'dismissed' and to_status = 'dismissed')
      or (event_type = 'completed' and to_status = 'completed')
      or (event_type = 'expired' and to_status = 'expired')
      or (event_type = 'superseded' and to_status = 'superseded')
    ),

  -- Row-local editedQuantity shape. Cross-table REORDER rules are in the
  -- BEFORE INSERT trigger (joins inventory_actions).
  constraint action_events_edited_quantity_shape
    check (
      (
        event_type = 'accepted_with_edit'
        and edited_quantity is not null
        and edited_quantity > 0
      )
      or (
        event_type is distinct from 'accepted_with_edit'
        and edited_quantity is null
      )
    ),

  constraint action_events_idempotency_key_not_blank
    check (
      pg_catalog.length(pg_catalog.btrim(idempotency_key)) > 0
    ),

  constraint action_events_event_body_hash_sha256
    check (event_body_hash ~ '^[a-f0-9]{64}$'),

  constraint action_events_organization_fk
    foreign key (organization_id)
    references public.organizations (id)
    on delete restrict,

  constraint action_events_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,

  constraint action_events_variant_fk
    foreign key (organization_id, store_id, variant_id)
    references public.product_variants (organization_id, store_id, id)
    on delete restrict,

  -- Tenant-safe action linkage (same organization).
  constraint action_events_inventory_action_fk
    foreign key (inventory_action_id, organization_id)
    references public.inventory_actions (id, organization_id)
    on delete restrict,

  constraint action_events_actor_user_fk
    foreign key (actor_user_id)
    references auth.users (id)
    on delete restrict
);

create unique index action_events_idempotency_uidx
  on public.action_events (
    organization_id,
    inventory_action_id,
    event_type,
    idempotency_key
  );

create index action_events_action_occurred_idx
  on public.action_events (
    inventory_action_id,
    occurred_at
  );

create index action_events_org_store_occurred_idx
  on public.action_events (
    organization_id,
    store_id,
    occurred_at
  );

comment on table public.action_events is
  'M7.3 append-only ActionEvent timeline. Writes reserved for future trusted '
  'lifecycle RPCs. No created-event backfill of M7.2 harness rows.';

-- -----------------------------------------------------------------------------
-- 4) Cross-table event validation (transactional; not assumed from event row)
-- -----------------------------------------------------------------------------

create or replace function public.validate_action_event_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_action public.inventory_actions%rowtype;
begin
  select *
  into v_action
  from public.inventory_actions as a
  where a.id = new.inventory_action_id
  for share;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_EVENT_ACTION_NOT_FOUND';
  end if;

  if v_action.organization_id is distinct from new.organization_id
    or v_action.store_id is distinct from new.store_id
    or v_action.variant_id is distinct from new.variant_id
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_EVENT_GRAIN_MISMATCH';
  end if;

  if new.event_type = 'accepted_with_edit' then
    if v_action.action_type is distinct from 'REORDER' then
      raise exception
        using
          errcode = 'P0001',
          message = 'ACTION_EVENT_EDIT_REQUIRES_REORDER';
    end if;

    if new.edited_quantity is null
      or new.edited_quantity <= 0
      or new.edited_quantity is not distinct from v_action.recommended_quantity
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'ACTION_EVENT_EDITED_QUANTITY_INVALID';
    end if;
  elsif new.edited_quantity is not null then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_EVENT_EDITED_QUANTITY_FORBIDDEN';
  end if;

  return new;
end;
$$;

revoke all
on function public.validate_action_event_insert()
from public, anon, authenticated, service_role;

create trigger action_events_validate_insert
before insert on public.action_events
for each row
execute function public.validate_action_event_insert();

-- -----------------------------------------------------------------------------
-- 5) Append-only immutability for action_events
-- -----------------------------------------------------------------------------

create or replace function public.prevent_action_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    using
      errcode = 'P0001',
      message = format(
        'action_events rows are immutable (%s on %s)',
        tg_op,
        tg_table_name
      );
end;
$$;

revoke all
on function public.prevent_action_event_mutation()
from public, anon, authenticated, service_role;

create trigger action_events_immutable
before update or delete on public.action_events
for each row
execute function public.prevent_action_event_mutation();

-- -----------------------------------------------------------------------------
-- 6) RLS + grants (member SELECT only; no browser/service_role DML)
-- -----------------------------------------------------------------------------

alter table public.action_events enable row level security;

revoke all
on table public.action_events
from public, anon, authenticated, service_role;

grant select
on table public.action_events
to authenticated, service_role;

create policy action_events_select_member
on public.action_events
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where
      membership.organization_id = action_events.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- inventory_actions remains fully immutable (M7.2 trigger unchanged).
-- No lifecycle transition RPCs are created in this migration.
