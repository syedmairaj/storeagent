# StoreAgent RLS Architecture

## Purpose

Supabase Row Level Security is a mandatory tenant-isolation boundary.

Application authorization does not replace RLS.

RLS protects StoreAgent against:

- missing application filters
- accidental cross-org queries
- compromised browser/client code
- route implementation mistakes
- unauthorized direct Supabase access

---

## 1. Primary RLS rule

A signed-in user may access tenant-owned records only when:

auth.uid()
-> organization_members.user_id
-> matching organization_id

The organization membership table is the authorization bridge.

---

## 2. Membership source of truth

organization_members is authoritative for tenant membership.

The browser/client must never be trusted to declare:

- organization membership
- organization role
- tenant ownership

A client-provided organization_id is only a requested scope.

Authorization comes from database membership.

---

## 3. Tenant-owned tables

Tenant-owned tables must be RLS-enabled.

Tenant-owned operational tables should carry organization_id directly where practical.

Examples:

- stores
- locations
- products
- product_variants
- provider_bindings
- inventory_snapshots
- orders
- order_items
- returns_refunds
- suppliers
- supplier_products
- purchase_orders
- purchase_order_items
- sku_daily_metrics
- forecast_runs
- sku_forecasts
- inventory_actions
- action_events
- data_quality_issues
- integrations
- sync_runs
- notification_preferences
- billing_entitlements

Direct organization_id simplifies:

- RLS
- indexing
- query review
- cross-org testing
- operational debugging

---

## 4. Read policy pattern

Conceptually:

USING (
  EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.organization_id = target.organization_id
      AND om.user_id = auth.uid()
  )
)

This is the baseline read rule.

---

## 5. Write policy pattern

Writes require more than tenant membership.

Write authorization depends on permission.

Examples:

- analyst may read actions
- analyst may not decide actions
- operator may decide actions
- admin may manage suppliers
- owner/admin may manage integrations

For sensitive operations, prefer:

- server-side authorization
- RPC/database function
- tightly scoped RLS

rather than complex client-side write policies alone.

---

## 6. Client-direct reads

Direct authenticated client reads are acceptable for low-risk tenant-scoped read operations when RLS fully protects them.

Examples may include:

- inventory lists
- action lists
- forecast views
- reports
- supplier read views

Only after policies are verified.

---

## 7. Client-direct writes

Client-direct writes should be conservative.

Avoid direct browser writes for high-impact operations such as:

- membership changes
- billing changes
- provider credential operations
- ownership transfer
- organization deletion
- action lifecycle transitions where audit semantics matter

These should go through trusted server/RPC paths.

---

## 8. Action lifecycle writes

InventoryAction original recommendation fields are not client-editable.

Merchant decisions create ActionEvent records.

Action state transitions should be performed through a trusted server-side service or RPC that:

- verifies membership
- verifies permission
- validates lifecycle transition
- inserts ActionEvent
- updates allowed lifecycle status
- preserves immutable evidence

---

## 9. Immutable tables

Historical tables should normally reject user UPDATE/DELETE access.

Examples:

- inventory_snapshots
- sync_runs
- forecast_runs
- sku_forecasts
- action_events

Application/service execution may insert records where appropriate.

Historical evidence must not be editable from ordinary clients.

---

## 10. Membership RLS

organization_members requires special care because it controls tenant access.

Users may be allowed to read their own memberships.

Membership management writes must not be generally client-writable.

Owner/admin membership changes should execute through trusted server/RPC logic.

Final-owner protection must be enforced.

---

## 11. Organization visibility

A user may read an organization only when membership exists.

Users must not enumerate organizations globally.

Organization creation/provisioning will use a trusted idempotent provisioning path.

---

## 12. Store ownership

Store rows are visible only through organization membership.

Child records must never rely only on store_id if organization_id is available.

Both relational constraints and RLS should reinforce organization ownership.

---

## 13. Provider integrations

Integrations are tenant-owned.

Credential values must not be exposed through ordinary client queries.

Separate:

- integration metadata
- secret credentials

Client-readable integration records contain safe status/configuration only.

---

## 14. Service role

Supabase service-role bypasses RLS.

Therefore service-role access is highly privileged.

Service-role code must never:

- accept raw client organization_id and trust it
- expose service-role keys to browser code
- execute broad cross-org operations without explicit purpose

Detailed service-role rules are frozen separately in M0.3.5.

---

## 15. Background workers

Workers may use privileged database access.

Every job must still carry or derive trusted organization scope.

Worker code must scope queries explicitly even when RLS is bypassed.

RLS bypass is not permission to write unscoped code.

---

## 16. AI workflows

AI does not query the database directly.

Trusted application code:

1. resolves tenant context
2. loads authorized evidence
3. sends only authorized payload to AI

AI output never determines authorization.

---

## 17. Anonymous access

Tenant business tables are not readable anonymously.

Anonymous/public access may exist only for explicitly public marketing/application surfaces later.

No tenant-owned operational data is public by default.

---

## 18. Policy naming

Use predictable policy names.

Examples:

- organizations_select_member
- stores_select_member
- products_select_member
- inventory_actions_select_member
- inventory_actions_no_client_update
- action_events_insert_authorized
- organization_members_select_self
- organization_members_manage_admin

Consistent naming makes policy audits easier.

---

## 19. Security indexing

RLS-supporting columns must be indexed appropriately.

Typical indexes:

organization_members(user_id, organization_id)

tenant_table(organization_id)

and where useful:

tenant_table(organization_id, store_id)

Poor RLS query performance must not become a reason to weaken isolation.

---

## 20. Cross-org tests

Every tenant-owned table must eventually be covered by security tests proving:

User A / Org A:

- can read Org A records when authorized
- cannot read Org B records
- cannot insert records into Org B
- cannot update Org B
- cannot delete Org B

These tests are mandatory before production.

---

## 21. Fail closed

If RLS cannot determine membership, access is denied.

Missing membership means:

DENY

not:

fallback organization
first organization
default tenant
global read

---

## 22. RLS vs application logic

RLS owns tenant isolation.

Application authorization owns business permissions and user experience.

Database constraints own relational integrity.

Trusted services own sensitive workflows.

These layers complement each other.

---

## M0.3.3 gate

Before RLS architecture is frozen:

- membership is the authorization bridge
- tenant tables carry organization_id where practical
- anonymous tenant access is denied
- immutable historical tables are not client editable
- sensitive writes use trusted server/RPC paths
- service role is recognized as RLS-bypassing
- privileged workers still require explicit tenant scope
- AI cannot query or authorize directly
- cross-org security tests are mandatory
- unresolved membership fails closed
