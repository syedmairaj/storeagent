-- Local adversarial checks for M1.7 organization profile completion.
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
      and proc.proname = 'complete_current_user_organization_profile'
  );

insert into _probe (step, ok)
select
  'authenticated_execute',
  has_function_privilege(
    'authenticated',
    'public.complete_current_user_organization_profile(uuid,text,text,text,text)',
    'execute'
  );

insert into _probe (step, ok)
select
  'anon_denied',
  not has_function_privilege(
    'anon',
    'public.complete_current_user_organization_profile(uuid,text,text,text,text)',
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
      and proc.proname = 'complete_current_user_organization_profile'
      and proc.prosecdef
      and exists (
        select 1
        from unnest(coalesce(proc.proconfig, array[]::text[])) as cfg(value)
        where cfg.value like 'search_path=%'
      )
  );

insert into _probe (step, ok)
select
  'atomic_owner_incomplete_predicate',
  pg_catalog.pg_get_functiondef(proc.oid) ilike '%membership.role = ''owner''%'
  and pg_catalog.pg_get_functiondef(proc.oid) ilike '%default_currency = ''XXX''%'
  and pg_catalog.pg_get_functiondef(proc.oid) ilike '%returning organization.id%'
from pg_catalog.pg_proc as proc
join pg_catalog.pg_namespace as nsp
  on nsp.oid = proc.pronamespace
where nsp.nspname = 'public'
  and proc.proname = 'complete_current_user_organization_profile'
limit 1;

select step, ok from _probe order by step;

do $$
begin
  if exists (select 1 from _probe where ok is not true) then
    raise exception 'M1.7 organization profile completion probe failed';
  end if;
end;
$$;

rollback;
