# StoreAgent Domain Invariants

## Purpose

These rules define conditions that must remain true across StoreAgent's canonical domain.

They will later be enforced through a combination of:

- database constraints
- foreign keys
- RLS
- application validation
- deterministic domain functions
- provider normalization
- tests

M0 defines the rules before implementation.

---

## 1. Organization boundary

Every tenant-owned record belongs to exactly one organization.

A child record may never reference a parent from another organization.

Examples:

- a ProductVariant must belong to a Product in the same organization
- an OrderItem must reference an Order and ProductVariant in the same organization
- an InventoryAction must reference a Variant owned by the same organization
- a ProviderBinding may not connect an external provider record to another organization's canonical entity

No unscoped tenant-domain query is acceptable.

---

## 2. Store boundary

Store-scoped records must remain internally consistent.

A record with:

- organizationId
- storeId

must reference a Store owned by the same organization.

Examples:

- Product.storeId
- ProductVariant.storeId
- Order.storeId
- InventorySnapshot.storeId
- ForecastRun.storeId
- InventoryAction.storeId

Where both parent and child contain storeId, they must agree.

---

## 3. Product / variant relationship

A ProductVariant:

- belongs to exactly one Product
- belongs to the same Organization as its Product
- belongs to the same Store as its Product
- is the canonical unit for inventory and forecasting

Product-level inventory quantities are not authoritative.

---

## 4. SKU identity

Within a StoreAgent store, an active canonical SKU must resolve deterministically.

Duplicate source data must not silently create multiple active canonical variants for the same intended SKU.

Potential duplicate SKUs must be:

- rejected
- quarantined
- or explicitly resolved

before trusted recommendations are produced.

---

## 5. Location consistency

An InventorySnapshot with a location:

- belongs to a Store
- references a Location from the same Store
- references a Variant from the same Store

Cross-store inventory relationships are invalid.

---

## 6. Inventory snapshots

InventorySnapshot is immutable historical evidence.

After creation:

- observed quantities are not rewritten
- observedAt is not rewritten
- variant/location ownership is not rewritten

Corrections produce a new snapshot or explicit reconciliation artifact.

Unknown quantities remain null.

Zero means a real observed zero.

---

## 7. Quantity rules

Unless explicitly modeled otherwise:

- inventory quantities must be integers
- MOQ must be a positive integer when present
- pack size must be a positive integer when present
- lead time must be >= 0 when present
- ordered quantity must be > 0
- received quantity must be >= 0
- returned quantity must be >= 0

A calculated recommended reorder quantity may never be negative.

If calculated need <= 0, StoreAgent must not emit a positive REORDER quantity.

---

## 8. Money rules

Persisted authoritative monetary values use exact decimal representation.

A monetary amount must not be interpreted without its currency context.

Unknown cost is not zero cost.

Unknown selling price is not zero selling price.

Unknown monetary impact must remain unknown.

StoreAgent must not invent currency conversions.

---

## 9. Orders

An OrderItem:

- belongs to exactly one Order
- references a Variant from the same organization/store
- has a positive sold quantity for normal sale lines

Cancelled sales must not contribute to net demand.

Returns/refunds must be represented explicitly rather than silently rewriting historical order lines.

---

## 10. Returns and refunds

ReturnRefund exists separately from OrderItem history.

A return/refund must never cause historical original sales records to be destroyed.

Demand calculations must define explicitly whether they use:

- gross units
- returned units
- net retained demand

The chosen calculation must be versioned/documented.

---

## 11. Suppliers

SupplierProduct must reference:

- a Supplier from the same organization
- a ProductVariant from the same organization

Supplier terms may override organization/store defaults.

Unknown supplier lead time remains null.

If MOQ or pack size is missing, StoreAgent may calculate unconstrained need but must not fabricate supplier constraints.

---

## 12. Purchase orders / incoming stock

PurchaseOrderItem:

- belongs to a PurchaseOrder
- references a Variant in the same organization/store
- may reference a destination Location in the same store

Incoming inventory must only reduce reorder need when the incoming quantity is considered valid under deterministic rules.

Cancelled purchase orders contribute zero valid incoming quantity.

Received quantity may not exceed ordered quantity unless an explicit reconciliation/over-receipt rule exists.

---

## 13. Metrics

SkuDailyMetric is derived data.

It must be reproducible from:

- canonical source data
- merchant settings
- algorithm version

A metric record may not become authoritative source truth.

Changing an algorithm must produce a new version or recalculated artifact with explicit version metadata.

---

## 14. Forecast runs

ForecastRun is versioned and history-safe.

A completed ForecastRun must retain:

- algorithm name
- algorithm version
- input window
- horizon
- parameters
- generated/completed timestamps

Historical forecast outputs are not silently rewritten when the algorithm changes.

---

## 15. SKU forecasts

SkuForecast:

- references one ForecastRun
- references one Variant
- remains associated with that run/version
- must not contain AI-invented numerical values

If data sufficiency is insufficient, StoreAgent must lower confidence or withhold stronger recommendations.

---

## 16. Inventory actions

InventoryAction represents one versioned recommendation.

Its original:

- action type
- recommended quantity
- evidence snapshot
- confidence
- algorithm version

must not be rewritten after merchant interaction.

Merchant decisions belong in ActionEvent.

---

## 17. Action lifecycle

Allowed V1 lifecycle:

NEW
-> ACCEPTED
-> COMPLETED

NEW
-> ACCEPTED_WITH_EDIT
-> COMPLETED

NEW
-> DISMISSED

NEW
-> EXPIRED

NEW
-> SUPERSEDED

A superseding action points to historical context without mutating the superseded action's evidence.

---

## 18. Merchant edits

If a merchant changes StoreAgent's recommended quantity:

- original recommendedQuantity remains unchanged
- edited quantity is recorded in ActionEvent
- outcome analysis can compare StoreAgent recommendation vs merchant decision

This distinction is mandatory for future learning.

---

## 19. Evidence snapshot

Every actionable recommendation must contain the deterministic evidence that justified it.

Evidence must be sufficient to explain:

- what StoreAgent observed
- why it generated the action
- which algorithm version was responsible

AI explanation is downstream of this evidence.

---

## 20. Confidence

Confidence must be produced from deterministic/data-quality rules.

AI may explain confidence.

AI may not upgrade or downgrade deterministic confidence.

---

## 21. Data quality

Known data-quality problems must not disappear silently.

Affected records may be:

- quarantined
- excluded
- marked low confidence
- converted to WATCH
- blocked from recommendation generation

The behavior must be explicit.

---

## 22. Provider bindings

ProviderBinding must uniquely identify a provider resource within the appropriate integration/resource scope.

Provider IDs are not canonical identity.

Deleting/disconnecting an integration must not destroy canonical historical sales, inventory evidence, forecasts, or actions.

---

## 23. Sync idempotency

Replaying the same successful import/sync operation must not duplicate canonical commercial records.

SyncRun.idempotencyKey participates in retry safety.

Provider synchronization must distinguish:

- create
- update
- skip
- quarantine
- failure

---

## 24. Historical deletion policy

Historical operational evidence is preserved unless legal/privacy deletion requirements require removal.

Provider deletion does not imply destroying:

- historical orders
- historical inventory snapshots
- historical forecasts
- historical recommendations
- merchant action history

Provider state may be archived/disconnected instead.

---

## 25. AI boundary

AI is allowed to:

- explain
- summarize
- prioritize within deterministic constraints
- communicate recommendations

AI is not allowed to originate or modify:

- stock levels
- prices
- costs
- lead times
- demand values
- forecast quantities
- reorder quantities
- stockout dates
- confidence values
- commercial monetary values

---

## M0.2 invariant gate

Before M0.2 closes:

- canonical types compile
- ownership relationships are documented
- null vs zero semantics are explicit
- money semantics are explicit
- immutable/history semantics are explicit
- provider identity is separate from canonical identity
- action evidence is immutable
- merchant edits are append-only
- AI numeric-truth boundary is explicit
