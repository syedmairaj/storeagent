-- CONN-HR-1 read-only post-apply catalog verification (run only after an
-- authorized apply of the five CONN migrations).
-- SELECT-only. Parameter-free. One row per check: check_name, pass, observed.
-- observed holds counts, role names, object names or fingerprints only.
-- GO requires every row pass = true (all_pass = true on every row).
-- Expected fingerprints come from the CONN-HR-1 disposable replay and are
-- recorded in docs/CONN_HR_1_HOSTED_READINESS_RUNBOOK.md.

with
guarded (oid, relname, relowner) as (
  select c.oid, c.relname, c.relowner
  from pg_catalog.pg_class as c
  where c.oid in (
    pg_catalog.to_regclass('public.integrations'),
    pg_catalog.to_regclass('public.provider_bindings'),
    pg_catalog.to_regclass('public.sync_runs')
  )
),
vault (oid, relname, relowner, relrowsecurity) as (
  select c.oid, c.relname, c.relowner, c.relrowsecurity
  from pg_catalog.pg_class as c
  where c.oid in (
    pg_catalog.to_regclass('public.integration_credentials'),
    pg_catalog.to_regclass('public.integration_external_accounts')
  )
),
base_owner (oid) as (
  select c.relowner from pg_catalog.pg_class as c
  where c.oid = pg_catalog.to_regclass('public.integrations')
),
fns (oid, proname, prosecdef, proowner, proconfig, is_rpc) as (
  select p.oid, p.proname, p.prosecdef, p.proowner, p.proconfig,
         p.proname not in (
           'prevent_integration_credential_identity_reassignment',
           'prevent_integration_external_account_identity_reassignment',
           'conn_1d_e_reject_secret_json')
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
      'conn_1d_e_reject_secret_json')
),
fn_exec (oid, proname, is_rpc, roles) as (
  select f.oid, f.proname, f.is_rpc,
    coalesce((
      select pg_catalog.string_agg(r.rolname, ',' order by r.rolname)
      from pg_catalog.pg_roles as r
      where not r.rolsuper
        and r.oid <> f.proowner
        and not pg_catalog.pg_has_role(r.oid, f.proowner, 'USAGE')
        and r.rolname !~ '^pg_'
        and pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE')
    ), '')
  from fns as f
),
vault_grantees (role_name, platform_reader) as (
  select distinct r.rolname,
    pg_catalog.pg_has_role(r.oid, 'pg_read_all_data', 'USAGE')
      or pg_catalog.pg_has_role(r.oid, 'pg_write_all_data', 'USAGE')
  from vault as v
  cross join pg_catalog.pg_roles as r
  where not r.rolsuper
    and r.oid <> v.relowner
    and not pg_catalog.pg_has_role(r.oid, v.relowner, 'USAGE')
    and r.rolname !~ '^pg_'
    and pg_catalog.has_table_privilege(
      r.oid, v.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
),
last_before (relname, trigger_name) as (
  select g.relname, (
    select t.tgname
    from pg_catalog.pg_trigger as t
    where t.tgrelid = g.oid
      and not t.tgisinternal
      and t.tgenabled <> 'D'
      and (t.tgtype & 1) <> 0
      and (t.tgtype & 2) <> 0
      and (t.tgtype & (4 | 16)) <> 0
    order by t.tgname collate "C" desc
    limit 1
  )
  from guarded as g
),
history as (
  select pg_catalog.count(*) as n,
         pg_catalog.md5(pg_catalog.string_agg(h.version, ',' order by h.version)) as versions_md5
  from supabase_migrations.schema_migrations as h
),
fp as (
  select
    (
      select pg_catalog.md5(pg_catalog.string_agg(
        f.oid::pg_catalog.regprocedure::text || '=' || pg_catalog.md5(pg_catalog.pg_get_functiondef(f.oid)),
        ',' order by f.oid::pg_catalog.regprocedure::text))
      from fns as f
    ) as functions_md5,
    (
      select pg_catalog.md5(pg_catalog.string_agg(part, ',' order by part))
      from (
        select v.relname || ':col:' || a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)
               || ':' || a.attnotnull::text || ':' || coalesce(pg_catalog.pg_get_expr(ad.adbin, ad.adrelid), '')
        from vault as v
        join pg_catalog.pg_attribute as a on a.attrelid = v.oid and a.attnum > 0 and not a.attisdropped
        left join pg_catalog.pg_attrdef as ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        union all
        select v.relname || ':con:' || k.conname || '=' || pg_catalog.pg_get_constraintdef(k.oid)
        from vault as v join pg_catalog.pg_constraint as k on k.conrelid = v.oid
        union all
        select v.relname || ':idx:' || pg_catalog.pg_get_indexdef(i.indexrelid)
        from vault as v join pg_catalog.pg_index as i on i.indrelid = v.oid
        union all
        select v.relname || ':trg:' || pg_catalog.pg_get_triggerdef(t.oid)
        from vault as v join pg_catalog.pg_trigger as t on t.tgrelid = v.oid and not t.tgisinternal
      ) as parts(part)
    ) as vault_schema_md5,
    (
      select pg_catalog.md5(pg_catalog.string_agg(pg_catalog.pg_get_triggerdef(t.oid), ',' order by g.relname))
      from guarded as g
      join pg_catalog.pg_trigger as t
        on t.tgrelid = g.oid and t.tgname = 'zz_conn_1d_e_secret_json_guard'
    ) as guard_triggers_md5
),
checks (check_name, pass, observed) as (
  select '01_history_rows_57', h.n = 57, h.n::text from history as h
  union all
  select '02_history_versions_md5', h.versions_md5 = '900da6949dfd6f7818a454b7f28ddf33', h.versions_md5
  from history as h
  union all
  select '03_vault_tables_present', pg_catalog.count(*) = 2, pg_catalog.count(*)::text from vault
  union all
  select '04_vault_owner_is_integrations_owner',
    pg_catalog.count(*) = 2 and pg_catalog.bool_and(v.relowner = (select oid from base_owner)),
    coalesce(pg_catalog.string_agg(v.relname || '=' || pg_catalog.pg_get_userbyid(v.relowner), ',' order by v.relname), '')
  from vault as v
  union all
  select '05_vault_rls_enabled', pg_catalog.count(*) = 2 and pg_catalog.bool_and(v.relrowsecurity),
    coalesce(pg_catalog.string_agg(v.relname || '=' || v.relrowsecurity::text, ',' order by v.relname), '')
  from vault as v
  union all
  select '06_vault_policy_count_zero', pg_catalog.count(*) = 0, pg_catalog.count(*)::text
  from pg_catalog.pg_policy as p join vault as v on v.oid = p.polrelid
  union all
  select '07_vault_rows_zero',
    (select pg_catalog.count(*) from public.integration_credentials) = 0
      and (select pg_catalog.count(*) from public.integration_external_accounts) = 0,
    (select pg_catalog.count(*) from public.integration_credentials)::text || ','
      || (select pg_catalog.count(*) from public.integration_external_accounts)::text
  union all
  select '08_vault_no_browser_or_service_privileges',
    not exists (select 1 from vault_grantees as g
                where g.role_name in ('anon', 'authenticated', 'service_role', 'authenticator')),
    coalesce((select pg_catalog.string_agg(g.role_name, ',' order by g.role_name) from vault_grantees as g
              where g.role_name in ('anon', 'authenticated', 'service_role', 'authenticator')), '')
  union all
  select '09_vault_other_grantees_platform_readers_only',
    not exists (select 1 from vault_grantees as g where not g.platform_reader
                and g.role_name not in ('anon', 'authenticated', 'service_role', 'authenticator')),
    coalesce((select pg_catalog.string_agg(g.role_name || case when g.platform_reader then '(platform_reader)' else '' end,
                                           ',' order by g.role_name) from vault_grantees as g), '')
  union all
  select '10_functions_present_10', pg_catalog.count(*) = 10, pg_catalog.count(*)::text from fns
  union all
  select '11_functions_owned_by_integrations_owner',
    pg_catalog.bool_and(f.proowner = (select oid from base_owner)),
    coalesce(pg_catalog.string_agg(distinct pg_catalog.pg_get_userbyid(f.proowner), ','), '')
  from fns as f
  union all
  select '12_rpcs_security_definer_empty_search_path',
    pg_catalog.count(*) = 7
      and pg_catalog.bool_and(f.prosecdef and f.proconfig = array['search_path=""']),
    pg_catalog.count(*) filter (where f.prosecdef and f.proconfig = array['search_path=""'])::text
  from fns as f where f.is_rpc
  union all
  select '13_trigger_functions_invoker_empty_search_path',
    pg_catalog.count(*) = 3
      and pg_catalog.bool_and(not f.prosecdef and f.proconfig = array['search_path=""']),
    pg_catalog.count(*) filter (where not f.prosecdef and f.proconfig = array['search_path=""'])::text
  from fns as f where not f.is_rpc
  union all
  select '14_rpc_execute_service_role_only',
    pg_catalog.count(*) = 7 and pg_catalog.bool_and(e.roles = 'service_role'),
    coalesce(pg_catalog.string_agg(distinct e.roles, ';'), '')
  from fn_exec as e where e.is_rpc
  union all
  select '15_trigger_function_execute_none',
    pg_catalog.count(*) = 3 and pg_catalog.bool_and(e.roles = ''),
    coalesce(pg_catalog.string_agg(distinct nullif(e.roles, ''), ';'), '')
  from fn_exec as e where not e.is_rpc
  union all
  select '16_function_definitions_md5', fp.functions_md5 = 'b3b15a5e6a8d8fa9cfddc42f9cb93834', coalesce(fp.functions_md5, '')
  from fp
  union all
  select '17_vault_schema_md5', fp.vault_schema_md5 = 'e8061599efc7703a435a393e409f1547', coalesce(fp.vault_schema_md5, '')
  from fp
  union all
  select '18_guard_trigger_definitions_md5', fp.guard_triggers_md5 = '0921691fa4a622ada27eb402d0228eeb',
    coalesce(fp.guard_triggers_md5, '')
  from fp
  union all
  select '19_guard_triggers_enabled_3', pg_catalog.count(*) = 3, pg_catalog.count(*)::text
  from pg_catalog.pg_trigger as t join guarded as g on g.oid = t.tgrelid
  where t.tgname = 'zz_conn_1d_e_secret_json_guard' and t.tgenabled = 'O'
  union all
  select '20_guard_is_last_before_row_trigger',
    pg_catalog.count(*) = 3 and pg_catalog.bool_and(l.trigger_name = 'zz_conn_1d_e_secret_json_guard'),
    coalesce(pg_catalog.string_agg(l.relname || '=' || coalesce(l.trigger_name, '<none>'), ',' order by l.relname), '')
  from last_before as l
  union all
  select '21_no_non_owner_trigger_holders', pg_catalog.count(*) = 0,
    coalesce(pg_catalog.string_agg(g.relname || ':' || r.rolname, ',' order by g.relname, r.rolname), '')
  from guarded as g
  cross join pg_catalog.pg_roles as r
  where not r.rolsuper
    and r.oid <> g.relowner
    and not pg_catalog.pg_has_role(r.oid, g.relowner, 'USAGE')
    and pg_catalog.has_table_privilege(r.oid, g.oid, 'TRIGGER')
  union all
  select '22_service_role_csv_dml_preserved',
    pg_catalog.count(*) = 3 and pg_catalog.bool_and(
      pg_catalog.has_table_privilege('service_role', g.oid, 'SELECT')
      and pg_catalog.has_table_privilege('service_role', g.oid, 'INSERT')
      and pg_catalog.has_table_privilege('service_role', g.oid, 'UPDATE')),
    pg_catalog.count(*)::text
  from guarded as g
  where exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
  union all
  select '23_vault_not_published',
    not exists (
      select 1 from pg_catalog.pg_publication_tables as pt
      where pt.schemaname = 'public'
        and pt.tablename in ('integration_credentials', 'integration_external_accounts'))
    and not exists (select 1 from pg_catalog.pg_publication as p where p.puballtables),
    coalesce((select pg_catalog.string_agg(p.pubname, ',' order by p.pubname)
              from pg_catalog.pg_publication as p where p.puballtables), '')
)
select c.check_name, coalesce(c.pass, false) as pass, c.observed,
       pg_catalog.bool_and(coalesce(c.pass, false)) over () as all_pass
from checks as c
order by c.check_name;
