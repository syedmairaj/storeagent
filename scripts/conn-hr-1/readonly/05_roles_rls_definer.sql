-- CONN-HR-1 read-only preflight 05 — role attributes, unexpected roles,
-- sensitive memberships, RLS policies and SECURITY DEFINER hygiene.
-- SELECT-only. Parameter-free. Allowlisted output fields only.
-- Version-dependent pg_auth_members columns (PostgreSQL 16+) are read through
-- to_jsonb(row).

select
  r.rolname as role_name,
  r.rolsuper as is_superuser,
  r.rolinherit as inherits,
  r.rolcreaterole as can_create_role,
  r.rolcreatedb as can_create_db,
  r.rolcanlogin as can_login,
  r.rolreplication as is_replication,
  r.rolbypassrls as bypasses_rls,
  pg_catalog.pg_has_role(r.oid, 'pg_read_all_data', 'USAGE') as reads_all_data,
  pg_catalog.pg_has_role(r.oid, 'pg_write_all_data', 'USAGE') as writes_all_data,
  pg_catalog.pg_has_role(
    r.oid,
    (select c.relowner from pg_catalog.pg_class as c
     where c.oid = pg_catalog.to_regclass('public.integrations')),
    'USAGE'
  ) as inherits_integrations_owner
from pg_catalog.pg_roles as r
where r.rolname !~ '^pg_'
order by 1;

-- Roles outside the Supabase-managed set (review each; not automatically a STOP).
select r.rolname as unexpected_role, r.rolcanlogin as can_login,
       r.rolbypassrls as bypasses_rls, r.rolsuper as is_superuser
from pg_catalog.pg_roles as r
where r.rolname !~ '^pg_'
  and r.rolname not in (
    'postgres', 'anon', 'authenticated', 'authenticator', 'cli_login_postgres',
    'dashboard_user', 'pgbouncer', 'pgsodium_keyholder', 'pgsodium_keyiduser',
    'pgsodium_keymaker', 'pgtle_admin', 'service_role', 'supabase_admin',
    'supabase_auth_admin', 'supabase_etl_admin', 'supabase_functions_admin',
    'supabase_privileged_role', 'supabase_read_only_user', 'supabase_realtime_admin',
    'supabase_replication_admin', 'supabase_storage_admin', 'supabase_superuser'
  )
order by 1;

select
  g.rolname as granted_role,
  m.rolname as member_role,
  a.admin_option,
  pg_catalog.to_jsonb(a) ->> 'inherit_option' as inherit_option,
  pg_catalog.to_jsonb(a) ->> 'set_option' as set_option
from pg_catalog.pg_auth_members as a
join pg_catalog.pg_roles as g on g.oid = a.roleid
join pg_catalog.pg_roles as m on m.oid = a.member
where g.rolname in (
    'postgres', 'service_role', 'anon', 'authenticated', 'authenticator',
    'supabase_admin', 'pg_read_all_data', 'pg_write_all_data'
  )
  or m.rolname in ('service_role', 'anon', 'authenticated', 'authenticator')
order by 1, 2;

-- RLS and policy counts on guarded, vault and tenancy tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  (select pg_catalog.count(*) from pg_catalog.pg_policy as p where p.polrelid = c.oid)
    as policy_count
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'integrations', 'provider_bindings', 'sync_runs', 'organizations',
    'organization_members', 'integration_credentials', 'integration_external_accounts'
  )
order by 1;

select
  p.tablename as table_name,
  p.policyname as policy_name,
  p.cmd as command,
  p.permissive,
  p.roles::text as policy_roles
from pg_catalog.pg_policies as p
where p.schemaname = 'public'
  and p.tablename in (
    'integrations', 'provider_bindings', 'sync_runs',
    'integration_credentials', 'integration_external_accounts'
  )
order by 1, 2;

-- SECURITY DEFINER hygiene across public.
select
  pg_catalog.count(*) filter (where p.prosecdef) as definer_functions,
  pg_catalog.count(*) filter (
    where p.prosecdef
      and not exists (
        select 1 from pg_catalog.unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
        where cfg like 'search\_path=%'
      )
  ) as definer_without_search_path,
  pg_catalog.count(*) filter (
    where p.prosecdef and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  ) as definer_executable_by_anon
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and exists (select 1 from pg_catalog.pg_roles where rolname = 'anon');

select p.oid::pg_catalog.regprocedure::text as definer_without_search_path
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1 from pg_catalog.unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
    where cfg like 'search\_path=%'
  )
order by 1;
