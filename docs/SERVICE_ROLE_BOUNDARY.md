# StoreAgent Service-Role Boundary

## Purpose

Supabase service-role access bypasses Row Level Security.

Therefore service-role usage is highly privileged and must be tightly constrained.

Service-role access is not a substitute for tenant resolution.

---

## 1. Browser prohibition

Service-role credentials must never be exposed to:

- browser bundles
- client components
- public environment variables
- frontend network responses
- logs
- error messages

Service-role usage is server-only.

---

## 2. Environment naming

Service-role secrets must use server-only environment variables.

Never prefix service-role credentials with:

NEXT_PUBLIC_

Any variable with a NEXT_PUBLIC_ prefix is considered browser-exposable.

---

## 3. Allowed service-role use cases

Service-role may be used for trusted server workflows such as:

- account/workspace provisioning
- background workers
- verified provider webhook processing
- verified Stripe webhook processing
- scheduled aggregation
- forecast jobs
- action generation
- reconciliation jobs
- privacy/export/delete operations
- administrative repair tooling

Only when tenant scope is established explicitly.

---

## 4. Prohibited usage

Service-role code must not:

- trust raw client organizationId
- trust raw client storeId
- query tenant data globally and filter later
- use email to infer tenant globally
- use provider IDs without integration scope
- perform unbounded cross-org updates
- return unrestricted database results to clients
- act as an RLS bypass for convenience

---

## 5. Tenant scope requirement

Every service-role operation that touches tenant data must have trusted tenant scope.

Trusted scope may come from:

- resolved authenticated TenantContext
- trusted Integration record
- trusted Stripe/customer binding
- trusted scheduled-job payload
- trusted canonical entity relationship

It must not come from arbitrary client input alone.

---

## 6. Worker scope

Background workers may use service-role access.

Each job must be scoped to:

- organizationId
- optional storeId
- explicit job purpose

Example:

forecast job:
organizationId = org-a
storeId = store-a
purpose = calculate_forecast

The worker must still apply explicit organization filters.

---

## 7. Webhook scope

Provider webhooks must follow:

verified signature
-> trusted integration lookup
-> integration.organizationId
-> tenant-scoped processing

Stripe webhooks must follow:

verified Stripe event
-> trusted billing binding
-> organizationId
-> tenant-scoped billing update

Never use email or display name for tenant resolution.

---

## 8. Provisioning

Initial organization/workspace provisioning may require privileged execution.

Provisioning must be:

- idempotent
- tied to authenticated user identity
- safe against duplicate organization/member creation
- explicit about organization ownership

Service-role must not create unrelated tenant records from untrusted input.

---

## 9. Logging

Service-role operations should log:

- operation name
- organizationId
- storeId when relevant
- correlation/job ID
- outcome

Do not log:

- service-role secret
- provider token
- Stripe secret
- OAuth credentials
- raw sensitive payloads unless explicitly required and protected

---

## 10. Narrow helpers

Prefer narrow server helpers.

Good:

runForecastForStore({
  organizationId,
  storeId
})

Bad:

serviceDb.query(anyTable, anyFilter)

Generic unrestricted service-role helpers make tenant mistakes easier.

---

## 11. Client/server import boundary

Service-role modules must live in clearly server-only locations.

Recommended locations:

lib/server/
lib/server/supabase/
workers/

Client components must never import these modules.

Where appropriate, server-only modules should import:

server-only

to prevent accidental client bundling.

---

## 12. RLS bypass acknowledgement

Any module using service-role must explicitly acknowledge:

RLS_IS_BYPASSED = true

through code structure/documentation.

The developer should never assume RLS is protecting service-role queries.

---

## 13. Fail closed

If a service-role workflow lacks trusted tenant scope:

DENY / FAIL

Do not:

- pick first tenant
- infer tenant heuristically
- continue with global scope

---

## 14. Bulk operations

Cross-organization bulk operations are exceptional.

They require:

- explicit administrative purpose
- dedicated implementation
- audit logging
- careful filtering
- no reuse in user-facing routes

V1 should avoid them unless operationally necessary.

---

## 15. AI

AI never receives service-role credentials.

AI never directly executes service-role database queries.

Trusted server code loads authorized data first.

---

## M0.3.5 gate

Before service-role architecture is frozen:

- service-role is server-only
- NEXT_PUBLIC_ service-role secrets are forbidden
- every privileged tenant operation requires trusted tenant scope
- workers remain explicitly org-scoped
- webhook tenant resolution uses trusted bindings
- generic unrestricted helpers are discouraged
- missing tenant scope fails closed
- AI never receives privileged credentials
