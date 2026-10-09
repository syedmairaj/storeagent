-- StoreAgent M1.5
-- Canonical foundation RLS + tenant enforcement.
--
-- Membership is the authorization bridge.
--
-- Direct authenticated client access:
--   SELECT only
--
-- Direct authenticated client mutation:
--   DENY
--
-- Anonymous tenant access:
--   DENY

-- -----------------------------------------------------------------------------
-- Explicit client privilege boundary
-- -----------------------------------------------------------------------------

revoke all
on table public.organizations
from anon;

revoke all
on table public.organization_members
from anon;

revoke all
on table public.stores
from anon;

revoke all
on table public.locations
from anon;

grant select
on table public.organizations
to authenticated;

grant select
on table public.organization_members
to authenticated;

grant select
on table public.stores
to authenticated;

grant select
on table public.locations
to authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.organizations
from authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.organization_members
from authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.stores
from authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.locations
from authenticated;

-- -----------------------------------------------------------------------------
-- organization_members
--
-- Membership is itself authorization data.
-- Ordinary authenticated clients may discover only their own memberships.
-- No direct client mutation policies exist.
-- -----------------------------------------------------------------------------

create policy organization_members_select_self
on public.organization_members
for select
to authenticated
using (
  user_id = (select auth.uid())
);

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------

create policy organizations_select_member
on public.organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      organizations.id
      and membership.user_id =
        (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- stores
-- -----------------------------------------------------------------------------

create policy stores_select_member
on public.stores
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      stores.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------

create policy locations_select_member
on public.locations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      locations.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);
