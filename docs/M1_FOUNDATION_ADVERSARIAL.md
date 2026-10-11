# StoreAgent M1.8 Foundation Integration and Adversarial Verification

## Purpose

M1.8 verifies that the complete M1 foundation works correctly when its
security and runtime boundaries are composed.

M1.8 does not add product functionality.

The verified chain is:

    authentication
    -> provisioning
    -> organization membership
    -> RLS
    -> explicit organization selection
    -> tenant resolution
    -> authenticated application shell
    -> error boundary
    -> observability

## Core security rule

Authentication identifies the user.

Authentication never establishes organization or store authorization.

A tenant-owned operation requires:

    verified user
    + explicit requested organization
    + matching membership
    + store ownership validation when a store is requested

## Adversarial matrix

### Anonymous

Must fail closed for:

- authenticated application access
- tenant resolution
- direct tenant-table reads
- direct tenant-table writes

### User A

May:

- resolve Org A when a matching membership exists
- resolve Store A when it belongs to Org A

May not:

- resolve Org B from a forged organization id
- resolve Store B through Org A
- obtain authorization from a foreign membership
- obtain authorization from authentication alone
- mutate protected foundation tables directly

### User B

The same guarantees apply symmetrically.

### Explicit tenant selection

StoreAgent must never:

- select the first membership
- select the newest membership
- silently select the only organization
- infer organization from user id
- infer tenant from provider id
- infer tenant from email
- use `.limit(1)` on unscoped tenant data

### Service-role boundary

Privileged execution still requires trusted tenant scope.

Service role does not establish tenant ownership.

### Errors and observability

Expected authorization failures remain expected failures.

Operational persistence failures use typed application errors.

Public errors do not expose:

- stack traces
- internal exception messages
- tokens
- cookies
- passwords
- service-role credentials
- provider credentials
- raw sessions

Observability correlation identifiers never establish authorization.

## M1.8 exclusions

M1.8 does not add:

- inventory persistence
- CSV ingestion
- Shopify synchronization
- forecasting
- decision persistence
- AI
- billing
- queues
- monitoring vendors
- new authentication providers
