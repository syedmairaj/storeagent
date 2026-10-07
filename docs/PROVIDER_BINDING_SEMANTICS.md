# StoreAgent Provider Binding Semantics

## Purpose

Provider bindings isolate external commerce-provider identity from StoreAgent canonical identity.

StoreAgent canonical entities must remain stable even if:

- provider IDs change
- a provider is disconnected
- a merchant reconnects
- data is imported through CSV instead of API
- future providers are added

---

## 1. Canonical identity

StoreAgent owns canonical IDs.

Examples:

- product.id
- productVariant.id
- location.id
- order.id

These IDs must not be copied from Shopify, CSV rows, WooCommerce, POS systems, or other providers.

External IDs belong only to provider bindings or source metadata.

---

## 2. Provider binding purpose

ProviderBinding maps:

provider
+ integration
+ resource type
+ external resource ID

to:

canonical StoreAgent entity ID

Example:

Shopify integration
+ product_variant
+ gid://shopify/ProductVariant/123

->

StoreAgent variant UUID

---

## 3. Binding uniqueness

A provider resource must resolve deterministically within an integration.

The logical uniqueness boundary is:

integrationId
+ resourceType
+ externalId

That combination must not map to two canonical entities.

Duplicate bindings are invalid.

---

## 4. Integration scope

Provider IDs are only meaningful inside the correct integration/provider account.

Example:

Shopify variant ID 123 from Store A

is not assumed to be the same resource as:

Shopify variant ID 123 from Store B.

Bindings therefore must include integration scope.

---

## 5. Canonical entity type consistency

A binding's resourceType determines what kind of canonical entity it may reference.

Examples:

product -> Product
product_variant -> ProductVariant
location -> Location
order -> Order

A `product_variant` provider binding must not point at a Product or Order.

This rule will later be enforced by application validation and tests.

---

## 6. Provider independence

Canonical domain entities must not require:

- Shopify GIDs
- WooCommerce IDs
- CSV row numbers
- POS-specific schemas
- provider SDK types

Provider-specific data is translated before entering the canonical domain.

---

## 7. CSV identity

CSV has no universal provider ID.

For CSV imports, StoreAgent must derive deterministic source identity from import-profile semantics.

Examples may include:

- SKU
- order reference + line identity
- supplier code
- merchant-mapped external key

The chosen source identity must be stable across repeat uploads.

Row number alone must never be used as stable commercial identity.

---

## 8. Idempotent ingestion

Repeated ingestion of the same provider resource must:

- resolve the existing binding
- update canonical current-state records where appropriate
- append immutable historical observations where appropriate
- not create duplicates

Example:

Importing the same Shopify order twice must not create two canonical Orders.

---

## 9. Current state vs history

Provider synchronization may update current canonical entities such as:

- product title
- product status
- barcode
- supplier terms

Historical observations must not be overwritten.

Examples:

- inventory snapshots are appended
- completed orders remain historical
- forecast runs remain historical
- inventory actions remain historical

---

## 10. Provider deletion

A provider saying a resource was deleted or archived does not automatically mean StoreAgent destroys history.

StoreAgent may:

- archive the canonical current-state entity
- mark the binding inactive later
- retain historical orders
- retain inventory snapshots
- retain forecasts
- retain actions

Historical evidence survives provider lifecycle changes unless privacy/legal deletion requires removal.

---

## 11. Disconnect

Disconnecting an integration:

- disables future sync
- invalidates/revokes credentials
- does not destroy canonical historical data
- does not change historical recommendation evidence

A reconnect may reuse existing bindings where identity can be proven safely.

---

## 12. Reconciliation

Provider webhooks are not sufficient as the sole source of synchronization truth.

StoreAgent must support periodic reconciliation.

Reconciliation checks for:

- missed records
- changed records
- archived/deleted records
- cursor drift
- provider inconsistencies

Bindings make reconciliation deterministic.

---

## 13. Source metadata

ProviderBinding.sourceMetadata may hold non-authoritative provider details useful for:

- debugging
- reconciliation
- provenance

It must not become a hidden replacement for canonical fields.

Canonical business logic must read canonical entities, not arbitrary provider JSON.

---

## 14. Credentials

ProviderBinding never stores credentials.

Integration configuration may contain non-secret metadata only.

Tokens, secrets, API keys, and credential material belong in secure credential storage.

---

## 15. Failure behavior

If StoreAgent cannot safely determine whether an external resource maps to:

- an existing canonical entity
- or a new canonical entity

it must fail closed.

Allowed behavior:

- quarantine
- flag data-quality issue
- request merchant resolution
- defer import

Disallowed behavior:

- guessing identity
- merging unrelated resources
- silently creating ambiguous duplicates

---

## 16. Provider adapter contract

Each provider adapter is responsible for:

1. reading provider/source data
2. validating source payloads
3. determining provider resource identity
4. normalizing into canonical input shape
5. resolving/creating ProviderBinding
6. writing canonical records safely
7. recording SyncRun counts/errors
8. quarantining unresolved source records

Provider adapters do not own StoreAgent business rules.

---

## 17. Provider parity principle

Equivalent commerce data from CSV and Shopify should produce equivalent canonical StoreAgent semantics.

Provider choice must not change:

- meaning of quantity
- meaning of order
- meaning of return
- meaning of supplier lead time
- forecasting formulas
- decision rules

Only source/provenance differs.

---

## M0.2.5 gate

Before provider semantics are considered frozen:

- canonical IDs are separate from provider IDs
- binding uniqueness is defined
- integration scope is explicit
- CSV stable identity rules are explicit
- retry/idempotency behavior is explicit
- disconnect behavior is explicit
- reconciliation behavior is explicit
- provider JSON cannot become business truth
