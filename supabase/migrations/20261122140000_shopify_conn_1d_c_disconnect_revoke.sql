-- StoreAgent SHOPIFY-CONN-1d-C
-- Additive disconnect/revoke RPC + α terminal create/CAS fence.
--
-- Authority:
--   CONN_1D_C_FINAL_PROTOCOL_FREEZE_REPORT (session)
--   docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md
--   docs/SERVICE_ROLE_BOUNDARY.md
--
-- Scope (this slice only):
--   CREATE OR REPLACE replace_integration_credential_set (terminal fence)
--   disconnect_or_revoke_integration_credentials
--   service_role EXECUTE only; vault table privileges remain revoked
--
-- Out of scope:
--   force-clear / advisory locks / generation bypass
--   D13 retention / D14 binding / OAuth / Shopify HTTP / hosted apply / KEK

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

revoke all
on table public.integration_external_accounts
from public;

revoke all
on table public.integration_external_accounts
from anon;

revoke all
on table public.integration_external_accounts
from authenticated;

revoke all
on table public.integration_external_accounts
from service_role;

-- -----------------------------------------------------------------------------
-- A. replace_integration_credential_set — preserve α signature + nonterminal
--    behavior; lock integrations before credentials; terminal → fenced
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
  v_status text;
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

  -- Lock order: integrations → credentials (create/CAS).
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

  -- Terminal statuses deny create and CAS replace (no credential resurrection).
  if v_status in ('disconnected', 'revoked') then
    credential_id := null;
    credential_generation := null;
    outcome := 'fenced';
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

  -- CAS replace: generation fence + unexpired refresh lease fence.
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
-- B. disconnect_or_revoke_integration_credentials
--    Lock order: integrations → credentials → external_accounts
-- -----------------------------------------------------------------------------

create or replace function public.disconnect_or_revoke_integration_credentials(
  p_organization_id uuid,
  p_integration_id uuid,
  p_provider text,
  p_expected_generation bigint,
  p_terminal_status text,
  p_reason_class text
)
returns table (
  outcome text,
  integration_status text,
  credential_generation bigint,
  vault_present boolean,
  refresh_lock_expires_at timestamptz,
  external_account_released boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_provider text;
  v_terminal text;
  v_reason text;
  v_mapped text;
  v_status text;
  v_now timestamptz;
  v_cred public.integration_credentials%rowtype;
  v_vault_present boolean := false;
  v_lease_expires timestamptz := null;
  v_gen bigint := null;
  v_ownership_status text := null;
  v_released boolean := false;
  v_status_changed boolean := false;
  v_cleared boolean := false;
  v_deleted integer := 0;
begin
  if p_organization_id is null
    or p_integration_id is null
    or p_provider is null
    or p_terminal_status is null
    or p_reason_class is null
  then
    raise exception 'invalid disconnect_or_revoke arguments'
      using errcode = '22023';
  end if;

  v_provider := pg_catalog.btrim(p_provider);
  v_terminal := pg_catalog.btrim(p_terminal_status);
  v_reason := pg_catalog.btrim(p_reason_class);

  if pg_catalog.length(v_provider) = 0
    or pg_catalog.length(v_terminal) = 0
    or pg_catalog.length(v_reason) = 0
  then
    raise exception 'invalid disconnect_or_revoke arguments'
      using errcode = '22023';
  end if;

  if v_terminal not in ('disconnected', 'revoked') then
    raise exception 'invalid disconnect_or_revoke terminal status'
      using errcode = '22023';
  end if;

  if v_reason = 'merchant_disconnect' then
    v_mapped := 'disconnected';
  elsif v_reason in ('uninstall', 'hard_auth_failure') then
    v_mapped := 'revoked';
  else
    raise exception 'invalid disconnect_or_revoke reason_class'
      using errcode = '22023';
  end if;

  if v_mapped <> v_terminal then
    raise exception 'disconnect_or_revoke reason/status mismatch'
      using errcode = '22023';
  end if;

  if p_expected_generation is not null and p_expected_generation < 1 then
    raise exception 'invalid disconnect_or_revoke expected_generation'
      using errcode = '22023';
  end if;

  v_now := pg_catalog.clock_timestamp();

  -- 1) Integration row lock.
  select integration.status
  into v_status
  from public.integrations as integration
  where integration.organization_id = p_organization_id
    and integration.id = p_integration_id
    and integration.provider = v_provider
  for update;

  if v_status is null then
    outcome := 'not_found';
    integration_status := null;
    credential_generation := null;
    vault_present := false;
    refresh_lock_expires_at := null;
    external_account_released := false;
    return next;
    return;
  end if;

  -- Deny reverse downgrade revoked → disconnected.
  if v_status = 'revoked' and v_terminal = 'disconnected' then
    outcome := 'conflict';
    integration_status := v_status;
    credential_generation := null;
    vault_present := false;
    refresh_lock_expires_at := null;
    external_account_released := false;
    return next;
    return;
  end if;

  -- 2) Credential row lock (if present).
  select cred.*
  into v_cred
  from public.integration_credentials as cred
  where cred.organization_id = p_organization_id
    and cred.integration_id = p_integration_id
    and cred.provider = v_provider
  for update;

  if found and v_cred.id is not null then
    v_vault_present := true;
    v_gen := v_cred.credential_generation;
    v_lease_expires := v_cred.refresh_lock_expires_at;

    -- Present vault requires exact positive generation (NULL forbidden).
    if p_expected_generation is null
      or p_expected_generation <> v_cred.credential_generation
    then
      outcome := 'conflict';
      integration_status := v_status;
      credential_generation := v_gen;
      vault_present := true;
      refresh_lock_expires_at := v_lease_expires;
      external_account_released := false;
      return next;
      return;
    end if;
  else
    v_vault_present := false;
    v_gen := null;
    v_lease_expires := null;

    -- NULL generation allowed ONLY when vault absent.
    if p_expected_generation is not null then
      outcome := 'conflict';
      integration_status := v_status;
      credential_generation := null;
      vault_present := false;
      refresh_lock_expires_at := null;
      external_account_released := false;
      return next;
      return;
    end if;
  end if;

  -- Commit terminal status (upgrade disconnected→revoked allowed).
  if v_status is distinct from v_terminal then
    update public.integrations as target
    set
      status = v_terminal,
      updated_at = v_now
    where target.organization_id = p_organization_id
      and target.id = p_integration_id
      and target.provider = v_provider;

    v_status := v_terminal;
    v_status_changed := true;
  end if;

  -- Lease held: terminal committed; vault retained; no ownership release.
  if v_vault_present
    and v_cred.refresh_lock_expires_at is not null
    and v_cred.refresh_lock_expires_at > v_now
  then
    outcome := 'lease_held';
    integration_status := v_status;
    credential_generation := v_gen;
    vault_present := true;
    refresh_lock_expires_at := v_cred.refresh_lock_expires_at;
    external_account_released := false;
    return next;
    return;
  end if;

  -- Clear vault when present and lease absent/expired (generation already matched).
  if v_vault_present then
    delete from public.integration_credentials as target
    where target.organization_id = p_organization_id
      and target.integration_id = p_integration_id
      and target.provider = v_provider
      and target.credential_generation = p_expected_generation
      and (
        target.refresh_lock_expires_at is null
        or target.refresh_lock_expires_at <= v_now
      );

    get diagnostics v_deleted = row_count;

    if v_deleted = 0 then
      -- Unexpected fence after locks; fail closed without ownership release.
      outcome := 'conflict';
      integration_status := v_status;
      credential_generation := v_gen;
      vault_present := true;
      refresh_lock_expires_at := v_lease_expires;
      external_account_released := false;
      return next;
      return;
    end if;

    v_cleared := true;
    v_vault_present := false;
    v_gen := null;
    v_lease_expires := null;
  end if;

  -- 3) External ownership lock + Phase A release ONLY after completed cleanup.
  select ownership.ownership_status
  into v_ownership_status
  from public.integration_external_accounts as ownership
  where ownership.organization_id = p_organization_id
    and ownership.integration_id = p_integration_id
    and ownership.provider = v_provider
  for update;

  if v_ownership_status = 'active' then
    update public.integration_external_accounts as ownership
    set
      ownership_status = v_terminal,
      revoked_at = v_now,
      updated_at = v_now
    where ownership.organization_id = p_organization_id
      and ownership.integration_id = p_integration_id
      and ownership.provider = v_provider
      and ownership.ownership_status = 'active';

    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then
      v_released := true;
      v_ownership_status := v_terminal;
    end if;
  end if;

  -- already_terminal only when no cleanup remained (status already target,
  -- vault absent, ownership already non-active).
  if not v_status_changed
    and not v_cleared
    and not v_released
    and v_status = v_terminal
    and not v_vault_present
    and (
      v_ownership_status is null
      or v_ownership_status <> 'active'
    )
  then
    outcome := 'already_terminal';
  else
    outcome := 'completed';
  end if;

  integration_status := v_status;
  credential_generation := v_gen;
  vault_present := v_vault_present;
  refresh_lock_expires_at := v_lease_expires;
  external_account_released := v_released;
  return next;
end;
$$;

revoke all
on function public.disconnect_or_revoke_integration_credentials(
  uuid, uuid, text, bigint, text, text
)
from public;

revoke all
on function public.disconnect_or_revoke_integration_credentials(
  uuid, uuid, text, bigint, text, text
)
from anon;

revoke all
on function public.disconnect_or_revoke_integration_credentials(
  uuid, uuid, text, bigint, text, text
)
from authenticated;

revoke all
on function public.disconnect_or_revoke_integration_credentials(
  uuid, uuid, text, bigint, text, text
)
from service_role;

grant execute
on function public.disconnect_or_revoke_integration_credentials(
  uuid, uuid, text, bigint, text, text
)
to service_role;
