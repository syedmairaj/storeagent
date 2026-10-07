# StoreAgent Server Tenant Resolution

## Purpose

Every tenant-owned server operation must resolve trusted tenant context before reading or writing commercial data.

The client may request an organization or store.

The server decides whether that request is authorized.

---

## 1. Resolution sequence

The required sequence is:

authenticated identity
-> requested organization
-> organization membership
-> requested store when present
-> store ownership validation
-> TenantContext

Do not change this order.

---

## 2. Authentication

No authenticated identity means:

DENY

Never attempt tenant resolution for an anonymous user.

---

## 3. Organization selection

StoreAgent supports users belonging to multiple organizations.

Therefore the server must not:

- choose the first membership
- choose the most recently created organization implicitly
- derive organization from user ID
- use a global/default organization silently

For tenant-owned routes, the intended organization must be explicit or come from a previously trusted server-side selection mechanism.

---

## 4. Client organization IDs

Client-provided organizationId is only a requested selector.

It is never proof of membership.

Correct:

client requests org-a
-> server checks authenticated user
-> server checks organization_members
-> membership exists
-> tenant context resolved

Incorrect:

client sends org-a
-> server queries org-a directly

---

## 5. Membership

Membership must match both:

- authenticated userId
- requested organizationId

A membership belonging to another user does not authorize access.

A membership belonging to another organization does not authorize access.

---

## 6. Role

Role comes from trusted OrganizationMember data.

Never accept role from:

- browser JSON
- query parameter
- cookie controlled by client
- hidden form field
- AI output

---

## 7. Store selection

If storeId is requested:

1. store must exist
2. store must belong to requested organization
3. user must already be authorized for that organization

A store ID alone never establishes tenant ownership.

---

## 8. No fallback

Resolution must fail closed.

Forbidden fallback patterns:

- first organization membership
- first store
- globally unique email lookup
- globally unique SKU lookup
- globally unique provider ID lookup
- first matching provider record
- `.limit(1)` on unscoped tenant data

Ambiguity means deny or require explicit resolution.

---

## 9. TenantContext

Successful resolution produces:

- userId
- organizationId
- role
- storeId or null

Business services receive TenantContext rather than trusting raw request tenant identifiers.

---

## 10. Server routes

Tenant-owned API routes/server actions should conceptually follow:

1. authenticate
2. parse requested tenant scope
3. resolve tenant context
4. verify permission
5. execute scoped business operation

Do not query domain records before tenant resolution.

---

## 11. Background jobs

Workers do not have authenticated browser users.

A background job must receive or derive trusted:

- organizationId
- optional storeId

from a previously authorized canonical operation.

Worker scope must never be inferred from arbitrary external IDs.

---

## 12. Provider callbacks and webhooks

Provider callbacks may not have a logged-in user.

Tenant resolution must therefore come from trusted integration identity.

Correct:

verified provider event
-> trusted integration binding
-> organizationId
-> storeId
-> canonical processing

Incorrect:

provider resource ID
-> global tenant lookup
-> first match

---

## 13. Billing callbacks

Billing events resolve organization through trusted billing/customer binding.

Never rely on:

- customer email
- organization name
- browser-submitted organization ID

when processing payment events.

---

## 14. AI

AI never resolves tenant context.

AI receives only already-authorized data.

---

## 15. Logging

Security logs may include:

- user ID
- organization ID
- store ID
- route/action name
- resolution failure code

Do not log:

- access tokens
- service-role secrets
- provider secrets

---

## Resolution failure vocabulary

Initial failure reasons:

- unauthenticated
- organization_required
- membership_not_found
- store_not_found
- store_wrong_organization

Failures are explicit and fail closed.

---

## M0.3.4 gate

Before tenant-resolution architecture closes:

- authenticated identity is mandatory
- requested organization is explicit
- membership matches both user and organization
- role comes from trusted membership
- store ownership is independently validated
- no first-organization fallback exists
- no global external-ID tenant inference exists
- failures are explicit and fail closed
