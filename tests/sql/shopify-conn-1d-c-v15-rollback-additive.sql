-- V15 (CONN-1d-C): drop disconnect/revoke RPC only.
-- UNSAFE ALPHA DOWNGRADE: do NOT restore the pre-1d-C replace_integration_credential_set
-- body. Restoring the historical α function would silently re-enable credential
-- resurrection under terminal integrations.status. Owner decision: no production
-- rollback may restore resurrection. Terminal fence remains after this rollback.
\set ON_ERROR_STOP on

begin;

drop function if exists
  public.disconnect_or_revoke_integration_credentials(
    uuid, uuid, text, bigint, text, text
  );

do $$
declare
  outcome text;
  org uuid := 'c011d0c0-ffff-4000-8000-00000000f15a';
  store uuid := 'c011d0c0-ffff-4000-8000-00000000f15b';
  integ uuid := 'c011d0c0-ffff-4000-8000-00000000f15c';
  access_ct bytea := decode('aa', 'hex');
  access_n bytea := decode('0102030405060708090a0b0c', 'hex');
  access_t bytea := decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex');
  refresh_ct bytea := decode('bb', 'hex');
  refresh_n bytea := decode('1112131415161718191a1b1c', 'hex');
  refresh_t bytea := decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex');
  dek_ct bytea := decode('cc', 'hex');
  dek_n bytea := decode('2122232425262728292a2b2c', 'hex');
  dek_t bytea := decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex');
begin
  if to_regprocedure(
    'public.disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)'
  ) is not null then
    raise exception 'disconnect RPC still present after 1d-C rollback';
  end if;

  -- α + β + CONN-1a must remain
  if to_regprocedure(
    'public.replace_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,bigint)'
  ) is null then
    raise exception 'α replace missing after 1d-C rollback';
  end if;

  if to_regprocedure(
    'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'
  ) is null then
    raise exception 'β acquire missing after 1d-C rollback';
  end if;

  if to_regclass('public.integration_credentials') is null then
    raise exception 'CONN-1a vault damaged by 1d-C rollback';
  end if;

  if to_regclass('public.integration_external_accounts') is null then
    raise exception 'CONN-1a external accounts damaged by 1d-C rollback';
  end if;

  -- Behavioral proof: terminal fence MUST remain (unsafe alpha downgrade denied).
  insert into public.organizations (id, name, default_currency, timezone)
  values (org, 'CONN-1d-C V15 org', 'USD', 'UTC')
  on conflict (id) do nothing;

  insert into public.stores (
    id, organization_id, name, status, currency, timezone
  )
  values (store, org, 'CONN-1d-C V15 store', 'active', 'USD', 'UTC')
  on conflict (id) do nothing;

  insert into public.integrations (
    id, organization_id, store_id, provider, status, display_name
  )
  values (integ, org, store, 'shopify', 'disconnected', 'V15 fence probe')
  on conflict (id) do nothing;

  update public.integrations
  set status = 'disconnected'
  where id = integ;

  execute 'set role service_role';

  select r.outcome into outcome
  from public.replace_integration_credential_set(
    org, integ, 'shopify', 'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', null
  ) as r;

  if outcome <> 'fenced' then
    raise exception
      'UNSAFE ALPHA DOWNGRADE DETECTED: replace under disconnected returned % (expected fenced). Restoring pre-1d-C α body is forbidden.',
      outcome;
  end if;

  reset role;

  delete from public.integrations where id = integ;
  delete from public.stores where id = store;
  delete from public.organizations where id = org;
end;
$$;

\echo '--- V15 CONN-1d-C rollback PASS; disconnect dropped; α terminal fence retained (unsafe downgrade denied) ---'

commit;
