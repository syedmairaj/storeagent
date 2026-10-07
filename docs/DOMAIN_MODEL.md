# StoreAgent Canonical Domain Model

## Purpose

StoreAgent owns a provider-independent commerce and inventory domain.

CSV, Shopify, and future commerce/POS providers normalize into this model.

Provider-specific schemas must not define the meaning of StoreAgent's canonical entities.

## Tenancy boundary

### Organization

Top-level tenant/account boundary.

Owns all merchant data.

Key responsibilities:

- organization membership
- default currency
- country
- timezone
- billing entitlement
- stores
- organization-wide defaults

### OrganizationMember

Associates a user with an organization.

Initial role vocabulary:

- owner
- admin
- analyst
- operator

Authorization semantics will be frozen separately in M0.3.

## Commerce structure

### Store

Logical selling operation inside an organization.

One organization may own one or more stores.

A store is not synonymous with a provider connection.

Example:

A merchant can have one logical StoreAgent store backed by Shopify today and another provider in the future.

### Location

Physical or logical inventory location.

Examples:

- warehouse
- retail branch
- fulfillment location

Multi-location support exists in the canonical model from day one.

Transfer optimization is not part of V1.

### Product

Product family/container.

Examples:

- "Classic T-Shirt"
- "Vitamin C Serum"

Contains descriptive merchandising fields such as:

- title
- brand
- category
- status

Inventory is not held at Product level.

### ProductVariant

Canonical SKU/inventory unit.

Examples:

- T-Shirt / Black / Medium
- Serum / 30ml

This is the primary unit used for:

- inventory
- sales
- forecasting
- supplier terms
- inventory decisions

Possible attributes:

- SKU
- barcode
- cost
- selling price
- currency
- status

## Provider mapping

### ProviderBinding

Maps an external provider resource to a canonical StoreAgent resource.

Purpose:

- provider independence
- idempotent synchronization
- reconciliation
- audit/debugging

Examples:

- Shopify product ID -> StoreAgent product ID
- Shopify variant ID -> StoreAgent product_variant ID
- Shopify location ID -> StoreAgent location ID

Provider IDs must not become canonical primary keys.

## Inventory

### InventorySnapshot

Immutable inventory observation.

Represents inventory state for a product variant at a location at a point in time.

Possible quantities:

- on hand
- available
- committed
- incoming

Snapshots are historical evidence.

Old snapshots must not be overwritten.

## Sales

### Order

Canonical sales transaction header.

Possible attributes:

- provider/source
- external reference
- ordered_at
- status
- currency
- totals

### OrderItem

Canonical sales line.

References:

- order
- product variant
- quantity
- unit price
- discounts
- unit cost when known

OrderItem is a key demand signal for StoreAgent forecasting.

### ReturnRefund

Canonical returned/refunded quantity or monetary adjustment.

Returns/refunds must be modeled explicitly so demand is not systematically overstated.

Possible attributes:

- order item
- returned quantity
- refunded amount
- reason
- occurred_at

## Suppliers and inbound stock

### Supplier

Canonical supplier entity.

Possible attributes:

- name
- default lead time
- currency
- contact metadata

### SupplierProduct

Relationship between supplier and product variant.

May define:

- supplier SKU
- unit cost
- lead-time override
- MOQ
- pack size
- preferred supplier status

### PurchaseOrder

Inbound purchase intent/history.

V1 supports imported/read purchase orders and incoming stock awareness.

V1 does not automatically create or submit purchase orders.

### PurchaseOrderItem

Inbound units for a product variant.

Important for preventing StoreAgent from recommending inventory already on order.

## Derived intelligence

### SkuDailyMetric

Derived daily inventory and demand features.

Examples:

- sales velocity
- net units sold
- inventory position
- returns
- sell-through
- inventory age
- demand trend

Derived values must be reproducible from authoritative data and algorithm version.

### ForecastRun

Versioned forecast execution.

Stores information such as:

- algorithm name/version
- parameters
- input window
- generated_at
- evaluation metadata

### SkuForecast

Forecast result for a product variant.

May include:

- forecast horizon
- expected demand
- confidence interval/band
- data sufficiency
- forecast quality metadata

AI must never originate these numeric fields.

## Inventory decisions

### InventoryAction

Canonical StoreAgent recommendation.

V1 action vocabulary:

- REORDER
- REDUCE
- PROMOTE
- WATCH

HEALTHY may be represented as a calculated state where no merchant intervention is required.

InventoryAction may contain:

- organization
- store
- variant
- location
- action type
- priority
- status
- recommended quantity
- recommended action date
- confidence
- confidence reason codes
- days of stock
- lead time
- demand velocity
- estimated stockout date
- inventory age
- estimated cash at risk
- revenue at risk
- evidence snapshot
- forecast run
- algorithm version
- created_at
- expires_at
- superseded_by

The recommendation's original evidence must be immutable.

### ActionEvent

Append-only merchant/action lifecycle history.

Examples:

- accepted
- accepted with edit
- dismissed
- completed
- expired
- superseded

Merchant edits must be captured explicitly instead of modifying original recommendation evidence.

## Data trust

### DataQualityIssue

Canonical data trust problem.

Examples:

- missing cost
- unknown lead time
- negative inventory
- duplicate SKU
- insufficient sales history
- suspicious outlier
- unresolved provider record

Data-quality issues must be visible to the merchant when they materially reduce recommendation quality.

## Integrations and synchronization

### Integration

Provider connection metadata.

Examples:

- Shopify
- CSV import profile
- future WooCommerce/POS provider

Credentials are not part of ordinary canonical domain payloads.

### SyncRun

Synchronization/import execution ledger.

Stores:

- provider/integration
- idempotency key
- cursor
- status
- started_at
- finished_at
- counts
- errors
- reconciliation metadata

Synchronization must be safe to retry.

## Notifications

### NotificationPreference

Merchant notification configuration.

Examples:

- weekly brief
- action alerts
- stockout alerts
- digest cadence

## Billing

### BillingEntitlement

Server-side authority for plan capability and limits.

Possible limits:

- stores
- SKUs
- locations
- analysis frequency
- feature access

Billing is based on operational scope, not AI token consumption.

## Ownership rules

Every tenant-owned domain record must resolve to exactly one organization.

Direct organization ownership or safe derivation through a parent relationship must be unambiguous.

No unscoped tenant-domain query is acceptable.

## Domain dependency flow

Provider data
-> canonical domain
-> data quality
-> metrics
-> forecasting
-> decision engine
-> inventory actions
-> AI explanation
-> merchant decision
-> outcome measurement

## Frozen M0.2 principles

1. Provider IDs are external identifiers, never canonical identity.
2. ProductVariant is the canonical inventory/SKU unit.
3. Location exists in the domain from day one.
4. Returns/refunds are explicit.
5. Incoming purchase orders are explicit.
6. Inventory history is snapshot-based and immutable.
7. Forecasts are versioned artifacts.
8. Recommendations store immutable evidence.
9. Merchant decisions are append-only action events.
10. Unknown commercial data must remain unknown rather than silently becoming zero.
11. Every tenant-owned record belongs to an organization boundary.
12. AI does not own canonical numeric truth.
