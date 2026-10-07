# StoreAgent Role and Permission Model

## Purpose

StoreAgent separates:

- authentication
- organization membership
- role
- permission

A user may belong to multiple organizations and may have a different role in each.

Role is organization-scoped.

---

## 1. Initial roles

StoreAgent V1 roles:

- owner
- admin
- analyst
- operator

---

## 2. Owner

Owner has the highest organization-level authority.

Owner may:

- view all organization/store data
- manage organization settings
- manage stores
- manage integrations
- manage suppliers
- review inventory actions
- accept inventory actions
- edit accepted quantities
- dismiss actions
- mark actions complete
- manage members
- manage billing
- export organization data
- initiate destructive organization-level operations when explicitly supported

Owner is the only V1 role intended to:

- transfer ownership
- permanently delete the organization
- make highest-risk billing/account changes

These operations will be implemented later and require explicit confirmation.

---

## 3. Admin

Admin manages day-to-day StoreAgent configuration and operations.

Admin may:

- view all organization/store data
- manage stores
- manage integrations
- manage supplier settings
- manage organization operational settings
- review inventory actions
- accept actions
- edit accepted quantities
- dismiss actions
- complete actions
- manage non-owner members
- view billing/plan information

Admin may not:

- transfer ownership
- remove/demote the final owner
- permanently delete the organization unless a future explicit policy grants it
- bypass billing entitlements

---

## 4. Analyst

Analyst is primarily read/evaluate.

Analyst may:

- view Overview
- view Actions
- view Inventory
- view Forecasts
- view Suppliers
- view Reports
- inspect data quality
- inspect recommendation evidence
- inspect sync health
- view historical actions and outcomes

Analyst may not:

- change organization settings
- manage integrations
- manage members
- manage billing
- accept/dismiss/complete inventory actions
- modify supplier terms
- mutate inventory truth

V1 treats analyst as read-only for operational decisions.

---

## 5. Operator

Operator handles day-to-day inventory-action workflow.

Operator may:

- view relevant organization/store inventory data
- view recommendations
- inspect evidence
- accept recommendations
- accept with edited quantity
- dismiss recommendations
- mark actions complete
- view suppliers
- view current sync/data-quality status

Operator may not:

- manage organization membership
- manage billing
- change organization ownership
- change security-sensitive integration credentials
- delete organization
- bypass deterministic decision rules

---

## 6. Permission vocabulary

Initial application permission vocabulary:

- organization.read
- organization.manage
- organization.delete
- ownership.transfer

- members.read
- members.manage

- stores.read
- stores.manage

- inventory.read

- suppliers.read
- suppliers.manage

- forecasts.read

- actions.read
- actions.decide

- integrations.read
- integrations.manage

- data_quality.read

- reports.read

- billing.read
- billing.manage

- export.read
- export.manage

---

## 7. Role permission matrix

| Permission | Owner | Admin | Analyst | Operator |
|---|---:|---:|---:|---:|
| organization.read | yes | yes | yes | yes |
| organization.manage | yes | yes | no | no |
| organization.delete | yes | no | no | no |
| ownership.transfer | yes | no | no | no |
| members.read | yes | yes | no | no |
| members.manage | yes | yes | no | no |
| stores.read | yes | yes | yes | yes |
| stores.manage | yes | yes | no | no |
| inventory.read | yes | yes | yes | yes |
| suppliers.read | yes | yes | yes | yes |
| suppliers.manage | yes | yes | no | no |
| forecasts.read | yes | yes | yes | yes |
| actions.read | yes | yes | yes | yes |
| actions.decide | yes | yes | no | yes |
| integrations.read | yes | yes | yes | yes |
| integrations.manage | yes | yes | no | no |
| data_quality.read | yes | yes | yes | yes |
| reports.read | yes | yes | yes | yes |
| billing.read | yes | yes | no | no |
| billing.manage | yes | no | no | no |
| export.read | yes | yes | yes | no |
| export.manage | yes | yes | no | no |

---

## 8. Authorization principles

Role checks occur only after tenant membership is verified.

Correct:

authenticated user
-> membership resolution
-> tenant context
-> role
-> permission

Incorrect:

authenticated user
-> client-supplied role
-> allow operation

Client-submitted roles are never trusted.

---

## 9. Permissions vs RLS

RLS primarily protects tenant boundaries.

Role/permission checks may be implemented using:

- RLS where appropriate
- server-side authorization
- database functions for sensitive operations

Do not force all business permissions into raw RLS if doing so makes policy logic fragile or unmaintainable.

Tenant isolation must never depend only on application checks.

---

## 10. Final owner protection

StoreAgent must never permit an organization to lose its final owner accidentally.

Future membership mutation must enforce:

- at least one owner remains
- user cannot remove final owner
- user cannot demote final owner without assigning another owner first

---

## 11. Self-permission escalation

A user must not be able to:

- change their own role to owner
- grant themselves permissions
- change another user's organization membership without sufficient authority

Membership changes must be server-authorized.

---

## 12. Multi-org behavior

One user may be:

owner in Organization A

and:

analyst in Organization B

Authorization is evaluated independently for each tenant context.

No global user role exists.

---

## 13. Background jobs

Workers do not inherit a human role.

Background jobs operate under trusted service execution but remain:

- organization-scoped
- store-scoped where relevant
- purpose-scoped

Service execution must not become unrestricted business access.

---

## 14. AI

AI has no application role.

AI cannot:

- approve actions
- change membership
- manage billing
- resolve authorization
- change tenant context

AI can only operate on already-authorized data supplied by trusted application code.

---

## M0.3.2 gate

Before role semantics are frozen:

- roles are organization-scoped
- permission vocabulary is explicit
- analyst is read-only for decisions
- operator can execute action workflow but not account administration
- admin cannot transfer ownership
- owner is protected from accidental final-owner removal
- client-submitted roles are never trusted
- AI has no authorization authority
