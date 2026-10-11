# StoreAgent M3 CSV Ingestion Contract

## Purpose

M3 introduces CSV as StoreAgent's first operational ingestion provider.

CSV ingestion translates merchant-supplied tabular source data into the
canonical commerce persistence layer frozen in M2.

CSV is a provider boundary.

CSV does not redefine canonical commerce semantics.

---

## Core rule

CSV source data determines source truth.

Canonical M2 persistence determines StoreAgent truth.

CSV parsing and normalization must never bypass:

- canonical organization ownership
- canonical store ownership
- provider bindings
- null-versus-zero semantics
- exact monetary semantics
- history semantics
- RLS / trusted service boundaries

---

## M3 scope

M3 may ingest canonical source data for:

- products
- product variants
- inventory observations
- orders
- order items
- returns/refunds
- suppliers
- supplier products
- purchase orders
- purchase-order items

M3 may create and maintain:

- CSV integrations
- provider bindings
- sync runs
- reconciliation metadata
- transient quarantine results

M3 does not implement:

- derived SKU metrics
- DataQualityIssue persistence
- forecasting
- inventory decisions
- AI explanations
- Shopify synchronization
- billing
- automated supplier recommendations

Durable DataQualityIssue persistence remains owned by M4.

---

## Provider identity

CSV is provider type:

`csv`

Canonical UUIDs must never be copied from CSV values.

CSV source identity must resolve through ProviderBinding.

Durable provider-binding identity remains:

- organization_id
- integration_id
- provider
- resource_type
- external_id

CSV external IDs remain case-preserving.

Whitespace surrounding source identity is normalized before binding.

---

## Stable CSV identity

A CSV row must have stable commercial identity.

Preferred identity order is resource-specific.

Explicit merchant-mapped external identity is preferred when available.

Where the resource contract explicitly permits it, a deterministic composite
identity may be derived from stable business identifiers.

Examples:

- product variant: merchant external key, otherwise stable SKU
- order: external order/reference identifier
- order item: order identity + stable line/item identity
- supplier: merchant supplier key/code when provided
- purchase order: external purchase-order/reference identifier

Row number must never be used as durable external identity.

File name must never be used as durable entity identity.

Upload timestamp must never be used as durable entity identity.

If stable identity cannot be proven, the row is quarantined.

Identity must never be guessed.

---

## Mapping contract

CSV field mapping is explicit.

StoreAgent must not infer an unmapped canonical field merely because a source
column has a similar name.

A canonical field may be mapped at most once.

A source column may be mapped at most once inside one resource mapping.

Mapped cell values are trimmed.

Blank mapped cells represent unknown values and normalize to NULL where the
canonical field is nullable.

Blank numeric cells must never silently become zero.

---

## File boundary

M3 accepts delimited CSV source content.

Parser responsibilities:

- decode source text
- recognize header row
- parse rows deterministically
- preserve source column names
- preserve row order for diagnostics only
- report structural parsing failures
- never assign canonical identity

Row number is diagnostic provenance only.

It is not provider identity.

---

## Resource-specific normalization

Parsing and normalization are separate stages.

Parser output is generic CSV rows.

Resource adapters translate mapped CSV rows into provider-normalized inputs.

Each adapter owns only source translation.

Adapters do not own:

- inventory formulas
- forecasting formulas
- decision rules
- AI behavior

---

## Commercial value semantics

Unknown value is not zero.

Blank optional quantity:

NULL

Explicit quantity `0`:

0

Blank optional monetary value:

NULL

Explicit monetary value `0`:

exact zero

Persisted monetary values use exact decimal semantics.

Binary floating-point money must not enter canonical persistence.

V1 quantities remain whole units.

---

## Current state vs history

Repeated CSV ingestion must respect canonical entity class.

Current-state records may reconcile when provider identity already resolves to
the same canonical entity.

Examples:

- product title
- product status
- variant barcode
- supplier terms
- purchase-order operational state

Historical evidence is append-oriented where frozen by M2.

Inventory observations append new snapshots.

Historical records must not be silently reassigned to another tenant or store.

---

## Provider-binding replay

For each normalized source resource:

1. build normalized provider-binding identity
2. resolve existing binding
3. if no binding exists:
   - create canonical entity safely
   - create provider binding
4. if binding exists for the same canonical entity:
   - treat as idempotent/reconciliation path
5. if the same provider identity attempts to point to another canonical entity:
   - quarantine / conflict
   - do not rebind silently

External parent identity is metadata.

It is not hidden uniqueness.

---

## File replay and idempotency

Importing the same file or equivalent source rows more than once must not create
duplicate canonical current-state entities.

Idempotency is resource identity based.

File hash alone is not canonical entity identity.

A file-level idempotency key may prevent duplicate orchestration work, but row
reconciliation must still use provider bindings.

Historical append rules remain resource-specific.

---

## Sync run

Every operational CSV import belongs to a SyncRun.

SyncRun must have:

- organization scope
- optional store scope consistent with the integration
- integration ID
- explicit idempotency key
- lifecycle status
- discovered count
- imported count
- updated count
- skipped count
- quarantined count
- failed count
- reconciliation metadata
- started timestamp
- optional finished timestamp

SyncRun identity never establishes tenant ownership.

Trusted organization/integration scope must already be resolved.

---

## Row disposition

Every parsed source row must end in exactly one operational disposition:

- imported
- updated
- skipped
- quarantined
- failed

A row must not increment more than one terminal count.

`discovered` counts rows presented to resource normalization.

---

## Quarantine

Quarantine is used when the row is structurally readable but cannot safely
enter canonical persistence.

Examples:

- stable external identity missing
- stable external identity invalid
- required mapped canonical field missing
- canonical/provider binding conflict
- ambiguous parent relationship
- invalid quantity
- invalid exact money
- unsupported source status
- ownership cannot be proven

Quarantine must retain enough non-secret provenance to explain:

- resource type
- row number
- external ID when known
- reason code
- affected canonical/source field where applicable

Quarantine does not create guessed canonical records.

Durable DataQualityIssue persistence is deferred to M4.

---

## Failed vs quarantined

Quarantined:

The source row is understandable, but cannot safely be persisted as canonical
commerce truth.

Failed:

The import operation encounters an unexpected operational or persistence
failure that is not a normal source-validation outcome.

Source validation problems should not be misclassified as infrastructure
failures.

---

## Partial failure

One bad row must not automatically corrupt or authorize another row.

Row processing must preserve tenant scope independently.

An invalid row may be quarantined while valid rows continue when doing so does
not violate resource consistency.

M3 must fail the whole import when the file-level contract itself is invalid,
including cases such as:

- unreadable CSV structure
- missing required header/mapping contract
- invalid integration scope
- invalid resource adapter configuration

---

## Transaction boundary

Do not wrap an entire large CSV import in one unbounded transaction.

Canonical write operations must be atomic at the resource/reconciliation unit
needed to preserve:

- canonical record consistency
- provider binding consistency
- ownership guarantees

Creation of a new canonical current-state entity and its first provider binding
must not leave a half-bound entity if one side fails.

Historical append operations must not mutate earlier history.

---

## Duplicate source rows

Duplicate rows with the same durable provider identity inside one import must
be deterministic.

They must never create multiple canonical entities.

Resource-specific handling may:

- reconcile equivalent repeats
- classify exact repeats as skipped
- quarantine contradictory duplicates

Contradictory duplicates must not use last-row-wins silently when doing so
would hide ambiguous source truth.

---

## Tenant boundary

CSV content never establishes organization ownership.

CSV content never establishes store authorization.

Organization/store scope comes from trusted resolved integration/import
context.

Provider external IDs do not authorize access.

All canonical writes must include explicit trusted tenant scope.

---

## Browser boundary

The M2 browser ACL/RLS model remains frozen.

Ordinary authenticated browser clients do not receive generic direct mutation
rights to canonical M2 tables.

CSV imports must execute through trusted server-side ingestion orchestration.

Service-role access, if used, requires explicit trusted tenant scope.

---

## Provenance

CSV provider bindings and sync reconciliation metadata may store non-secret
source provenance.

Provenance must not become a hidden replacement for canonical fields.

No credentials or secrets belong in:

- provider bindings
- reconciliation metadata
- quarantine metadata
- CSV mappings

---

## V1 resource ordering

When one import workflow contains dependent resource classes, parents must be
resolved before children.

Examples:

- product before product variant
- order before order item
- supplier before supplier product
- purchase order before purchase-order item

Inventory snapshots require existing canonical variant and location ownership.

M3 must not create relationships whose parent identity cannot be proven.

---

## M3 sub-milestones

- M3.1 CSV ingestion contract + import matrix
- M3.2 CSV file parsing + structural validation
- M3.3 Product + variant CSV normalization
- M3.4 Inventory CSV ingestion
- M3.5 Orders + order-items CSV ingestion
- M3.6 Supplier + purchase-order CSV ingestion
- M3.7 Idempotency + provider-binding reconciliation
- M3.8 Quarantine + partial-failure accounting
- M3.9 End-to-end CSV import orchestration
- M3.10 M3 adversarial/final gate

---

## M3.1 exit criteria

M3.1 is complete when:

- CSV responsibilities are separated from canonical domain logic
- stable source identity rules are explicit
- row number is diagnostic only
- mapping semantics are explicit
- null-versus-zero behavior remains frozen
- provider-binding replay behavior is explicit
- current-state vs history behavior is explicit
- sync-run accounting semantics are explicit
- quarantine semantics are explicit
- failed vs quarantined behavior is explicit
- duplicate-row behavior is explicit
- partial-failure behavior is explicit
- tenant authority never comes from CSV content
- browser mutation authority is not broadened
- downstream M4+ features remain deferred
- no operational CSV parser/import route has been introduced yet
