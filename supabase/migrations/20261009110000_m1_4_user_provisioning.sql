-- StoreAgent M1.4
-- Initial authenticated-user provisioning.
--
-- A new authenticated user receives:
--
--   Organization
--     -> owner OrganizationMember
--
-- Existing members are never assigned a "first" organization.
--
-- The caller cannot provide user_id, organization_id or role.
-- Identity comes exclusively from auth.uid().

create or replace function public.ensure_current_user_provisioned()
returns table (
  created boolean,
  organization_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid;
  created_organization_id uuid;
begin
  authenticated_user_id :=
    auth.uid();

  if authenticated_user_id is null then
    raise exception
      'Authentication required.'
      using errcode = '42501';
  end if;

  /*
   * Serialize provisioning attempts for one authenticated user.
   *
   * This prevents concurrent auth callbacks from both observing
   * zero memberships and creating duplicate initial organizations.
   */
  perform
    pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        authenticated_user_id::text,
        0
      )
    );

  /*
   * Provisioning is not tenant selection.
   *
   * If any membership already exists, the user is provisioned.
   * Do not choose the first membership and do not expose an
   * arbitrary organization id.
   */
  if exists (
    select 1
    from public.organization_members as membership
    where membership.user_id =
      authenticated_user_id
  ) then
    return query
    select
      false,
      null::uuid;

    return;
  end if;

  insert into public.organizations (
    name,
    country_code,
    default_currency,
    timezone
  )
  values (
    'My Organization',
    null,
    'XXX',
    'UTC'
  )
  returning id
  into created_organization_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  )
  values (
    created_organization_id,
    authenticated_user_id,
    'owner'
  );

  return query
  select
    true,
    created_organization_id;
end;
$$;

revoke all
on function public.ensure_current_user_provisioned()
from public;

revoke all
on function public.ensure_current_user_provisioned()
from anon;

grant execute
on function public.ensure_current_user_provisioned()
to authenticated;
