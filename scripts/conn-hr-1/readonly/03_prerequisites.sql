-- CONN-HR-1 read-only preflight 03 — prerequisite objects, schema fingerprints
-- and name collisions for the five CONN migrations.
-- SELECT-only. Parameter-free. Allowlisted output fields only.
-- Expected fingerprints are recorded in docs/CONN_HR_1_HOSTED_READINESS_RUNBOOK.md.

select
  pg_catalog.to_regclass('public.integrations') is not null as integrations_present,
  pg_catalog.to_regclass('public.provider_bindings') is not null as provider_bindings_present,
  pg_catalog.to_regclass('public.sync_runs') is not null as sync_runs_present,
  pg_catalog.to_regclass('public.organizations') is not null as organizations_present,
  pg_catalog.to_regprocedure('public.set_updated_at()') is not null as set_updated_at_present,
  pg_catalog.to_regnamespace('extensions') is not null as extensions_schema_present,
  pg_catalog.to_regprocedure('auth.uid()') is not null as auth_uid_present,
  exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conname = 'integrations_organization_id_provider_unique'
      and c.conrelid = pg_catalog.to_regclass('public.integrations')
      and c.contype = 'u'
  ) as m26_composite_unique_present,
  pg_catalog.to_regclass('public.integration_credentials') is null as vault_table_absent,
  pg_catalog.to_regclass('public.integration_external_accounts') is null as ownership_table_absent,
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger as t
    where t.tgname = 'zz_conn_1d_e_secret_json_guard'
  ) as guard_trigger_count;

-- Column shape of the columns the CONN migrations depend on.
select
  c.relname as table_name,
  a.attname as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
  a.attnotnull as not_null
from pg_catalog.pg_attribute as a
join pg_catalog.pg_class as c on c.oid = a.attrelid
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not a.attisdropped
  and (c.relname, a.attname) in (
    ('integrations', 'organization_id'), ('integrations', 'id'),
    ('integrations', 'provider'), ('integrations', 'status'),
    ('integrations', 'configuration'), ('provider_bindings', 'source_metadata'),
    ('sync_runs', 'error_summary'), ('sync_runs', 'reconciliation_metadata'),
    ('sync_runs', 'status')
  )
order by 1, 2;

-- Structural fingerprints (column, constraint, trigger, index definitions).
-- Columns are ordered by name so attnum drift does not matter.
select
  c.relname as table_name,
  (
    select pg_catalog.md5(pg_catalog.string_agg(
      a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text,
      ',' order by a.attname))
    from pg_catalog.pg_attribute as a
    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  ) as columns_md5,
  (
    select pg_catalog.md5(pg_catalog.string_agg(
      k.conname || '=' || pg_catalog.pg_get_constraintdef(k.oid), ',' order by k.conname))
    from pg_catalog.pg_constraint as k
    where k.conrelid = c.oid
  ) as constraints_md5,
  (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      t.tgname || '=' || pg_catalog.pg_get_triggerdef(t.oid), ',' order by t.tgname), ''))
    from pg_catalog.pg_trigger as t
    where t.tgrelid = c.oid and not t.tgisinternal
  ) as triggers_md5,
  (
    select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.pg_get_indexdef(i.indexrelid), ',' order by pg_catalog.pg_get_indexdef(i.indexrelid)))
    from pg_catalog.pg_index as i
    where i.indrelid = c.oid
  ) as indexes_md5
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('integrations', 'provider_bindings', 'sync_runs')
order by c.relname;

-- Definitions the vault migrations rely on.
select
  k.conname as constraint_name,
  pg_catalog.pg_get_constraintdef(k.oid) as definition
from pg_catalog.pg_constraint as k
where k.conrelid = pg_catalog.to_regclass('public.integrations')
  and k.conname in (
    'integrations_status_check',
    'integrations_configuration_object',
    'integrations_organization_id_provider_unique'
  )
order by 1;

select pg_catalog.md5(
  pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.set_updated_at()'))
) as set_updated_at_md5;

-- Name collisions with objects the five migrations create (expect 0 / no rows).
select pg_catalog.count(*) as colliding_relations
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (
    c.relname like 'integration\_credentials%'
    or c.relname like 'integration\_external\_accounts%'
  );

select p.oid::pg_catalog.regprocedure::text as colliding_function
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'load_integration_credential_envelope', 'replace_integration_credential_set',
    'clear_integration_credentials', 'acquire_integration_credential_refresh_lock',
    'rotate_integration_credential_set', 'release_integration_credential_refresh_lock',
    'disconnect_or_revoke_integration_credentials',
    'prevent_integration_credential_identity_reassignment',
    'prevent_integration_external_account_identity_reassignment',
    'conn_1d_e_reject_secret_json'
  )
order by 1;
