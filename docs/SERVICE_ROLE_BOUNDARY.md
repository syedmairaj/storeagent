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

## 14. Data-quality issue mutation

`persist_data_quality_issue` and `transition_data_quality_issue` are the M4 write paths.

Execute is granted to `service_role` and revoked from `public`, `anon`, and `authenticated`.

Browser roles have no insert, update, or delete on `data_quality_issues`. Authenticated members have SELECT only.

Every call requires a trusted organization id. Organization is never derived from `source_context`, provider ids, or the issue payload.

Lifecycle and persistence rules are in `DOMAIN_INVARIANTS.md` section 21.

---

## 15. Bulk operations

Cross-organization bulk operations are exceptional.

They require:

- explicit administrative purpose
- dedicated implementation
- audit logging
- careful filtering
- no reuse in user-facing routes

V1 should avoid them unless operationally necessary.

---

## 16. AI

AI never receives service-role credentials.

AI never directly executes service-role database queries.

Trusted server code loads authorized data first.

---

## 17. Derived SKU metric reads

`public.sku_daily_metrics` allows authenticated member SELECT. Anon has no access. Browser INSERT, UPDATE, and DELETE are revoked. Local M5.5 adds `sku_daily_metric_source_snapshot` and `commit_sku_daily_metric` for `service_role` only. Both are `security definer` with an empty `search_path`. The source token and the four payloads come from one statement. Commit revalidates that token under source-table `SHARE` locks, with a 2-second `lock_timeout`, and raises `SA008` on mismatch. Orchestration is server-only in `lib/persistence/recompute-sku-daily-metric.ts`. Hosted deployment is complete: both functions remain `security definer` with an empty `search_path`, `service_role` has `EXECUTE`, and `authenticated` and `anon` do not. The M5.5 closeout is in `IMPLEMENTATION_STATUS.md`.

M5.6A adds `public.sku_daily_metric_source_events`. Row level security is enabled and there are no merchant policies. `service_role` has `SELECT` only. Capture functions are `security definer` with an empty `search_path` and `EXECUTE` granted to `service_role` only. They run as statement triggers and are not a merchant write path.

M5.6B adds `public.sku_daily_metric_recompute_requests` and `public.consume_sku_daily_metric_source_events(integer, uuid)`. The table has row level security, no merchant policies, and `SELECT` for `service_role` only. The function is `security definer` with an empty `search_path`. `EXECUTE` is granted to `service_role` only. Calling it is explicit. Deploying the function does not consume hosted events or recalculate hosted metrics. No deployed worker claims these requests. The handoff is `docs/M5_6_HANDOFF.md`.

M5.6C (closed locally; hosted migration not deployed; worker disabled) adds six `security definer` functions with an empty `search_path`: recover, claim, start, complete, fail, and queue stats for metric recompute requests. `EXECUTE` is revoked from `public`, `anon`, and `authenticated` and granted to `service_role` only. `service_role` still has no INSERT, UPDATE, or DELETE on the request table; every transition goes through these functions and matches the full stored primary key. Claim and consumption are cross-organization infrastructure dispatch under section 15. Each executed item takes its tenant scope from its own request row, never from a caller. Orchestration is server-only in `lib/persistence/metric-recompute-queue.ts`. The internal trigger is disabled by default and returns counts only.

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
