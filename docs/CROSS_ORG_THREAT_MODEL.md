# StoreAgent Cross-Organization Threat Model

## Purpose

StoreAgent must assume that tenant identifiers, store identifiers, provider identifiers, and role claims may be malicious or incorrect.

The system must fail closed.

---

## Threat 1 — Malicious organization ID

Attack:

A signed-in user belonging to Org A submits:

organizationId = Org B

Expected result:

DENY

Reason:

authentication does not imply membership in every organization.

---

## Threat 2 — Correct organization, foreign store ID

Attack:

User belongs to Org A but requests:

organizationId = Org A
storeId = Store B

where Store B belongs to Org B.

Expected result:

DENY

Store ID never overrides organization ownership.

---

## Threat 3 — Another user's membership reused

Attack:

User A attempts to rely on a membership row that belongs to User B.

Expected result:

DENY

Membership must match both:

- authenticated user ID
- requested organization ID

---

## Threat 4 — First-membership fallback

Attack surface:

Application resolves:

memberships.limit(1)

and treats the first organization as the user's tenant.

Risk:

Multi-org users may be placed into the wrong organization.

Expected design:

No implicit first-membership tenant selection.

---

## Threat 5 — Global email lookup

Attack surface:

Resolve tenant by:

contact.email
customer.email
user.email

without organization scope.

Risk:

Same email may exist across organizations.

Expected design:

Email never establishes tenant ownership globally.

---

## Threat 6 — Global SKU lookup

Attack surface:

Find SKU ABC123 globally and infer tenant from first result.

Risk:

SKU values are not globally unique.

Expected design:

SKU lookup is organization/store-scoped.

---

## Threat 7 — Provider ID collision

Attack:

Two Shopify stores have externally similar provider IDs.

Expected design:

Provider identity is scoped by:

integrationId
+ resourceType
+ externalId

Provider external ID alone never resolves tenant identity.

---

## Threat 8 — Worker payload tampering

Attack:

A worker receives:

organizationId = Org A
storeId = Store B

Expected result:

DENY before processing.

Trusted worker payload still requires ownership validation.

---

## Threat 9 — Service-role query without tenant filter

Attack surface:

Privileged code executes:

SELECT * FROM inventory_actions

and filters afterward.

Risk:

RLS is bypassed and cross-org data enters memory.

Expected design:

Privileged queries are explicitly organization-scoped before returning data.

---

## Threat 10 — Role escalation

Attack:

Client submits:

role = owner

Expected result:

Ignored.

Role comes only from trusted organization_members data.

---

## Threat 11 — Self-promotion

Attack:

Admin/analyst/operator attempts to update their membership role to owner.

Expected result:

DENY unless future trusted ownership-transfer workflow authorizes it.

---

## Threat 12 — Final owner removal

Attack:

Last owner removes or demotes themselves.

Expected result:

DENY.

At least one owner must remain.

---

## Threat 13 — Cross-org canonical reference

Attack:

Org A InventoryAction references Org B ProductVariant.

Expected result:

Impossible through application validation and future database constraints.

---

## Threat 14 — Cross-org provider binding

Attack:

Integration in Org A binds to canonical entity in Org B.

Expected result:

DENY.

Integration and canonical entity must resolve to the same organization.

---

## Threat 15 — AI-driven tenant selection

Attack surface:

Prompt or model output suggests an organization ID.

Expected result:

AI output is never an authorization source.

---

## Threat 16 — Browser-exposed service key

Attack surface:

NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

Expected result:

Forbidden by architecture and deployment review.

---

## Threat 17 — Anonymous tenant access

Attack:

Unauthenticated request attempts to read inventory/actions/orders.

Expected result:

DENY.

Tenant operational data is private by default.

---

## Threat 18 — Unscoped export

Attack surface:

Export endpoint loads records from multiple organizations.

Expected result:

Export scope must come from trusted TenantContext.

---

## Threat 19 — Billing tenant confusion

Attack surface:

Stripe webhook associates organization by email or organization name.

Expected result:

DENY / no update.

Billing webhook resolves through trusted customer/subscription binding.

---

## Threat 20 — Integration reconnect confusion

Attack surface:

Reconnect matches integration by provider name alone.

Expected result:

DENY ambiguous match.

Reconnect must use trusted provider/account identity and existing binding.

---

## Cross-org security rule

Any ambiguity in tenant ownership must result in:

DENY
QUARANTINE
or EXPLICIT RESOLUTION

Never:

GUESS
FIRST MATCH
GLOBAL FALLBACK

---

## M0.3.6 gate

Before threat modeling closes:

- malicious organization selector is covered
- foreign-store selector is covered
- user/membership mismatch is covered
- first-membership fallback is prohibited
- global email/SKU tenant inference is prohibited
- provider IDs are integration-scoped
- worker payload scope must be validated
- service-role queries remain explicitly tenant-scoped
- client role escalation is prohibited
- final-owner protection is defined
- AI is excluded from tenant authorization
