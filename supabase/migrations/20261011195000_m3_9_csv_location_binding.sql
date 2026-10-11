-- =============================================================================
-- M3.9D-D0
-- Explicit CSV source-location -> canonical-location binding.
--
-- This does not create locations.
-- It binds one stable CSV location identity to one existing canonical location
-- inside an already trusted CSV integration scope.
-- =============================================================================

create or replace function public.csv_bind_location(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_external_id text,
  p_canonical_location_id uuid,
  p_source_metadata jsonb
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
  normalized_external_id text;
  existing_binding public.provider_bindings%rowtype;
begin
  perform public.assert_csv_reconciliation_scope(
    p_organization_id,
    p_integration_id,
    p_store_id,
    true
  );

  normalized_external_id :=
    pg_catalog.btrim(
      p_external_id
    );

  if
    normalized_external_id is null
    or pg_catalog.length(
      normalized_external_id
    ) = 0
  then
    raise exception
      'CSV location external identity must not be blank';
  end if;

  if
    p_source_metadata is not null
    and pg_catalog.jsonb_typeof(
      p_source_metadata
    ) <> 'object'
  then
    raise exception
      'CSV location source metadata must be a JSON object';
  end if;

  -- Explicit target proof before touching provider identity.
  perform 1
  from public.locations l
  where
    l.id =
      p_canonical_location_id
    and l.organization_id =
      p_organization_id
    and l.store_id =
      p_store_id;

  if not found then
    raise exception
      'CSV location target is outside trusted store scope';
  end if;

  select pb.*
  into existing_binding
  from public.provider_bindings pb
  where
    pb.organization_id =
      p_organization_id
    and pb.integration_id =
      p_integration_id
    and pb.provider =
      'csv'
    and pb.resource_type =
      'location'
    and pb.external_id =
      normalized_external_id
  for update;

  if found then
    if
      existing_binding.canonical_entity_id
      is distinct from
      p_canonical_location_id
    then
      raise exception
        'CSV location identity is already bound to another canonical location';
    end if;

    if
      existing_binding.source_metadata
      is distinct from
      p_source_metadata
    then
      update public.provider_bindings
      set
        source_metadata =
          p_source_metadata
      where
        id =
          existing_binding.id;
    end if;

    return query
    select
      p_canonical_location_id,
      'skipped'::text;

    return;
  end if;

  begin
    insert into public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id,
      external_parent_id,
      source_metadata
    )
    values (
      p_organization_id,
      p_integration_id,
      'csv',
      'location',
      p_canonical_location_id,
      normalized_external_id,
      null,
      p_source_metadata
    );
  exception
    when unique_violation then
      -- Concurrent create: re-read durable identity and fail closed on conflict.
      select pb.*
      into existing_binding
      from public.provider_bindings pb
      where
        pb.organization_id =
          p_organization_id
        and pb.integration_id =
          p_integration_id
        and pb.provider =
          'csv'
        and pb.resource_type =
          'location'
        and pb.external_id =
          normalized_external_id;

      if
        not found
        or existing_binding.canonical_entity_id
          is distinct from
          p_canonical_location_id
      then
        raise exception
          'CSV location identity conflict during concurrent binding';
      end if;

      return query
      select
        p_canonical_location_id,
        'skipped'::text;

      return;
  end;

  return query
  select
    p_canonical_location_id,
    'imported'::text;
end;
$$;

revoke all
on function public.csv_bind_location(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.csv_bind_location(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  jsonb
)
to service_role;
