# StoreAgent M2 canonical persistence contract

Status: M2.1 contract freeze

## Purpose

M2 converts the frozen StoreAgent canonical commerce domain into durable,
provider-independent PostgreSQL persistence.

M2 does not redesign M0 domain ownership.

The database must preserve canonical business truth without allowing provider
identifiers, AI output, derived metrics, forecasting logic or UI concerns to
become persistence authority.

## M2 rules

- Organization remains the primary tenant boundary.
- Canonical entity identity is independent of provider identity.
- Provider identifiers never establish tenant ownership.
- Unknown commercial values remain NULL, never silently zero.
- Persisted monetary values use exact decimal/numeric semantics.
- V1 inventory quantities are whole units.
- Cross-organization relationships must be impossible at the database layer.
- Cross-store relationships must be impossible where store ownership applies.
- Immutable/history records are append-oriented.
- Derived metrics do not own source-of-truth commerce persistence.
- Forecasting does not own source-of-truth commerce persistence.
- Decision logic does not own source-of-truth commerce persistence.
- AI does not own numerical or commercial truth.
- CSV and Shopify are ingestion/provider concerns, not canonical schema owners.

## M2 persistence scope

### M2.2 — Products and variants

Tables:

- `products`
- `product_variants`

Canonical owners:

- `Product`
- `ProductVariant`

Required ownership:

- product belongs to one organization
- product belongs to one store
- variant belongs to one organization
- variant belongs to one store
- variant belongs to one product
- variant organization must equal product organization
- variant store must equal product store

Important value semantics:

- product title is required
- product brand is nullable
- product category is nullable
- product status is constrained
- variant SKU is required and non-blank
- barcode is nullable
- variant title is nullable
- cost is nullable
- selling price is nullable
- currency is nullable
- NULL commercial value must not become zero

SKU policy:

M2 must not impose global organization-level SKU uniqueness unless a later
explicit product decision requires it.

Messy or duplicate provider/CSV SKUs must be ingestible and diagnosable rather
than automatically becoming tenant identity.

### M2.3 — Inventory history

Table:

- `inventory_snapshots`

Canonical owner:

- `InventorySnapshot`

Required ownership:

- organization
- store
- location
- product variant

Required history semantics:

- snapshots are immutable history
- a newer observation creates another row
- historical observations are not overwritten by later inventory truth

Quantity semantics:

- `on_hand_quantity` nullable
- `available_quantity` nullable
- `committed_quantity` nullable
- `incoming_quantity` nullable
- known quantities must be whole units
- known quantities must be non-negative
- NULL means unknown
- zero means known zero

Source semantics:

- source records the provider class that produced the observation
- source does not establish tenant ownership

### M2.4 — Orders and demand evidence

Tables:

- `orders`
- `order_items`
- `return_refunds`

Canonical owners:

- `Order`
- `OrderItem`
- `ReturnRefund`

Required ownership:

- every row belongs to an organization
- every order belongs to a store
- every order item belongs to the same organization/store as its order
- every referenced variant must belong to the same organization/store
- optional location must belong to the same organization/store
- returns/refunds must not cross organization or store ownership

History semantics:

Orders, order items and return/refund evidence are historical commerce truth.

Provider resynchronization must reconcile records deterministically rather than
silently reassigning them to another tenant.

Commercial semantics:

- external reference may be NULL
- monetary values may be NULL where the source does not provide them
- NULL monetary value does not mean zero
- currency remains explicit
- returned quantity may be NULL
- refunded amount may be NULL

### M2.5 — Suppliers and purchase orders

Tables:

- `suppliers`
- `supplier_products`
- `purchase_orders`
- `purchase_order_items`

Canonical owners:

- `Supplier`
- `SupplierProduct`
- `PurchaseOrder`
- `PurchaseOrderItem`

Required ownership:

- supplier belongs to an organization
- supplier-product links remain inside one organization
- supplier-product variant belongs to the same organization
- purchase order belongs to an organization/store
- purchase-order item belongs to the same organization/store as the order
- purchase-order variant belongs to the same organization/store
- destination location, when present, belongs to the same organization/store

Supplier constraint semantics:

- lead time may be NULL
- known lead time must be >= 0
- minimum order quantity may be NULL
- known minimum order quantity must be > 0
- pack size may be NULL
- known pack size must be > 0
- supplier SKU may be NULL
- unit cost may be NULL
- supplier currency may be NULL

Purchase-order semantics:

- supplier may be NULL when source truth is incomplete
- ordered time may be NULL
- expected time may be NULL
- received time may be NULL
- received quantity may be NULL
- source is provider metadata only
- source never establishes authorization

### M2.6 — Integration identity and provider bindings

Tables:

- `integrations`
- `provider_bindings`
- `sync_runs`

Canonical owners:

- `Integration`
- `ProviderBinding`
- `SyncRun`

Provider binding identity key:

- `organization_id`
- `integration_id`
- `provider`
- `resource_type`
- `external_id`

Provider binding rules:

- canonical entity id and external id are separate concepts
- external id is case-preserving
- external id must be non-blank
- provider identifiers never establish tenant ownership
- provider identifiers never replace canonical UUID identity
- integration must already be trusted to the same organization
- a binding cannot point across organizations

Integration credential rule:

`Integration.configuration` stores non-secret configuration only.

Credentials, access tokens and refresh tokens are outside canonical commerce
tables and belong in secure credential storage.

Sync-run semantics:

- sync run is operational history
- idempotency key is explicit
- cursor before/after remains nullable
- reconciliation metadata remains separate from canonical entity identity
- failed provider rows must never weaken tenant isolation

## RLS classification

### Tenant current state

Expected current-state tables:

- products
- product_variants
- suppliers
- supplier_products
- purchase_orders
- purchase_order_items
- integrations
- provider_bindings

### Tenant immutable/history

Expected history tables:

- inventory_snapshots
- orders
- order_items
- return_refunds
- sync_runs

RLS policy capabilities must follow the frozen StoreAgent RLS profile contract.
Convenience must not create broader browser mutation authority.

## Relational ownership strategy

Where a child entity carries both `organization_id` and another canonical
parent id, PostgreSQL should enforce tenant ownership structurally.

Examples:

- product variant -> product
- inventory snapshot -> store/location/variant
- order item -> order/variant/location
- return/refund -> order/order item/variant/location
- supplier product -> supplier/variant
- purchase-order item -> purchase order/variant/location
- provider binding -> integration

Composite ownership foreign keys are preferred where they make cross-tenant or
cross-store relationships impossible without relying only on application code.

## History policy

Historical evidence must not be destructively converted into current state.

Examples:

- inventory observation at 10:00 remains stored
- inventory observation at 11:00 creates a later observation
- a refund remains separately observable from the original sale
- provider synchronization does not rewrite historical evidence into a new
  tenant or store
- later derived calculations consume history; they do not become history owner

## Explicitly deferred from M2 persistence

These canonical types exist because M0 froze the architecture, but persistence
for them belongs to later milestones:

- `DataQualityIssue` -> M4
- `SkuDailyMetric` -> M5
- `ForecastRun` -> M6
- `SkuForecast` -> M6
- `InventoryAction` -> M7
- `ActionEvent` -> M7 / outcome-history milestone

M2 must not implement:

- inventory calculations
- derived SKU metrics
- forecasting
- forecast execution
- decision generation
- recommendation generation
- AI explanation
- CSV parsing
- Shopify synchronization
- billing
- notification delivery

## M2 sub-milestones

- M2.1 Canonical persistence contract + table matrix
- M2.2 Products + variants
- M2.3 Inventory snapshots
- M2.4 Orders + order items + returns/refunds
- M2.5 Suppliers + supplier products + purchase orders
- M2.6 Provider-neutral integration identity + bindings
- M2.7 RLS + relational/adversarial verification
- M2.8 M2 gate

## M2.1 exit criteria

M2.1 is complete when:

- canonical persisted entity scope is explicit
- deferred derived entity scope is explicit
- null-versus-zero semantics are explicit
- exact monetary persistence ownership is explicit
- organization/store ownership rules are explicit
- provider binding identity is explicit
- provider identifiers are explicitly non-authoritative for tenancy
- immutable/history expectations are explicit
- RLS table classes are explicit
- no M2 SQL migration has been introduced yet
- no product UI has been introduced
- no provider synchronization has been introduced
