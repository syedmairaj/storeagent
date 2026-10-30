-- StoreAgent M6 P2b.2b.2
-- Trusted SECURITY DEFINER issuance/invalidation RPCs for forecast day evidence.
--
-- Trust and issuer metadata are stamped inside these functions only.
-- Callers never supply trust, evidence_id, source, integration/provider/actor
-- identity overrides, or closure_id.
--
-- Coverage=complete:
--   trusted_provider path is fail-closed (no authoritative provider day/stream
--   closure source yet; sync_run / provider auth / caller closure_id are not
--   accepted).
--   verified_merchant_attestation path requires explicit
--   p_assert_day_stream_closed=true; the RPC stamps closure_id itself.
--
-- Table DML remains revoked from roles; only these definers write.

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.forecast_evidence_fnv1a32(
  p_input text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  hash bigint := 2166136261;
  i integer;
  code integer;
begin
  for i in 1..pg_catalog.char_length(p_input) loop
    code := pg_catalog.ascii(
      pg_catalog.substr(p_input, i, 1)
    );
    hash := (hash # code) & 4294967295;
    hash := (hash * 16777619) & 4294967295;
  end loop;

  return pg_catalog.lpad(
    pg_catalog.to_hex(hash::bigint),
    8,
    '0'
  );
end;
$$;

revoke all
on function public.forecast_evidence_fnv1a32(text)
from public, anon, authenticated;

grant execute
on function public.forecast_evidence_fnv1a32(text)
to service_role;

create or replace function public.forecast_evidence_lock_idempotency(
  p_organization_id uuid,
  p_issuance_path text,
  p_idempotency_key text,
  p_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    5606202,
    pg_catalog.hashtext(
      p_organization_id::text ||
      pg_catalog.chr(31) ||
      p_issuance_path ||
      pg_catalog.chr(31) ||
      p_idempotency_key ||
      pg_catalog.chr(31) ||
      p_version::text
    )
  );
end;
$$;

revoke all
on function public.forecast_evidence_lock_idempotency(
  uuid,
  text,
  text,
  integer
)
from public, anon, authenticated;

grant execute
on function public.forecast_evidence_lock_idempotency(
  uuid,
  text,
  text,
  integer
)
to service_role;

create or replace function public.forecast_evidence_assert_provider_integration(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid
)
returns public.integrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration_row public.integrations%rowtype;
begin
  select i.*
  into integration_row
  from public.integrations as i
  where
    i.id = p_integration_id
    and i.organization_id = p_organization_id
  for share;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evidence requires a trusted integration in-organization';
  end if;

  if integration_row.status is distinct from 'active' then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evidence requires an active integration';
  end if;

  if integration_row.store_id is distinct from p_store_id then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evidence store scope does not match integration';
  end if;

  return integration_row;
end;
$$;

revoke all
on function public.forecast_evidence_assert_provider_integration(
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.forecast_evidence_assert_provider_integration(
  uuid,
  uuid,
  uuid
)
to service_role;

create or replace function public.forecast_evidence_assert_merchant_actor(
  p_organization_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_role text;
begin
  if not exists (
    select 1
    from public.stores as s
    where
      s.organization_id = p_organization_id
      and s.id = p_store_id
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evidence store is not in organization';
  end if;

  select m.role
  into member_role
  from public.organization_members as m
  where
    m.organization_id = p_organization_id
    and m.user_id = p_actor_user_id;

  if member_role is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evidence actor is not an organization member';
  end if;

  if member_role not in ('owner', 'admin') then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evidence merchant attestation requires owner or admin';
  end if;
end;
$$;

revoke all
on function public.forecast_evidence_assert_merchant_actor(
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.forecast_evidence_assert_merchant_actor(
  uuid,
  uuid,
  uuid
)
to service_role;

-- -----------------------------------------------------------------------------
-- Provider promotion issuance
-- -----------------------------------------------------------------------------

create or replace function public.issue_trusted_provider_promotion_evidence(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_local_date date,
  p_state text,
  p_observed_at timestamptz,
  p_idempotency_key text,
  p_location_id uuid default null,
  p_variant_id uuid default null,
  p_version integer default 1,
  p_supersedes_evidence_id text default null
)
returns table (
  evidence_id text,
  disposition text,
  trust text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration_row public.integrations%rowtype;
  normalized_key text;
  computed_id text;
  stamped_source text;
  existing public.forecast_day_promotion_evidence%rowtype;
  supersede_row public.forecast_day_promotion_evidence%rowtype;
begin
  if p_state not in ('none', 'promotion') then
    raise exception
      using errcode = 'P0001', message = 'promotion state must be none or promotion';
  end if;

  if p_version is null or p_version < 1 then
    raise exception
      using errcode = 'P0001', message = 'evidence version must be an integer >= 1';
  end if;

  normalized_key := pg_catalog.btrim(p_idempotency_key);

  if normalized_key is null or pg_catalog.length(normalized_key) = 0 then
    raise exception
      using errcode = 'P0001', message = 'idempotency key must not be blank';
  end if;

  integration_row :=
    public.forecast_evidence_assert_provider_integration(
      p_organization_id,
      p_store_id,
      p_integration_id
    );

  perform public.forecast_evidence_lock_idempotency(
    p_organization_id,
    'trusted_provider',
    normalized_key,
    p_version
  );

  computed_id :=
    'ev_' ||
    public.forecast_evidence_fnv1a32(
      'trusted_provider' ||
      pg_catalog.chr(31) ||
      'promotion' ||
      pg_catalog.chr(31) ||
      p_organization_id::text ||
      pg_catalog.chr(31) ||
      p_store_id::text ||
      pg_catalog.chr(31) ||
      coalesce(p_location_id::text, '') ||
      pg_catalog.chr(31) ||
      coalesce(p_variant_id::text, '') ||
      pg_catalog.chr(31) ||
      p_local_date::text ||
      pg_catalog.chr(31) ||
      normalized_key ||
      pg_catalog.chr(31) ||
      p_version::text
    );

  stamped_source :=
    'provider:' ||
    integration_row.provider ||
    ':integration:' ||
    integration_row.id::text;

  select e.*
  into existing
  from public.forecast_day_promotion_evidence as e
  where
    e.organization_id = p_organization_id
    and e.trust = 'trusted_provider'
    and e.idempotency_key = normalized_key
    and e.version = p_version
  for update;

  if found then
    if
      existing.evidence_id is distinct from computed_id
      or existing.store_id is distinct from p_store_id
      or existing.location_id is distinct from p_location_id
      or existing.variant_id is distinct from p_variant_id
      or existing.local_date is distinct from p_local_date
      or existing.state is distinct from p_state
      or existing.observed_at is distinct from p_observed_at
      or existing.supersedes_evidence_id
        is distinct from p_supersedes_evidence_id
      or existing.integration_id is distinct from integration_row.id
      or existing.provider is distinct from integration_row.provider
      or existing.source is distinct from stamped_source
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'duplicate promotion evidence idempotency key has conflicting payload';
    end if;

    evidence_id := existing.evidence_id;
    disposition := 'replayed';
    trust := existing.trust;
    version := existing.version;
    return next;
    return;
  end if;

  if p_supersedes_evidence_id is not null then
    select e.*
    into supersede_row
    from public.forecast_day_promotion_evidence as e
    where
      e.organization_id = p_organization_id
      and e.evidence_id = p_supersedes_evidence_id
    for update;

    if not found then
      raise exception
        using
          errcode = 'P0001',
          message = 'supersedes_evidence_id not found in organization';
    end if;

    if
      supersede_row.store_id is distinct from p_store_id
      or supersede_row.location_id is distinct from p_location_id
      or supersede_row.variant_id is distinct from p_variant_id
      or supersede_row.local_date is distinct from p_local_date
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'supersedes_evidence_id scope mismatch for promotion evidence';
    end if;

    if supersede_row.invalidated_at is null then
      update public.forecast_day_promotion_evidence as e
      set invalidated_at = p_observed_at
      where e.evidence_id = supersede_row.evidence_id;
    end if;
  end if;

  insert into public.forecast_day_promotion_evidence (
    evidence_id,
    organization_id,
    store_id,
    location_id,
    variant_id,
    local_date,
    state,
    trust,
    source,
    observed_at,
    version,
    invalidated_at,
    supersedes_evidence_id,
    idempotency_key,
    integration_id,
    actor_user_id,
    provider
  )
  values (
    computed_id,
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_local_date,
    p_state,
    'trusted_provider',
    stamped_source,
    p_observed_at,
    p_version,
    null,
    p_supersedes_evidence_id,
    normalized_key,
    integration_row.id,
    null,
    integration_row.provider
  );

  evidence_id := computed_id;
  disposition := 'created';
  trust := 'trusted_provider';
  version := p_version;
  return next;
end;
$$;

revoke all
on function public.issue_trusted_provider_promotion_evidence(
  uuid,
  uuid,
  uuid,
  date,
  text,
  timestamptz,
  text,
  uuid,
  uuid,
  integer,
  text
)
from public, anon, authenticated;

grant execute
on function public.issue_trusted_provider_promotion_evidence(
  uuid,
  uuid,
  uuid,
  date,
  text,
  timestamptz,
  text,
  uuid,
  uuid,
  integer,
  text
)
to service_role;

-- -----------------------------------------------------------------------------
-- Merchant promotion issuance
-- -----------------------------------------------------------------------------

create or replace function public.issue_merchant_attestation_promotion_evidence(
  p_organization_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid,
  p_local_date date,
  p_state text,
  p_observed_at timestamptz,
  p_idempotency_key text,
  p_location_id uuid default null,
  p_variant_id uuid default null,
  p_version integer default 1,
  p_supersedes_evidence_id text default null
)
returns table (
  evidence_id text,
  disposition text,
  trust text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_key text;
  computed_id text;
  stamped_source text;
  existing public.forecast_day_promotion_evidence%rowtype;
  supersede_row public.forecast_day_promotion_evidence%rowtype;
begin
  if p_state not in ('none', 'promotion') then
    raise exception
      using errcode = 'P0001', message = 'promotion state must be none or promotion';
  end if;

  if p_version is null or p_version < 1 then
    raise exception
      using errcode = 'P0001', message = 'evidence version must be an integer >= 1';
  end if;

  normalized_key := pg_catalog.btrim(p_idempotency_key);

  if normalized_key is null or pg_catalog.length(normalized_key) = 0 then
    raise exception
      using errcode = 'P0001', message = 'idempotency key must not be blank';
  end if;

  perform public.forecast_evidence_assert_merchant_actor(
    p_organization_id,
    p_store_id,
    p_actor_user_id
  );

  perform public.forecast_evidence_lock_idempotency(
    p_organization_id,
    'verified_merchant_attestation',
    normalized_key,
    p_version
  );

  computed_id :=
    'ev_' ||
    public.forecast_evidence_fnv1a32(
      'verified_merchant_attestation' ||
      pg_catalog.chr(31) ||
      'promotion' ||
      pg_catalog.chr(31) ||
      p_organization_id::text ||
      pg_catalog.chr(31) ||
      p_store_id::text ||
      pg_catalog.chr(31) ||
      coalesce(p_location_id::text, '') ||
      pg_catalog.chr(31) ||
      coalesce(p_variant_id::text, '') ||
      pg_catalog.chr(31) ||
      p_local_date::text ||
      pg_catalog.chr(31) ||
      normalized_key ||
      pg_catalog.chr(31) ||
      p_version::text
    );

  stamped_source :=
    'merchant:attestation:actor:' || p_actor_user_id::text;

  select e.*
  into existing
  from public.forecast_day_promotion_evidence as e
  where
    e.organization_id = p_organization_id
    and e.trust = 'verified_merchant_attestation'
    and e.idempotency_key = normalized_key
    and e.version = p_version
  for update;

  if found then
    if
      existing.evidence_id is distinct from computed_id
      or existing.store_id is distinct from p_store_id
      or existing.location_id is distinct from p_location_id
      or existing.variant_id is distinct from p_variant_id
      or existing.local_date is distinct from p_local_date
      or existing.state is distinct from p_state
      or existing.observed_at is distinct from p_observed_at
      or existing.supersedes_evidence_id
        is distinct from p_supersedes_evidence_id
      or existing.actor_user_id is distinct from p_actor_user_id
      or existing.source is distinct from stamped_source
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'duplicate promotion evidence idempotency key has conflicting payload';
    end if;

    evidence_id := existing.evidence_id;
    disposition := 'replayed';
    trust := existing.trust;
    version := existing.version;
    return next;
    return;
  end if;

  if p_supersedes_evidence_id is not null then
    select e.*
    into supersede_row
    from public.forecast_day_promotion_evidence as e
    where
      e.organization_id = p_organization_id
      and e.evidence_id = p_supersedes_evidence_id
    for update;

    if not found then
      raise exception
        using
          errcode = 'P0001',
          message = 'supersedes_evidence_id not found in organization';
    end if;

    if
      supersede_row.store_id is distinct from p_store_id
      or supersede_row.location_id is distinct from p_location_id
      or supersede_row.variant_id is distinct from p_variant_id
      or supersede_row.local_date is distinct from p_local_date
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'supersedes_evidence_id scope mismatch for promotion evidence';
    end if;

    if supersede_row.invalidated_at is null then
      update public.forecast_day_promotion_evidence as e
      set invalidated_at = p_observed_at
      where e.evidence_id = supersede_row.evidence_id;
    end if;
  end if;

  insert into public.forecast_day_promotion_evidence (
    evidence_id,
    organization_id,
    store_id,
    location_id,
    variant_id,
    local_date,
    state,
    trust,
    source,
    observed_at,
    version,
    invalidated_at,
    supersedes_evidence_id,
    idempotency_key,
    integration_id,
    actor_user_id,
    provider
  )
  values (
    computed_id,
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_local_date,
    p_state,
    'verified_merchant_attestation',
    stamped_source,
    p_observed_at,
    p_version,
    null,
    p_supersedes_evidence_id,
    normalized_key,
    null,
    p_actor_user_id,
    null
  );

  evidence_id := computed_id;
  disposition := 'created';
  trust := 'verified_merchant_attestation';
  version := p_version;
  return next;
end;
$$;

revoke all
on function public.issue_merchant_attestation_promotion_evidence(
  uuid,
  uuid,
  uuid,
  date,
  text,
  timestamptz,
  text,
  uuid,
  uuid,
  integer,
  text
)
from public, anon, authenticated;

grant execute
on function public.issue_merchant_attestation_promotion_evidence(
  uuid,
  uuid,
  uuid,
  date,
  text,
  timestamptz,
  text,
  uuid,
  uuid,
  integer,
  text
)
to service_role;

-- -----------------------------------------------------------------------------
-- Provider coverage issuance (partial only; complete fail-closed)
-- -----------------------------------------------------------------------------

create or replace function public.issue_trusted_provider_coverage_evidence(
  p_organization_id uuid,
  p_store_id uuid,
  p_integration_id uuid,
  p_local_date date,
  p_stream text,
  p_coverage text,
  p_as_of timestamptz,
  p_observed_at timestamptz,
  p_idempotency_key text,
  p_location_id uuid default null,
  p_variant_id uuid default null,
  p_version integer default 1,
  p_supersedes_evidence_id text default null
)
returns table (
  evidence_id text,
  disposition text,
  trust text,
  version integer,
  coverage text,
  closure_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration_row public.integrations%rowtype;
  normalized_key text;
  computed_id text;
  stamped_source text;
  existing public.forecast_day_coverage_evidence%rowtype;
  supersede_row public.forecast_day_coverage_evidence%rowtype;
begin
  if p_stream not in ('orders', 'returns') then
    raise exception
      using errcode = 'P0001', message = 'coverage stream must be orders or returns';
  end if;

  if p_coverage not in ('complete', 'partial') then
    raise exception
      using errcode = 'P0001', message = 'coverage level must be complete or partial';
  end if;

  -- Fail closed: no authoritative provider day/stream closure source yet.
  -- sync_run success, provider auth, and caller-supplied closure ids are not
  -- accepted as completion proof.
  if p_coverage = 'complete' then
    raise exception
      using
        errcode = 'P0001',
        message = 'trusted_provider coverage=complete is unavailable: no authoritative day/stream closure source';
  end if;

  if p_version is null or p_version < 1 then
    raise exception
      using errcode = 'P0001', message = 'evidence version must be an integer >= 1';
  end if;

  normalized_key := pg_catalog.btrim(p_idempotency_key);

  if normalized_key is null or pg_catalog.length(normalized_key) = 0 then
    raise exception
      using errcode = 'P0001', message = 'idempotency key must not be blank';
  end if;

  integration_row :=
    public.forecast_evidence_assert_provider_integration(
      p_organization_id,
      p_store_id,
      p_integration_id
    );

  perform public.forecast_evidence_lock_idempotency(
    p_organization_id,
    'trusted_provider',
    normalized_key,
    p_version
  );

  computed_id :=
    'ev_' ||
    public.forecast_evidence_fnv1a32(
      'trusted_provider' ||
      pg_catalog.chr(31) ||
      'coverage' ||
      pg_catalog.chr(31) ||
      p_organization_id::text ||
      pg_catalog.chr(31) ||
      p_store_id::text ||
      pg_catalog.chr(31) ||
      coalesce(p_location_id::text, '') ||
      pg_catalog.chr(31) ||
      coalesce(p_variant_id::text, '') ||
      pg_catalog.chr(31) ||
      p_local_date::text ||
      pg_catalog.chr(31) ||
      p_stream ||
      pg_catalog.chr(31) ||
      normalized_key ||
      pg_catalog.chr(31) ||
      p_version::text
    );

  stamped_source :=
    'provider:' ||
    integration_row.provider ||
    ':integration:' ||
    integration_row.id::text;

  select e.*
  into existing
  from public.forecast_day_coverage_evidence as e
  where
    e.organization_id = p_organization_id
    and e.trust = 'trusted_provider'
    and e.idempotency_key = normalized_key
    and e.version = p_version
  for update;

  if found then
    if
      existing.evidence_id is distinct from computed_id
      or existing.store_id is distinct from p_store_id
      or existing.location_id is distinct from p_location_id
      or existing.variant_id is distinct from p_variant_id
      or existing.local_date is distinct from p_local_date
      or existing.stream is distinct from p_stream
      or existing.coverage is distinct from p_coverage
      or existing.as_of is distinct from p_as_of
      or existing.observed_at is distinct from p_observed_at
      or existing.supersedes_evidence_id
        is distinct from p_supersedes_evidence_id
      or existing.integration_id is distinct from integration_row.id
      or existing.provider is distinct from integration_row.provider
      or existing.source is distinct from stamped_source
      or existing.closure_id is not null
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'duplicate coverage evidence idempotency key has conflicting payload';
    end if;

    evidence_id := existing.evidence_id;
    disposition := 'replayed';
    trust := existing.trust;
    version := existing.version;
    coverage := existing.coverage;
    closure_id := existing.closure_id;
    return next;
    return;
  end if;

  if p_supersedes_evidence_id is not null then
    select e.*
    into supersede_row
    from public.forecast_day_coverage_evidence as e
    where
      e.organization_id = p_organization_id
      and e.evidence_id = p_supersedes_evidence_id
    for update;

    if not found then
      raise exception
        using
          errcode = 'P0001',
          message = 'supersedes_evidence_id not found in organization';
    end if;

    if
      supersede_row.store_id is distinct from p_store_id
      or supersede_row.location_id is distinct from p_location_id
      or supersede_row.variant_id is distinct from p_variant_id
      or supersede_row.local_date is distinct from p_local_date
      or supersede_row.stream is distinct from p_stream
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'supersedes_evidence_id scope mismatch for coverage evidence';
    end if;

    if supersede_row.invalidated_at is null then
      update public.forecast_day_coverage_evidence as e
      set invalidated_at = p_observed_at
      where e.evidence_id = supersede_row.evidence_id;
    end if;
  end if;

  insert into public.forecast_day_coverage_evidence (
    evidence_id,
    organization_id,
    store_id,
    location_id,
    variant_id,
    local_date,
    stream,
    coverage,
    trust,
    source,
    as_of,
    observed_at,
    version,
    invalidated_at,
    supersedes_evidence_id,
    idempotency_key,
    integration_id,
    actor_user_id,
    provider,
    closure_id
  )
  values (
    computed_id,
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_local_date,
    p_stream,
    'partial',
    'trusted_provider',
    stamped_source,
    p_as_of,
    p_observed_at,
    p_version,
    null,
    p_supersedes_evidence_id,
    normalized_key,
    integration_row.id,
    null,
    integration_row.provider,
    null
  );

  evidence_id := computed_id;
  disposition := 'created';
  trust := 'trusted_provider';
  version := p_version;
  coverage := 'partial';
  closure_id := null;
  return next;
end;
$$;

revoke all
on function public.issue_trusted_provider_coverage_evidence(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  uuid,
  uuid,
  integer,
  text
)
from public, anon, authenticated;

grant execute
on function public.issue_trusted_provider_coverage_evidence(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  uuid,
  uuid,
  integer,
  text
)
to service_role;

-- -----------------------------------------------------------------------------
-- Merchant coverage issuance
-- -----------------------------------------------------------------------------

create or replace function public.issue_merchant_attestation_coverage_evidence(
  p_organization_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid,
  p_local_date date,
  p_stream text,
  p_coverage text,
  p_as_of timestamptz,
  p_observed_at timestamptz,
  p_idempotency_key text,
  p_assert_day_stream_closed boolean default false,
  p_location_id uuid default null,
  p_variant_id uuid default null,
  p_version integer default 1,
  p_supersedes_evidence_id text default null
)
returns table (
  evidence_id text,
  disposition text,
  trust text,
  version integer,
  coverage text,
  closure_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_key text;
  computed_id text;
  stamped_source text;
  stamped_closure text;
  effective_coverage text;
  existing public.forecast_day_coverage_evidence%rowtype;
  supersede_row public.forecast_day_coverage_evidence%rowtype;
begin
  if p_stream not in ('orders', 'returns') then
    raise exception
      using errcode = 'P0001', message = 'coverage stream must be orders or returns';
  end if;

  if p_coverage not in ('complete', 'partial') then
    raise exception
      using errcode = 'P0001', message = 'coverage level must be complete or partial';
  end if;

  if p_coverage = 'complete' and p_assert_day_stream_closed is not true then
    raise exception
      using
        errcode = 'P0001',
        message = 'merchant coverage=complete requires explicit day/stream closure attestation';
  end if;

  if p_coverage = 'partial' and p_assert_day_stream_closed is true then
    raise exception
      using
        errcode = 'P0001',
        message = 'partial coverage must not assert day/stream closure';
  end if;

  if p_version is null or p_version < 1 then
    raise exception
      using errcode = 'P0001', message = 'evidence version must be an integer >= 1';
  end if;

  normalized_key := pg_catalog.btrim(p_idempotency_key);

  if normalized_key is null or pg_catalog.length(normalized_key) = 0 then
    raise exception
      using errcode = 'P0001', message = 'idempotency key must not be blank';
  end if;

  perform public.forecast_evidence_assert_merchant_actor(
    p_organization_id,
    p_store_id,
    p_actor_user_id
  );

  perform public.forecast_evidence_lock_idempotency(
    p_organization_id,
    'verified_merchant_attestation',
    normalized_key,
    p_version
  );

  computed_id :=
    'ev_' ||
    public.forecast_evidence_fnv1a32(
      'verified_merchant_attestation' ||
      pg_catalog.chr(31) ||
      'coverage' ||
      pg_catalog.chr(31) ||
      p_organization_id::text ||
      pg_catalog.chr(31) ||
      p_store_id::text ||
      pg_catalog.chr(31) ||
      coalesce(p_location_id::text, '') ||
      pg_catalog.chr(31) ||
      coalesce(p_variant_id::text, '') ||
      pg_catalog.chr(31) ||
      p_local_date::text ||
      pg_catalog.chr(31) ||
      p_stream ||
      pg_catalog.chr(31) ||
      normalized_key ||
      pg_catalog.chr(31) ||
      p_version::text
    );

  stamped_source :=
    'merchant:attestation:actor:' || p_actor_user_id::text;

  effective_coverage := p_coverage;

  if effective_coverage = 'complete' then
    -- Owner/admin day/stream attestation only — never provider-verified.
    -- closure_id is RPC-stamped provenance; trust remains merchant attestation.
    stamped_closure :=
      'merchant_day_stream_closure:' || computed_id;
  else
    stamped_closure := null;
  end if;

  select e.*
  into existing
  from public.forecast_day_coverage_evidence as e
  where
    e.organization_id = p_organization_id
    and e.trust = 'verified_merchant_attestation'
    and e.idempotency_key = normalized_key
    and e.version = p_version
  for update;

  if found then
    if
      existing.evidence_id is distinct from computed_id
      or existing.store_id is distinct from p_store_id
      or existing.location_id is distinct from p_location_id
      or existing.variant_id is distinct from p_variant_id
      or existing.local_date is distinct from p_local_date
      or existing.stream is distinct from p_stream
      or existing.coverage is distinct from effective_coverage
      or existing.as_of is distinct from p_as_of
      or existing.observed_at is distinct from p_observed_at
      or existing.supersedes_evidence_id
        is distinct from p_supersedes_evidence_id
      or existing.actor_user_id is distinct from p_actor_user_id
      or existing.source is distinct from stamped_source
      or existing.closure_id is distinct from stamped_closure
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'duplicate coverage evidence idempotency key has conflicting payload';
    end if;

    evidence_id := existing.evidence_id;
    disposition := 'replayed';
    trust := existing.trust;
    version := existing.version;
    coverage := existing.coverage;
    closure_id := existing.closure_id;
    return next;
    return;
  end if;

  if p_supersedes_evidence_id is not null then
    select e.*
    into supersede_row
    from public.forecast_day_coverage_evidence as e
    where
      e.organization_id = p_organization_id
      and e.evidence_id = p_supersedes_evidence_id
    for update;

    if not found then
      raise exception
        using
          errcode = 'P0001',
          message = 'supersedes_evidence_id not found in organization';
    end if;

    if
      supersede_row.store_id is distinct from p_store_id
      or supersede_row.location_id is distinct from p_location_id
      or supersede_row.variant_id is distinct from p_variant_id
      or supersede_row.local_date is distinct from p_local_date
      or supersede_row.stream is distinct from p_stream
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'supersedes_evidence_id scope mismatch for coverage evidence';
    end if;

    if supersede_row.invalidated_at is null then
      update public.forecast_day_coverage_evidence as e
      set invalidated_at = p_observed_at
      where e.evidence_id = supersede_row.evidence_id;
    end if;
  end if;

  insert into public.forecast_day_coverage_evidence (
    evidence_id,
    organization_id,
    store_id,
    location_id,
    variant_id,
    local_date,
    stream,
    coverage,
    trust,
    source,
    as_of,
    observed_at,
    version,
    invalidated_at,
    supersedes_evidence_id,
    idempotency_key,
    integration_id,
    actor_user_id,
    provider,
    closure_id
  )
  values (
    computed_id,
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_local_date,
    p_stream,
    effective_coverage,
    'verified_merchant_attestation',
    stamped_source,
    p_as_of,
    p_observed_at,
    p_version,
    null,
    p_supersedes_evidence_id,
    normalized_key,
    null,
    p_actor_user_id,
    null,
    stamped_closure
  );

  evidence_id := computed_id;
  disposition := 'created';
  trust := 'verified_merchant_attestation';
  version := p_version;
  coverage := effective_coverage;
  closure_id := stamped_closure;
  return next;
end;
$$;

revoke all
on function public.issue_merchant_attestation_coverage_evidence(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  boolean,
  uuid,
  uuid,
  integer,
  text
)
from public, anon, authenticated;

grant execute
on function public.issue_merchant_attestation_coverage_evidence(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  boolean,
  uuid,
  uuid,
  integer,
  text
)
to service_role;

-- -----------------------------------------------------------------------------
-- Coverage invalidation with late-event fencing + tenant-agent authorization
-- -----------------------------------------------------------------------------

drop function if exists public.invalidate_forecast_day_coverage_evidence(
  uuid,
  text,
  timestamptz,
  timestamptz
);

create or replace function public.invalidate_forecast_day_coverage_evidence(
  p_organization_id uuid,
  p_evidence_id text,
  p_invalidated_at timestamptz,
  p_late_event_observed_at timestamptz,
  p_integration_id uuid default null,
  p_actor_user_id uuid default null
)
returns table (
  evidence_id text,
  disposition text,
  invalidated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.forecast_day_coverage_evidence%rowtype;
  has_integration boolean := p_integration_id is not null;
  has_actor boolean := p_actor_user_id is not null;
begin
  if p_late_event_observed_at is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'coverage invalidation requires a late-event observed_at watermark';
  end if;

  -- service_role alone is insufficient: require exactly one trusted agent.
  if has_integration = has_actor then
    raise exception
      using
        errcode = 'P0001',
        message = 'coverage invalidation requires exactly one of integration_id or actor_user_id';
  end if;

  select e.*
  into target
  from public.forecast_day_coverage_evidence as e
  where
    e.organization_id = p_organization_id
    and e.evidence_id = p_evidence_id
  for update;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'coverage evidence not found in organization';
  end if;

  if has_integration then
    perform public.forecast_evidence_assert_provider_integration(
      p_organization_id,
      target.store_id,
      p_integration_id
    );
  else
    perform public.forecast_evidence_assert_merchant_actor(
      p_organization_id,
      target.store_id,
      p_actor_user_id
    );
  end if;

  if target.invalidated_at is not null then
    raise exception
      using
        errcode = 'P0001',
        message = 'coverage evidence is already invalidated';
  end if;

  if p_late_event_observed_at <= target.as_of then
    raise exception
      using
        errcode = 'P0001',
        message = 'late-event observed_at must be after coverage as_of watermark';
  end if;

  update public.forecast_day_coverage_evidence as e
  set invalidated_at = p_invalidated_at
  where e.evidence_id = target.evidence_id;

  evidence_id := target.evidence_id;
  disposition := 'invalidated';
  invalidated_at := p_invalidated_at;
  return next;
end;
$$;

revoke all
on function public.invalidate_forecast_day_coverage_evidence(
  uuid,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.invalidate_forecast_day_coverage_evidence(
  uuid,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid
)
to service_role;
