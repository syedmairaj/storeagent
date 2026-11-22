-- StoreAgent SHOPIFY-CONN-1c-β
-- Additive refresh-lease RPCs: acquire / rotate / release.
--
-- Authority:
--   SHOPIFY_CONN_1C_BETA_PROTOCOL_FREEZE_REPORT (session)
--   docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md
--   docs/SHOPIFY_CONN_1C_ALPHA_IMPLEMENTATION_REPORT.md
--   docs/SERVICE_ROLE_BOUNDARY.md
--
-- Scope (this slice only):
--   acquire_integration_credential_refresh_lock
--   rotate_integration_credential_set
--   release_integration_credential_refresh_lock
--   service_role EXECUTE only; vault table privileges remain revoked
--
-- Out of scope:
--   forced vault clear / generation bypass / integrations.status mutation
--   advisory locks, OAuth, Shopify HTTP, hosted apply, KEK wiring
--   token_kind expansion / Amazon / Noon

-- Re-affirm table privilege boundary (hosted ambient grants).
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
-- A. acquire_integration_credential_refresh_lock
--    Lock order: integrations FOR UPDATE → credentials FOR UPDATE
--    Eligible status: active | degraded
--    Same-owner reacquire while unexpired: DENY
--    Success returns sealed envelope + claim token; deny returns no secrets
-- -----------------------------------------------------------------------------

create or replace function public.acquire_integration_credential_refresh_lock(
  p_organization_id uuid,
  p_integration_id uuid,
  p_provider text,
  p_owner_id text,
  p_lease_seconds integer
)
returns table (
  acquired boolean,
  refresh_lock_token text,
  refresh_lock_expires_at timestamptz,
  credential_generation bigint,
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
  last_rotated_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_provider text;
  v_owner text;
  v_now timestamptz;
  v_expires timestamptz;
  v_token text;
  v_status text;
  v_cred public.integration_credentials%rowtype;
begin
  if p_organization_id is null
    or p_integration_id is null
    or p_provider is null
    or p_owner_id is null
    or p_lease_seconds is null
  then
    raise exception 'invalid integration credential acquire arguments'
      using errcode = '22023';
  end if;

  v_provider := pg_catalog.btrim(p_provider);
  v_owner := pg_catalog.btrim(p_owner_id);

  if pg_catalog.length(v_provider) = 0
    or pg_catalog.length(v_owner) = 0
    or v_owner !~ '^[A-Za-z0-9_.:-]{1,200}$'
    or p_lease_seconds < 30
    or p_lease_seconds > 300
  then
    raise exception 'invalid integration credential acquire arguments'
      using errcode = '22023';
  end if;

  v_now := pg_catalog.clock_timestamp();

  -- 1) Integration row lock (eligibility).
  select integration.status
  into v_status
  from public.integrations as integration
  where integration.organization_id = p_organization_id
    and integration.id = p_integration_id
    and integration.provider = v_provider
  for update;

  if v_status is null
    or v_status not in ('active', 'degraded')
  then
    acquired := false;
    refresh_lock_token := null;
    refresh_lock_expires_at := null;
    credential_generation := null;
    id := null;
    organization_id := null;
    integration_id := null;
    provider := null;
    token_kind := null;
    access_ciphertext := null;
    access_nonce := null;
    access_auth_tag := null;
    refresh_ciphertext := null;
    refresh_nonce := null;
    refresh_auth_tag := null;
    dek_wrapped := null;
    dek_wrap_nonce := null;
    dek_wrap_auth_tag := null;
    key_version := null;
    access_expires_at := null;
    refresh_expires_at := null;
    scope := null;
    last_rotated_at := null;
    created_at := null;
    updated_at := null;
    return next;
    return;
  end if;

  -- 2) Credential row lock.
  select cred.*
  into v_cred
  from public.integration_credentials as cred
  where cred.organization_id = p_organization_id
    and cred.integration_id = p_integration_id
    and cred.provider = v_provider
  for update;

  if not found or v_cred.id is null then
    acquired := false;
    refresh_lock_token := null;
    refresh_lock_expires_at := null;
    credential_generation := null;
    id := null;
    organization_id := null;
    integration_id := null;
    provider := null;
    token_kind := null;
    access_ciphertext := null;
    access_nonce := null;
    access_auth_tag := null;
    refresh_ciphertext := null;
    refresh_nonce := null;
    refresh_auth_tag := null;
    dek_wrapped := null;
    dek_wrap_nonce := null;
    dek_wrap_auth_tag := null;
    key_version := null;
    access_expires_at := null;
    refresh_expires_at := null;
    scope := null;
    last_rotated_at := null;
    created_at := null;
    updated_at := null;
    return next;
    return;
  end if;

  -- Unexpired lease (any owner, including same owner) → DENY; no secrets.
  if v_cred.refresh_lock_expires_at is not null
    and v_cred.refresh_lock_expires_at > v_now
  then
    acquired := false;
    refresh_lock_token := null;
    refresh_lock_expires_at := null;
    credential_generation := null;
    id := null;
    organization_id := null;
    integration_id := null;
    provider := null;
    token_kind := null;
    access_ciphertext := null;
    access_nonce := null;
    access_auth_tag := null;
    refresh_ciphertext := null;
    refresh_nonce := null;
    refresh_auth_tag := null;
    dek_wrapped := null;
    dek_wrap_nonce := null;
    dek_wrap_auth_tag := null;
    key_version := null;
    access_expires_at := null;
    refresh_expires_at := null;
    scope := null;
    last_rotated_at := null;
    created_at := null;
    updated_at := null;
    return next;
    return;
  end if;

  v_token := pg_catalog.gen_random_uuid()::text;
  v_expires := v_now + pg_catalog.make_interval(secs => p_lease_seconds);

  update public.integration_credentials as target
  set
    refresh_lock_token = v_token,
    refresh_lock_owner_id = v_owner,
    refresh_lock_claimed_at = v_now,
    refresh_lock_expires_at = v_expires,
    updated_at = v_now
  where target.organization_id = p_organization_id
    and target.integration_id = p_integration_id
    and target.provider = v_provider
  returning target.*
  into v_cred;

  acquired := true;
  refresh_lock_token := v_cred.refresh_lock_token;
  refresh_lock_expires_at := v_cred.refresh_lock_expires_at;
  credential_generation := v_cred.credential_generation;
  id := v_cred.id;
  organization_id := v_cred.organization_id;
  integration_id := v_cred.integration_id;
  provider := v_cred.provider;
  token_kind := v_cred.token_kind;
  access_ciphertext := v_cred.access_ciphertext;
  access_nonce := v_cred.access_nonce;
  access_auth_tag := v_cred.access_auth_tag;
  refresh_ciphertext := v_cred.refresh_ciphertext;
  refresh_nonce := v_cred.refresh_nonce;
  refresh_auth_tag := v_cred.refresh_auth_tag;
  dek_wrapped := v_cred.dek_wrapped;
  dek_wrap_nonce := v_cred.dek_wrap_nonce;
  dek_wrap_auth_tag := v_cred.dek_wrap_auth_tag;
  key_version := v_cred.key_version;
  access_expires_at := v_cred.access_expires_at;
  refresh_expires_at := v_cred.refresh_expires_at;
  scope := v_cred.scope;
  last_rotated_at := v_cred.last_rotated_at;
  created_at := v_cred.created_at;
  updated_at := v_cred.updated_at;
  return next;
end;
$$;

revoke all
on function public.acquire_integration_credential_refresh_lock(
  uuid, uuid, text, text, integer
)
from public;

revoke all
on function public.acquire_integration_credential_refresh_lock(
  uuid, uuid, text, text, integer
)
from anon;

revoke all
on function public.acquire_integration_credential_refresh_lock(
  uuid, uuid, text, text, integer
)
from authenticated;

revoke all
on function public.acquire_integration_credential_refresh_lock(
  uuid, uuid, text, text, integer
)
from service_role;

grant execute
on function public.acquire_integration_credential_refresh_lock(
  uuid, uuid, text, text, integer
)
to service_role;

-- -----------------------------------------------------------------------------
-- B. rotate_integration_credential_set
--    Lease + generation fence; eligibility re-check; atomic pair replace
-- -----------------------------------------------------------------------------

create or replace function public.rotate_integration_credential_set(
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
  p_owner_id text,
  p_claim_token text,
  p_expected_generation bigint
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
  v_owner text;
  v_claim text;
  v_scope text;
  v_status text;
  v_now timestamptz;
  v_id uuid;
  v_generation bigint;
  v_exists boolean;
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
    or p_owner_id is null
    or p_claim_token is null
    or p_expected_generation is null
  then
    raise exception 'invalid integration credential rotate arguments'
      using errcode = '22023';
  end if;

  v_provider := pg_catalog.btrim(p_provider);
  v_token_kind := pg_catalog.btrim(p_token_kind);
  v_owner := pg_catalog.btrim(p_owner_id);
  v_claim := pg_catalog.btrim(p_claim_token);

  if pg_catalog.length(v_provider) = 0
    or pg_catalog.length(v_token_kind) = 0
    or pg_catalog.length(v_owner) = 0
    or pg_catalog.length(v_claim) = 0
    or v_owner !~ '^[A-Za-z0-9_.:-]{1,200}$'
    or p_expected_generation < 1
  then
    raise exception 'invalid integration credential rotate arguments'
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
    raise exception 'unsupported credential token_kind'
      using errcode = '22023';
  end if;

  if p_scope is null then
    v_scope := null;
  else
    v_scope := pg_catalog.btrim(p_scope);
    if pg_catalog.length(v_scope) = 0 then
      raise exception 'invalid integration credential rotate arguments'
        using errcode = '22023';
    end if;
  end if;

  v_now := pg_catalog.clock_timestamp();

  -- 1) Integration eligibility under row lock.
  select integration.status
  into v_status
  from public.integrations as integration
  where integration.organization_id = p_organization_id
    and integration.id = p_integration_id
    and integration.provider = v_provider
  for update;

  if v_status is null then
    credential_id := null;
    credential_generation := null;
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_status not in ('active', 'degraded') then
    credential_id := null;
    credential_generation := null;
    outcome := 'fenced';
    return next;
    return;
  end if;

  -- 2) Credential row lock + atomic lease/generation CAS rotate.
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
    last_rotated_at = v_now,
    refresh_lock_token = null,
    refresh_lock_owner_id = null,
    refresh_lock_claimed_at = null,
    refresh_lock_expires_at = null,
    updated_at = v_now
  where target.organization_id = p_organization_id
    and target.integration_id = p_integration_id
    and target.provider = v_provider
    and target.credential_generation = p_expected_generation
    and target.refresh_lock_owner_id = v_owner
    and target.refresh_lock_token = v_claim
    and target.refresh_lock_expires_at is not null
    and target.refresh_lock_expires_at > v_now
  returning target.id, target.credential_generation
  into v_id, v_generation;

  if v_id is not null then
    credential_id := v_id;
    credential_generation := v_generation;
    outcome := 'rotated';
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
    outcome := 'fenced';
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
on function public.rotate_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text,
  text, text, bigint
)
from public;

revoke all
on function public.rotate_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text,
  text, text, bigint
)
from anon;

revoke all
on function public.rotate_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text,
  text, text, bigint
)
from authenticated;

revoke all
on function public.rotate_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text,
  text, text, bigint
)
from service_role;

grant execute
on function public.rotate_integration_credential_set(
  uuid, uuid, text, text,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  bytea, bytea, bytea,
  integer, timestamptz, timestamptz, text,
  text, text, bigint
)
to service_role;

-- -----------------------------------------------------------------------------
-- C. release_integration_credential_refresh_lock
--    Clears own lease when owner+token still match (unexpired or expired).
--    Never clears a successor lease (token mismatch → fenced).
-- -----------------------------------------------------------------------------

create or replace function public.release_integration_credential_refresh_lock(
  p_organization_id uuid,
  p_integration_id uuid,
  p_provider text,
  p_owner_id text,
  p_claim_token text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text;
  v_owner text;
  v_claim text;
  v_updated integer;
  v_exists boolean;
begin
  if p_organization_id is null
    or p_integration_id is null
    or p_provider is null
    or p_owner_id is null
    or p_claim_token is null
  then
    raise exception 'invalid integration credential release arguments'
      using errcode = '22023';
  end if;

  v_provider := pg_catalog.btrim(p_provider);
  v_owner := pg_catalog.btrim(p_owner_id);
  v_claim := pg_catalog.btrim(p_claim_token);

  if pg_catalog.length(v_provider) = 0
    or pg_catalog.length(v_owner) = 0
    or pg_catalog.length(v_claim) = 0
    or v_owner !~ '^[A-Za-z0-9_.:-]{1,200}$'
  then
    raise exception 'invalid integration credential release arguments'
      using errcode = '22023';
  end if;

  -- Lock credential row (release does not mutate integrations).
  perform 1
  from public.integration_credentials as cred
  where cred.organization_id = p_organization_id
    and cred.integration_id = p_integration_id
    and cred.provider = v_provider
  for update;

  update public.integration_credentials as target
  set
    refresh_lock_token = null,
    refresh_lock_owner_id = null,
    refresh_lock_claimed_at = null,
    refresh_lock_expires_at = null,
    updated_at = pg_catalog.clock_timestamp()
  where target.organization_id = p_organization_id
    and target.integration_id = p_integration_id
    and target.provider = v_provider
    and target.refresh_lock_owner_id = v_owner
    and target.refresh_lock_token = v_claim;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    return 'released';
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
on function public.release_integration_credential_refresh_lock(
  uuid, uuid, text, text, text
)
from public;

revoke all
on function public.release_integration_credential_refresh_lock(
  uuid, uuid, text, text, text
)
from anon;

revoke all
on function public.release_integration_credential_refresh_lock(
  uuid, uuid, text, text, text
)
from authenticated;

revoke all
on function public.release_integration_credential_refresh_lock(
  uuid, uuid, text, text, text
)
from service_role;

grant execute
on function public.release_integration_credential_refresh_lock(
  uuid, uuid, text, text, text
)
to service_role;
