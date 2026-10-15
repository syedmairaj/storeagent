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

M5 owns deterministic derived metrics only. M6 owns forecasting, including stockout censoring and lost-sales estimation. M7 owns inventory actions and decision confidence.

The initial M5 grain is organization, store, location, variant, metric date, and algorithm version. Location is required. A null location is not a valid initial M5 row. The same algorithm version is a recomputable cache. A different algorithm version is a different row.

Cancelled orders are excluded from sold units. M5 passes `cancelledUnits = 0` into the velocity formula and does not subtract cancelled quantity again. Physical `returned_quantity` reduces units only when the return has a usable location attribution. Financial refund status alone does not reduce demand. Eligible-day count and coverage are deterministic metric metadata, not a confidence score. Observed `salesVelocity30d` is the planning daily demand for safety stock, reorder point, and target stock. Null 30-day velocity makes safety stock, reorder point, target stock, and days of stock null. Known zero 30-day velocity stays 0 and makes days of stock null with `ZERO_DEMAND`. One untrustworthy incoming purchase-order line makes aggregate incoming quantity null. M5 does not sum only the trusted lines. M5 does not persist revenue.

The M5.1 formula contract is in `INVENTORY_FORMULAS.md`. M5.1 is closed. M5.2 persists that cache as `public.sku_daily_metrics`. Schema and RLS closure are in `IMPLEMENTATION_STATUS.md`. Approved M5.3 sales-aggregate clarifications are the “M5.3 frozen sales-aggregate clarifications” section of `INVENTORY_FORMULAS.md`.

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

M4 owns durable `DataQualityIssue` records only.

M5 owns derived SKU metrics.

M6 owns forecasting.

M7 owns inventory decisions.

M4 does not own AI, merchant UI, billing, Shopify synchronization, or supplier sourcing.

The entity vocabularies live in `DOMAIN_MODEL.md`. Mutation authority lives in `SERVICE_ROLE_BOUNDARY.md`. Negative-inventory value semantics live in `VALUE_SEMANTICS.md`.

Identity:

- `issue_key` is deterministic
- organization id is outside the `issue_key` tuple
- one OPEN row exists per `(organization_id, issue_key)`
- message, remediation hint, source context, and timestamps are not identity
- provider `externalParentId` is source-context evidence only

Persistence through `persist_data_quality_issue`:

- service-role execution only
- trusted organization, store, location, and variant ownership is checked
- `source_context` cannot establish tenancy
- the same OPEN issue reconciles atomically
- `detected_at` stays immutable
- `last_detected_at` never moves backward
- `occurrence_count` increments by one
- severity never downgrades
- a later detection after RESOLVED creates a new OPEN row
- IGNORED history fails closed with SA003
- SUPERSEDED history fails closed with SA004

Lifecycle through `transition_data_quality_issue`:

- only OPEN may resolve, ignore, or supersede
- RESOLVED, IGNORED, and SUPERSEDED are terminal
- the issue must belong to the trusted organization, or the call fails with SA006
- any other lifecycle transition fails with SA005
- `occurredAt` earlier than `detected_at` fails with SA007
- `occurredAt` equal to `detected_at` is allowed
- commercial timestamps are explicit arguments
- the row update assigns only `status` and `resolved_at`

SA001 and SA002 remain CSV reconciliation codes. They are not lifecycle codes.

Durable qualification codes are:

- BINDING_CONFLICT
- IDENTITY_AMBIGUOUS
- RELATIONSHIP_UNRESOLVED
- AMBIGUOUS_INVENTORY_SEMANTICS
- NEGATIVE_INVENTORY

Ordinary transient quarantine stays non-durable. That includes DUPLICATE_CONFLICT, HISTORY_CONFLICT, and PROVIDER_INCONSISTENCY unless a durable code above is present.

Security:

- authenticated members have one SELECT policy
- anon cannot read `data_quality_issues`
- browser mutation is forbidden

Adversarial proof is `tests/unit/data-quality-adversarial.live.test.ts`. The coverage summary is in `IMPLEMENTATION_STATUS.md`.

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
