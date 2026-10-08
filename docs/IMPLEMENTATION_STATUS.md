# StoreAgent Implementation Status

## Current milestone

M0 — Architecture Lock

## Current sub-milestone

M0.5 — Forecast specification

## Status

IN PROGRESS

## M0 scope

- [x] M0.1 Repository + engineering conventions
  - [x] Design quality constitution added
- [ ] M0.2 Canonical domain schema
- [ ] M0.3 Tenancy / RLS architecture
- [ ] M0.4 Inventory formula specification
- [ ] M0.5 Forecast specification
- [ ] M0.6 Decision engine rules
- [ ] M0.7 Provider adapter contract
- [ ] M0.8 Background job architecture
- [ ] M0.9 Testing / evaluation architecture
- [ ] M0.10 Architecture gate

## Do not start yet

- Authentication implementation
- Database migrations
- CSV importer
- Shopify connector
- Forecast execution code
- AI integration
- Billing
- Production UI

These begin only after M0 passes.


### M0.1 completion

Status: PASS

Verified:

- Node 22 project runtime
- Next.js 16 foundation
- React 19
- strict TypeScript
- ESLint
- Tailwind CSS
- shadcn Base UI / Luma foundation
- Vitest
- production build
- design system constitution
- engineering conventions
- clean git diff validation

Next allowed sub-milestone:

M0.2 — Canonical domain schema


### M0.2 progress

- [x] M0.2.1 Entity catalog + ownership boundaries
- [x] M0.2.2 Canonical TypeScript types
- [x] M0.2.3 Relationships + invariants
- [x] M0.2.4 Money/time/nullability rules
- [x] M0.2.5 Provider binding semantics
- [x] M0.2.6 Immutable/history model
- [x] M0.2.7 Domain-model architecture tests
- [x] M0.2.8 M0.2 gate


### M0.2 completion

Status: PASS

Frozen:

- canonical entity catalog
- organization/store ownership boundaries
- provider-independent canonical identity
- canonical TypeScript domain model
- domain relationships and invariants
- exact monetary semantics
- UTC/store-local time semantics
- null vs zero semantics
- provider binding and reconciliation semantics
- immutable inventory/history model
- forecast and algorithm versioning
- immutable recommendation evidence
- append-only merchant action history
- AI numeric-truth boundary

Verification:

- typecheck PASS
- lint PASS
- unit/architecture tests PASS
- production build PASS
- git diff check PASS

Test count at closure:

41 / 41 passing

Next allowed sub-milestone:

M0.3 — Tenancy / RLS architecture


### M0.3 progress

- [x] M0.3.1 Tenancy model
- [x] M0.3.2 Membership + role semantics
- [x] M0.3.3 RLS policy architecture
- [x] M0.3.4 Server tenant-resolution rules
- [x] M0.3.5 Service-role boundary
- [x] M0.3.6 Cross-org attack scenarios
- [x] M0.3.7 Tenancy architecture tests
- [x] M0.3.8 M0.3 gate


### M0.3 completion

Status: PASS

Frozen:

- Organization as primary tenant boundary
- authentication separated from authorization
- multi-organization membership support
- organization-scoped roles
- explicit permission model
- trusted TenantContext resolution
- no first-organization fallback
- store ownership validation
- RLS architecture
- immutable-history client restrictions
- trusted server/RPC write boundaries
- Supabase service-role boundary
- explicit worker tenant scope
- provider/billing binding tenant resolution
- cross-organization threat model
- AI excluded from authorization

Verification:

- typecheck PASS
- lint PASS
- tenancy/security tests PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M0.4 — Inventory formula specification


### M0.4 progress

- [x] M0.4.1 Formula specification baseline
- [x] M0.4.2 Sales velocity implementation contract
- [x] M0.4.3 Days-of-stock contract
- [x] M0.4.4 Safety-stock contract
- [x] M0.4.5 Reorder-point contract
- [x] M0.4.6 Target-stock contract
- [x] M0.4.7 Recommended-order-quantity contract
- [x] M0.4.8 Sell-through / inventory-age / demand-trend contract
- [x] M0.4.9 Stockout / overstock-risk contract
- [x] M0.4.10 Supplier MOQ / pack rounding contract
- [x] M0.4.11 Incoming-stock validity contract
- [x] M0.4.12 Formula invariants + tests
- [x] M0.4.13 M0.4 gate


### M0.4 completion

Status: PASS

Frozen deterministic inventory logic:

- sales velocity
- days of stock
- safety stock
- reorder point
- target stock
- recommended order quantity
- sell-through
- inventory age provenance
- demand trend
- stockout risk
- overstock risk
- MOQ handling
- pack-size rounding
- incoming purchase-order validity

Key invariants:

- null means unknown
- zero means known zero
- negative reorder quantities are impossible
- incoming inventory never becomes negative
- ambiguous incoming state fails closed
- supplier-constrained quantity never falls below required need
- pack-size constraints always round upward
- historical/commercial calculations are versioned
- deterministic inventory math does not depend on UI, AI, Stripe or provider SDKs
- AI does not calculate inventory truth

Verification:

- 161 unit/architecture tests PASS
- typecheck PASS
- lint PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M0.5 — Forecast specification


### M0.5 progress

- [x] M0.5.1 Forecast principles + V1 scope
- [x] M0.5.2 History sufficiency contract
- [x] M0.5.3 Weighted moving-average baseline
- [x] M0.5.4 Trend adjustment
- [x] M0.5.5 Stockout censoring
- [x] M0.5.6 Promotion/event treatment
- [x] M0.5.7 Cold-start behavior
- [x] M0.5.8 Forecast confidence
- [x] M0.5.9 Forecast horizons
- [x] M0.5.10 Backtesting + error metrics
- [x] M0.5.11 Versioning + reproducibility
- [x] M0.5.12 Forecast invariants + tests
- [x] M0.5.13 M0.5 gate


### M0.5 completion

Status: PASS

Frozen deterministic forecast architecture:

- forecast principles and V1 scope
- history sufficiency
- weighted-demand baseline
- bounded trend adjustment
- stockout censoring
- promotion treatment
- cold-start policy
- deterministic forecast confidence
- forecast horizons
- backtesting with MAE / WAPE / bias
- algorithm versioning
- reproducibility fingerprinting

Key invariants:

- forecasting estimates demand only
- forecasting does not emit REORDER / REDUCE / PROMOTE / WATCH
- negative forecast demand is impossible
- missing data does not silently become zero
- stockout days do not silently become zero demand
- known promotion periods do not contaminate baseline demand
- insufficient history does not publish fabricated numeric forecasts
- worse data quality cannot increase confidence
- AI cannot assign or override numeric forecast truth
- provider SDKs do not belong inside deterministic forecast logic
- same canonical input + same config + same algorithm versions remains reproducible

Verification:

- 244 tests PASS
- typecheck PASS
- lint PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M0.6 — Decision engine rules


## M0.6 — Decision engine rules

- [x] M0.6.1 Decision principles + precedence model
- [x] M0.6.2 Decision reason-code contract
- [x] M0.6.3 REORDER rule
- [x] M0.6.4 REDUCE rule
- [x] M0.6.5 PROMOTE rule
- [x] M0.6.6 WATCH + HEALTHY rules
- [x] M0.6.7 Conflict resolution
- [x] M0.6.8 Priority rules
- [x] M0.6.9 Decision confidence
- [x] M0.6.10 Evidence snapshot mapping
- [x] M0.6.11 Versioning + reproducibility
- [x] M0.6.12 Decision invariants + tests
- [x] M0.6.13 M0.6 gate


### M0.6 completion

Status: PASS

Frozen deterministic decision architecture:

- decision principles and precedence model
- stable reason-code contract
- REORDER rule
- REDUCE rule
- PROMOTE rule
- WATCH / HEALTHY rules
- conflict detection
- primary-action precedence
- deterministic priority
- deterministic decision confidence
- evidence snapshot mapping
- algorithm versioning
- reproducibility fingerprinting
- canonical orchestration path

Key invariants:

- metrics and forecasting remain the only owners of numeric truth
- AI cannot choose action type or quantity
- HEALTHY is not persisted as InventoryAction
- REORDER is the only V1 action with recommendedQuantity
- REDUCE and PROMOTE may coexist as compatible excess-family interventions
- REDUCE is primary when REDUCE + PROMOTE are both valid
- REORDER + excess-family actions fail closed to WATCH
- contradictory signals never depend on evaluation order
- WATCH is used for material uncertainty or commercial conflict
- known zero is distinct from unknown
- decision confidence never exceeds underlying forecast confidence
- priority does not choose action type
- evidence snapshots preserve decision-time truth
- deterministic decision modules have no AI, UI, persistence, commerce-provider, or billing SDK dependency
- same canonical inputs + same config + same algorithm versions are reproducible

Verification:

- 376 tests PASS
- typecheck PASS
- lint PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M0.7 — Provider adapter architecture


## M0.7 — Provider adapter architecture

- [x] M0.7.1 Provider boundary principles + adapter contract
- [x] M0.7.2 External identity normalization
- [x] M0.7.3 Timestamp normalization
- [x] M0.7.4 Money + currency normalization
- [x] M0.7.5 Quantity + inventory semantics
- [x] M0.7.6 Order-status normalization
- [x] M0.7.7 Purchase-order-status normalization
- [x] M0.7.8 Binding + idempotency contract
- [x] M0.7.9 Quarantine + reconciliation contract
- [x] M0.7.10 CSV adapter boundary
- [x] M0.7.11 Shopify adapter boundary
- [x] M0.7.12 Provider invariants + tests
- [x] M0.7.13 M0.7 gate


### M0.7 completion

Status: PASS

Frozen:

- provider anti-corruption boundary
- raw provider payloads remain untrusted until resource-specific validation
- provider transport and normalization are separate concerns
- deterministic external identity normalization
- explicit composite external identity where provider scope requires it
- UTC timestamp normalization without timezone guessing
- exact-string money normalization
- unknown quantity remains distinct from known zero
- provider inventory semantics are explicit rather than inferred
- canonical order-status normalization fails closed
- canonical purchase-order-status normalization fails closed
- incoming-stock truth remains owned by the frozen M0.4 metric policy
- durable provider binding identity and replay/idempotency semantics
- backward compatibility with the earlier provider-binding contract
- binding conflicts never silently rebind canonical identity
- quarantine, skip, failure and reconciliation semantics are distinct
- DataQualityIssue remains the durable domain-quality artifact
- CSV mappings are explicit and stable identity must not use row number
- Shopify GIDs remain opaque external identity
- Shopify inventory retains variant + location scope
- Shopify API-specific status and inventory mappings require explicit versioned rules
- provider-specific types remain outside the canonical commerce domain
- provider modules cannot depend on metrics, forecasting, decision engine, AI, UI, billing or database clients
- equivalent provider facts should normalize into equivalent canonical StoreAgent semantics

Verification:

- typecheck PASS
- lint PASS
- 524 unit/architecture tests PASS
- production build PASS
- git diff check PASS
- no M0.7 package dependency changes
- no provider-to-engine dependency leaks
- no provider-specific type leakage into canonical commerce domain

Next allowed sub-milestone:

M0.8 — Background job architecture


## M0.8 — Background job architecture

- [x] M0.8.1 Worker tenancy + trusted-scope contract
- [x] M0.8.2 Job vocabulary + payload envelope
- [x] M0.8.3 Deterministic idempotency-key contract
- [x] M0.8.4 Job lifecycle + state-machine contract
- [x] M0.8.5 Claim + lease + crash-recovery semantics
- [x] M0.8.6 Retry + backoff policy
- [x] M0.8.7 Terminal failure + dead-work policy
- [x] M0.8.8 Concurrency + duplicate-execution protection
- [x] M0.8.9 SyncRun orchestration boundary
- [x] M0.8.10 Forecast/metrics/decision pipeline orchestration
- [x] M0.8.11 Scheduled + event-triggered execution boundary
- [x] M0.8.12 Observability + safe payload/logging rules
- [x] M0.8.13 Background-job invariants + tests
- [x] M0.8.14 M0.8 gate
