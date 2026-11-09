-- StoreAgent PB1.e — attestation freshness invalidation
--
-- Closes the PB1.d gap where direct INSERT/UPDATE/DELETE on
-- store_incoming_evidence_attestations changed the SA008 source token
-- without dirtying current-day metrics (only the upsert RPC enqueued).
--
-- Every effective attestation row change now invalidates store-local
-- current-day grains in the same transaction via the existing M5
-- dirty_generation enqueue helper. Claimed/running leases are preserved.
-- Cascade store delete skips enqueue when the store row is already gone.
--
-- Does not change frozen formulas, unlock M7, or add workers/HTTP routes.

-- -----------------------------------------------------------------------------
-- Trigger: any attestation mutation dirties current-day metrics
-- -----------------------------------------------------------------------------

create or replace function public.store_incoming_evidence_attestations_invalidate_metrics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_store_id uuid;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
    v_store_id := old.store_id;
  elsif tg_op = 'UPDATE'
    and (
      old.organization_id is distinct from new.organization_id
      or old.store_id is distinct from new.store_id
    )
  then
    -- PK move is unexpected; invalidate both sides when the store still exists.
    if exists (
      select 1
      from public.stores as store
      where store.organization_id = old.organization_id
        and store.id = old.store_id
    ) then
      perform public.enqueue_sku_daily_metric_store_incoming_invalidation(
        old.organization_id,
        old.store_id
      );
    end if;

    v_organization_id := new.organization_id;
    v_store_id := new.store_id;
  else
    v_organization_id := new.organization_id;
    v_store_id := new.store_id;
  end if;

  -- Skip when the store is already gone (stores → attestation ON DELETE CASCADE).
  if exists (
    select 1
    from public.stores as store
    where store.organization_id = v_organization_id
      and store.id = v_store_id
  ) then
    perform public.enqueue_sku_daily_metric_store_incoming_invalidation(
      v_organization_id,
      v_store_id
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.store_incoming_evidence_attestations_invalidate_metrics() is
  'PB1.e: after INSERT/UPDATE/DELETE on store_incoming_evidence_attestations, dirty store-local current sku_daily_metrics grains via M5 dirty_generation enqueue. Skips missing stores (cascade). Does not unlock commercial actions.';

revoke all
on function public.store_incoming_evidence_attestations_invalidate_metrics()
from public, anon, authenticated;

grant execute
on function public.store_incoming_evidence_attestations_invalidate_metrics()
to service_role;

drop trigger if exists store_incoming_evidence_attestations_invalidate_metrics
on public.store_incoming_evidence_attestations;

create trigger store_incoming_evidence_attestations_invalidate_metrics
after insert or update or delete
on public.store_incoming_evidence_attestations
for each row
execute function public.store_incoming_evidence_attestations_invalidate_metrics();

-- -----------------------------------------------------------------------------
-- Upsert RPC: rely on the trigger (avoid double dirty_generation bump)
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

  -- Invalidation is performed by
  -- store_incoming_evidence_attestations_invalidate_metrics (AFTER INSERT/UPDATE).

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
  'Owner/admin attestation that store PO incoming evidence is complete. Row write is atomic with current-day metric invalidation via PB1.e trigger. Does not unlock commercial actions.';

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
