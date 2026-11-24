-- SHOPIFY-CONN-1d-E V15 rollback (offline / isolated PG only).
-- Drops only the additive 1d-E objects and proves M2.6 / M2.7, the CONN vault
-- objects and the CSV writer RPCs are intact. Re-apply the migration file
-- afterwards to restore the control.

\set ON_ERROR_STOP on

\echo '=== CONN-1d-E V15 rollback ==='

begin;

drop trigger zz_conn_1d_e_secret_json_guard on public.integrations;
drop trigger zz_conn_1d_e_secret_json_guard on public.provider_bindings;
drop trigger zz_conn_1d_e_secret_json_guard on public.sync_runs;
drop function public.conn_1d_e_reject_secret_json();

commit;

do $$
declare
  v_table text;
  v_policy text;
  v_trigger text;
  v_fn text;
begin
  if exists (select 1 from pg_proc where proname = 'conn_1d_e_reject_secret_json')
    or exists (select 1 from pg_trigger where tgname = 'zz_conn_1d_e_secret_json_guard')
  then
    raise exception 'FAIL V15: 1d-E objects remain after rollback';
  end if;

  foreach v_table in array array['integrations', 'provider_bindings', 'sync_runs'] loop
    if not (
      select c.relrowsecurity
      from pg_class c
      where c.oid = format('public.%I', v_table)::regclass
    ) then
      raise exception 'FAIL V15: RLS disabled on %', v_table;
    end if;

    if not has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
      or has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
    then
      raise exception 'FAIL V15: M2.7 browser privileges changed on %', v_table;
    end if;

    -- The TRIGGER revoke is a privilege change, not an additive object, so it
    -- is intentionally left in place; service_role DML is unaffected.
    if has_table_privilege('service_role', format('public.%I', v_table), 'TRIGGER')
      or not has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
      or not has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
    then
      raise exception 'FAIL V15: service_role privileges changed on %', v_table;
    end if;
  end loop;

  foreach v_policy in array array[
    'integrations_select_member',
    'provider_bindings_select_member',
    'sync_runs_select_member'
  ] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = v_policy) then
      raise exception 'FAIL V15: M2.7 policy % missing', v_policy;
    end if;
  end loop;

  foreach v_trigger in array array[
    'integrations_set_updated_at',
    'integrations_prevent_identity_reassignment',
    'provider_bindings_validate_canonical_target',
    'provider_bindings_prevent_identity_reassignment',
    'provider_bindings_set_updated_at',
    'sync_runs_validate_integration_scope',
    'sync_runs_prevent_identity_reassignment',
    'sync_runs_prevent_delete'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = v_trigger and not tgisinternal) then
      raise exception 'FAIL V15: M2.6 trigger % missing', v_trigger;
    end if;
  end loop;

  foreach v_fn in array array[
    'csv_bind_location',
    'csv_reconcile_product',
    'csv_reconcile_product_variant',
    'csv_reconcile_order',
    'csv_reconcile_order_item',
    'csv_reconcile_supplier',
    'csv_reconcile_purchase_order',
    'csv_reconcile_purchase_order_item',
    'csv_begin_sync_run',
    'csv_complete_sync_run',
    'csv_fail_sync_run',
    'replace_integration_credential_set',
    'disconnect_or_revoke_integration_credentials'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
    ) then
      raise exception 'FAIL V15: function % missing after rollback', v_fn;
    end if;
  end loop;

  if to_regclass('public.integration_credentials') is null
    or to_regclass('public.integration_external_accounts') is null
  then
    raise exception 'FAIL V15: CONN vault tables missing after rollback';
  end if;
end;
$$;

-- Rollback removes the DB control (app guard remains): prove, then discard.
begin;

insert into public.organizations (id, name, default_currency, timezone)
values ('e3000000-0000-4000-8000-000000000001', 'V15 probe', 'USD', 'UTC');

insert into public.integrations (organization_id, provider, status, configuration)
values (
  'e3000000-0000-4000-8000-000000000001',
  'shopify', 'pending', '{"access_token":"rollback-probe"}'
);

rollback;

\echo 'CONN-1d-E V15 rollback PASS (M2.6/M2.7 + CONN vault + CSV RPCs intact; DB control removed)'
