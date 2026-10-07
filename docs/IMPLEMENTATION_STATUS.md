# StoreAgent Implementation Status

## Current milestone

M0 — Architecture Lock

## Current sub-milestone

M0.2 — Canonical domain schema

## Status

IN PROGRESS

## M0 scope

- [x] M0.1 Repository + engineering conventions
  - [x] Design quality constitution added
- [ ] M0.2 Canonical domain schema
- [ ] M0.3 Tenancy / RLS architecture
- [ ] M0.4 Inventory formula specification
- [ ] M0.5 Forecast specification
- [ ] M0.6 Decision engine rules
- [ ] M0.7 Provider adapter contract
- [ ] M0.8 Background job architecture
- [ ] M0.9 Testing / evaluation architecture
- [ ] M0.10 Architecture gate

## Do not start yet

- Authentication implementation
- Database migrations
- CSV importer
- Shopify connector
- Forecast execution code
- AI integration
- Billing
- Production UI

These begin only after M0 passes.


### M0.1 completion

Status: PASS

Verified:

- Node 22 project runtime
- Next.js 16 foundation
- React 19
- strict TypeScript
- ESLint
- Tailwind CSS
- shadcn Base UI / Luma foundation
- Vitest
- production build
- design system constitution
- engineering conventions
- clean git diff validation

Next allowed sub-milestone:

M0.2 — Canonical domain schema


### M0.2 progress

- [x] M0.2.1 Entity catalog + ownership boundaries
- [x] M0.2.2 Canonical TypeScript types
- [x] M0.2.3 Relationships + invariants
- [x] M0.2.4 Money/time/nullability rules
- [x] M0.2.5 Provider binding semantics
- [x] M0.2.6 Immutable/history model
- [x] M0.2.7 Domain-model architecture tests
- [x] M0.2.8 M0.2 gate


### M0.2 completion

Status: PASS

Frozen:

- canonical entity catalog
- organization/store ownership boundaries
- provider-independent canonical identity
- canonical TypeScript domain model
- domain relationships and invariants
- exact monetary semantics
- UTC/store-local time semantics
- null vs zero semantics
- provider binding and reconciliation semantics
- immutable inventory/history model
- forecast and algorithm versioning
- immutable recommendation evidence
- append-only merchant action history
- AI numeric-truth boundary

Verification:

- typecheck PASS
- lint PASS
- unit/architecture tests PASS
- production build PASS
- git diff check PASS

Test count at closure:

41 / 41 passing

Next allowed sub-milestone:

M0.3 — Tenancy / RLS architecture
