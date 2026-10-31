-- StoreAgent M7.3c
-- LOCAL-ONLY trusted human approval lifecycle RPCs + narrowly gated immutability.
--
-- Contract authority: docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md
--
-- Gate token (transaction-local):
--   set_config('storeagent.inventory_action_lifecycle_gate',
--              'trusted_lifecycle_rpc_v1', true)
-- Only SECURITY DEFINER lifecycle RPCs set this token immediately before
-- inventory_actions UPDATE / action_events INSERT. Roles still have no table DML.
-- service_role cannot UPDATE inventory_actions directly (grants revoked) and
-- cannot EXECUTE the merchant RPC. Merchant consent requires auth.uid().
--
-- Merchant eligibility is universally fail-closed until a separately approved
-- production source-of-create exists. No source-class string bypass is shipped.
-- M7.2 source_class / trust_hard_false CHECKs are left unchanged.
--
-- Out of scope: HTTP/UI, workers/cron, hosted activate, buying, M5/M6 changes.

-- -----------------------------------------------------------------------------
-- 1) Narrowly gated inventory_actions immutability
-- -----------------------------------------------------------------------------

create or replace function public.prevent_inventory_action_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_gate text;
begin
  if tg_op = 'DELETE' then
    raise exception
      using
        errcode = 'P0001',
        message = format(
          'inventory_actions rows are immutable (%s on %s)',
          tg_op,
          tg_table_name
        );
  end if;

  v_gate := pg_catalog.current_setting(
    'storeagent.inventory_action_lifecycle_gate',
    true
  );

  if v_gate is distinct from 'trusted_lifecycle_rpc_v1' then
    raise exception
      using
        errcode = 'P0001',
        message = format(
          'inventory_actions rows are immutable (%s on %s)',
          tg_op,
          tg_table_name
        );
  end if;

  -- Trusted lifecycle RPCs may change ONLY status + superseded_by_action_id.
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
    or new.location_id is distinct from old.location_id
    or new.variant_id is distinct from old.variant_id
    or new.decision_as_of_date is distinct from old.decision_as_of_date
    or new.pinned_time_zone is distinct from old.pinned_time_zone
    or new.action_type is distinct from old.action_type
    or new.compatible_secondary_action_types
      is distinct from old.compatible_secondary_action_types
    or new.priority is distinct from old.priority
    or new.recommended_quantity is distinct from old.recommended_quantity
    or new.recommended_action_date is distinct from old.recommended_action_date
    or new.confidence is distinct from old.confidence
    or new.evidence_snapshot is distinct from old.evidence_snapshot
    or new.incoming_state_known is distinct from old.incoming_state_known
    or new.evidence_source_class is distinct from old.evidence_source_class
    or new.metric_date is distinct from old.metric_date
    or new.metric_algorithm_version is distinct from old.metric_algorithm_version
    or new.metric_source_watermark is distinct from old.metric_source_watermark
    or new.forecast_run_id is distinct from old.forecast_run_id
    or new.algorithm_version is distinct from old.algorithm_version
    or new.configuration_version is distinct from old.configuration_version
    or new.algorithm_versions is distinct from old.algorithm_versions
    or new.decision_reproducibility_fingerprint
      is distinct from old.decision_reproducibility_fingerprint
    or new.evidence_provenance_fingerprint
      is distinct from old.evidence_provenance_fingerprint
    or new.decision_body_hash is distinct from old.decision_body_hash
    or new.claims_merchant_facing is distinct from old.claims_merchant_facing
    or new.claims_production_forecast_approval
      is distinct from old.claims_production_forecast_approval
    or new.claims_m7_production_eligibility
      is distinct from old.claims_m7_production_eligibility
    or new.algorithm_approved is distinct from old.algorithm_approved
    or new.is_scored_merchant_decision
      is distinct from old.is_scored_merchant_decision
    or new.created_at is distinct from old.created_at
  then
    raise exception
      using
        errcode = 'P0001',
        message =
          'inventory_actions lifecycle gate allows only status and superseded_by_action_id mutation';
  end if;

  return new;
end;
$$;

revoke all
on function public.prevent_inventory_action_mutation()
from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Gate action_events INSERT to trusted lifecycle RPCs
-- -----------------------------------------------------------------------------

create or replace function public.validate_action_event_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_action public.inventory_actions%rowtype;
  v_gate text;
begin
  v_gate := pg_catalog.current_setting(
    'storeagent.inventory_action_lifecycle_gate',
    true
  );

  if v_gate is distinct from 'trusted_lifecycle_rpc_v1' then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_EVENT_INSERT_REQUIRES_LIFECYCLE_RPC';
  end if;

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

-- -----------------------------------------------------------------------------
-- 4) Shared helpers (history-policy parity + eligibility + event hash)
-- -----------------------------------------------------------------------------

create or replace function public.inventory_action_can_transition_status(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from is null or p_to is null then false
    when p_from = p_to then true
    when p_from in ('dismissed', 'completed', 'expired', 'superseded') then false
    when p_from = 'new' and p_to in (
      'accepted', 'accepted_with_edit', 'dismissed', 'expired', 'superseded'
    ) then true
    when p_from = 'accepted' and p_to in ('completed', 'superseded') then true
    when p_from = 'accepted_with_edit' and p_to in ('completed', 'superseded') then true
    else false
  end;
$$;

revoke all
on function public.inventory_action_can_transition_status(text, text)
from public, anon, authenticated;

grant execute
on function public.inventory_action_can_transition_status(text, text)
to service_role;

create or replace function public.inventory_action_is_merchant_approvable(
  p_action public.inventory_actions
)
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Fail-closed for every current source class / trust shape.
  -- Production merchant approval requires a separately approved
  -- source-of-create contract; do not add string allowlists here.
  select case when p_action is null then false else false end;
$$;

revoke all
on function public.inventory_action_is_merchant_approvable(public.inventory_actions)
from public, anon, authenticated;

grant execute
on function public.inventory_action_is_merchant_approvable(public.inventory_actions)
to service_role;

-- Intent hash is stable across retries. from_status is audited on the event
-- row but omitted here so replay after status change does not false-conflict.
create or replace function public.inventory_action_event_body_hash(
  p_event_type text,
  p_edited_quantity integer,
  p_note text,
  p_to_status text,
  p_superseded_by_action_id uuid
)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.inventory_action_sha256_hex(
    public.inventory_action_stable_serialize(
      jsonb_strip_nulls(
        jsonb_build_object(
          'editedQuantity', to_jsonb(p_edited_quantity),
          'eventType', to_jsonb(p_event_type),
          'note', to_jsonb(p_note),
          'supersededByActionId', to_jsonb(p_superseded_by_action_id),
          'toStatus', to_jsonb(p_to_status)
        )
      )
    )
  );
$$;

revoke all
on function public.inventory_action_event_body_hash(
  text, integer, text, text, uuid
)
from public, anon, authenticated;

grant execute
on function public.inventory_action_event_body_hash(
  text, integer, text, text, uuid
)
to service_role;

create or replace function public.inventory_action_require_decide_membership(
  p_organization_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
begin
  v_uid := (select auth.uid());

  if v_uid is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_AUTH_REQUIRED';
  end if;

  select membership.role
  into v_role
  from public.organization_members as membership
  where
    membership.organization_id = p_organization_id
    and membership.user_id = v_uid;

  if v_role is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_MEMBERSHIP_REQUIRED';
  end if;

  if v_role not in ('owner', 'admin', 'operator') then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_ROLE_DENIED';
  end if;

  return v_uid;
end;
$$;

revoke all
on function public.inventory_action_require_decide_membership(uuid)
from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Merchant transition RPC
-- -----------------------------------------------------------------------------

create or replace function public.transition_inventory_action_merchant(
  p_inventory_action_id uuid,
  p_event_type text,
  p_edited_quantity integer,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.inventory_actions%rowtype;
  v_existing public.action_events%rowtype;
  v_actor uuid;
  v_to_status text;
  v_body_hash text;
  v_event_id uuid;
  v_recommended integer;
begin
  if p_inventory_action_id is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_INVALID_PAYLOAD';
  end if;

  if p_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) = 0
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_INVALID_PAYLOAD';
  end if;

  if p_event_type is null or p_event_type not in (
    'accepted',
    'accepted_with_edit',
    'dismissed',
    'completed'
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_INVALID_PAYLOAD';
  end if;

  v_to_status := p_event_type;

  select *
  into v_action
  from public.inventory_actions as a
  where a.id = p_inventory_action_id
  for update;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_NOT_FOUND';
  end if;

  v_actor := public.inventory_action_require_decide_membership(
    v_action.organization_id
  );

  if not public.inventory_action_is_merchant_approvable(v_action) then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_NOT_MERCHANT_APPROVABLE';
  end if;

  v_body_hash := public.inventory_action_event_body_hash(
    p_event_type,
    p_edited_quantity,
    p_note,
    v_to_status,
    null
  );

  select *
  into v_existing
  from public.action_events as e
  where
    e.organization_id = v_action.organization_id
    and e.inventory_action_id = v_action.id
    and e.event_type = p_event_type
    and e.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.event_body_hash is distinct from v_body_hash then
      raise exception
        using
          errcode = 'P0001',
          message = 'ACTION_EVENT_IDEMPOTENCY_BODY_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'disposition', 'replayed',
      'inventoryActionId', v_action.id,
      'actionEventId', v_existing.id,
      'fromStatus', v_existing.from_status,
      'toStatus', v_existing.to_status,
      'eventType', v_existing.event_type,
      'editedQuantity', v_existing.edited_quantity,
      'actorUserId', v_existing.actor_user_id
    );
  end if;

  if not public.inventory_action_can_transition_status(
    v_action.status,
    v_to_status
  ) or v_action.status = v_to_status then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_TRANSITION_ILLEGAL';
  end if;

  if p_event_type = 'accepted_with_edit' then
    if v_action.action_type is distinct from 'REORDER' then
      raise exception
        using
          errcode = 'P0001',
          message = 'ACTION_EVENT_EDIT_REQUIRES_REORDER';
    end if;
    v_recommended := v_action.recommended_quantity;
    if p_edited_quantity is null
      or p_edited_quantity <= 0
      or p_edited_quantity is not distinct from v_recommended
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'ACTION_EVENT_EDITED_QUANTITY_INVALID';
    end if;
  elsif p_edited_quantity is not null then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_EVENT_EDITED_QUANTITY_FORBIDDEN';
  end if;

  perform pg_catalog.set_config(
    'storeagent.inventory_action_lifecycle_gate',
    'trusted_lifecycle_rpc_v1',
    true
  );

  insert into public.action_events (
    organization_id,
    store_id,
    variant_id,
    inventory_action_id,
    event_type,
    edited_quantity,
    note,
    actor_user_id,
    from_status,
    to_status,
    idempotency_key,
    event_body_hash
  ) values (
    v_action.organization_id,
    v_action.store_id,
    v_action.variant_id,
    v_action.id,
    p_event_type,
    p_edited_quantity,
    p_note,
    v_actor,
    v_action.status,
    v_to_status,
    p_idempotency_key,
    v_body_hash
  )
  returning id into v_event_id;

  update public.inventory_actions as a
  set status = v_to_status
  where a.id = v_action.id;

  return jsonb_build_object(
    'ok', true,
    'disposition', 'applied',
    'inventoryActionId', v_action.id,
    'actionEventId', v_event_id,
    'fromStatus', v_action.status,
    'toStatus', v_to_status,
    'eventType', p_event_type,
    'editedQuantity', p_edited_quantity,
    'actorUserId', v_actor,
    'recommendedQuantity', v_action.recommended_quantity
  );
exception
  when unique_violation then
    select *
    into v_existing
    from public.action_events as e
    where
      e.organization_id = v_action.organization_id
      and e.inventory_action_id = v_action.id
      and e.event_type = p_event_type
      and e.idempotency_key = p_idempotency_key;

    if not found then
      raise;
    end if;

    if v_existing.event_body_hash is distinct from v_body_hash then
      raise exception
        using
          errcode = 'P0001',
          message = 'ACTION_EVENT_IDEMPOTENCY_BODY_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'disposition', 'replayed',
      'inventoryActionId', v_action.id,
      'actionEventId', v_existing.id,
      'fromStatus', v_existing.from_status,
      'toStatus', v_existing.to_status,
      'eventType', v_existing.event_type,
      'editedQuantity', v_existing.edited_quantity,
      'actorUserId', v_existing.actor_user_id
    );
end;
$$;

revoke all
on function public.transition_inventory_action_merchant(
  uuid, text, integer, text, text
)
from public, anon, service_role;

grant execute
on function public.transition_inventory_action_merchant(
  uuid, text, integer, text, text
)
to authenticated;

-- -----------------------------------------------------------------------------
-- 6) System expire RPC
-- -----------------------------------------------------------------------------

create or replace function public.expire_inventory_action_system(
  p_inventory_action_id uuid,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.inventory_actions%rowtype;
  v_existing public.action_events%rowtype;
  v_body_hash text;
  v_event_id uuid;
  v_event_type text := 'expired';
  v_to_status text := 'expired';
begin
  if p_inventory_action_id is null
    or p_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) = 0
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_INVALID_PAYLOAD';
  end if;

  select *
  into v_action
  from public.inventory_actions as a
  where a.id = p_inventory_action_id
  for update;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_NOT_FOUND';
  end if;

  v_body_hash := public.inventory_action_event_body_hash(
    v_event_type,
    null,
    p_note,
    v_to_status,
    null
  );

  select *
  into v_existing
  from public.action_events as e
  where
    e.organization_id = v_action.organization_id
    and e.inventory_action_id = v_action.id
    and e.event_type = v_event_type
    and e.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.event_body_hash is distinct from v_body_hash then
      raise exception
        using
          errcode = 'P0001',
          message = 'ACTION_EVENT_IDEMPOTENCY_BODY_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'disposition', 'replayed',
      'inventoryActionId', v_action.id,
      'actionEventId', v_existing.id,
      'fromStatus', v_existing.from_status,
      'toStatus', v_existing.to_status,
      'eventType', v_existing.event_type,
      'actorUserId', null
    );
  end if;

  if not public.inventory_action_can_transition_status(
    v_action.status,
    v_to_status
  ) or v_action.status = v_to_status then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_TRANSITION_ILLEGAL';
  end if;

  perform pg_catalog.set_config(
    'storeagent.inventory_action_lifecycle_gate',
    'trusted_lifecycle_rpc_v1',
    true
  );

  insert into public.action_events (
    organization_id,
    store_id,
    variant_id,
    inventory_action_id,
    event_type,
    edited_quantity,
    note,
    actor_user_id,
    from_status,
    to_status,
    idempotency_key,
    event_body_hash
  ) values (
    v_action.organization_id,
    v_action.store_id,
    v_action.variant_id,
    v_action.id,
    v_event_type,
    null,
    p_note,
    null,
    v_action.status,
    v_to_status,
    p_idempotency_key,
    v_body_hash
  )
  returning id into v_event_id;

  update public.inventory_actions as a
  set status = v_to_status
  where a.id = v_action.id;

  return jsonb_build_object(
    'ok', true,
    'disposition', 'applied',
    'inventoryActionId', v_action.id,
    'actionEventId', v_event_id,
    'fromStatus', v_action.status,
    'toStatus', v_to_status,
    'eventType', v_event_type,
    'actorUserId', null
  );
end;
$$;

revoke all
on function public.expire_inventory_action_system(uuid, text, text)
from public, anon, authenticated;

grant execute
on function public.expire_inventory_action_system(uuid, text, text)
to service_role;

-- -----------------------------------------------------------------------------
-- 7) System supersede RPC
-- -----------------------------------------------------------------------------

create or replace function public.supersede_inventory_action_system(
  p_inventory_action_id uuid,
  p_new_action_id uuid,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.inventory_actions%rowtype;
  v_new public.inventory_actions%rowtype;
  v_existing public.action_events%rowtype;
  v_body_hash text;
  v_event_id uuid;
  v_event_type text := 'superseded';
  v_to_status text := 'superseded';
begin
  if p_inventory_action_id is null
    or p_new_action_id is null
    or p_idempotency_key is null
    or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) = 0
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_INVALID_PAYLOAD';
  end if;

  if p_inventory_action_id = p_new_action_id then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_SELF_SUPERSEDE_FORBIDDEN';
  end if;

  select *
  into v_action
  from public.inventory_actions as a
  where a.id = p_inventory_action_id
  for update;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_NOT_FOUND';
  end if;

  select *
  into v_new
  from public.inventory_actions as a
  where a.id = p_new_action_id;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_SUPERSEDE_TARGET_NOT_FOUND';
  end if;

  if v_new.organization_id is distinct from v_action.organization_id then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_SCOPE_ERROR';
  end if;

  v_body_hash := public.inventory_action_event_body_hash(
    v_event_type,
    null,
    p_note,
    v_to_status,
    p_new_action_id
  );

  select *
  into v_existing
  from public.action_events as e
  where
    e.organization_id = v_action.organization_id
    and e.inventory_action_id = v_action.id
    and e.event_type = v_event_type
    and e.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.event_body_hash is distinct from v_body_hash then
      raise exception
        using
          errcode = 'P0001',
          message = 'ACTION_EVENT_IDEMPOTENCY_BODY_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'disposition', 'replayed',
      'inventoryActionId', v_action.id,
      'actionEventId', v_existing.id,
      'fromStatus', v_existing.from_status,
      'toStatus', v_existing.to_status,
      'eventType', v_existing.event_type,
      'supersededByActionId', v_action.superseded_by_action_id,
      'actorUserId', null
    );
  end if;

  if not public.inventory_action_can_transition_status(
    v_action.status,
    v_to_status
  ) or v_action.status = v_to_status then
    raise exception
      using
        errcode = 'P0001',
        message = 'ACTION_LIFECYCLE_TRANSITION_ILLEGAL';
  end if;

  perform pg_catalog.set_config(
    'storeagent.inventory_action_lifecycle_gate',
    'trusted_lifecycle_rpc_v1',
    true
  );

  insert into public.action_events (
    organization_id,
    store_id,
    variant_id,
    inventory_action_id,
    event_type,
    edited_quantity,
    note,
    actor_user_id,
    from_status,
    to_status,
    idempotency_key,
    event_body_hash
  ) values (
    v_action.organization_id,
    v_action.store_id,
    v_action.variant_id,
    v_action.id,
    v_event_type,
    null,
    p_note,
    null,
    v_action.status,
    v_to_status,
    p_idempotency_key,
    v_body_hash
  )
  returning id into v_event_id;

  update public.inventory_actions as a
  set
    status = v_to_status,
    superseded_by_action_id = p_new_action_id
  where a.id = v_action.id;

  return jsonb_build_object(
    'ok', true,
    'disposition', 'applied',
    'inventoryActionId', v_action.id,
    'actionEventId', v_event_id,
    'fromStatus', v_action.status,
    'toStatus', v_to_status,
    'eventType', v_event_type,
    'supersededByActionId', p_new_action_id,
    'actorUserId', null
  );
end;
$$;

revoke all
on function public.supersede_inventory_action_system(uuid, uuid, text, text)
from public, anon, authenticated;

grant execute
on function public.supersede_inventory_action_system(uuid, uuid, text, text)
to service_role;

comment on function public.transition_inventory_action_merchant(
  uuid, text, integer, text, text
) is
  'M7.3c merchant lifecycle RPC. Actor=auth.uid(); decide roles only; '
  'eligibility universally fail-closed until approved source-of-create. '
  'No buying side effects.';

comment on function public.expire_inventory_action_system(uuid, text, text) is
  'M7.3c system expire RPC. service_role EXECUTE only; no scheduler.';

comment on function public.supersede_inventory_action_system(
  uuid, uuid, text, text
) is
  'M7.3c system supersede RPC. service_role EXECUTE only; no scheduler.';
