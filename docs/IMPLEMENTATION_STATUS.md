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


### M0.8 completion

Status: PASS

Frozen background-job architecture:

- worker tenancy + trusted-scope contract
- canonical job vocabulary + payload envelope
- deterministic logical idempotency
- worker lifecycle state machine
- claim / lease / crash-recovery semantics
- deterministic retry + backoff policy
- terminal failure + dead-work contract
- concurrency + duplicate-execution protection
- SyncRun orchestration boundary
- metrics -> forecast -> decision -> AI pipeline ordering
- scheduled + event-triggered execution boundary
- tenant-scoped observability contract

Key invariants:

- BackgroundJob is infrastructure execution truth, not canonical business truth
- BackgroundJob does not replace SyncRun, ForecastRun or InventoryAction
- organization ownership remains mandatory under privileged worker execution
- trigger identifiers and provider identifiers never establish tenant ownership
- logical idempotency excludes runtime delivery, lease and worker identity
- duplicate enqueue does not create replacement logical work
- only the active ownerId + claimToken may mutate leased work
- retry_wait is infrastructure state and does not mean canonical business failure
- worker retries do not change deterministic business truth
- SyncRun idempotency remains distinct from worker-job idempotency
- metrics own inventory formulas
- forecasting owns demand estimation
- decision engine owns commercial action selection
- AI remains downstream of deterministic truth
- worker observability does not become canonical commercial truth

Verification at M0.8 closure:

- typecheck PASS
- lint PASS
- 753 tests PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M0.9 — Testing / evaluation architecture


## M0.9 — Testing / evaluation architecture

- [x] M0.9.1 Evaluation principles + scenario contract
- [x] M0.9.2 Versioned deterministic fixture format
- [x] M0.9.3 Golden expected-output contract
- [x] M0.9.4 Metrics scenario matrix
- [x] M0.9.5 Forecast scenario matrix
- [x] M0.9.6 Decision scenario matrix
- [x] M0.9.7 Cross-tenant adversarial evaluation matrix
- [x] M0.9.8 Worker/retry/concurrency evaluation matrix
- [x] M0.9.9 Reproducibility + regression drift policy
- [x] M0.9.10 AI numeric-mutation evaluation contract
- [x] M0.9.11 Evaluation invariants
- [x] M0.9.12 M0.9 gate

### M0.9 completion

Status: PASS

Frozen testing / evaluation architecture:

- evaluation scenario contract
- versioned deterministic fixture contract
- reviewed golden-output contract
- metrics regression matrix
- forecast regression matrix
- decision regression matrix
- cross-tenant adversarial matrix
- worker / retry / concurrency matrix
- reproducibility and regression-drift policy
- AI numeric-mutation contract
- global evaluation invariants
- approved-golden regression gate

Key invariants:

- deterministic fixtures contain input evidence only
- reviewed expected truth belongs to approved goldens
- scenario IDs are stable and globally unique
- golden IDs are stable and globally unique
- scenario and golden configuration identity must match
- fixture references are versioned and explicit
- regression drift fails closed
- golden files are never automatically regenerated
- evaluation never replaces canonical business logic
- forecast and decision reproducibility remain deterministic
- cross-tenant evaluation fails closed
- worker retry and lease behavior remain deterministic
- infrastructure execution state does not replace business truth
- AI may explain deterministic truth but may not mutate it
- AI numeric-mutation violations are critical
- explanation worker remains unimplemented during M0
- evaluation contracts contain no live network or provider dependency

Verification at M0.9 closure:

- typecheck PASS
- lint PASS
- 1086 tests PASS
- production build PASS
- git diff check PASS

Next milestone:

M0.10 — M0 architecture gate


## M0.10 — M0 architecture gate

### M0.10 completion

Status: PASS

M0 architecture is frozen and internally consistent across:

- engineering foundation
- canonical commerce domain
- tenancy / authorization / RLS architecture
- deterministic inventory formulas
- deterministic forecasting
- deterministic decision engine
- provider adapter anti-corruption boundary
- background-job orchestration
- testing / evaluation architecture

Cross-boundary dependency direction:

Canonical commerce domain
-> metrics
-> forecasting
-> decision engine
-> AI explanation

Provider adapters normalize external data into canonical boundaries but do not own downstream commercial truth.

Worker infrastructure orchestrates execution but does not replace canonical business records or deterministic calculations.

Final M0 invariants:

- Organization is the primary tenant boundary
- authentication does not equal authorization
- provider identifiers never establish tenant ownership
- canonical domain remains provider-independent
- unknown remains distinct from zero
- metrics own deterministic inventory arithmetic
- forecasting owns deterministic demand estimation
- decision engine owns commercial action selection
- decision confidence cannot exceed deterministic forecast confidence
- provider adapters do not calculate downstream metrics, forecasts or decisions
- BackgroundJob is infrastructure execution truth only
- SyncRun, ForecastRun and InventoryAction remain canonical business truth
- retries, leases and duplicate delivery do not create replacement business truth
- AI remains downstream of deterministic truth
- AI cannot mutate action, quantity, forecast, risk, confidence or evidence truth
- evaluation does not duplicate canonical business algorithms
- reviewed golden outputs remain explicit and are never automatically regenerated
- deterministic layers contain no UI, billing, AI or commerce-provider SDK dependency
- all M0 architecture milestones have explicit PASS closure records

Verification at M0 closure:

- typecheck PASS
- lint PASS
- 1096 tests PASS
- production build PASS
- git diff check PASS

M0 architecture gate: PASS

Next milestone:

M1 — Foundation implementation


## M1 — Foundation implementation

- [x] M1.1 Runtime + environment + Supabase boundary
- [x] M1.2 Authentication + session foundation
- [ ] M1.3 Canonical foundation schema
- [ ] M1.4 Organization membership + provisioning
- [ ] M1.5 RLS + tenant enforcement
- [ ] M1.6 Authenticated application shell
- [ ] M1.7 Error + observability boundary
- [ ] M1.8 Foundation integration + adversarial tests
- [ ] M1.9 M1 gate

M1 implementation rules:

- M0 architectural ownership remains frozen.
- Authentication never substitutes for authorization.
- Organization remains the primary tenant boundary.
- Browser code never receives privileged service credentials.
- Provider identifiers never establish tenant ownership.
- Database persistence must preserve unknown versus zero semantics.
- M1 does not implement inventory calculations, forecasts, decisions, AI explanations, provider synchronization or billing.
- M1 infrastructure must be consumable by later CSV and Shopify milestones without changing canonical domain ownership.

### M1.1 completion

Status: PASS

Implemented foundation boundaries:

- explicit runtime environment contract
- public Supabase configuration separated from privileged server configuration
- browser Supabase client
- request-scoped server Supabase client
- privileged admin Supabase client
- server-only enforcement for privileged Supabase access
- lazy environment validation
- environment configuration tests
- Supabase client architecture tests

Security invariants:

- browser code cannot access service-role credentials
- service-role credentials are never exposed through NEXT_PUBLIC_ variables
- request-scoped server client uses publishable credentials and remains RLS-compatible
- privileged admin client is server-only
- privileged access does not itself authorize tenant access
- trusted tenant-scope enforcement remains owned by the existing M0 tenancy architecture
- deterministic metrics, forecasting and decision modules do not depend on Supabase
- no provider, billing, AI or queue SDK was introduced
- no database schema or authentication behavior was implemented prematurely

Verification at M1.1 closure:

- typecheck PASS
- lint PASS
- 1107 tests PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M1.2 — Authentication + session foundation

### M1.2 completion

Status: PASS

Implemented authentication/session foundation:

- provider-neutral authenticated identity contract
- verified JWT claim mapping
- server-side authenticated identity resolver
- fail-closed authenticated identity requirement
- Next.js 16 root Proxy session-refresh boundary
- Supabase PKCE authentication callback
- safe same-origin post-auth redirect handling
- POST-only sign-out route
- authentication/session architecture documentation
- authentication claim tests
- redirect security tests
- authentication/session architecture tests

Security invariants:

- authentication establishes user identity only
- authentication does not establish organization or store authorization
- verified server identity is derived from JWT `sub`
- server identity validation uses `supabase.auth.getClaims()`
- `supabase.auth.getSession()` is not trusted as the server authorization boundary
- JWT tenant-looking claims do not establish StoreAgent tenant ownership
- organization membership remains owned by StoreAgent tenancy persistence
- store ownership remains independently validated
- Proxy owns session refresh, not business authorization
- normal user authentication never uses the privileged Supabase admin client
- service-role / secret credentials do not participate in user authentication
- PKCE callback exchanges an Auth Code rather than accepting client-supplied identity
- post-auth redirects reject external and protocol-relative destinations
- sign-out is POST-only
- M1.2 does not implement organization provisioning, RLS policy persistence or application UI

Verification at M1.2 closure:

- typecheck PASS
- lint PASS
- focused authentication tests: 25 PASS
- full suite: 113 test files / 1132 tests PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M1.3 — Canonical foundation schema
