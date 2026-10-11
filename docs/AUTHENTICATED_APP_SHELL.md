# StoreAgent M1.6 Authenticated Application Shell

## Purpose

M1.6 establishes the authenticated StoreAgent application shell without
introducing inventory, forecasting, decision, provider, billing or AI logic.

The shell provides:

- authenticated application-route protection
- explicit organization selection
- organization authorization before workspace entry
- responsive application chrome
- organization context visibility
- sign-out
- honest foundation empty states

## Route model

    /
      marketing

    /app
      authenticated organization selection

    /app/[organizationId]
      authorized organization workspace

The organization id in the workspace route is an explicit requested tenant
selector.

It does not establish authorization by itself.

## Authentication boundary

All `/app` routes require a verified authenticated identity.

Authentication answers:

    Who is this user?

Authentication does not answer:

    Which organization may this user access?

Signed-out users are redirected to the public application surface.

## Organization selection

StoreAgent supports multi-organization users.

Therefore `/app` must never:

- select the first organization
- select the newest organization
- silently use the only organization
- infer organization from user id
- persist an unverified organization id as authority

Even when only one organization exists, the user explicitly selects it.

## Workspace authorization

`/app/[organizationId]` performs:

    verified identity
      -> requested organization id
      -> matching OrganizationMember
      -> trusted TenantContext
      -> organization record
      -> workspace shell

If membership does not match, access fails closed.

## Tenant selection persistence

M1.6 does not create a tenant-selection cookie or browser localStorage
authority.

The explicit route organization id remains the requested scope.

Future convenience mechanisms may remember a previous selection only if they
remain subordinate to server-side membership authorization.

## Application shell

The shell contains:

- StoreAgent product identity
- current organization identity
- current authenticated user identity
- current organization role
- Overview navigation state
- future product-area navigation labels
- explicit organization-switch action
- POST-only sign out
- responsive desktop/mobile structure

Future product areas may be visible as unavailable navigation context, but
M1.6 does not implement their business behavior.

## Design requirements

The shell must be:

- spacious
- premium
- decision-oriented
- responsive
- keyboard accessible
- visually confident
- free of cramped dashboard patterns
- free of decorative AI gradients
- free of invented business metrics

Empty states are first-class interface states.

## Error behavior

Unexpected persistence failures throw and remain available for the M1.7 error
and observability boundary.

Authorization failures do not fall back to another organization.

## M1.6 exclusions

M1.6 does not implement:

- store selection
- inventory ingestion
- inventory tables
- metrics
- forecasting
- inventory decisions
- data-quality processing
- provider synchronization
- Shopify
- CSV import
- billing
- AI explanations
- organization membership management
- ownership transfer
- organization deletion
