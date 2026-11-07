-- StoreAgent M1.7
-- First-time organization profile completion.
--
-- Authenticated clients remain SELECT-only on organizations (M1.5).
-- Owners complete bootstrap org fields through this trusted RPC.
--
-- Identity and ownership derive exclusively from auth.uid().
-- Callers cannot invent membership or escalate role.
-- Updates are atomic: ownership + incomplete bootstrap predicates
-- are enforced in the same UPDATE statement (no arbitrary org pick).

create or replace function public.complete_current_user_organization_profile(
  p_organization_id uuid,
  p_name text,
  p_country_code text,
  p_default_currency text,
  p_timezone text
)
returns table (
  organization_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid;
  normalized_name text;
  normalized_country text;
  normalized_currency text;
  normalized_timezone text;
  updated_organization_id uuid;
  is_owner boolean;
  org_exists boolean;
  is_incomplete boolean;
begin
  authenticated_user_id := auth.uid();

  if authenticated_user_id is null then
    raise exception
      'Authentication required.'
      using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception
      'Organization is required.'
      using errcode = '22023';
  end if;

  normalized_name :=
    pg_catalog.btrim(coalesce(p_name, ''));

  normalized_country :=
    pg_catalog.upper(pg_catalog.btrim(coalesce(p_country_code, '')));

  normalized_currency :=
    pg_catalog.upper(pg_catalog.btrim(coalesce(p_default_currency, '')));

  normalized_timezone :=
    pg_catalog.btrim(coalesce(p_timezone, ''));

  if pg_catalog.length(normalized_name) = 0
     or pg_catalog.length(normalized_name) > 120 then
    raise exception
      'Organization name is invalid.'
      using errcode = '22023';
  end if;

  if pg_catalog.length(normalized_country) <> 2
     or normalized_country !~ '^[A-Z]{2}$' then
    raise exception
      'Country code is invalid.'
      using errcode = '22023';
  end if;

  if pg_catalog.length(normalized_currency) <> 3
     or normalized_currency !~ '^[A-Z]{3}$'
     or normalized_currency = 'XXX' then
    raise exception
      'Currency is invalid.'
      using errcode = '22023';
  end if;

  if pg_catalog.length(normalized_timezone) = 0
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names as tz
       where tz.name = normalized_timezone
     ) then
    raise exception
      'Timezone is invalid.'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.organizations as organization
    where organization.id = p_organization_id
  )
  into org_exists;

  if not org_exists then
    raise exception
      'Organization not found.'
      using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = authenticated_user_id
      and membership.role = 'owner'
  )
  into is_owner;

  if not is_owner then
    raise exception
      'Organization ownership required.'
      using errcode = '42501';
  end if;

  select
    organization.country_code is null
    or organization.default_currency = 'XXX'
  into is_incomplete
  from public.organizations as organization
  where organization.id = p_organization_id;

  if is_incomplete is distinct from true then
    raise exception
      'Organization profile is already complete.'
      using errcode = 'P0001';
  end if;

  /*
   * Atomic completion: only the owned incomplete organization mutates.
   * Concurrent callers cannot complete a second time.
   */
  update public.organizations as organization
  set
    name = normalized_name,
    country_code = normalized_country,
    default_currency = normalized_currency,
    timezone = normalized_timezone
  where organization.id = p_organization_id
    and (
      organization.country_code is null
      or organization.default_currency = 'XXX'
    )
    and exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = organization.id
        and membership.user_id = authenticated_user_id
        and membership.role = 'owner'
    )
  returning organization.id
  into updated_organization_id;

  if updated_organization_id is null then
    raise exception
      'Organization profile is already complete.'
      using errcode = 'P0001';
  end if;

  return query
  select updated_organization_id;
end;
$$;

revoke all
on function public.complete_current_user_organization_profile(
  uuid,
  text,
  text,
  text,
  text
)
from public;

revoke all
on function public.complete_current_user_organization_profile(
  uuid,
  text,
  text,
  text,
  text
)
from anon;

grant execute
on function public.complete_current_user_organization_profile(
  uuid,
  text,
  text,
  text,
  text
)
to authenticated;
