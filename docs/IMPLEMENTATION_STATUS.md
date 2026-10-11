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
- [x] M1.3 Canonical foundation schema
- [x] M1.4 Organization membership + provisioning
- [x] M1.5 RLS + tenant enforcement
- [x] M1.6 Authenticated application shell
- [x] M1.7 Error + observability boundary
- [x] M1.8 Foundation integration + adversarial tests
- [x] M1.9 M1 gate

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

### M1.3 completion

Status: PASS

Implemented canonical foundation persistence:

- Supabase local development configuration
- canonical organizations table
- canonical organization_members table
- canonical stores table
- canonical locations table
- UUID primary keys
- canonical role constraints
- canonical store/location status constraints
- organization membership uniqueness
- Supabase auth.users membership reference
- explicit organization ownership
- composite same-organization Store -> Location ownership constraint
- tenant/RLS supporting indexes
- automatic updated_at maintenance
- RLS enabled fail-closed on all M1.3 tenant tables
- no RLS policies introduced before M1.5
- canonical foundation schema documentation
- schema architecture tests

Database invariants:

- Organization is the primary tenant boundary
- authentication identity does not imply organization membership
- one user may belong to multiple organizations
- one user may belong to an organization only once
- Store belongs to exactly one Organization
- Location belongs to exactly one Store and Organization
- Location organization_id must match Store organization_id
- cross-organization Location -> Store relationships are rejected by PostgreSQL
- organization-owned records do not use ad-hoc cascading tenant deletion
- auth user deletion may remove membership relationships
- provider IDs do not participate in canonical identity
- profiles were not invented outside the frozen domain model
- later commerce, inventory, forecasting, action, billing and AI tables were not prematurely created

Database verification:

- local migration rebuild PASS
- remote migration applied and synchronized
- local migration version: 20261009090000
- remote migration version: 20261009090000
- local schema and remote schema materially match
- Supabase database lint: no schema errors
- cross-organization ownership attack rejected by locations_store_ownership_fk
- RLS enabled on organizations
- RLS enabled on organization_members
- RLS enabled on stores
- RLS enabled on locations
- zero M1.3 RLS policies before M1.5

Verification at M1.3 closure:

- focused schema tests: 14 PASS
- typecheck PASS
- lint PASS
- full suite: 114 test files / 1146 tests PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M1.4 — Organization membership + provisioning

### M1.4 completion

Status: PASS

Implemented organization membership and provisioning foundation:

- authenticated current-user provisioning boundary
- PostgreSQL SECURITY DEFINER provisioning RPC
- provisioning identity derived exclusively from auth.uid()
- one initial organization created for an unprovisioned authenticated user
- initial organization name `My Organization`
- initial organization currency `XXX`
- initial organization timezone `UTC`
- owner membership created for the authenticated user
- repeat provisioning is idempotent
- advisory locking protects concurrent provisioning
- uniqueness constraints protect duplicate membership creation
- application provisioning wrapper for authenticated flows
- authentication callback invokes provisioning only after successful authentication
- no client-supplied user id establishes provisioning ownership
- no first/default organization selection introduced

Security invariants:

- authentication identifies the user but does not itself authorize tenant access
- provisioning derives the user only from trusted authenticated database context
- callers cannot provision another user by supplying a user id
- organization membership remains the authorization bridge
- initial provisioning does not bypass RLS for ordinary application reads
- privileged provisioning scope remains narrow and explicit
- no provider identifiers establish tenant ownership
- no inventory, forecasting, decision, AI, billing or provider synchronization behavior is introduced

Idempotency invariants:

- first provisioning creates exactly one organization
- first provisioning creates exactly one owner membership
- subsequent provisioning calls do not create another organization
- subsequent provisioning calls do not create another membership
- concurrent provisioning is serialized safely
- database uniqueness constraints remain the final duplicate-safety boundary

Verification at M1.4 closure:

- provisioning architecture tests PASS
- authenticated provisioning verified
- repeated provisioning verified idempotent
- owner membership verified
- canonical defaults verified
- typecheck PASS
- lint PASS
- full test suite PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M1.5 — RLS + tenant enforcement


### M1.5 completion

Status: PASS

Implemented RLS and tenant enforcement:

- authenticated membership-backed organization visibility
- authenticated self-only organization membership visibility
- authenticated membership-backed store visibility
- authenticated membership-backed location visibility
- anonymous tenant-table access denied
- direct authenticated client mutations denied for foundation tenant tables
- predictable RLS policy names
- no implicit first/default organization behavior
- no privileged RLS bypass helper introduced
- RLS remains enabled on all canonical foundation tables
- foundation RLS implementation documentation
- foundation RLS architecture tests

Security invariants:

- authentication alone does not grant organization access
- organization_members remains the tenant authorization bridge
- users may read only their own membership rows directly
- organization reads require matching authenticated membership
- store reads require matching authenticated organization membership
- location reads require matching authenticated organization membership
- cross-organization reads fail closed
- malicious client-supplied organization identifiers do not grant access
- direct client membership mutation is denied
- direct client organization mutation is denied
- anonymous tenant access is denied
- tenant isolation remains enforced by RLS independently of application filtering
- relational ownership remains enforced separately by PostgreSQL constraints

Live adversarial verification:

- User A can read Org A
- User A cannot read Org B
- User A sees only own membership
- User A sees only Store A
- User A sees only Location A
- User B can read Org B
- User B sees only Store B
- User B sees only Location B
- User A querying Org B Store rows returns no rows
- User A querying Org B Location rows returns no rows
- direct organization INSERT denied
- direct membership UPDATE denied
- direct organization DELETE denied
- anonymous organization SELECT denied

Database verification:

- exactly 4 foundation RLS policies installed
- organizations RLS enabled
- organization_members RLS enabled
- stores RLS enabled
- locations RLS enabled
- Supabase database lint PASS
- local database reset PASS

Verification at M1.5 closure:

- typecheck PASS
- lint PASS
- focused RLS architecture tests PASS
- full test suite PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M1.6 — Authenticated application shell

### M1.6 completion

Status: PASS

Implemented authenticated application shell:

- protected authenticated `/app` boundary
- dedicated `/login` authentication surface
- verified Supabase authentication
- explicit organization selection
- no first/default organization fallback
- authorized `/app/[organizationId]` workspace
- membership-backed organization resolution
- fail-closed foreign-organization access
- responsive desktop sidebar
- responsive mobile application header
- portal-based mobile navigation drawer
- responsive organization switching
- authenticated identity and role visibility
- POST-only sign out
- honest no-data foundation state
- browser-safe explicit NEXT_PUBLIC Supabase configuration
- application-shell architecture tests

Responsive UX foundation:

- permanent navigation on desktop
- off-canvas navigation on mobile/tablet
- opaque mobile drawer and dimmed backdrop
- body scroll locked while drawer is open
- drawer scroll support on short screens
- Escape and backdrop close behavior
- no horizontal overflow
- mobile navigation remains reachable
- touch-friendly navigation controls
- no fabricated inventory or decision data

Security invariants:

- authentication does not establish tenant authorization
- organization id remains a requested selector only
- membership matches authenticated user and organization
- role derives from trusted membership persistence
- no implicit tenant fallback exists
- no browser-controlled tenant authority
- no privileged Supabase admin client in the application shell
- unauthorized organization access fails closed
- sign out remains POST-only

Verification at M1.6 closure:

- typecheck PASS
- lint PASS
- focused M1.6 tests: 14 PASS
- full suite: 117 test files / 1185 tests PASS
- production build PASS
- git diff check PASS
- responsive mobile browser verification PASS

Next allowed sub-milestone:

M1.7 — Error + observability boundary

### M1.7 completion

Status: PASS

Implemented application error and observability boundary:

- explicit application error taxonomy
- expected / operational / programming error categories
- stable application error codes
- internal versus public error separation
- request / correlation ID validation and generation
- structured application observability context
- trusted user / organization / store correlation fields
- structured application log events
- defensive secret and credential redaction
- bearer-token and JWT-looking value redaction
- safe public error payloads
- typed tenant persistence failures
- structured authentication callback failure logging
- structured sign-out failure logging
- request-id propagation on sign-out responses
- typed authenticated application persistence failures
- responsive application error boundary
- no monitoring-vendor dependency
- application observability architecture documentation

Security and privacy invariants:

- public errors never expose internal exception messages
- public errors never expose stack traces
- observability never establishes authentication or tenant authorization
- tenant identifiers are logged only when already trusted
- raw client organization identifiers do not become trusted through logging
- access tokens are not emitted
- refresh tokens are not emitted
- Authorization headers are not emitted
- cookies are not emitted
- passwords are not emitted
- service-role credentials are not emitted
- provider credentials are not emitted
- raw sessions and provider payloads are not observability-owned
- authentication callback authorization codes are not logged
- observability has no inventory, forecasting or decision ownership

Live verification:

- signed-out `/app` remains protected
- authorized organization workspace loads normally
- unauthorized organization access remains fail-closed
- POST sign-out removes authenticated application access
- controlled workspace failure returns HTTP 500
- responsive StoreAgent error boundary renders
- internal controlled exception text is not exposed in UI
- stack traces are not exposed in UI
- safe Next.js error reference/digest is displayed
- responsive error UI verified at mobile width

Verification at M1.7 closure:

- typecheck PASS
- lint PASS
- focused M1.7 tests: 26 PASS
- full test suite PASS
- production build PASS
- git diff check PASS

Next allowed sub-milestone:

M1.8 — Foundation integration + adversarial tests

### M1.8 completion

Status: PASS

Implemented foundation integration and adversarial verification:

- deterministic cross-layer M1 integration matrix
- explicit adversarial tenant threat matrix
- authentication-to-tenant-resolution composition checks
- explicit organization selection verification
- no first/default organization fallback verification
- browser privileged-credential boundary verification
- service-role trusted-scope verification
- safe public-error integration verification
- observability redaction integration verification
- live PostgreSQL RLS adversarial verification
- live anonymous isolation verification
- live authenticated cross-organization isolation verification
- live direct mutation denial verification
- live foundation RLS policy verification
- live provisioning idempotency verification
- live signed-out application protection verification
- live authorized organization access verification
- live foreign organization denial verification
- live nonexistent organization denial verification
- live post-signout stale workspace denial verification

Security invariants verified:

- authentication does not establish organization authorization
- requested organization id remains only a selector
- organization membership remains the authorization bridge
- user and organization must both match trusted persistence
- foreign organization identifiers do not grant access
- foreign store identifiers do not grant access
- known provider/resource identifiers do not establish tenant ownership
- no implicit first-membership fallback exists
- anonymous users cannot read tenant data
- authenticated browser clients cannot directly mutate foundation tenant tables
- privileged execution still requires trusted tenant scope
- RLS remains enabled on organizations
- RLS remains enabled on organization_members
- RLS remains enabled on stores
- RLS remains enabled on locations
- exactly four foundation RLS policies remain installed
- repeated provisioning remains idempotent
- repeated provisioning produces exactly one owner membership
- repeated provisioning produces exactly one organization
- provisioning defaults remain canonical
- public errors do not expose internal exception messages
- public errors do not expose stack traces
- observability does not establish authorization
- secrets, tokens, cookies and credentials remain redacted

Live verification:

- signed-out `/app` returns redirect to `/login?next=/app`
- authorized workspace loads successfully
- foreign organization access redirects fail-closed
- nonexistent organization access redirects fail-closed
- sign-out returns 303
- revisiting a previously authorized workspace after sign-out redirects to login

Verification at M1.8 closure:

- typecheck PASS
- lint PASS
- focused M1.8 tests: 3 files / 32 tests PASS
- full suite: 126 test files / 1243 tests PASS
- production build PASS
- Supabase DB lint PASS
- live PostgreSQL adversarial checks PASS
- provisioning idempotency checks PASS
- live HTTP/browser adversarial checks PASS
- git diff check PASS

Next allowed sub-milestone:

M1.9 — M1 gate

### M1.9 completion

Status: PASS

M1 foundation gate verified:

- M1.1 runtime + environment + Supabase boundary PASS
- M1.2 authentication + session foundation PASS
- M1.3 canonical foundation schema PASS
- M1.4 organization membership + provisioning PASS
- M1.5 RLS + tenant enforcement PASS
- M1.6 authenticated application shell PASS
- M1.7 error + observability boundary PASS
- M1.8 foundation integration + adversarial verification PASS

Final security gate:

- authentication uses verified `getClaims()` server-side
- `getSession()` is not used as the server authorization boundary
- authentication never substitutes for tenant authorization
- organization remains the primary tenant boundary
- organization selection remains explicit
- no first/default organization fallback exists
- membership matches authenticated user and requested organization
- provider identifiers do not establish tenant ownership
- browser code has no privileged Supabase credentials
- service-role execution requires trusted tenant scope
- RLS independently enforces tenant isolation
- anonymous tenant access fails closed
- cross-organization access fails closed
- direct browser mutations of foundation tenant tables are denied
- provisioning is idempotent
- public errors do not expose internal details
- observability does not establish authorization
- secrets and credentials remain outside public observability output

Final M1 verification:

- typecheck PASS
- lint PASS
- full suite: 126 test files / 1243 tests PASS
- production build PASS
- Supabase DB lint PASS
- live PostgreSQL adversarial verification PASS
- provisioning idempotency verification PASS
- live authenticated and unauthenticated HTTP verification PASS
- privileged browser credential scan PASS
- server authentication boundary scan PASS
- implicit tenant fallback scan PASS
- git diff check PASS

M1 gate: PASS

The StoreAgent foundation is now approved for the next roadmap milestone.

## M2 — Canonical commerce persistence

- [x] M2.1 Canonical persistence contract + table matrix
- [x] M2.2 Products + variants
- [x] M2.3 Inventory snapshots
- [x] M2.4 Orders + order items + returns/refunds
- [x] M2.5 Suppliers + supplier products + purchase orders
- [x] M2.6 Provider-neutral integration identity + bindings
- [x] M2.7 RLS + relational/adversarial verification
- [x] M2.8 M2 gate

M2 implementation rules:

- M0 canonical domain ownership remains frozen.
- M1 authentication, tenancy, RLS and observability boundaries remain frozen.
- Organization remains the primary tenant boundary.
- Canonical identity remains independent of provider identity.
- Provider identifiers never establish tenant ownership.
- Unknown commercial values remain NULL and never silently become zero.
- Persisted monetary values preserve exact decimal semantics.
- V1 inventory quantities remain whole units.
- Cross-organization relationships must be impossible at the database layer.
- Cross-store relationships must be impossible where store ownership applies.
- History records are append-oriented unless an explicit canonical contract says otherwise.
- M2 does not implement derived metrics, forecasting, decisions, AI explanation, CSV parsing, Shopify synchronization or billing.

### M2.1 completion

Status: PASS

Frozen canonical persistence contract:

- M2 persisted entity scope explicitly defined
- deferred derived entity scope explicitly defined
- product and product-variant persistence ownership defined
- inventory snapshot history ownership defined
- orders, order items and returns/refunds ownership defined
- supplier and purchase-order persistence ownership defined
- provider-neutral integration and binding ownership defined
- organization/store relational ownership requirements defined
- NULL-versus-zero semantics explicitly preserved
- exact monetary persistence semantics explicitly preserved
- provider binding identity key frozen
- provider external identifiers remain case-preserving
- provider identifiers remain non-authoritative for tenancy
- RLS table classifications defined
- history/append semantics defined
- composite ownership FK strategy defined
- no M2 database migration introduced
- no M2 product UI introduced
- no provider synchronization introduced

Deferred from M2 persistence:

- DataQualityIssue -> M4
- SkuDailyMetric -> M5
- ForecastRun -> M6
- SkuForecast -> M6
- InventoryAction -> M7
- ActionEvent -> M7 / outcome history

Verification at M2.1 closure:

- typecheck PASS
- focused M2.1 tests: 2 files / 20 tests PASS
- lint PASS
- git diff check PASS
- M2 migration absence verified
- persistence architecture contract verified

Next allowed sub-milestone:

M2.2 — Products + variants

### M2.2 completion

Status: PASS

Implemented canonical product persistence:

- `products`
- `product_variants`
- organization ownership on products
- store ownership on products
- organization ownership on variants
- store ownership on variants
- product ownership on variants
- composite organization/store/product ownership enforcement
- product status constraint
- product-variant status constraint
- required non-blank product title
- required non-blank SKU
- nullable brand
- nullable category
- nullable barcode
- nullable variant title
- nullable cost amount
- nullable selling price amount
- nullable currency
- exact PostgreSQL numeric money persistence
- non-negative known commercial amounts
- duplicate SKU policy preserved
- updated_at triggers
- indexes for tenant/store/product access
- RLS enabled fail-closed
- M2.7 read policies intentionally deferred

Relational invariants verified:

- product cannot reference a store from another organization
- variant cannot reference a product from another organization
- variant cannot cross store ownership
- product and variant ownership are enforced by PostgreSQL composite foreign keys
- canonical UUID identity remains separate from provider identity

Value semantics verified:

- unknown cost remains NULL
- unknown selling price remains NULL
- unknown currency remains NULL
- known zero cost remains zero
- known zero selling price remains zero
- NULL remains distinct from zero
- negative known commercial values are rejected
- duplicate SKUs remain permitted

Live database verification:

- clean local database reset PASS
- M2.2 migration applied from zero PASS
- Supabase DB lint PASS
- relational/adversarial SQL PASS
- product RLS enabled
- product_variant RLS enabled
- zero M2.7 product policies installed
- authenticated product reads remain fail-closed before M2.7

Verification at M2.2 closure:

- typecheck PASS
- focused M2 tests PASS
- lint PASS
- database reset PASS
- Supabase DB lint PASS
- adversarial SQL PASS
- git diff check PASS

Next allowed sub-milestone:

M2.3 — Inventory snapshots

### M2.3 completion

Status: PASS

Implemented canonical inventory history:

- `inventory_snapshots`
- organization ownership
- store ownership
- location ownership
- product-variant ownership
- composite organization/store/location enforcement
- composite organization/store/variant enforcement
- observed timestamp
- nullable on-hand quantity
- nullable available quantity
- nullable committed quantity
- nullable incoming quantity
- provider source provenance
- created_at only; no mutable updated_at state
- RLS enabled fail-closed
- M2.7 read policies intentionally deferred

Strengthened foundation ownership:

- `locations` now exposes composite
  `(organization_id, store_id, id)` ownership
  for downstream store-scoped canonical foreign keys

History semantics verified:

- inventory observations are append-oriented
- later observation creates another row
- existing snapshots cannot be updated
- existing snapshots cannot be deleted
- historical observations remain preserved

Value semantics verified:

- NULL means unknown
- zero means known zero
- NULL remains distinct from zero
- known quantities use whole-unit integer persistence
- known quantities must be non-negative
- invalid provider source values are rejected

Relational invariants verified:

- snapshot cannot use a location from another organization
- snapshot cannot use a location from another store
- snapshot cannot use a variant from another organization
- location and variant ownership are enforced structurally by PostgreSQL

Live database verification:

- clean migration chain applied through M2.3
- Supabase DB lint PASS
- relational/adversarial SQL PASS
- inventory snapshot RLS enabled
- zero M2.7 inventory policies installed
- authenticated inventory reads remain fail-closed before M2.7

Verification at M2.3 closure:

- typecheck PASS
- focused M2 tests PASS
- lint PASS
- Supabase DB lint PASS
- adversarial SQL PASS
- direct RLS/policy verification PASS
- location composite ownership constraint verified
- git diff check PASS

Next allowed sub-milestone:

M2.4 — Orders + order items + returns/refunds

### M2.4 completion

Status: PASS

Implemented canonical demand-history persistence:

- `orders`
- `order_items`
- `return_refunds`
- organization ownership on every row
- store ownership on every row
- composite order ownership for order items
- composite variant ownership
- optional location ownership
- composite return/refund ownership against order + variant + order item
- exact PostgreSQL numeric monetary persistence
- nullable unknown monetary values
- required order currency
- nullable order-item and return/refund currency
- whole-unit order quantities
- nullable whole-unit returned quantities
- provider source provenance
- frozen order-status vocabulary
- non-unique external-reference indexing
- RLS enabled fail-closed
- M2.7 policies intentionally deferred

Ownership invariants verified:

- order item cannot reference an order from another organization
- order item cannot reference a variant from another organization
- order item cannot reference a location from another store
- return/refund cannot claim an order-item/variant mismatch
- canonical order ownership cannot be reassigned
- canonical order-item identity cannot be reassigned
- canonical return/refund identity cannot be reassigned

Reconciliation semantics verified:

- legitimate order status reconciliation remains allowed
- provider reconciliation cannot silently reassign tenant/store ownership
- provider external reference remains evidence, not canonical tenant identity

Value semantics verified:

- unknown gross amount remains NULL
- unknown discount amount remains NULL
- unknown net amount remains NULL
- NULL monetary value remains distinct from zero
- negative returned quantity is rejected
- source commercial money is not over-constrained by M2

Live database verification:

- clean migration chain applied through M2.4
- Supabase DB lint PASS
- M2.4 adversarial SQL PASS
- orders RLS enabled
- order_items RLS enabled
- return_refunds RLS enabled
- zero M2.7 policies installed
- authenticated demand-history access remains fail-closed before M2.7

Verification at M2.4 closure:

- typecheck PASS
- focused M2 tests PASS
- lint PASS
- clean local DB reset PASS
- Supabase DB lint PASS
- adversarial SQL PASS
- direct RLS/policy verification PASS
- git diff check PASS

Next allowed sub-milestone:

M2.5 — Suppliers + supplier products + purchase orders

### M2.5 completion

Status: PASS

Implemented canonical supplier and purchase-order persistence:

- `suppliers`
- `supplier_products`
- `purchase_orders`
- `purchase_order_items`
- organization-scoped supplier ownership
- organization-scoped supplier-product relationships
- store-scoped purchase-order ownership
- store-scoped purchase-order-item ownership
- composite supplier ownership
- composite variant ownership
- optional destination-location ownership
- exact PostgreSQL numeric commercial values
- nullable supplier logistics/commercial truth
- nullable purchase-order supplier and timing truth
- whole-unit purchase-order quantities
- frozen purchase-order status vocabulary
- provider source provenance
- updated_at triggers on mutable current-state records
- RLS enabled fail-closed
- M2.7 policies intentionally deferred

Foundation ownership strengthened:

- `product_variants` now exposes
  `(organization_id, id)`
  for organization-scoped supplier-product ownership

Supplier semantics verified:

- supplier remains organization-scoped
- no store ownership invented for suppliers
- default lead time may be NULL
- known default lead time must be >= 0
- supplier SKU may be NULL
- supplier unit cost may be NULL
- supplier currency may be NULL
- supplier-product lead time may be NULL
- known lead time must be >= 0
- minimum order quantity may be NULL
- known minimum order quantity must be > 0
- pack size may be NULL
- known pack size must be > 0
- preferred remains explicit boolean state

Purchase-order semantics verified:

- supplier may be NULL when source truth is incomplete
- external reference may be NULL
- ordered_at may be NULL
- expected_at may be NULL
- received_at may be NULL
- currency may be NULL
- received quantity may be NULL
- zero received quantity remains distinct from NULL
- destination location may be NULL
- provider source remains provenance only

Relational invariants verified:

- supplier-product cannot reference a supplier from another organization
- supplier-product cannot reference a variant from another organization
- purchase order cannot reference a supplier from another organization
- purchase-order item cannot cross organization/store variant ownership
- purchase-order item cannot cross destination-location ownership
- purchase-order ownership cannot be reassigned
- supplier-product canonical identity cannot be reassigned
- purchase-order-item canonical identity cannot be reassigned
- same-organization supplier reconciliation remains allowed

Live database verification:

- clean migration chain applied through M2.5
- Supabase DB lint PASS
- M2.5 adversarial SQL PASS
- suppliers RLS enabled
- supplier_products RLS enabled
- purchase_orders RLS enabled
- purchase_order_items RLS enabled
- zero M2.7 policies installed
- authenticated supplier/PO access remains fail-closed before M2.7

Verification at M2.5 closure:

- typecheck PASS
- focused M2 tests: 6 files / 86 tests PASS
- lint PASS
- clean local DB reset PASS
- Supabase DB lint PASS
- adversarial SQL PASS
- direct RLS/policy verification PASS
- git diff check PASS

Next allowed sub-milestone:

M2.6 — Provider-neutral integration identity + bindings

### M2.6 completion

Status: PASS

Implemented provider-neutral integration persistence:

- `integrations`
- `provider_bindings`
- `sync_runs`
- organization-owned integrations
- optional store-scoped integrations
- provider-neutral provider vocabulary
- non-secret integration configuration
- durable provider-binding identity
- polymorphic canonical binding validation
- sync-run idempotency identity
- nullable sync cursors
- explicit sync counts
- reconciliation metadata
- operational sync history
- RLS enabled fail-closed
- M2.7 policies intentionally deferred

Provider-binding identity frozen as:

- `organization_id`
- `integration_id`
- `provider`
- `resource_type`
- `external_id`

Provider identity semantics verified:

- external IDs remain case-preserving
- surrounding whitespace aliases are rejected
- external parent ID is not part of binding uniqueness
- canonical entity ID remains separate from provider external ID
- provider identifiers never establish tenant ownership
- provider must match the trusted integration provider
- integration must already belong to the same organization
- durable provider identity cannot silently rebind to another canonical entity

Canonical-target ownership verified:

- provider bindings validate canonical targets against canonical tables
- cross-organization canonical binding is rejected
- store-scoped integration cannot bind store-scoped canonical entities from another store
- organization-scoped integration remains organization-wide
- bound canonical entities cannot be deleted while bindings exist

Sync-run semantics verified:

- explicit idempotency key
- duplicate sync idempotency identity rejected
- cross-organization integration linkage rejected
- store-scoped sync run must match integration store
- lifecycle reconciliation remains allowed
- tenant/integration/idempotency identity cannot be reassigned
- sync runs cannot be deleted
- cursor before/after remain nullable
- reconciliation metadata remains separate from canonical identity

Security and credential boundary verified:

- integration configuration stores non-secret configuration only
- access tokens are not persisted
- refresh tokens are not persisted
- API keys are not persisted
- client secrets are not persisted
- provider identity never establishes authorization

Live database verification:

- clean migration chain applied through M2.6
- Supabase DB lint PASS
- M2.6 adversarial SQL PASS
- integrations RLS enabled
- provider_bindings RLS enabled
- sync_runs RLS enabled
- zero M2.7 policies installed
- authenticated integration access remains fail-closed before M2.7
- durable provider-binding unique constraint present

Verification at M2.6 closure:

- typecheck PASS
- focused M2/provider tests PASS
- lint PASS
- clean local DB reset PASS
- Supabase DB lint PASS
- adversarial SQL PASS
- direct RLS/policy verification PASS
- provider-binding durable identity verification PASS
- git diff check PASS

Next allowed sub-milestone:

M2.7 — RLS + relational/adversarial verification

### M2.7 completion

Status: PASS

Implemented canonical M2 browser/RLS enforcement across all 13 M2 tables:

- `products`
- `product_variants`
- `inventory_snapshots`
- `orders`
- `order_items`
- `return_refunds`
- `suppliers`
- `supplier_products`
- `purchase_orders`
- `purchase_order_items`
- `integrations`
- `provider_bindings`
- `sync_runs`

Browser privilege boundary:

- anonymous role has zero M2 table privileges
- authenticated role has SELECT only
- authenticated INSERT denied
- authenticated UPDATE denied
- authenticated DELETE denied
- authenticated TRUNCATE denied
- authenticated REFERENCES denied
- authenticated TRIGGER denied
- no browser mutation policy introduced

RLS policy model:

- exactly one authenticated SELECT policy per M2 table
- exactly 13 M2 SELECT policies installed
- organization membership remains the authorization bridge
- `auth.uid()` is matched against `organization_members.user_id`
- row `organization_id` determines tenant visibility
- store IDs do not establish authorization
- provider IDs do not establish authorization
- integration IDs do not establish authorization
- external IDs do not establish authorization

Current-state protection verified:

- products tenant-isolated
- product variants tenant-isolated
- suppliers tenant-isolated
- supplier-product relationships tenant-isolated
- purchase orders tenant-isolated
- purchase-order items tenant-isolated
- integrations tenant-isolated
- provider bindings tenant-isolated

Historical protection verified:

- inventory snapshot history tenant-isolated
- order history tenant-isolated
- order-item history tenant-isolated
- return/refund history tenant-isolated
- sync-run history tenant-isolated
- ordinary authenticated clients cannot mutate history

Adversarial verification:

- two independent tenant graphs created
- user A sees own tenant data
- user A cannot see tenant B data
- authenticated non-member sees zero M2 rows
- anonymous M2 access denied
- authenticated current-state mutation denied
- authenticated history mutation denied
- RLS independently enforces organization isolation

Defense-in-depth verification:

- PostgreSQL ACLs restrict authenticated clients to SELECT
- RLS independently filters SELECT visibility
- canonical composite foreign keys enforce relational ownership
- service-role boundary remains separate from browser authorization
- no privileged RLS bypass helper introduced

Live database verification:

- all 13 M2 tables have RLS enabled
- exactly 13 M2 SELECT policies installed
- every policy targets `authenticated`
- zero anonymous M2 grants
- exactly 13 authenticated SELECT grants
- zero authenticated non-SELECT M2 grants
- M2.7 cross-tenant adversarial SQL PASS
- transaction rollback PASS

Verification at M2.7 closure:

- typecheck PASS
- focused tenancy/RLS/M2 tests PASS
- lint PASS
- clean local database reset PASS
- Supabase DB lint PASS
- M2.7 adversarial SQL PASS
- direct ACL verification PASS
- direct RLS policy verification PASS
- git diff check PASS

Next allowed sub-milestone:

M2.8 — M2 final gate

### M2.8 completion

Status: PASS

M2 canonical persistence gate closed.

Implemented and verified:

- canonical products
- canonical product variants
- immutable inventory snapshots
- orders
- order items
- return/refund evidence
- suppliers
- supplier-product relationships
- purchase orders
- purchase-order items
- provider-neutral integrations
- durable provider bindings
- sync-run operational history
- organization/store relational ownership
- provider identity separation
- tenant RLS enforcement
- browser ACL hardening

Canonical persistence invariants:

- organization remains the primary tenant boundary
- canonical UUID identity remains independent of provider identity
- provider identifiers never establish tenant ownership
- provider binding identity is scoped by organization + integration + provider + resource type + external ID
- provider external IDs remain case-preserving
- provider binding cannot silently rebind to another canonical entity
- cross-organization relationships are structurally rejected
- cross-store relationships are structurally rejected where store ownership applies
- unknown commercial values remain NULL
- NULL remains distinct from known zero
- persisted money uses exact PostgreSQL numeric semantics
- V1 inventory and commerce quantities remain whole units
- immutable/history records preserve historical truth
- history is not destructively converted into current state

RLS and browser security:

- all 13 M2 tenant tables have RLS enabled
- exactly 13 authenticated SELECT policies installed
- organization membership is the authorization bridge
- anon has zero M2 table privileges
- authenticated has SELECT-only M2 table privileges
- authenticated INSERT denied
- authenticated UPDATE denied
- authenticated DELETE denied
- authenticated history mutation denied
- authenticated non-member sees zero M2 tenant rows
- cross-tenant reads are blocked by RLS
- provider IDs, external IDs, integration IDs and store IDs do not establish authorization
- service-role remains outside browser authority and still requires trusted tenant scope

M2.8 full repository verification:

- `npm run check` PASS
- typecheck PASS
- lint PASS
- full Vitest suite PASS
- 134 test files PASS
- 1366 tests PASS
- production Next.js build PASS
- clean local Supabase reset PASS
- migration chain applies from zero through M2.7
- Supabase DB lint PASS
- M2.7 live cross-tenant adversarial SQL PASS
- transaction rollback PASS
- git diff check PASS

Historical M2 adversarial-suite note:

- M2.2 through M2.6 SQL adversarial suites continue to pass their relational and value-semantics checks
- those milestone-local scripts intentionally assert that M2.7 policies do not yet exist
- when executed against the fully migrated M2.7 database, each therefore stops at its historical "M2.7 policies introduced prematurely" assertion
- this is expected later-schema behavior and is not an M2 regression
- M2.7 adversarial SQL is the authoritative live RLS verification for the final M2 schema

Explicitly still deferred:

- CSV parsing / ingestion pipeline -> M3
- DataQualityIssue persistence -> M4
- derived SKU metrics -> M5
- forecasting persistence/execution -> M6
- deterministic inventory actions -> M7
- AI explanation -> later milestone
- Shopify synchronization -> M10
- billing -> later milestone

M2 final result:

PASS — canonical persistence, relational ownership, provider identity, history semantics, and tenant isolation are frozen and verified.

Next milestone:

M3 — CSV ingestion

- [x] M3.1 CSV ingestion contract + import matrix
- [ ] M3.2 CSV file parsing + structural validation
- [ ] M3.3 Product + variant CSV normalization
- [ ] M3.4 Inventory CSV ingestion
- [ ] M3.5 Orders + order-items CSV ingestion
- [ ] M3.6 Supplier + purchase-order CSV ingestion
- [ ] M3.7 Idempotency + provider-binding reconciliation
- [ ] M3.8 Quarantine + partial-failure accounting
- [ ] M3.9 End-to-end CSV import orchestration
- [ ] M3.10 M3 adversarial/final gate\n

### M3.1 completion

Status: PASS

Frozen CSV ingestion architecture:

- CSV is a provider boundary
- CSV does not redefine canonical commerce semantics
- canonical UUID identity remains separate from CSV/provider identity
- CSV source identity resolves through ProviderBinding
- row number is diagnostic provenance only
- file name is not durable commercial identity
- upload timestamp is not durable commercial identity
- explicit merchant mapping is required
- unmapped canonical fields are never guessed from similar column names
- duplicate canonical-field mappings are rejected
- duplicate source-column mappings are rejected
- blank mapped cells remain unknown
- blank numeric cells never silently become zero
- explicit zero remains distinct from NULL
- exact monetary semantics remain frozen
- V1 quantities remain whole units

Stable identity rules:

- merchant-mapped external identity is preferred when present
- deterministic composite identity is allowed only where the resource contract permits it
- product-variant SKU fallback remains deterministic
- row number is never a successful identity fallback
- missing stable identity quarantines the row
- identity is never guessed
- CSV external identity remains case-preserving

Provider-binding replay rules:

- normalized provider-binding identity is resolved before canonical creation
- existing binding to same canonical entity is idempotent/reconciliation path
- missing binding may create canonical entity + first binding atomically
- binding conflicts fail closed
- provider identity cannot silently rebind canonical ownership
- external parent identity remains metadata rather than hidden uniqueness

Current-state/history behavior:

- current-state records may reconcile when identity is already proven
- immutable/history evidence remains append-oriented
- inventory observations append new snapshots
- historical tenant/store ownership is never reassigned by CSV replay

Sync-run accounting:

- every operational CSV import belongs to a SyncRun
- discovered/imported/updated/skipped/quarantined/failed counts remain explicit
- each row receives exactly one terminal disposition
- SyncRun identity does not establish tenant ownership
- trusted organization/integration scope must already be resolved

Quarantine/failure semantics:

- source-validation ambiguity quarantines instead of guessing
- provider-binding conflict quarantines
- invalid quantities/money may quarantine
- ambiguous parent relationship quarantines
- durable DataQualityIssue persistence remains deferred to M4
- quarantine remains distinct from infrastructure/persistence failure
- one bad row does not automatically invalidate independent valid rows
- file-level contract failures may fail the whole import

Security boundary:

- CSV content never establishes organization ownership
- CSV content never establishes store authorization
- provider IDs never authorize tenant access
- M2 browser ACL/RLS authority remains unchanged
- ordinary authenticated browser clients do not gain canonical mutation rights
- CSV ingestion is server-side only
- service-role usage still requires explicit trusted tenant scope

M3 scope remains limited:

- no derived metrics
- no forecasting
- no decision generation
- no AI explanation
- no Shopify synchronization
- no billing
- no durable DataQualityIssue persistence
- no operational CSV parser/import route introduced yet

Verification at M3.1 closure:

- typecheck PASS
- 6 focused CSV/provider test files PASS
- 60 focused tests PASS
- lint PASS
- git diff check PASS
- M2 boundaries remain unchanged

Next allowed sub-milestone:

M3.2 — CSV file parsing + structural validation

