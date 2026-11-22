-- StoreAgent SHOPIFY-CONN-1c-α
-- Additive vault persistence: fence columns + SECURITY DEFINER load/create/CAS/clear.
--
-- Authority:
--   docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md
--   SHOPIFY_CONN_1C_PERSISTENCE_PREFLIGHT_REPORT (session)
--   docs/SERVICE_ROLE_BOUNDARY.md
--   docs/CROSS_ORG_THREAT_MODEL.md
--
-- Scope (this slice only):
--   credential_generation + planned refresh-lease metadata columns
--   load / create-only insert / CAS-replace / generation-fenced clear RPCs
--   service_role EXECUTE only; vault table privileges remain revoked
--
-- Out of scope:
--   acquire/rotate/release refresh-lease RPCs (CONN-1c-β)
--   OAuth, Shopify HTTP, webhooks, SyncRun, hosted apply
--   integrations.status mutation, plaintext in SQL, runtime KEK wiring

-- -----------------------------------------------------------------------------
-- A. Additive fence + planned lease metadata (no lease RPC behavior)
-- -----------------------------------------------------------------------------

alter table public.integration_credentials
  add column if not exists credential_generation bigint not null default 1;

alter table public.integration_credentials
  add column if not exists refresh_lock_token text null;

alter table public.integration_credentials
  add column if not exists refresh_lock_owner_id text null;

alter table public.integration_credentials
  add column if not exists refresh_lock_claimed_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'integration_credentials_generation_positive'
      and conrelid = 'public.integration_credentials'::regclass
  ) then
    alter table public.integration_credentials
      add constraint integration_credentials_generation_positive
      check (credential_generation > 0);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'integration_credentials_refresh_lock_consistent'
      and conrelid = 'public.integration_credentials'::regclass
  ) then
    alter table public.integration_credentials
      add constraint integration_credentials_refresh_lock_consistent
      check (
        (
          refresh_lock_token is null
          and refresh_lock_owner_id is null
          and refresh_lock_claimed_at is null
          and refresh_lock_expires_at is null
        )
        or (
          refresh_lock_token is not null
          and pg_catalog.length(pg_catalog.btrim(refresh_lock_token)) > 0
          and refresh_lock_owner_id is not null
          and pg_catalog.length(pg_catalog.btrim(refresh_lock_owner_id)) > 0
          and refresh_lock_claimed_at is not null
          and refresh_lock_expires_at is not null
        )
      );
  end if;
end;
$$;

-- Re-affirm table privilege boundary after ALTER (hosted ambient grants).
revoke all
on table public.integration_credentials
from public;

revoke all
on table public.integration_credentials
from anon;

revoke all
on table public.integration_credentials
from authenticated;

revoke all
on table public.integration_credentials
from service_role;

-- -----------------------------------------------------------------------------
-- B. load_integration_credential_envelope — sealed bytes only
-- -----------------------------------------------------------------------------

create or replace function public.load_integration_credential_envelope(
  p_organization_id uuid,
  p_integration_id uuid,
  p_provider text
)
returns table (
  id uuid,
  organization_id uuid,
  integration_id uuid,
  provider text,
  token_kind text,
  access_ciphertext bytea,
  access_nonce bytea,
  access_auth_tag bytea,
  refresh_ciphertext bytea,
  refresh_nonce bytea,
  refresh_auth_tag bytea,
  dek_wrapped bytea,
  dek_wrap_nonce bytea,
  dek_wrap_auth_tag bytea,
  key_version integer,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  scope text,
  credential_generation bigint,
  last_rotated_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null
    or p_integration_id is null
    or p_provider is null
    or pg_catalog.length(pg_catalog.btrim(p_provider)) = 0
  then
    raise exception 'invalid integration credential load arguments'
      using errcode = '22023';
  end if;

  return query
  select
    row.id,
    row.organization_id,
    row.integration_id,
    row.provider,
    row.token_kind,
    row.access_ciphertext,
    row.access_nonce,
    row.access_auth_tag,
    row.refresh_ciphertext,
    row.refresh_nonce,
    row.refresh_auth_tag,
    row.dek_wrapped,
    row.dek_wrap_nonce,
    row.dek_wrap_auth_tag,
    row.key_version,
    row.access_expires_at,
    row.refresh_expires_at,
    row.scope,
    row.credential_generation,
    row.last_rotated_at,
    row.created_at,
    row.updated_at
  from public.integration_credentials as row
  where row.organization_id = p_organization_id
    and row.integration_id = p_integration_id
    and row.provider = p_provider;
end;
$$;

revoke all
on function public.load_integration_credential_envelope(uuid, uuid, text)
from public;

revoke all
on function public.load_integration_credential_envelope(uuid, uuid, text)
from anon;

revoke all
on function public.load_integration_credential_envelope(uuid, uuid, text)
from authenticated;

revoke all
on function public.load_integration_credential_envelope(uuid, uuid, text)
from service_role;

grant execute
on function public.load_integration_credential_envelope(uuid, uuid, text)
to service_role;

-- -----------------------------------------------------------------------------
-- C. replace_integration_credential_set — create-only or CAS-replace
--     p_expected_generation NULL => INSERT only (never overwrite)
--     p_expected_generation set  => UPDATE only when generation matches
-- -----------------------------------------------------------------------------

create or replace function public.replace_integration_credential_set(
  p_organization_id uuid,
  p_integration_id uuid,
  p_provider text,
  p_token_kind text,
  p_access_ciphertext bytea,
  p_access_nonce bytea,
  p_access_auth_tag bytea,
  p_refresh_ciphertext bytea,
  p_refresh_nonce bytea,
  p_refresh_auth_tag bytea,
  p_dek_wrapped bytea,
  p_dek_wrap_nonce bytea,
  p_dek_wrap_auth_tag bytea,
  p_key_version integer,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_scope text,
  p_expected_generation bigint default null
)
returns table (
  credential_id uuid,
  credential_generation bigint,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_provider text;
  v_token_kind text;
  v_scope text;
  v_exists boolean;
  v_id uuid;
  v_generation bigint;
begin
  if p_organization_id is null
    or p_integration_id is null
    or p_provider is null
    or p_token_kind is null
    or p_access_ciphertext is null
    or p_access_nonce is null
    or p_access_auth_tag is null
    or p_dek_wrapped is null
    or p_dek_wrap_nonce is null
    or p_dek_wrap_auth_tag is null
    or p_key_version is null
  then
    raise exception 'invalid integration credential replace arguments'
      using errcode = '22023';
  end if;

  v_provider := pg_catalog.btrim(p_provider);
  v_token_kind := pg_catalog.btrim(p_token_kind);

  if pg_catalog.length(v_provider) = 0
    or pg_catalog.length(v_token_kind) = 0
  then
    raise exception 'invalid integration credential replace arguments'
      using errcode = '22023';
  end if;

  if p_expected_generation is not null and p_expected_generation < 1 then
    raise exception 'invalid integration credential replace arguments'
      using errcode = '22023';
  end if;

  if p_key_version < 1
    or pg_catalog.length(p_access_ciphertext) = 0
    or pg_catalog.length(p_access_nonce) <> 12
    or pg_catalog.length(p_access_auth_tag) <> 16
    or pg_catalog.length(p_dek_wrapped) = 0
    or pg_catalog.length(p_dek_wrap_nonce) <> 12
    or pg_catalog.length(p_dek_wrap_auth_tag) <> 16
  then
    raise exception 'invalid integration credential envelope shape'
      using errcode = '22023';
  end if;

  -- offline_expiring requires a complete independent refresh seal.
  if v_token_kind = 'offline_expiring' then
    if p_refresh_ciphertext is null
      or p_refresh_nonce is null
      or p_refresh_auth_tag is null
      or pg_catalog.length(p_refresh_ciphertext) = 0
      or pg_catalog.length(p_refresh_nonce) <> 12
      or pg_catalog.length(p_refresh_auth_tag) <> 16
    then
      raise exception 'offline_expiring requires complete refresh envelope'
        using errcode = '22023';
    end if;
  else
    -- Only offline_expiring is accepted by table CHECK today.
    raise exception 'unsupported credential token_kind'
      using errcode = '22023';
  end if;

  if p_scope is null then
    v_scope := null;
  else
    v_scope := pg_catalog.btrim(p_scope);
    if pg_catalog.length(v_scope) = 0 then
      raise exception 'invalid integration credential replace arguments'
        using errcode = '22023';
    end if;
  end if;

  -- Trusted integration identity must exist before any vault write.
  if not exists (
    select 1
    from public.integrations as integration
    where integration.organization_id = p_organization_id
      and integration.id = p_integration_id
      and integration.provider = v_provider
  ) then
    credential_id := null;
    credential_generation := null;
    outcome := 'not_found';
    return next;
    return;
  end if;

  if p_expected_generation is null then
    -- Create-only: never overwrite an existing row.
    insert into public.integration_credentials (
      organization_id,
      integration_id,
      provider,
      token_kind,
      access_ciphertext,
      access_nonce,
      access_auth_tag,
      refresh_ciphertext,
      refresh_nonce,
      refresh_auth_tag,
      dek_wrapped,
      dek_wrap_nonce,
      dek_wrap_auth_tag,
      key_version,
      access_expires_at,
      refresh_expires_at,
      scope,
      credential_generation,
      last_rotated_at
    )
    values (
      p_organization_id,
      p_integration_id,
      v_provider,
      v_token_kind,
      p_access_ciphertext,
      p_access_nonce,
      p_access_auth_tag,
      p_refresh_ciphertext,
      p_refresh_nonce,
      p_refresh_auth_tag,
      p_dek_wrapped,
      p_dek_wrap_nonce,
      p_dek_wrap_auth_tag,
      p_key_version,
      p_access_expires_at,
      p_refresh_expires_at,
      v_scope,
      1,
      pg_catalog.now()
    )
    on conflict on constraint integration_credentials_org_integration_unique
    do nothing
    returning id, credential_generation
    into v_id, v_generation;

    if v_id is null then
      credential_id := null;
      credential_generation := null;
      outcome := 'conflict';
      return next;
      return;
    end if;

    credential_id := v_id;
    credential_generation := v_generation;
    outcome := 'inserted';
    return next;
    return;
  end if;

  -- CAS replace: generation fence.
  -- Unexpired refresh lease (β foresight) must not be silently overridden by
  -- ordinary α replace — single-flight rule from vault contract §8.
  -- Expired/absent lease may proceed; successful write clears stale lock cols.
  update public.integration_credentials as target
  set
    token_kind = v_token_kind,
    access_ciphertext = p_access_ciphertext,
    access_nonce = p_access_nonce,
    access_auth_tag = p_access_auth_tag,
    refresh_ciphertext = p_refresh_ciphertext,
    refresh_nonce = p_refresh_nonce,
    refresh_auth_tag = p_refresh_auth_tag,
    dek_wrapped = p_dek_wrapped,
    dek_wrap_nonce = p_dek_wrap_nonce,
    dek_wrap_auth_tag = p_dek_wrap_auth_tag,
    key_version = p_key_version,
    access_expires_at = p_access_expires_at,
    refresh_expires_at = p_refresh_expires_at,
    scope = v_scope,
    credential_generation = target.credential_generation + 1,
    last_rotated_at = pg_catalog.now(),
    refresh_lock_token = null,
    refresh_lock_owner_id = null,
    refresh_lock_claimed_at = null,
    refresh_lock_expires_at = null,
    updated_at = pg_catalog.now()
  where target.organization_id = p_organization_id
    and target.integration_id = p_integration_id
    and target.provider = v_provider
    and target.credential_generation = p_expected_generation
    and (
      target.refresh_lock_expires_at is null
      or target.refresh_lock_expires_at <= pg_catalog.clock_timestamp()
    )
  returning
    target.id,
    target.credential_generation
  into v_id, v_generation;

  if v_id is not null then
    credential_id := v_id;
    credential_generation := v_generation;
    outcome := 'replaced';
    return next;
    return;
  end if;

  select exists (
    select 1
    from public.integration_credentials as existing
    where existing.organization_id = p_organization_id
      and existing.integration_id = p_integration_id
      and existing.provider = v_provider
  )
  into v_exists;

  if v_exists then
    credential_id := null;
    credential_generation := null;
    outcome := 'conflict';
    return next;
    return;
  end if;

  credential_id := null;
  credential_generation := null;
  outcome := 'not_found';
  return next;
end;
$$;

revoke all
on function public.replace_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text, bigint
)
from public;

revoke all
on function public.replace_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text, bigint
)
from anon;

revoke all
on function public.replace_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text, bigint
)
from authenticated;

revoke all
on function public.replace_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text, bigint
)
from service_role;

grant execute
on function public.replace_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text, bigint
)
to service_role;

-- -----------------------------------------------------------------------------
-- D. clear_integration_credentials — generation-fenced delete; no status mutate
-- -----------------------------------------------------------------------------

create or replace function public.clear_integration_credentials(
  p_organization_id uuid,
  p_integration_id uuid,
  p_provider text,
  p_expected_generation bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text;
  v_deleted integer;
  v_exists boolean;
begin
  if p_organization_id is null
    or p_integration_id is null
    or p_provider is null
    or p_expected_generation is null
    or p_expected_generation < 1
  then
    raise exception 'invalid integration credential clear arguments'
      using errcode = '22023';
  end if;

  v_provider := pg_catalog.btrim(p_provider);
  if pg_catalog.length(v_provider) = 0 then
    raise exception 'invalid integration credential clear arguments'
      using errcode = '22023';
  end if;

  -- Generation fence + unexpired lease fence (ordinary clear must not
  -- override an active β refresh lease).
  delete from public.integration_credentials as target
  where target.organization_id = p_organization_id
    and target.integration_id = p_integration_id
    and target.provider = v_provider
    and target.credential_generation = p_expected_generation
    and (
      target.refresh_lock_expires_at is null
      or target.refresh_lock_expires_at <= pg_catalog.clock_timestamp()
    );

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    return 'cleared';
  end if;

  select exists (
    select 1
    from public.integration_credentials as existing
    where existing.organization_id = p_organization_id
      and existing.integration_id = p_integration_id
      and existing.provider = v_provider
  )
  into v_exists;

  if v_exists then
    return 'fenced';
  end if;

  return 'not_found';
end;
$$;

revoke all
on function public.clear_integration_credentials(uuid, uuid, text, bigint)
from public;

revoke all
on function public.clear_integration_credentials(uuid, uuid, text, bigint)
from anon;

revoke all
on function public.clear_integration_credentials(uuid, uuid, text, bigint)
from authenticated;

revoke all
on function public.clear_integration_credentials(uuid, uuid, text, bigint)
from service_role;

grant execute
on function public.clear_integration_credentials(uuid, uuid, text, bigint)
to service_role;
