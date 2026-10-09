# StoreAgent Canonical Foundation Schema

## Purpose

M1.3 translates the minimum frozen StoreAgent tenancy and commerce foundation
into PostgreSQL persistence.

This milestone establishes relational truth.

It does not implement tenant authorization policies, provisioning workflows,
inventory persistence, provider synchronization, forecasting, decisions,
billing or AI.

## Foundation tables

M1.3 owns exactly these canonical tables:

- organizations
- organization_members
- stores
- locations

Supabase Auth continues to own authenticated user identity in:

- auth.users

StoreAgent does not introduce a separate Profile domain entity in M1.3.

## Organization

Organization is the primary StoreAgent tenant boundary.

Persisted fields:

- id
- name
- country_code
- default_currency
- timezone
- created_at
- updated_at

Organization deletion is intentionally not implemented as cascading deletion.

Later lifecycle work must define retention, billing, provider disconnect,
audit and privacy behavior before destructive tenant deletion is automated.

## Organization membership

organization_members connects:

- organization
- authenticated user
- StoreAgent role

Supported roles:

- owner
- admin
- analyst
- operator

A user may belong to multiple organizations.

The same user may belong to a particular organization only once.

Authentication does not imply organization membership.

Membership references Supabase auth.users identity directly.

Deletion of an auth user may remove that user's membership relationships.

Deleting an organization does not cascade through StoreAgent business data.

## Store

Store belongs to exactly one Organization.

Persisted fields:

- id
- organization_id
- name
- status
- currency
- timezone
- created_at
- updated_at

Supported statuses:

- active
- inactive
- archived

Provider identity is not part of Store canonical identity.

## Location

Location is part of the canonical domain from day one.

Persisted fields:

- id
- organization_id
- store_id
- name
- status
- code
- created_at
- updated_at

Supported statuses:

- active
- inactive
- archived

A Location's organization_id must match the owning Store's organization_id.

The database enforces this relationship through a composite foreign key.

A Location cannot point to a Store owned by another Organization.

## Cross-organization integrity

Tenant ownership must not depend exclusively on application code.

Where child records contain both organization_id and a parent identifier, the
database should be able to prove that the parent belongs to the same
organization.

M1.3 therefore establishes composite ownership keys that later domain tables
can reuse.

## Timestamps

Mutable foundation entities carry:

- created_at
- updated_at

Both are timestamptz.

created_at is set at insertion.

updated_at is automatically refreshed by a database trigger when a row is
updated.

## RLS boundary

Row Level Security is enabled during M1.3.

M1.3 intentionally creates no RLS policies.

Therefore browser/authenticated access remains fail-closed until M1.5 defines,
implements and verifies StoreAgent tenant policies.

M1.5 owns policy behavior.

M1.3 owns relational schema and constraints.

## Delete behavior

Organization-owned relationships use restrictive deletion behavior.

M1.3 does not create an ad-hoc organization cascade.

The only intentional cascade in this foundation is:

    auth.users
      -> organization_members

when an authentication identity itself is deleted.

This cleans up membership references without defining organization lifecycle.

## Explicit exclusions

M1.3 does not create:

- profiles
- products
- product_variants
- inventory_snapshots
- orders
- order_items
- returns_refunds
- suppliers
- supplier_products
- purchase_orders
- purchase_order_items
- integrations
- provider_bindings
- sync_runs
- metrics
- forecasts
- inventory actions
- action events
- billing
- notification preferences
- AI persistence
- Supplier Intelligence persistence

Those belong to later milestones.
