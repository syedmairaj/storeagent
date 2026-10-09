# StoreAgent M1.5 RLS Implementation

## Purpose

M1.5 turns the frozen StoreAgent tenant-isolation architecture into database
policy enforcement for the canonical foundation tables.

Covered tables:

- organizations
- organization_members
- stores
- locations

Organization remains the primary tenant boundary.

Authentication alone never grants tenant access.

## Authorization bridge

`organization_members` is the source of truth for organization membership.

Authenticated tenant reads follow:

    auth.uid()
      -> organization_members.user_id
      -> organization_members.organization_id
      -> tenant-owned row

A client-supplied organization id remains only a requested selector.

## Membership visibility

Authenticated users may directly read only their own membership rows:

    organization_members.user_id = auth.uid()

M1.5 does not expose every member of an organization to ordinary clients.

Membership administration remains a trusted server/RPC responsibility.

## Organization visibility

An authenticated user may read an Organization only when a matching
OrganizationMember exists for:

- auth.uid()
- organization.id

There is no global organization enumeration.

## Store visibility

An authenticated user may read a Store only when a matching
OrganizationMember exists for:

- auth.uid()
- store.organization_id

A store id alone never establishes authorization.

## Location visibility

An authenticated user may read a Location only when a matching
OrganizationMember exists for:

- auth.uid()
- location.organization_id

The existing composite database constraint independently guarantees that the
Location organization matches its Store organization.

## Client writes

M1.5 grants no direct authenticated-client mutation capability for:

- organizations
- organization_members
- stores
- locations

No INSERT, UPDATE or DELETE policy is created.

Table privileges also remove ordinary client mutation privileges as
defense-in-depth.

Provisioning and future sensitive mutations use trusted RPC/server workflows.

## Anonymous access

Anonymous callers receive no tenant-table access.

No tenant-owned foundation table is public.

## Failure behavior

Missing or mismatched membership means:

    DENY

Never:

- first organization
- default organization
- first store
- global tenant read

## Layer ownership

RLS owns tenant isolation.

Application authorization owns business permissions and user experience.

Database constraints own relational consistency.

Trusted RPC/server services own sensitive mutation workflows.

## M1.5 exclusions

M1.5 does not implement:

- membership invitation
- membership mutation
- ownership transfer
- organization deletion
- store creation workflow
- location creation workflow
- authenticated application UI
- inventory tables
- integrations
- billing
- provider synchronization
- AI
