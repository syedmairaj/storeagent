# StoreAgent Provider Adapter Architecture

## Purpose

Provider adapters form the anti-corruption boundary between external commerce data and the canonical StoreAgent domain.

External providers may differ in:

- identifiers
- field names
- payload shapes
- status vocabulary
- timestamps
- timezone behavior
- currency representation
- inventory semantics
- order semantics
- purchase-order semantics
- nullability
- pagination
- webhook behavior

Those differences must not leak into:

- metrics
- forecasting
- decision engine
- AI explanation logic

Pipeline:

provider transport / CSV reader
-> raw provider payload
-> provider adapter
-> normalized canonical candidate
-> binding / persistence / reconciliation
-> canonical StoreAgent domain
-> metrics
-> forecasting
-> decision engine

## Canonical provider vocabulary

StoreAgent already owns canonical provider and resource vocabulary through:

- ProviderType
- ProviderResourceType
- OrderStatus
- PurchaseOrderStatus
- ProviderBinding
- Integration
- SyncRun

Adapters must map provider-specific semantics into those canonical concepts.

Adapters must not redefine competing canonical enums.

## Provider bindings

ProviderBinding is the durable identity bridge between:

external provider identity
and
canonical StoreAgent identity.

The adapter may emit:

- provider
- resource type
- external ID
- external parent ID
- normalized source metadata

The adapter does not assign canonical entity IDs by itself.

Binding and persistence infrastructure resolves or creates canonical entities.

External IDs must never be treated as StoreAgent UUIDs.

## Transport and normalization separation

Provider transport code is responsible for obtaining source data.

Examples:

- Shopify API client
- CSV parser
- webhook receiver
- future WooCommerce client

Provider adapter code is responsible for normalization.

A provider adapter must not:

- call external APIs
- perform OAuth
- refresh tokens
- write directly to the database
- calculate metrics
- calculate forecasts
- calculate inventory actions

This separation makes normalization deterministic and independently testable.

## Raw payload boundary

Raw provider payloads are untrusted input.

Shared adapter contracts treat provider payloads as `unknown` until validated by a provider/resource-specific normalizer.

Raw provider payloads must not flow directly into canonical persistence.

## Resource-specific normalization

Normalization is resource-specific.

Examples:

- Shopify product normalization
- Shopify variant normalization
- Shopify order normalization
- CSV inventory normalization
- CSV order normalization

A normalizer is bound to:

- one provider
- one canonical resource type
- one explicit adapter version

It returns either:

- accepted canonical candidate
- quarantined record
- intentionally skipped record

## Accepted records

An accepted result contains a validated canonical candidate suitable for later binding/persistence.

Acceptance means provider-specific ambiguity has been resolved sufficiently for the canonical resource contract.

Acceptance does not itself persist anything.

## Quarantine

A record is quarantined when StoreAgent cannot safely normalize it.

Examples:

- missing required external identity
- invalid timestamp
- invalid quantity
- unsupported currency representation
- ambiguous inventory semantics
- unsupported provider status
- malformed required relationship

Quarantine is fail-closed.

The adapter must not fabricate canonical values merely to avoid quarantine.

## Skip

A record may be intentionally skipped when it is valid source data but is outside the supported ingestion scope.

Skip is not an error.

Skip must carry an explicit machine-readable reason.

## Known zero versus unknown

Adapters must preserve StoreAgent value semantics.

Known zero is valid.

Unknown remains null or otherwise explicitly unknown according to the canonical type.

Provider absence must never silently become numeric zero unless the provider contract proves that absence means zero.

## Provider statuses

Provider-specific status strings must never escape the adapter boundary.

Adapters map external statuses into canonical StoreAgent status types.

Unknown or unsupported status behavior must be explicit.

Mapping rules will be frozen in later M0.7 sub-milestones.

## Time

Provider timestamps must be normalized before canonical persistence.

Adapters must preserve the distinction between:

- source event time
- observation time
- ingestion time

Timezone assumptions must never be implicit.

Detailed timestamp rules will be frozen separately.

## Money

Provider money values must be normalized into StoreAgent canonical decimal-string and currency semantics.

Floating-point provider amounts must not become canonical monetary truth without deterministic normalization.

Detailed money rules will be frozen separately.

## Inventory

Provider inventory concepts must not be assumed equivalent.

Examples:

- on hand
- available
- committed
- incoming

Adapters must map only semantics the source actually supports.

Missing inventory dimensions remain unknown.

Detailed inventory normalization will be frozen separately.

## Idempotency

Normalization must be deterministic.

Equivalent provider input under the same adapter version must normalize to equivalent canonical output.

Persistence and synchronization layers own write idempotency using:

- provider identity
- resource type
- external identity
- provider bindings
- sync-run state

Adapters do not create duplicate canonical identity rules.

## Versioning

Every provider/resource normalizer has an explicit adapter version.

A normalization rule change capable of changing canonical output requires a version change.

Historical synchronization metadata may retain the adapter version used.

## Security boundary

Provider credentials and tokens do not belong in normalization payloads or canonical source metadata.

Integration.configuration contains only non-secret provider configuration.

Credentials belong in secure credential storage.

## Downstream isolation

Metrics, forecasting, and decision modules consume canonical StoreAgent data only.

They must never import:

- Shopify payload types
- CSV row schemas
- WooCommerce payload types
- provider API response types

Provider-specific quirks end at the adapter boundary.

## M0.7.1 non-goals

This step does not yet define:

- external-ID normalization
- timestamp normalization
- money normalization
- inventory normalization
- order-status mapping
- purchase-order-status mapping
- CSV column schemas
- Shopify API payload schemas
- persistence repositories
- sync workers

Those rules belong to later M0.7 sub-milestones.


## M0.7.2 frozen external identity normalization

External identity normalization is deterministic and provider-agnostic.

Rules:

- trim surrounding whitespace
- preserve case
- reject empty required external IDs
- blank optional parent IDs become null
- external IDs are never interpreted as StoreAgent UUIDs
- provider IDs remain strings even when they look like UUIDs or integers

Provider identity namespace is determined by:

- provider
- resource type
- external ID

External parent identity may be preserved separately when needed for relationship resolution.

Generic normalization does not lowercase, uppercase, parse, or otherwise rewrite provider IDs.

A provider-specific adapter may define additional rules only when the provider contract requires them.

Composite external IDs are permitted when the source lacks a single stable identifier.

Composite identities must:

- use explicit named parts
- preserve part value case
- reject blank names or values
- be deterministic

Generic composite format:

`name=value|name=value`

Changing composite identity construction rules requires an adapter-version change.

External identity normalization does not assign canonical StoreAgent entity IDs.

ProviderBinding remains the durable bridge from external identity to canonical identity.


## M0.7.3 frozen timestamp normalization

Provider timestamps are normalized deterministically before canonical persistence.

Canonical provider date-time values require explicit timezone information.

Accepted V1 examples:

- `2026-10-08T06:30:00Z`
- `2026-10-08T10:30:00+04:00`
- ISO-8601 date-times with fractional seconds and an explicit zone

Rejected V1 examples:

- timezone-less local date-times
- date-only values where a canonical date-time is required
- impossible calendar dates
- invalid clock values
- invalid timezone offsets

Accepted provider timestamps normalize to UTC ISO-8601 strings.

The original trimmed timestamp may be retained as normalization provenance.

Normalization must never depend on the server, worker, browser, or developer-machine timezone.

Optional timestamps may remain null.

Blank optional timestamps normalize to null rather than an invented instant.

Adapters must preserve distinct temporal meanings.

Examples include:

- source event time
- inventory observation time
- ingestion time
- synchronization start/end time

One timestamp must not be silently substituted for another merely because the provider omitted data.

If a provider supplies a local timestamp separately from an authoritative timezone, the provider-specific adapter may combine them deterministically.

That behavior must be explicit and versioned.

Generic timestamp normalization does not infer timezones.

Ambiguous timestamps fail closed rather than silently assuming UTC or local time.

Changing timestamp interpretation rules requires an adapter-version change when canonical output may change.


## M0.7.4 frozen money and currency normalization

Canonical provider money normalization is exact and deterministic.

### Amount representation

Generic money normalization accepts exact decimal strings.

Examples:

- `0012.3400` -> `12.34`
- `00012` -> `12`
- `0.00` -> `0`
- `-0.00` -> `0`
- `-0012.3400` -> `-12.34`

Generic normalization rejects:

- JavaScript numeric values
- scientific notation
- thousands separators
- embedded currency symbols
- empty strings
- malformed decimal text

The generic provider layer deliberately rejects JavaScript numbers because binary floating-point values must not become canonical monetary truth accidentally.

When a provider supplies an exact alternative representation such as integer minor units, the provider-specific adapter may deterministically convert that representation into an exact decimal string.

That conversion must be explicit, tested, and versioned.

The generic decimal normalizer permits negative values.

Whether a particular canonical field permits negative money is a resource-specific business rule and is not inferred by the generic normalizer.

### Decimal canonicalization

Canonical normalized decimal strings:

- have no leading redundant zeroes
- have no trailing fractional zeroes
- do not use exponent notation
- do not use grouping separators
- normalize negative zero to zero

Canonicalization must preserve the exact numeric value.

### Currency

Generic currency normalization:

- trims surrounding whitespace
- requires exactly three alphabetic characters
- normalizes the code to uppercase

Example:

` usd ` -> `USD`

Three-letter syntax validation does not by itself prove that a currency is supported by StoreAgent or by a provider.

Provider/resource-specific support policy may quarantine unsupported currencies with:

`UNSUPPORTED_CURRENCY`

Malformed currency syntax uses:

`INVALID_CURRENCY`

### Separation of amount and currency

Currency symbols embedded in amount text are rejected.

Amount and currency are normalized independently and then combined.

Adapters must not infer currency from:

- symbols
- browser locale
- worker locale
- server locale
- organization default currency

unless a provider-specific source contract explicitly guarantees that inference.

### Downstream rule

Canonical commerce-domain monetary values remain exact decimal-string data.

Metrics, forecasting, and decision logic must never depend on provider floating-point money representations.

Any change that can alter normalized monetary output requires an adapter-version change.


## M0.7.5 frozen quantity and inventory semantics

Canonical inventory quantities are whole, non-negative units.

Generic quantity normalization accepts:

- non-negative JavaScript safe integers
- digit-only strings representing non-negative whole units

Examples:

- `0` -> `0`
- `42` -> `42`
- `0042` -> `42`

Generic quantity normalization rejects:

- negative values
- fractional values
- scientific notation strings
- unsafe integers
- malformed quantity text

Known zero is valid and must remain zero.

Missing, null, undefined, or blank optional inventory quantities remain unknown and normalize to null.

### Inventory semantic separation

The canonical InventorySnapshot distinguishes:

- onHandQuantity
- availableQuantity
- committedQuantity
- incomingQuantity

These concepts are not interchangeable.

A generic adapter may populate a canonical field only when the provider contract explicitly guarantees that semantic.

The generic provider layer must not derive:

`available = onHand - committed`

or:

`onHand = available + committed`

or:

`incoming = open purchase-order quantity`

unless a provider-specific contract explicitly defines and guarantees that relationship.

Missing semantics remain null.

The presence of one inventory quantity never proves another inventory quantity.

Examples:

If a source provides:

- on hand = 100
- committed = 20

but does not explicitly provide available inventory, canonical output is:

- onHandQuantity = 100
- committedQuantity = 20
- availableQuantity = null

StoreAgent does not invent 80.

### Provider-specific semantics

Provider-specific adapters may translate provider concepts into canonical inventory fields only when documented and tested.

Examples may include Shopify inventory states or CSV columns that the merchant explicitly maps to a canonical semantic.

Such mappings belong to the provider-specific adapter version.

Provider-specific field names must not escape the adapter boundary.

### Incoming inventory

Incoming inventory is particularly sensitive.

A provider value may populate canonical incomingQuantity only when it represents trustworthy incoming inventory according to the frozen StoreAgent purchase-order/incoming policy.

Unknown purchase-order state or ambiguous provider semantics must not become incoming quantity.

### Downstream rule

Metrics, forecasting, and decision logic consume canonical inventory semantics only.

They must never reinterpret provider-specific inventory fields.

Any provider mapping change capable of changing canonical inventory meaning requires an adapter-version change.


## M0.7.6 frozen order-status normalization

StoreAgent canonical order statuses are:

- pending
- open
- completed
- cancelled
- refunded
- partially_refunded
- unknown

Generic normalization preserves canonical values.

The alternate spelling:

`canceled`

normalizes to:

`cancelled`

Blank, missing, unsupported, or unrecognized provider statuses normalize to:

`unknown`

Generic normalization must never guess that an unfamiliar provider status means:

- completed
- open
- refunded
- any other canonical status

Examples such as:

- fulfilled
- paid
- processing

remain `unknown` unless a provider-specific adapter explicitly maps them.

This rule protects demand truth.

An unsupported provider status must never silently become completed demand.

Provider-specific adapters may define explicit mappings from their external vocabulary into canonical StoreAgent status values.

Such mappings must be:

- deterministic
- documented
- tested
- versioned

Provider status strings must not escape the adapter boundary.

Any mapping change capable of changing canonical demand classification requires an adapter-version change.


## M0.7.7 frozen purchase-order-status normalization

StoreAgent canonical purchase-order statuses are:

- draft
- submitted
- confirmed
- partially_received
- received
- cancelled
- unknown

Generic normalization preserves canonical values.

The alternate spelling:

`canceled`

normalizes to:

`cancelled`

Blank, missing, unsupported, and unrecognized provider statuses normalize to:

`unknown`

Provider-specific statuses such as:

- approved
- in_transit
- closed
- processing

must not be guessed into canonical states by the generic layer.

A provider-specific adapter may map such values only when the provider contract gives an unambiguous semantic mapping.

### Separation from incoming-inventory truth

The provider layer normalizes purchase-order vocabulary only.

It must not decide how much inventory counts as trusted incoming stock.

That responsibility remains exclusively with the frozen M0.4 `incoming-stock-v1` metric policy.

The existing canonical incoming policy remains:

- draft -> known zero incoming
- submitted -> full ordered quantity counts
- confirmed -> full ordered quantity counts
- partially_received -> ordered quantity minus received quantity
- received -> known zero incoming
- cancelled -> known zero incoming
- unknown -> incoming state unknown

For partially received orders, unavailable received quantity fails closed.

Receipt quantities greater than ordered quantities fail closed.

If any aggregated PO line has an unknown incoming state, the aggregate incoming quantity also fails closed.

M0.7 must not duplicate or reinterpret these rules.

The correct dependency direction is:

provider status
-> canonical PurchaseOrderStatus
-> M0.4 incoming-stock policy
-> trusted incoming quantity

Metrics must not depend on provider-specific status vocabulary.

Provider adapters must not import the metrics layer to calculate incoming stock.

Any provider-specific purchase-order status mapping capable of changing canonical status output requires an adapter-version change.


## M0.7.8 frozen provider binding and idempotency contract

ProviderBinding is StoreAgent's durable bridge between external provider identity and canonical entity identity.

### Binding identity

The repository retains the earlier frozen provider-binding helpers:

- `providerBindingKey`
- `bindingMatchesIdentity`
- `hasAmbiguousBindings`

Those helpers remain supported for existing tenancy and ambiguity checks.

M0.7.8 adds the stronger durable persistence identity through `buildProviderBindingKey`.

V1 durable binding identity is:

- organization ID
- integration ID
- provider
- resource type
- normalized external ID

Together these identify one external resource inside one tenant and integration namespace.

The binding key is deterministic.

Provider external IDs remain strings.

A provider external ID must never be interpreted as the canonical StoreAgent entity ID even when it resembles a UUID.

### Tenant and integration isolation

Identical external IDs may legitimately exist in:

- different organizations
- different integrations
- different providers
- different resource types

Those bindings must remain distinct.

Cross-organization provider identity must never resolve a canonical entity.

### External parent identity

`externalParentId` is relationship provenance and is not hidden uniqueness in the generic binding key.

If a provider only guarantees resource identity inside a parent scope, the provider adapter must construct an explicit deterministic composite external ID before binding.

This keeps uniqueness visible and versioned.

### Idempotent replay

When no binding exists:

`create`

When the same binding identity already points to the same canonical entity:

`idempotent`

The replay must not create a second canonical entity.

This applies to:

- sync retries
- pagination retries
- webhook redelivery
- CSV re-import
- worker retry
- provider timeout recovery

### Binding conflicts

When the same binding identity already points to a different canonical entity:

`conflict`

StoreAgent must never silently rebind that external identity.

A conflict must enter reconciliation/quarantine handling.

Automatic last-write-wins rebinding is forbidden.

### Persistence responsibility

The provider helper classifies identity and replay semantics.

The persistence layer must enforce the same binding uniqueness transactionally.

Application-level checks alone are not sufficient against concurrent workers.

The database implementation must eventually enforce a uniqueness constraint equivalent to the frozen V1 binding identity.

### SyncRun idempotency

ProviderBinding identity and SyncRun.idempotencyKey solve different problems.

ProviderBinding prevents duplicate canonical identity.

SyncRun.idempotencyKey prevents duplicate execution of the same synchronization operation.

Neither replaces the other.

### Identity changes

If upstream identity itself changes, StoreAgent must not silently mutate an existing binding into a different external resource.

Identity migration or reconciliation requires an explicit workflow.

Any change to provider identity construction that can change binding keys requires an adapter-version change.


## M0.7.9 frozen quarantine and reconciliation contract

StoreAgent reuses the existing canonical synchronization and data-quality model.

M0.7 does not introduce a parallel quarantine persistence entity.

### Quarantine

Quarantine is an ingestion disposition.

A quarantined provider record:

- is not persisted as canonical commercial truth
- increments `SyncRun.counts.quarantined`
- retains explicit machine-readable normalization issues
- may contribute reconciliation metadata
- may later be retried after remediation

Quarantine must never silently become accepted data.

### Skip

Skip is an intentional non-error disposition.

A skipped record:

- increments `SyncRun.counts.skipped`
- carries an explicit reason
- is not treated as canonical failure
- is not automatically a DataQualityIssue

### Failure

Failure represents operational or execution failure rather than an ordinary normalization disposition.

Examples may include:

- provider transport failure
- persistence failure
- worker failure
- unexpected internal exception

Failures contribute to `SyncRun.counts.failed`.

Normalization ambiguity should normally quarantine rather than become a technical failure.

### Reconciliation

Reconciliation handles cases where StoreAgent cannot safely resolve provider state into canonical truth.

Examples include:

- binding conflicts
- ambiguous identity
- unresolved relationships
- provider inconsistencies
- missed or changed source records
- cursor drift

Reconciliation must fail closed.

Canonical business truth remains unchanged until the ambiguity is safely resolved.

Automatic last-write-wins rebinding is forbidden.

### Binding conflicts

A binding conflict is a reconciliation condition.

The same durable provider identity mapping to a different canonical entity must not:

- overwrite the existing binding
- silently merge entities
- create an ambiguous duplicate

It must enter quarantine/reconciliation handling.

### DataQualityIssue relationship

`DataQualityIssue` is a durable domain-quality artifact.

Quarantine and DataQualityIssue are related but are not the same thing.

Not every quarantined row requires a durable DataQualityIssue.

A durable issue may be appropriate when the problem:

- requires merchant remediation
- persists across sync attempts
- represents ambiguous identity
- represents unresolved canonical relationships
- materially affects downstream commercial truth

Transient malformed rows may remain sync-local quarantine evidence.

### SyncRun ownership

Existing SyncRun fields remain authoritative for synchronization outcome accounting:

- discovered
- imported
- updated
- skipped
- quarantined
- failed

`errorSummary` may summarize operational failures.

`reconciliationMetadata` may contain non-authoritative structured reconciliation/provenance information.

Neither field replaces canonical domain entities.

### Source preservation

Reconciliation metadata may retain provider identity, adapter version, reason codes, and issue summaries needed for deterministic debugging.

Credentials, secrets, and tokens must never be included.

### Downstream safety

Quarantined or unresolved provider records must not flow into:

- metrics
- forecasts
- inventory decisions
- AI explanations as canonical truth

Known data-quality problems must not disappear silently.


## M0.7.10 frozen CSV adapter boundary

CSV is StoreAgent's first ingestion provider.

CSV adapter behavior must remain deterministic and provider-boundary only.

### Explicit mapping

CSV normalization uses explicit column-to-canonical-field mapping.

StoreAgent must not infer commercial semantics merely from similar column names.

Examples:

A column named:

- stock
- qty
- inventory
- available

does not automatically map to any canonical inventory field.

The merchant/import configuration must explicitly choose the semantic mapping.

### Blank cells

Blank, missing, or whitespace-only optional cells represent unavailable data.

They do not become numeric zero.

Known textual zero remains known zero and is normalized by the relevant canonical quantity or money normalizer.

### Stable identity

CSV rows require stable external identity.

Preferred identity is an explicitly mapped external ID.

When no external ID exists, a resource-specific stable identifier such as SKU may be used through an explicit deterministic composite external ID.

Physical row number is not durable provider identity.

Row numbers may change when:

- files are sorted
- exports are regenerated
- records are inserted
- records are removed

Therefore row number must not be used as successful binding identity.

Rows with no stable identity must fail closed and be quarantined.

### Mapping uniqueness

One canonical field may not be mapped from multiple CSV columns in the same adapter configuration.

One source column may not silently populate multiple canonical fields.

Any deliberate multi-field transformation must belong to an explicit provider/resource adapter rule rather than accidental mapping configuration.

### CSV resources

CSV adapters remain resource-specific.

V1 architecture permits resource-specific import contracts for canonical resources such as:

- product variants
- inventory
- orders
- order items
- returns
- purchase orders
- purchase-order items

Actual M3 ingestion may expose only the subset needed by the product workflow.

### Transport boundary

CSV parsing and file reading are transport concerns.

Canonical normalization helpers operate on already-parsed row values.

CSV adapters must not calculate:

- sales velocity
- safety stock
- forecast demand
- reorder quantities
- inventory actions
- commercial confidence

### Idempotency

Re-importing equivalent CSV data under the same integration and adapter identity must not create duplicate canonical resources.

Stable external identity feeds ProviderBinding and M0.7.8 idempotency behavior.

### Versioning

Changes to CSV mapping or normalization rules capable of changing canonical output require an adapter-version change.

The mapping configuration used for an import must be reproducible or retained as synchronization provenance.


## M0.7.11 frozen Shopify adapter boundary

Shopify is StoreAgent's second initial provider.

M0.7 freezes the anti-corruption boundary only.

Actual Shopify API transport, authentication, API-version selection, webhook handling, and production field mapping belong to the later Shopify milestone.

### Shopify-specific isolation

Shopify-specific payload and helper types belong under:

`lib/providers/shopify/`

They must not enter the canonical commerce domain.

Canonical StoreAgent entities remain provider-independent.

### Shopify identity

StoreAgent treats Shopify GraphQL GIDs as opaque external identifiers.

Example:

`gid://shopify/ProductVariant/123`

The terminal identifier must not be interpreted as:

- StoreAgent UUID
- numeric canonical identity
- globally unique identity outside the integration/provider scope

Whitespace may be normalized at the adapter boundary.

Case and full GID identity are otherwise preserved.

Product, product variant, and location resources retain independent ProviderBindings.

### Inventory location scope

Canonical StoreAgent inventory is variant + location scoped.

Shopify inventory normalization must therefore retain both:

- ProductVariant identity
- Location identity

Inventory from different Shopify locations must never be silently aggregated into one provider observation before canonical location semantics are resolved.

Product-level inventory is not canonical inventory truth.

### Shopify inventory semantics

Shopify-specific inventory concepts may map into canonical:

- on hand
- available
- committed
- incoming

only when the selected Shopify API contract explicitly guarantees the semantic.

M0.7 does not hard-code API-version-specific inventory-state mappings.

Missing or unsupported semantics remain unknown.

Provider adapters must not derive missing inventory semantics arithmetically unless the provider contract explicitly guarantees the relationship.

### Shopify orders

Shopify financial state, fulfillment state, and canonical StoreAgent OrderStatus are separate concepts.

M0.7 does not assume that:

- paid means completed demand
- fulfilled means completed demand
- unfulfilled means open
- closed means completed

Provider-specific order mapping must be explicit, documented, tested, and versioned.

Unknown or unmapped provider status fails closed to canonical `unknown`.

### Shopify purchase orders

The same rule applies to Shopify or future Shopify-supported inbound/purchase-order status vocabulary.

Provider-specific status must explicitly map into canonical PurchaseOrderStatus before the frozen M0.4 incoming-stock policy evaluates trusted incoming quantity.

The Shopify adapter must not calculate valid incoming inventory itself.

### Money

Shopify monetary values must pass through StoreAgent's exact money normalization contract.

JavaScript floating-point values must not become canonical monetary truth accidentally.

### Pagination

Shopify pagination cursors are opaque synchronization transport provenance.

They may be retained in SyncRun cursor fields.

Cursors are not:

- canonical entity identity
- ProviderBinding identity
- business data

The adapter must not infer commercial meaning from cursor contents.

### Transport separation

M0.7 does not install a Shopify SDK.

The later Shopify connector may select an appropriate transport/client based on the supported Shopify API version.

Transport code is responsible for:

- authentication
- HTTP/GraphQL execution
- rate-limit handling
- pagination
- webhook receipt

Normalization remains separately testable.

### Prohibitions

Shopify adapters must not calculate:

- sales velocity
- safety stock
- reorder point
- target stock
- forecast demand
- stockout risk
- overstock risk
- action type
- action priority
- deterministic confidence

Those remain downstream StoreAgent engine responsibilities.

### Canonical parity

Equivalent commerce facts imported from Shopify and CSV should yield equivalent canonical StoreAgent semantics before metrics, forecasting, and decisions run.

Any Shopify normalization change capable of changing canonical output requires an adapter-version change.


## M0.7.12 frozen provider invariants

The complete M0.7 provider layer must satisfy the following invariants.

### Dependency direction

Provider code is upstream of canonical StoreAgent business logic.

Allowed direction:

provider/source
-> provider adapter
-> canonical domain
-> metrics
-> forecasting
-> decision engine

Provider modules must not depend on:

- metrics
- forecasting
- decision engine
- AI providers
- UI frameworks
- billing
- database clients

Normalization remains a pure deterministic boundary.

### Canonical-domain isolation

Provider-specific types and field names must not appear in the canonical commerce domain.

Examples include:

- Shopify GID types
- Shopify inventory payload fields
- CSV row types
- CSV mapping configuration
- provider API response models

Provider IDs remain external identity only.

### Provider isolation

Shopify-specific implementation stays under:

`lib/providers/shopify/`

CSV-specific implementation stays under:

`lib/providers/csv/`

Downstream deterministic engines must not import either provider implementation.

### Identity

External IDs remain strings.

Generic identity normalization:

- trims surrounding whitespace
- preserves case
- rejects empty required identity
- does not parse numeric-looking IDs
- does not convert provider IDs into canonical UUIDs

Durable provider binding identity remains scoped by organization, integration, provider, resource type and normalized external ID.

### Unknown versus zero

Missing commercial values remain unknown.

Generic provider normalization must not convert missing values into zero.

Known zero remains valid zero.

This applies especially to:

- inventory
- quantities
- incoming stock
- money
- demand-related source values

### Money

Generic monetary normalization accepts exact string representations only.

Binary floating-point values must not become canonical monetary truth accidentally.

### Statuses

Unrecognized provider order and purchase-order statuses fail closed to canonical `unknown`.

Provider-specific mappings must be explicit and versioned.

Status guessing is forbidden.

### Inventory semantics

Provider inventory concepts must not be treated as interchangeable.

Missing inventory dimensions remain unknown unless a provider-specific contract explicitly guarantees a mapping.

### Reconciliation

Ambiguous identity, relationships, or provider state must not silently enter canonical truth.

Allowed outcomes include:

- quarantine
- skip
- reconciliation
- durable DataQualityIssue where appropriate

Binding conflicts must never use last-write-wins rebinding.

### Credentials

Provider credentials, secrets and tokens do not belong in:

- canonical provider payloads
- ProviderBinding source metadata
- ordinary Integration configuration
- reconciliation metadata

Credentials belong in secure credential storage.

### Downstream truth

Metrics, forecasts and inventory decisions consume canonical StoreAgent data only.

Provider payloads, provider API fields and provider-specific identifiers must never become hidden business logic inputs.

### Canonical parity

Equivalent commercial facts from different providers should normalize into equivalent canonical semantics.

CSV and Shopify may differ in transport and provider vocabulary, but downstream deterministic engines must not need to know which provider supplied the data.
