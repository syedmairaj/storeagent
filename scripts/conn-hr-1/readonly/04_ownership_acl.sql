-- CONN-HR-1 read-only preflight 04 — ownership, effective privileges, ACL
-- grantors and default privileges.
-- SELECT-only. Parameter-free. Allowlisted output fields only (role names,
-- object names, booleans). Works before and after apply: absent vault tables
-- simply produce no rows.

-- Table owners and RLS flags (guarded + vault tables).
select
  c.relname as table_name,
  pg_catalog.pg_get_userbyid(c.relowner) as owner_role,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'integrations', 'provider_bindings', 'sync_runs',
    'integration_credentials', 'integration_external_accounts'
  )
order by 1;

select pg_catalog.pg_get_userbyid(n.nspowner) as public_schema_owner
from pg_catalog.pg_namespace as n
where n.nspname = 'public';

-- Effective table privileges (inheritance and pg_read_all_data included) for
-- every non-superuser, non-owner role holding at least one privilege.
select
  c.relname as table_name,
  r.rolname as role_name,
  pg_catalog.pg_has_role(r.oid, c.relowner, 'USAGE') as inherits_owner,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT') as can_select,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT') as can_insert,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE') as can_update,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE') as can_delete,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE') as can_truncate,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'REFERENCES') as can_references,
  pg_catalog.has_table_privilege(r.oid, c.oid, 'TRIGGER') as can_trigger
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
cross join pg_catalog.pg_roles as r
where n.nspname = 'public'
  and c.relname in (
    'integrations', 'provider_bindings', 'sync_runs',
    'integration_credentials', 'integration_external_accounts'
  )
  and not r.rolsuper
  and r.oid <> c.relowner
  and r.rolname !~ '^pg_'
  and pg_catalog.has_table_privilege(
    r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
order by 1, 2;

-- Explicit ACL entries with grantor. A TRIGGER entry for a browser or
-- service role whose grantor is not the table owner survives the 1d-E REVOKE.
select
  c.relname as table_name,
  pg_catalog.pg_get_userbyid(a.grantor) as grantor_role,
  case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end as grantee_role,
  a.privilege_type,
  a.is_grantable,
  a.grantor = c.relowner as grantor_is_owner
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(c.relacl) as a
where n.nspname = 'public'
  and c.relname in (
    'integrations', 'provider_bindings', 'sync_runs',
    'integration_credentials', 'integration_external_accounts'
  )
order by 1, 3, 4;

-- Function owner, SECURITY DEFINER, search_path and effective EXECUTE for
-- every non-superuser, non-owner role.
select
  p.oid::pg_catalog.regprocedure::text as function_signature,
  pg_catalog.pg_get_userbyid(p.proowner) as owner_role,
  p.prosecdef as security_definer,
  coalesce((
    select pg_catalog.string_agg(cfg, ',' order by cfg)
    from pg_catalog.unnest(p.proconfig) as cfg
    where cfg like 'search\_path=%'
  ), '') as search_path_setting,
  p.proacl is null as acl_is_default_public_execute,
  coalesce((
    select pg_catalog.string_agg(r.rolname, ',' order by r.rolname)
    from pg_catalog.pg_roles as r
    where not r.rolsuper
      and r.oid <> p.proowner
      and r.rolname !~ '^pg_'
      and pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
  ), '') as execute_roles
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'set_updated_at',
    'load_integration_credential_envelope', 'replace_integration_credential_set',
    'clear_integration_credentials', 'acquire_integration_credential_refresh_lock',
    'rotate_integration_credential_set', 'release_integration_credential_refresh_lock',
    'disconnect_or_revoke_integration_credentials',
    'prevent_integration_credential_identity_reassignment',
    'prevent_integration_external_account_identity_reassignment',
    'conn_1d_e_reject_secret_json'
  )
order by 1;

-- Default privileges that will apply to objects the migrations create.
-- The migrations revoke only from PUBLIC, anon, authenticated, service_role;
-- any other grantee for for_role = postgres is a STOP.
select
  pg_catalog.pg_get_userbyid(d.defaclrole) as for_role,
  coalesce(n.nspname, '<all schemas>') as schema_name,
  d.defaclobjtype as object_type,
  case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee) end as grantee_role,
  a.privilege_type
from pg_catalog.pg_default_acl as d
left join pg_catalog.pg_namespace as n on n.oid = d.defaclnamespace
cross join lateral pg_catalog.aclexplode(d.defaclacl) as a
where n.nspname is null or n.nspname = 'public'
order by 1, 2, 3, 4, 5;

-- Schema privileges on public for non-superuser roles.
select
  r.rolname as role_name,
  pg_catalog.has_schema_privilege(r.oid, 'public', 'USAGE') as public_usage,
  pg_catalog.has_schema_privilege(r.oid, 'public', 'CREATE') as public_create
from pg_catalog.pg_roles as r
where not r.rolsuper
  and r.rolname !~ '^pg_'
  and pg_catalog.has_schema_privilege(r.oid, 'public', 'USAGE,CREATE')
order by 1;
