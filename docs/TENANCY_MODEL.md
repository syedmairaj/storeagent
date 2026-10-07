# StoreAgent Tenancy Model

## Purpose

StoreAgent is a multi-tenant SaaS.

The Organization is the primary tenant boundary.

No user, API route, background job, provider sync, or AI workflow may access another organization's commercial data unless a future explicitly authorized cross-organization feature is designed.

---

## 1. Primary tenant boundary

Organization is the top-level tenant/account boundary.

All merchant-owned business data belongs to one Organization.

Examples:

- stores
- locations
- products
- product variants
- inventory
- orders
- returns
- suppliers
- purchase orders
- forecasts
- inventory actions
- integrations
- sync runs
- billing entitlements

---

## 2. User identity vs tenant identity

Authentication identifies the user.

Authentication alone does not authorize tenant access.

A signed-in user may act inside an Organization only when an active OrganizationMember relationship authorizes that user.

Therefore:

authenticated user
!=
authorized organization member

---

## 3. Membership

OrganizationMember connects:

user
-> organization
-> role

Initial roles:

- owner
- admin
- analyst
- operator

Membership determines which organizations a user may enter.

Role determines which actions may eventually be permitted inside that organization.

---

## 4. One user, multiple organizations

The architecture must support a user belonging to more than one organization.

Do not assume:

userId
=
organizationId

Do not permanently derive tenant identity from the authenticated user ID.

Tenant context must be resolved explicitly.

---

## 5. Store ownership

Store belongs to exactly one Organization.

A store cannot be shared between organizations.

All store-scoped data must resolve back to the same owning organization.

Example:

Organization A
  -> Store A1
      -> Products
      -> Inventory
      -> Orders

Organization B
  -> Store B1
      -> Products
      -> Inventory
      -> Orders

A user authorized only for Organization A must never access Store B1 or its descendants.

---

## 6. Direct vs inherited organization ownership

Some tables will carry organization_id directly.

Examples:

- stores
- products
- variants
- orders
- inventory_actions
- integrations

Other relationships may also be provable through a parent.

However, StoreAgent prefers explicit organization_id on tenant-owned operational tables where doing so improves:

- RLS clarity
- query safety
- performance
- auditability

Redundant organization_id is acceptable when protected by consistency constraints.

---

## 7. Tenant context

Application code must resolve a TenantContext before executing tenant-owned business operations.

Conceptually:

TenantContext
- userId
- organizationId
- role
- storeId? when store-scoped
- authorization source

Tenant context must come from trusted authenticated membership resolution.

Never accept organization ownership merely because the client submitted:

organizationId = "..."

Client input may identify a requested organization, but server code must independently verify membership.

---

## 8. URL parameters

A route may include:

/organizations/{organizationId}
/stores/{storeId}

These identifiers are selectors, not authorization.

Server-side authorization must still confirm:

- authenticated user
- membership
- organization ownership
- store ownership where relevant

---

## 9. RLS

Supabase Row Level Security is a mandatory database boundary.

Application authorization does not replace RLS.

RLS is defense in depth against:

- route mistakes
- missing filters
- compromised client code
- accidental cross-org queries

Tenant-owned tables must be RLS-enabled.

---

## 10. Application query scope

Even with RLS enabled, application queries should remain explicitly scoped where practical.

Preferred:

organization_id = resolvedTenant.organizationId

Avoid relying on RLS as the only indication of developer intent.

Rule:

RLS protects.
Application scoping communicates and reinforces ownership.

---

## 11. No unscoped tenant queries

Application-domain queries must not intentionally perform:

SELECT all products

and depend solely on later filtering in memory.

Tenant scope must be established before data is returned to business logic.

---

## 12. Background jobs

Workers have the same tenant-boundary requirements as web requests.

Every tenant-owned job payload must identify the intended Organization or derive it safely from trusted canonical records.

Example:

calculate forecast
-> organizationId
-> storeId
-> validated ownership

A worker may not process records across organizations accidentally because it runs outside a user request.

---

## 13. Provider integrations

Integration belongs to an Organization.

Provider synchronization must inherit that Organization before canonical writes occur.

An external provider identifier must never determine tenant ownership globally.

Correct:

integration
-> organization
-> provider resource
-> canonical record

Incorrect:

external provider ID
-> global lookup
-> guessed organization

---

## 14. AI boundary

AI receives only data already authorized for the resolved tenant.

AI must never be used to resolve tenant identity.

AI prompts must not include data from multiple organizations unless a future explicitly authorized administrative feature requires it.

---

## 15. Billing

BillingEntitlement belongs to Organization.

Plan/usage checks are performed against resolved organization context.

A user's subscription or identity alone does not determine another organization's entitlements.

---

## 16. Cross-organization references

Cross-organization foreign-key relationships are invalid.

Examples that must be impossible:

Organization A ProductVariant
-> Organization B Product

Organization A InventoryAction
-> Organization B Variant

Organization A SupplierProduct
-> Organization B Supplier

Application checks and database constraints will enforce this.

---

## 17. Organization deletion

Organization deletion is a separate future lifecycle design.

It must not be implemented as ad-hoc cascading deletion before:

- privacy rules
- billing state
- retention requirements
- audit requirements
- provider disconnect behavior

are defined.

---

## 18. Security posture

StoreAgent tenancy uses multiple boundaries:

1. authenticated identity
2. organization membership
3. application tenant resolution
4. explicit query scoping
5. database foreign keys/constraints
6. Supabase RLS
7. security tests

No single layer is considered sufficient.

---

## M0.3.1 gate

Before tenancy architecture progresses:

- Organization is the tenant boundary
- authentication is separate from authorization
- membership is mandatory
- multi-org users are supported
- URL/client organization IDs are not trusted
- background jobs are tenant-scoped
- provider sync is tenant-scoped
- billing is organization-scoped
- AI cannot resolve tenant ownership
- RLS is mandatory
