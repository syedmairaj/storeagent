# StoreAgent User Provisioning

## Purpose

M1.4 establishes the trusted transition from authenticated identity to initial
StoreAgent organization membership.

Authentication answers:

    Who is the user?

Provisioning answers:

    Does this authenticated user need an initial StoreAgent organization?

Provisioning does not choose the user's active organization.

Tenant selection and authorization remain separate concerns.

## Provisioning boundary

Provisioning is performed through an authenticated PostgreSQL RPC:

    ensure_current_user_provisioned()

The function derives identity exclusively from:

    auth.uid()

It does not accept:

- user_id
- organization_id
- role
- store_id

from callers.

This prevents client-controlled tenant identity from entering the provisioning
boundary.

## New user behavior

When the authenticated user has zero OrganizationMember records:

1. serialize provisioning for that authenticated user
2. create one Organization
3. create one OrganizationMember
4. assign the `owner` role
5. return that a new organization was created

The organization and owner membership are created in one database transaction.

A partial result must not survive.

## Existing user behavior

When any OrganizationMember already exists for the authenticated user:

- create no organization
- create no membership
- select no organization
- return `created = false`
- return no organization identifier

Provisioning must never implement:

    first membership
    first organization
    default tenant

Multi-organization selection belongs to later application behavior.

## Concurrency

Provisioning must be safe when the same authenticated user triggers multiple
requests concurrently.

The function takes a transaction-scoped PostgreSQL advisory lock derived from
the authenticated user id before testing membership existence.

Therefore concurrent requests for the same user serialize around the
membership check.

Only one request may create the initial Organization + owner membership.

## Bootstrap organization values

The initial organization uses bootstrap values because M1 does not yet include
merchant onboarding.

Initial values:

- name: `My Organization`
- country_code: null
- default_currency: `XXX`
- timezone: `UTC`

`XXX` is used as the bootstrap currency marker rather than inventing a merchant
currency such as USD, AED or GBP.

These values are not merchant business truth.

Future onboarding must collect and persist the merchant's actual:

- organization name
- country
- default currency
- timezone

before business calculations depend on those values.

## Privilege model

The provisioning RPC is:

- SECURITY DEFINER
- search_path hardened
- executable by authenticated users
- unavailable to anonymous callers

The function can mutate RLS-protected foundation tables while remaining bound
to `auth.uid()`.

Provisioning does not use the StoreAgent service-role client.

This is intentional because a user undergoing initial provisioning does not yet
have an organization-scoped trusted service context.

## Auth callback integration

After PKCE code exchange succeeds, the server-side authentication callback
invokes provisioning before completing the authentication redirect.

If provisioning fails, authentication must not silently continue into an
apparently usable tenant state.

The callback returns a safe generic provisioning error.

## M1.4 exclusions

M1.4 does not implement:

- organization selection UI
- organization switching
- invitations
- membership management UI
- ownership transfer
- organization deletion
- role editing
- store creation
- profile records
- RLS tenant policies
- inventory
- integrations
- billing
- Supplier Intelligence

M1.5 owns tenant RLS policy implementation.
