# StoreAgent Error and Observability Boundary

## Purpose

M1.7 establishes StoreAgent's application error and observability boundary.

Observability reports what happened.

It does not own business truth, inventory calculations, forecasting,
decision logic, provider synchronization, billing or AI behavior.

## Error categories

StoreAgent distinguishes three categories.

### Expected

Expected failures are normal request outcomes.

Examples:

- authentication required
- invalid request
- organization required
- tenant access denied
- resource not found

Expected failures are not application crashes.

### Operational

Operational failures occur when valid application work cannot complete.

Examples:

- database unavailable
- authentication provider failure
- persistence failure
- network dependency failure

### Programming

Programming failures represent unexpected invariants or implementation bugs.

They must never expose internal details to browser users.

## Public versus internal errors

Internal errors may contain:

- stable error code
- error kind
- internal safe message
- request id
- trusted user id
- trusted organization id
- trusted store id
- route
- action
- safe structured metadata

Public errors may contain only:

- stable public error code
- safe public message
- request id

Public responses must not expose:

- stack traces
- database errors
- Supabase internal errors
- access tokens
- refresh tokens
- Authorization headers
- cookies
- passwords
- service-role credentials
- provider credentials
- raw sessions
- raw provider payloads

## Correlation identifiers

Application operations use an explicit requestId.

An inbound request id may be reused only when it matches StoreAgent's safe
request-id syntax.

Otherwise StoreAgent generates a new identifier.

A request id provides correlation.

It does not establish authentication or tenant authorization.

## Tenant context

Observability may record already-authorized:

- userId
- organizationId
- storeId

Observability must never infer tenant ownership.

Raw client organization IDs, provider IDs, emails or external identifiers
must not become trusted tenant context through logging.

## Redaction

Structured metadata is defensively redacted.

Sensitive key names and recognizable credential-bearing strings must not be
emitted.

Redaction is defense in depth.

Callers should still avoid passing sensitive material to observability.

## Logging

Application telemetry is structured.

M1.7 does not add a logging or monitoring vendor.

The internal contract must remain usable by a later transport without
changing application error ownership.

## Worker relationship

Existing worker observability remains worker-specific.

Application observability follows the same principles:

- explicit correlation
- explicit tenant scope
- structured events
- no secrets
- no raw payload ownership
- no monitoring-vendor dependency

Application and worker observability do not import each other's execution
models.

## M1.7 exclusions

M1.7 does not introduce:

- Sentry
- Datadog
- New Relic
- Axiom
- Better Stack
- OpenTelemetry backend configuration
- provider monitoring
- billing monitoring
- AI monitoring
- inventory alerting
- forecasting alerting
- business retry policy
