# StoreAgent Authentication and Session Architecture

## Purpose

M1.2 establishes authentication and session mechanics.

Authentication answers:

> Who is this user?

Authentication does not answer:

> Which organization, store or resource may this user access?

Organization authorization remains owned by StoreAgent tenancy architecture.

## Authentication provider boundary

Supabase Auth owns:

- authentication identity
- access tokens
- refresh tokens
- authentication sessions
- PKCE code exchange
- provider authentication flows

StoreAgent owns:

- interpretation of verified authentication identity
- organization membership
- tenant resolution
- permissions
- store ownership validation
- authorization decisions

A valid Supabase session never grants organization access by itself.

## Server identity verification

Server code must not trust the user object from an unverified cookie session.

StoreAgent verifies request identity through:

    supabase.auth.getClaims()

The authenticated StoreAgent identity is derived from the verified JWT `sub`.

StoreAgent does not use:

    supabase.auth.getSession()

as an authorization or trusted server-identity boundary.

## Tenant claims

JWT claims do not establish StoreAgent tenant ownership.

In particular, authentication claims such as:

- organization_id
- store_id
- role
- provider metadata
- user metadata

must not independently authorize canonical StoreAgent resources.

Organization membership and store ownership are resolved separately through trusted persistence.

## Session refresh

Next.js 16 uses root-level `proxy.ts`.

Proxy owns:

- reading incoming auth cookies
- refreshing Supabase authentication state
- propagating refreshed cookies to the response

Proxy does not own:

- organization authorization
- permissions
- business-route policy
- canonical resource ownership

## PKCE callback

Server-side authentication uses PKCE-compatible code exchange.

The callback:

    /auth/callback

accepts an Auth Code and exchanges it through:

    exchangeCodeForSession()

The callback never accepts a raw user id, organization id or store id as proof of authorization.

## Redirect safety

Post-auth redirects must remain same-origin application paths.

Absolute external URLs and protocol-relative URLs are rejected.

## Sign out

Sign out mutates authentication state and is therefore POST-only.

GET requests must not sign a user out.

## Privileged Supabase access

Authentication/session code must not use the privileged Supabase admin client.

Service-role or secret credentials do not participate in normal user authentication.

## M1.2 exclusions

M1.2 does not implement:

- organization provisioning
- membership persistence
- application RLS policies
- store selection
- authenticated dashboard UI
- Google-specific UI
- email magic-link UI
- password authentication UI
- billing
- inventory functionality
- provider synchronization
- AI

Those capabilities belong to later milestones.
