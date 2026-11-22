-- V15: drop additive CONN-1a objects; M2.6 integrations surface must remain.
\set ON_ERROR_STOP on

begin;

drop trigger if exists integration_credentials_prevent_identity_reassignment
  on public.integration_credentials;
drop trigger if exists integration_credentials_set_updated_at
  on public.integration_credentials;
drop function if exists
  public.prevent_integration_credential_identity_reassignment();

drop trigger if exists integration_external_accounts_prevent_identity_reassignment
  on public.integration_external_accounts;
drop trigger if exists integration_external_accounts_set_updated_at
  on public.integration_external_accounts;
drop function if exists
  public.prevent_integration_external_account_identity_reassignment();

drop table if exists public.integration_credentials;
drop table if exists public.integration_external_accounts;

do $$
begin
  if to_regclass('public.integration_credentials') is not null then
    raise exception 'integration_credentials still present after rollback';
  end if;
  if to_regclass('public.integration_external_accounts') is not null then
    raise exception 'integration_external_accounts still present after rollback';
  end if;
  if to_regclass('public.integrations') is null then
    raise exception 'M2.6 integrations damaged by additive rollback';
  end if;
  if to_regprocedure(
    'public.prevent_integration_identity_reassignment()'
  ) is null then
    raise exception 'M2.6 identity guard missing after additive rollback';
  end if;

  -- integrations still accepts inserts after vault drop
  insert into public.organizations (id, name, default_currency, timezone)
  values (
    'c011a0ff-0000-4000-8000-000000000099'::uuid,
    'V15 Org',
    'USD',
    'UTC'
  )
  on conflict (id) do nothing;

  insert into public.integrations (
    id, organization_id, provider, status, display_name
  )
  values (
    'c011a0ff-0000-4000-8000-000000000098'::uuid,
    'c011a0ff-0000-4000-8000-000000000099'::uuid,
    'shopify',
    'pending',
    'V15 intact'
  )
  on conflict (id) do nothing;
end;
$$;

\echo '--- V15 rollback of additive objects PASS; M2.6 intact ---'

commit;
