-- V15 (CONN-1c-α): drop α RPCs + fence columns; preserve CONN-1a tables + M2.6.
\set ON_ERROR_STOP on

begin;

drop function if exists
  public.load_integration_credential_envelope(uuid, uuid, text);

drop function if exists
  public.replace_integration_credential_set(
    uuid, uuid, text, text,
    bytea, bytea, bytea,
    bytea, bytea, bytea,
    bytea, bytea, bytea,
    integer, timestamptz, timestamptz, text, bigint
  );

drop function if exists
  public.clear_integration_credentials(uuid, uuid, text, bigint);

alter table public.integration_credentials
  drop constraint if exists integration_credentials_refresh_lock_consistent;

alter table public.integration_credentials
  drop constraint if exists integration_credentials_generation_positive;

alter table public.integration_credentials
  drop column if exists refresh_lock_claimed_at;

alter table public.integration_credentials
  drop column if exists refresh_lock_owner_id;

alter table public.integration_credentials
  drop column if exists refresh_lock_token;

alter table public.integration_credentials
  drop column if exists credential_generation;

do $$
begin
  if to_regprocedure(
    'public.load_integration_credential_envelope(uuid,uuid,text)'
  ) is not null then
    raise exception 'load RPC still present after α rollback';
  end if;

  if to_regclass('public.integration_credentials') is null then
    raise exception 'CONN-1a integration_credentials damaged by α rollback';
  end if;

  if to_regclass('public.integration_external_accounts') is null then
    raise exception 'CONN-1a integration_external_accounts damaged by α rollback';
  end if;

  if to_regclass('public.integrations') is null then
    raise exception 'M2.6 integrations damaged by α rollback';
  end if;

  if to_regprocedure(
    'public.prevent_integration_identity_reassignment()'
  ) is null then
    raise exception 'M2.6 identity guard missing after α rollback';
  end if;

  if to_regprocedure(
    'public.prevent_integration_credential_identity_reassignment()'
  ) is null then
    raise exception 'CONN-1a credential identity guard missing after α rollback';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_credentials'
      and column_name = 'credential_generation'
  ) then
    raise exception 'credential_generation still present after α rollback';
  end if;

  -- CONN-1a table still accepts owner inserts after α rollback
  insert into public.organizations (id, name, default_currency, timezone)
  values (
    'c011c0ff-0000-4000-8000-000000000099'::uuid,
    'V15-1c Org',
    'USD',
    'UTC'
  )
  on conflict (id) do nothing;

  insert into public.integrations (
    id, organization_id, provider, status, display_name
  )
  values (
    'c011c0ff-0000-4000-8000-000000000098'::uuid,
    'c011c0ff-0000-4000-8000-000000000099'::uuid,
    'shopify',
    'pending',
    'V15-1c intact'
  )
  on conflict (id) do nothing;

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
    key_version
  )
  values (
    'c011c0ff-0000-4000-8000-000000000099'::uuid,
    'c011c0ff-0000-4000-8000-000000000098'::uuid,
    'shopify',
    'offline_expiring',
    decode('aa', 'hex'),
    decode('0102030405060708090a0b0c', 'hex'),
    decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
    decode('bb', 'hex'),
    decode('1112131415161718191a1b1c', 'hex'),
    decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
    decode('cc', 'hex'),
    decode('2122232425262728292a2b2c', 'hex'),
    decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
    1
  );
end;
$$;

\echo '--- V15 CONN-1c-α rollback PASS; CONN-1a + M2.6 intact ---'

commit;
