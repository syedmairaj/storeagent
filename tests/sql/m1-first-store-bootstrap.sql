-- Local adversarial checks for M1.9 first-store bootstrap.
-- Run against local Supabase after applying migrations.

begin;

create temporary table _probe (
  step text primary key,
  ok boolean not null
);

insert into _probe (step, ok)
select
  'function_exists',
  exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as nsp
      on nsp.oid = proc.pronamespace
    where nsp.nspname = 'public'
      and proc.proname = 'create_current_user_first_organization_store'
  );

insert into _probe (step, ok)
select
  'authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.create_current_user_first_organization_store(uuid,text,text,text)',
    'execute'
  );

insert into _probe (step, ok)
select
  'anon_denied',
  not has_function_privilege(
    'anon',
    'public.create_current_user_first_organization_store(uuid,text,text,text)',
    'execute'
  );

insert into _probe (step, ok)
select
  'search_path_hardened',
  exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as nsp
      on nsp.oid = proc.pronamespace
    where nsp.nspname = 'public'
      and proc.proname = 'create_current_user_first_organization_store'
      and proc.prosecdef
      and exists (
        select 1
        from unnest(coalesce(proc.proconfig, array[]::text[])) as cfg(value)
        where cfg.value like 'search_path=%'
      )
  );

insert into _probe (step, ok)
select
  'owner_admin_and_first_store_guards',
  pg_catalog.pg_get_functiondef(proc.oid) ilike '%''owner'', ''admin''%'
  and pg_catalog.pg_get_functiondef(proc.oid) ilike '%Organization already has a store.%'
  and pg_catalog.pg_get_functiondef(proc.oid) ilike '%Organization profile is incomplete.%'
  and pg_catalog.pg_get_functiondef(proc.oid) ilike '%pg_advisory_xact_lock%'
from pg_catalog.pg_proc as proc
join pg_catalog.pg_namespace as nsp
  on nsp.oid = proc.pronamespace
where nsp.nspname = 'public'
  and proc.proname = 'create_current_user_first_organization_store'
limit 1;

select step, ok from _probe order by step;

do $$
begin
  if exists (select 1 from _probe where ok is not true) then
    raise exception 'M1.9 first-store bootstrap probe failed';
  end if;
end;
$$;

rollback;
