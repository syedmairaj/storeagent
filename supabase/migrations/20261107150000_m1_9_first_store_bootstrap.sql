-- StoreAgent M1.9
-- First-store bootstrap for a completed organization.
--
-- Authenticated clients remain SELECT-only on stores/locations (M1.5).
-- Owners and admins create the first store through this trusted RPC.
--
-- Identity and membership derive exclusively from auth.uid().
-- Callers cannot invent membership, escalate role, or select arbitrary orgs.
-- Concurrent first-store submissions are serialized per organization.
-- Currency/timezone default from the completed organization profile.
-- A default active location is created in the same transaction so later
-- inventory CSV binding has a store-scoped location without inventing stock.

create or replace function public.create_current_user_first_organization_store(
  p_organization_id uuid,
  p_name text,
  p_currency text default null,
  p_timezone text default null
)
returns table (
  store_id uuid,
  location_id uuid,
  organization_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid;
  normalized_name text;
  normalized_currency text;
  normalized_timezone text;
  org_default_currency text;
  org_timezone text;
  org_country_code text;
  member_role text;
  created_store_id uuid;
  created_location_id uuid;
  existing_store_count integer;
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

  /*
   * Serialize first-store creation per organization so concurrent owners
   * cannot both observe zero stores and insert duplicates.
   */
  perform pg_catalog.pg_advisory_xact_lock(
    ('x' || pg_catalog.substr(
      pg_catalog.md5('storeagent.first_store.' || p_organization_id::text),
      1,
      16
    ))::bit(64)::bigint
  );

  select
    membership.role
  into member_role
  from public.organization_members as membership
  where membership.organization_id = p_organization_id
    and membership.user_id = authenticated_user_id;

  if member_role is null then
    raise exception
      'Organization membership required.'
      using errcode = '42501';
  end if;

  if member_role not in ('owner', 'admin') then
    raise exception
      'Store management requires owner or admin.'
      using errcode = '42501';
  end if;

  select
    organization.default_currency,
    organization.timezone,
    organization.country_code
  into
    org_default_currency,
    org_timezone,
    org_country_code
  from public.organizations as organization
  where organization.id = p_organization_id;

  if org_default_currency is null then
    raise exception
      'Organization not found.'
      using errcode = 'P0002';
  end if;

  if org_country_code is null
     or org_default_currency = 'XXX' then
    raise exception
      'Organization profile is incomplete.'
      using errcode = 'P0001';
  end if;

  select
    pg_catalog.count(*)::integer
  into existing_store_count
  from public.stores as store
  where store.organization_id = p_organization_id;

  if existing_store_count > 0 then
    raise exception
      'Organization already has a store.'
      using errcode = 'P0001';
  end if;

  normalized_name :=
    pg_catalog.btrim(coalesce(p_name, ''));

  if pg_catalog.length(normalized_name) = 0
     or pg_catalog.length(normalized_name) > 120 then
    raise exception
      'Store name is invalid.'
      using errcode = '22023';
  end if;

  if p_currency is null
     or pg_catalog.btrim(p_currency) = '' then
    normalized_currency := org_default_currency;
  else
    normalized_currency :=
      pg_catalog.upper(pg_catalog.btrim(p_currency));
  end if;

  if pg_catalog.length(normalized_currency) <> 3
     or normalized_currency !~ '^[A-Z]{3}$'
     or normalized_currency = 'XXX' then
    raise exception
      'Currency is invalid.'
      using errcode = '22023';
  end if;

  if p_timezone is null
     or pg_catalog.btrim(p_timezone) = '' then
    normalized_timezone := org_timezone;
  else
    normalized_timezone :=
      pg_catalog.btrim(p_timezone);
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

  insert into public.stores (
    organization_id,
    name,
    status,
    currency,
    timezone
  )
  values (
    p_organization_id,
    normalized_name,
    'active',
    normalized_currency,
    normalized_timezone
  )
  returning stores.id
  into created_store_id;

  insert into public.locations (
    organization_id,
    store_id,
    name,
    status,
    code
  )
  values (
    p_organization_id,
    created_store_id,
    'Main',
    'active',
    null
  )
  returning locations.id
  into created_location_id;

  return query
  select
    created_store_id,
    created_location_id,
    p_organization_id;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on CREATE FUNCTION.
-- Supabase hosted also commonly applies role-specific default privileges
-- that GRANT EXECUTE to service_role (independent of PUBLIC). REVOKE FROM
-- public/anon alone does not remove that service_role grant.
revoke all
on function public.create_current_user_first_organization_store(
  uuid,
  text,
  text,
  text
)
from public;

revoke all
on function public.create_current_user_first_organization_store(
  uuid,
  text,
  text,
  text
)
from anon;

revoke all
on function public.create_current_user_first_organization_store(
  uuid,
  text,
  text,
  text
)
from service_role;

grant execute
on function public.create_current_user_first_organization_store(
  uuid,
  text,
  text,
  text
)
to authenticated;
