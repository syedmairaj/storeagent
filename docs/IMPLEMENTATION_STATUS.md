# StoreAgent Implementation Status

## Active handoff

Project thesis, also recorded in `README.md` and `docs/PROJECT_HANDOFF.md`:

Data determines reality. Deterministic forecasting and inventory logic calculate decisions. AI explains, prioritizes, and communicates those decisions. Merchants approve actions until automation earns trust.

Baseline for this handoff: `main` @ `6136874` (M6 P4d diagnostic reporting; hosted schema closeout through `20261030200000`). Session bootstrap: `docs/PROJECT_HANDOFF.md`. M5.6 operating detail: `docs/M5_6_HANDOFF.md`.

### Roadmap ownership

M4 — Data Quality Foundation — CLOSED

M5 — derived SKU metrics — IN PROGRESS (implementation closed through M5.7 local; hosted worker/rollover runtime still unauthorized; M5.8 gate open)

- M5.1 contract — CLOSED
- M5.2 schema + RLS — CLOSED
- M5.3 contract — CLOSED
- M5.3 sales-aggregate implementation — CLOSED
- M5.4 inventory metrics — CLOSED
- M5.5 persistence/recomputation — CLOSED
- M5.6 orchestration — implementation closed through M5.6D; HTTP workers/scheduler still DISABLED (not a full hosted runtime close)
- M5.6A source-event capture — CLOSED
- M5.6B recompute-request generation — CLOSED
- M5.6C worker orchestration — CLOSED locally; HOSTED SCHEMA DEPLOYED; HOSTED ONE-SHOT RECOMPUTE PATH VERIFIED via M5.6E.4 Stage 3 (HTTP workers still DISABLED; no scheduler).
- M5.6D daily rollover — **CLOSED** for **implementation and native verification** (acceptance D1–D12). HOSTED SCHEMA DEPLOYED (`20261020100000`). E.4 Stage 4 org-scoped rollover ×2 is **supporting hosted evidence**, not full HTTP runtime verification. Hosted multi-store, timezone recovery, and rollover HTTP execution remain **unverified**. ROLLOVER HTTP TRIGGER DISABLED. NO SCHEDULER.
- M5.6E.3 org-scoped claim/recover — IMPLEMENTED; HOSTED SCHEMA DEPLOYED (`20261028100000`); HOSTED ORG-SCOPED CONSUME/CLAIM USED IN CANARY. WORKERS DISABLED.
- M5.6E.4 hosted canary — **CLOSED** (hosted canary verification only: Stages 0–4). Metrics 0/0/7; Stage 4 rollover ×2 verified; final canary queue `queued` dirty=2 claimed=1 intentional (no further E.4 recompute); fingerprint `59d7d64dbcc254544f04cdb81ccff699`; workers OFF by repo configuration (live host env not verified at M6 schema closeout). See `docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md` §0 / §8.
- M5.7 adversarial verification — **CLOSED** for **local adversarial engineering only** (Phases 1–5B on `main` through `312bd9c`). Hosted F1/T4 migrations (`20261028210000`, `20261028220000`) **APPLIED AND VERIFIED ON HOSTED** (schema/grants only). Hosted worker/runtime verification and production activation remain separate and **unauthorized**. Workers / cron / HTTP metric routes remain DISABLED by repo configuration.
- M5.8 final architecture/documentation gate — OPEN (does not block M6 engineering)

M6 — Forecasting — **IN PROGRESS** (owns forecasting). Local P1–P4d implemented/tested/committed through **`6136874`**. **Hosted schema readiness CLOSED** through `20261030200000`. Production forecast operation remains **NOT APPROVED**. See M6 progress section below.

- M6 P1 deterministic orchestrator — IMPLEMENTED; locally verified (`cb5c371`)
- M6 P2a commerce facts adapter — IMPLEMENTED; locally verified (`0df9666`)
- M6 P2b.1 promotion/coverage evidence model — IMPLEMENTED; locally verified (`d363c72`, `210f92d`)
- M6 P2b.2a/b evidence schema, RLS, RPCs, persistence — IMPLEMENTED; locally verified; **hosted schema applied** (`20261030100000`, `20261030110000`)
- M6 P2b.2c.1 merchant attestation boundary — IMPLEMENTED; locally verified (`e76a8cc`)
- M6 P2b.2c.3b coverage correction outbox — IMPLEMENTED; Git committed (`fb160e9`); **hosted `20261030120000` APPLIED AND VERIFIED** (7 correction-outbox triggers; pending=0 at closeout)
- M6 P2c.1 gated forecast sku-demand source snapshot RPC — IMPLEMENTED; Git committed (`92853fa`); **hosted `20261030130000` APPLIED AND VERIFIED**
- M6 P2c.2 gated TypeScript loader — IMPLEMENTED; locally verified (`7f6ba7f`)
- M6 P2c.3 integration/concurrency verification — IMPLEMENTED; locally verified (`7cbd8e9`)
- M6 P3b forecast persistence foundation + adapter — IMPLEMENTED; locally verified (`c915079`, `6e40bbf`); **hosted `20261030140000` APPLIED AND VERIFIED**
- M6 P3d publication foundation, adapter, fresh reader — IMPLEMENTED; locally verified (`091a29c`, `a71faff`, `83c29b0`); **hosted `20261030150000` / `20261030160000` APPLIED AND VERIFIED**
- M6 P4a PIT backtest harness — IMPLEMENTED; locally verified (`d4a91b2`); fixture-only diagnostics
- M6 P4b historical evidence integrity gate — IMPLEMENTED; locally verified (`24fa202`); live historical PIT replay **unsupported**
- M6 P4c evaluation persistence — IMPLEMENTED; locally verified (`f179516`, `42c6111`, `4dfa844`); **hosted `20261030200000` APPLIED AND VERIFIED**; trust flags hard-false
- M6 P4d diagnostic evaluation reporting — IMPLEMENTED; locally verified (`6136874`); pure-TS; hard-false trust; fixture ≠ merchant performance
- M6 hosted schema readiness — **CLOSED** (migrations `100000`, `110000`, `120000`–`160000`, `20261030200000` applied + post-deploy verified on linked project `qlsqminsfdntpqdkhxjx`)
- M6 production forecast operation (persist/publish/eval callers, algorithm approval, automatic publication) — **NOT APPROVED**
- M6 → M7 activation — **BLOCKED** until separate future gates

M7 — Inventory Decisions — NOT STARTED. M7 owns inventory decisions (after forecasting). Product sequence remains M6 forecasting → M7 decisions → approval-gated buying. Preserve Gemini roadmap: REORDER/REDUCE/PROMOTE/WATCH, available-stock planning, multi-location isolation, lead-time, supplier MOQ, approval-gated buying, CSV→Shopify→WooCommerce→Amazon, seven-day trial, premium decision-first UX.

NEXT STEP = **Do not activate production forecast operation.** Hosted M6 schema is closed; production persist/publish/eval callers, algorithm approval, automatic publication, and M7 remain **separate future approvals**. Optional P1: correction-outbox trigger-function EXECUTE defense-in-depth; live hosting env verification for worker flags. M5 worker/rollover HTTP enablement remains a **separate** unauthorized track. DO NOT ENABLE WORKERS / CRON / HTTP METRIC (RECOMPUTE OR ROLLOVER) OR FORECAST WORKERS WITHOUT EXPLICIT SEPARATE APPROVAL. DO NOT CLAIM/RECOMPUTE THE E.4 CANARY GRAIN LEFT `queued` AT `dirty_generation=2` / `claimed_generation=1`. HOSTED SCHEMA DEPLOY DOES **NOT** AUTHORIZE PRODUCTION FORECAST OPERATION, ALGORITHM APPROVAL, OR M7.

M5.5 persistence and recomputation are closed. M5.6A source-event capture and M5.6B recompute-request generation are closed. M5.6C worker orchestration is closed for local implementation and native local Supabase PostgreSQL 17 verification. M5.6D daily rollover is **closed** for implementation and native local Supabase PostgreSQL 17 verification (independent acceptance D1–D12). M5.7 local adversarial engineering is **closed** (see M5.7 closeout below); that closure is **not** hosted worker/runtime readiness. **Hosted schema (M5):** M5.6A–D (`20261020100000` for M5.6D), M5.6E.3 (`20261028100000`), and M5.7 F1/T4 (`20261028210000`, `20261028220000`) are deployed and operator-verified on hosted. **Hosted canary runtime:** M5.6E.4 closed — org-scoped consume/claim, one-shot recompute, and frozen-as_of rollover ×2 verified on the canary org (supporting evidence for M5.6D; not full HTTP rollover runtime verification); foreign fingerprint unchanged; canary request remains intentionally `queued` at `dirty_generation=2` (`claimed_generation=1`, `applied_generation=1`, `attempt_count=0`, lease fields cleared) and was **untouched** by M6 schema deploy. Hosted multi-store, timezone-recovery, and HTTP rollover/recompute execution remain unverified. **Production worker enablement** and hosted metric-worker runtime verification remain separate and unauthorized. Repo configuration keeps workers/cron/HTTP disabled; live hosting env was **not** verified at M6 schema closeout. No scheduler. **Hosted schema (M6):** `20261030100000`, `20261030110000`, `20261030120000`–`20261030160000`, and `20261030200000` **APPLIED AND VERIFIED**. Post-deploy verification: seven correction-outbox triggers installed; outbox pending=0; forecast/publication/current/evaluation hosted row counts=0; no automatic persist/publish/eval activation. Canary runbook: `docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md`. Isolation decision: `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md`. M5 handoff: `docs/M5_6_HANDOFF.md`. Project handoff: `docs/PROJECT_HANDOFF.md`. Incoming quantity, inventory position, and inventory age remain unknown until trustworthy historical evidence exists.

### Owners

M5.1 formula contract: `docs/INVENTORY_FORMULAS.md`, section “M5.1 frozen derived-metric contract”. Domain summary: `docs/DOMAIN_INVARIANTS.md` section 13. Entity: `docs/DOMAIN_MODEL.md` `SkuDailyMetric`. M5.3 aggregation clarifications: `docs/INVENTORY_FORMULAS.md`, section “M5.3 frozen sales-aggregate clarifications”. M5.4 inventory clarifications: `docs/INVENTORY_FORMULAS.md`, section “M5.4 frozen inventory-metric clarifications”.

M5.2 schema closure is the record below. Mutation authority for the table is `docs/SERVICE_ROLE_BOUNDARY.md`. Merchant UI responsiveness is `docs/DESIGN_SYSTEM.md`. M5 has no merchant-facing UI.

M5 must not own forecasts, forecast horizons, stockout or lost-sales estimates, REORDER / REDUCE / PROMOTE / WATCH, decision confidence, recommended order quantity, supplier choice, MOQ, pack adjustment, AI, billing, Shopify-specific logic, or merchant UI.

### M5.2 schema

Migration: `supabase/migrations/20261014100000_m5_2_sku_daily_metrics.sql`

Table: `public.sku_daily_metrics`

Natural key: `organization_id`, `store_id`, `location_id`, `variant_id`, `metric_date`, `algorithm_version`

Security: RLS enabled; authenticated member SELECT only; anon has no access; no browser INSERT, UPDATE, or DELETE. Service-role persistence is the closed M5.5 implementation recorded below. Hosted deployment of that implementation is complete.

Schema behavior: nullable metrics have no zero defaults; the persisted reason-code vocabulary is the exact 16 lowercase codes from the M5.1 contract; `STOCK_COVERAGE_UNKNOWN` is not persisted; `inventory_position` is null unless both components are known; sell-through is bounded 0..1; a null sell-through may have a null reason or the denominator-zero reason; the 30-day dependency constraints are enforced; the row is recomputable, with `updated_at` and no immutability trigger.

Verification: local `db reset` passed; `db lint` passed; schema test 5/5 passed; local and remote migration history are aligned through `20261014100000`; that migration is already applied remotely.

### Operations

Use `npx supabase` for project commands. The global Supabase CLI is 2.90.0 and the project CLI resolved by `npx` is 2.120.0. The older global CLI cannot parse the current config keys `orioledb_version` and `local_smtp`. Do not change `supabase/config.toml` to accommodate the old CLI.

The sections below are the historical milestone log.

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
- [x] M3.2 CSV file parsing + structural validation
- [x] M3.3 Product + variant CSV normalization
- [x] M3.4 Inventory CSV ingestion
- [x] M3.5 Orders + order-items CSV ingestion
- [x] M3.6 Supplier + purchase-order CSV ingestion
- [x] M3.7 Idempotency + provider-binding reconciliation
- [x] M3.8 Quarantine + partial-failure accounting
- [x] M3.9 End-to-end CSV import orchestration
- [x] M3.10 M3 adversarial/final gate\n

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

### M3.2 completion

Status: PASS

Implemented generic deterministic CSV structural parsing:

- accepts string input
- accepts UTF-8 byte input
- rejects malformed UTF-8
- removes leading UTF-8 BOM
- supports LF line endings
- supports CRLF line endings
- recognizes header row
- preserves source header names
- preserves source cell whitespace
- preserves empty cells
- supports quoted fields
- supports delimiters inside quoted fields
- supports escaped double quotes
- supports embedded newlines inside quoted fields
- ignores blank physical records
- preserves logical-record source row number for diagnostics

Structural validation:

- empty CSV rejected
- blank header names rejected
- duplicate header names rejected
- wider rows rejected
- narrower rows rejected
- unterminated quoted fields rejected
- unexpected characters after closing quotes rejected
- quotes inside unquoted fields rejected

Boundary guarantees:

- parser emits generic CsvRow values only
- parser does not trim mapped business values
- parser does not assign provider identity
- parser does not perform merchant field mapping
- parser does not resolve ProviderBinding
- parser does not access Supabase
- parser does not write canonical persistence
- parser does not own product/inventory/order/supplier semantics
- parser does not import metrics
- parser does not import forecasting
- parser does not import decision logic
- parser does not import AI dependencies
- row number remains diagnostic provenance only

Verification at M3.2 closure:

- typecheck PASS
- 5 focused CSV/provider test files PASS
- 61 focused tests PASS
- lint PASS
- git diff check PASS
- no database migration introduced
- no import route introduced
- no UI introduced
- M2 canonical persistence and security boundaries unchanged

Next allowed sub-milestone:

M3.3 — Product + variant CSV normalization

### M3.3 completion

Status: PASS

Implemented deterministic CSV normalization for products and product variants.

Product normalization:

- product adapter must declare resource type `product`
- adapter version must be non-blank
- product requires explicit stable external identity
- product title is required
- product title is never used as durable identity
- optional brand remains NULL when blank or absent
- optional category remains NULL when blank or absent
- product status normalizes only to canonical:
  - active
  - draft
  - archived
- unsupported product status quarantines
- missing required product fields quarantine
- product normalization produces provider candidate data only

Product-variant normalization:

- variant adapter must declare resource type `product_variant`
- positive safe diagnostic row number required
- explicit external ID is preferred
- stable SKU composite identity remains valid fallback when explicit external ID is absent
- SKU remains required canonical data even when external ID exists
- stable parent product external identity is required
- unresolved parent identity quarantines
- external identity case remains preserved
- optional barcode remains NULL when blank or absent
- optional variant title remains NULL when blank or absent
- variant status normalizes only to canonical:
  - active
  - inactive
  - archived
- unsupported variant status quarantines

Commercial semantics:

- exact monetary strings use existing provider-money normalization
- JavaScript floating-point money is not introduced
- redundant decimal zeroes normalize deterministically
- known zero remains exact zero
- blank money remains NULL
- negative commercial money quarantines
- malformed money quarantines
- currency uses canonical three-letter normalization
- currency is required when variant money is supplied
- currency may remain known when monetary amounts are unknown

Provider-result semantics:

- accepted records carry explicit provider identity
- invalid source records quarantine rather than guess
- normalization issues use existing provider issue codes
- canonical candidate payloads contain no diagnostic row number
- normalization does not generate canonical UUIDs
- normalization does not assign organization ownership
- normalization does not assign store ownership
- normalization does not create ProviderBinding records

CSV mapping vocabulary extended explicitly for:

- brand
- category
- costAmount
- sellingPriceAmount

Generic `amount` remains available for later resource adapters and is not
silently overloaded for product-variant commercial fields.

Boundary guarantees:

- parser remains separate from product/variant normalization
- mapping remains explicit
- normalization remains upstream of persistence
- no Supabase dependency introduced
- no database migration introduced
- no canonical persistence writes introduced
- no SyncRun mutation introduced
- no route introduced
- no UI introduced
- no metrics dependency introduced
- no forecasting dependency introduced
- no decision-engine dependency introduced
- no AI dependency introduced

Verification at M3.3 closure:

- typecheck PASS
- 9 focused provider/CSV test files PASS
- 120 focused tests PASS
- lint PASS
- git diff check PASS

Next allowed sub-milestone:

M3.4 — Inventory CSV ingestion

### M3.4 completion

Status: PASS

Implemented deterministic CSV inventory-observation normalization.

Inventory observation model:

- inventory snapshots remain append-only historical evidence
- inventory snapshots do not receive ProviderBinding identity
- durable variant and location resources remain the bindable entities
- inventory observation scope is:
  - variant source identity
  - location source identity
  - observed timestamp
- canonical variant/location UUID resolution remains downstream
- inventory normalization does not assign canonical UUIDs

CSV inventory mapping vocabulary added explicitly:

- variantExternalId
- locationExternalId
- observedAt

Shared CSV mapping contract:

- CsvMappingConfig owns only column mappings
- bindable CsvAdapterConfig extends CsvMappingConfig
- CsvInventoryAdapterConfig extends CsvMappingConfig separately
- mapping helpers no longer require ProviderResourceType
- inventory observations do not invent a fake bindable resource type

Variant relationship semantics:

- explicit variant external identity is preferred
- stable SKU composite identity remains valid fallback
- variant identity case is preserved
- missing stable variant identity quarantines
- variant reference is not silently inferred from mutable product data

Location relationship semantics:

- stable location external identity is required
- location identity case is preserved
- location names are not used as identity
- missing location identity quarantines
- canonical location resolution remains downstream and must fail closed

Timestamp semantics:

- observedAt is required
- timestamp must include explicit timezone
- timezone offsets normalize deterministically to UTC
- impossible or ambiguous timestamps quarantine
- machine-local timezone is never used

Inventory quantity semantics:

- on-hand, available, committed, and incoming remain independent
- no arithmetic is performed between provider quantity fields
- blank quantities remain NULL
- explicit zero remains known zero
- quantities must be non-negative whole units
- negative quantities quarantine
- fractional quantities quarantine
- unsafe quantities quarantine through existing provider helpers
- an observation with all four quantities unknown quarantines
- four explicit zero quantities remain a valid observation

Historical semantics:

- normalization produces an inventory observation candidate only
- no historical snapshot is rewritten
- no snapshot update semantics introduced
- no snapshot delete semantics introduced
- persistence remains append-oriented
- M2 immutable inventory database protections remain unchanged

Boundary guarantees:

- no ProviderBinding is created for inventory snapshots
- no ProviderNormalizationResult bindable-resource contract is misused
- no canonicalEntityId is manufactured
- no organization ownership is assigned
- no store ownership is assigned
- no canonical locationId is assigned
- no canonical variantId is assigned
- no Supabase dependency introduced
- no database migration introduced
- no persistence write path introduced
- no SyncRun mutation introduced
- no import route introduced
- no UI introduced
- no metrics dependency introduced
- no forecasting dependency introduced
- no decision-engine dependency introduced
- no AI dependency introduced

Verification at M3.4 closure:

- typecheck PASS
- 11 focused CSV/provider/schema test files PASS
- 155 focused tests PASS
- lint PASS
- git diff check PASS

Next allowed sub-milestone:

M3.5 — Orders + order-items CSV ingestion

### M3.5 completion

Status: PASS

Implemented deterministic CSV normalization for orders and order items.

Order identity:

- order requires explicit stable externalId
- externalReference remains optional commercial/provider evidence
- externalReference is never promoted into provider identity
- externalReference may be non-unique
- row number is never order identity
- order provider identity remains case-preserving

Order normalization:

- orderedAt is required
- orderedAt requires explicit timezone
- timestamps normalize deterministically to UTC
- order currency is required
- currency uses canonical three-letter normalization
- order status uses the frozen canonical order-status normalizer
- supported canonical statuses remain:
  - pending
  - open
  - completed
  - cancelled
  - refunded
  - partially_refunded
  - unknown
- unsupported/missing provider status maps fail-closed to unknown
- unsupported status is never guessed into completed/open

Order commercial values:

- grossAmount is optional
- discountAmount is optional
- netAmount is optional
- blank money remains NULL
- explicit zero remains exact zero
- malformed money quarantines
- negative commercial money quarantines
- JavaScript floating-point money is not introduced

Order-item identity:

- order item requires explicit stable externalId
- diagnostic CSV row number is never durable identity
- SKU alone is not used as order-item identity
- parent order identity is carried separately as externalParentId
- externalParentId remains relationship provenance, not hidden binding uniqueness

Order-item relationships:

- parent order source identity is required
- variant source identity is required
- explicit variantExternalId is preferred
- stable SKU composite identity remains valid variant fallback
- location source identity remains optional
- unresolved required relationships quarantine
- canonical orderId, variantId, and locationId remain downstream concerns

Order-item quantities:

- quantity is required
- quantity must be a non-negative whole unit
- explicit zero quantity remains valid because canonical M2 permits known zero
- fractional quantities quarantine
- negative quantities quarantine
- unsafe quantities quarantine through existing provider helpers

Order-item commercial values:

- unitPriceAmount is optional
- discountAmount is optional
- unitCostAmount is optional
- currency is optional when all item money is unknown
- currency is required when any item monetary value is supplied
- known monetary zero remains exact zero
- blank monetary values remain NULL
- malformed or negative monetary values quarantine

Persistence/reconciliation boundary:

- normalization creates provider candidates only
- no canonical UUID is generated
- no organization ownership is assigned
- no store ownership is assigned
- no canonical orderId is assigned
- no canonical variantId is assigned
- no canonical locationId is assigned
- no ProviderBinding write occurs
- no canonical order/order-item write occurs
- order reconciliation remains downstream
- immutable ownership relationships remain protected by M2 schema

Scope exclusions:

- return/refund CSV normalization is not included in M3.5
- no metrics calculation
- no sales-velocity calculation
- no forecasting
- no decisions
- no AI
- no UI
- no API route
- no database migration
- no SyncRun mutation

Verification at M3.5 closure:

- typecheck PASS
- 15 focused CSV/provider/schema test files PASS
- 219 focused tests PASS
- lint PASS
- git diff check PASS

Next allowed sub-milestone:

M3.6 — Supplier + purchase-order CSV ingestion

### M3.6 completion

Status: PASS

Implemented deterministic CSV normalization for suppliers, supplier-product relationships, purchase orders, and purchase-order items.

Supplier identity and scope:

- supplier is a bindable ProviderResourceType
- supplier requires explicit stable externalId
- supplier name is mutable descriptive data only
- supplier name is never used as provider identity
- supplier remains organization-scoped
- no store ownership is invented for supplier
- default lead time may be unknown
- supplier currency may be unknown
- supplier email may be unknown
- supplier phone may be unknown
- lead time accepts known zero
- negative/fractional lead time quarantines

Supplier-product relationship:

- supplier_product is not a ProviderResourceType
- supplier_product receives no ProviderBinding
- relationship identity is resolved from supplier + variant
- supplier external identity is required
- variant external identity is required
- explicit variantExternalId is preferred
- stable SKU composite identity remains valid variant fallback
- supplier SKU is optional descriptive/provider data
- unit cost is optional exact decimal data
- currency is required when unit cost is known
- lead time may be unknown
- minimum order quantity may be unknown
- pack size may be unknown
- MOQ must be greater than zero when known
- pack size must be greater than zero when known
- preferred defaults to false when absent
- no canonical supplierId or variantId is created during normalization

Purchase-order identity:

- purchase order is a bindable ProviderResourceType
- PO requires explicit stable externalId
- externalReference remains optional provider/commercial evidence
- externalReference is never promoted into provider identity
- supplier relationship is optional
- supplier external identity is retained separately as relationship provenance

Purchase-order status:

- status normalization uses frozen canonical PurchaseOrderStatus vocabulary
- supported canonical statuses remain:
  - draft
  - submitted
  - confirmed
  - partially_received
  - received
  - cancelled
  - unknown
- unsupported/missing statuses map fail-closed to unknown
- provider normalization does not interpret incoming-stock truth

Purchase-order timestamps:

- orderedAt is optional
- expectedAt is optional
- receivedAt is optional
- supplied timestamps require explicit timezone
- timestamps normalize deterministically to UTC
- malformed/tz-less timestamps quarantine
- missing timestamps remain NULL

Purchase-order currency:

- PO currency remains optional
- known currency uses canonical three-letter normalization
- invalid currency quarantines

Purchase-order-item identity:

- purchase-order item is a bindable ProviderResourceType
- PO item requires explicit stable externalId
- diagnostic CSV row number is never durable identity
- parent PO identity is carried as externalParentId
- externalParentId remains relationship provenance, not hidden binding uniqueness

Purchase-order-item relationships:

- parent PO source identity is required
- variant source identity is required
- explicit variantExternalId is preferred
- stable SKU composite identity remains valid variant fallback
- destination location source identity remains optional
- canonical purchaseOrderId, variantId, and destinationLocationId remain downstream concerns

Purchase-order-item quantities:

- orderedQuantity is required
- orderedQuantity must be a non-negative whole unit
- explicit ordered zero remains structurally valid
- receivedQuantity is optional
- explicit received zero remains known zero
- negative/fractional/unsafe quantities quarantine

Incoming-stock boundary:

- CSV/provider normalization does not calculate valid incoming inventory
- receivedQuantity greater than orderedQuantity is preserved as source evidence
- received > ordered is not rejected during normalization
- deterministic incoming-stock-v1 owns commercial consistency checks
- RECEIVED_EXCEEDS_ORDERED remains a metrics-layer reason code
- unknown PO status remains fail-closed downstream

Purchase-order-item commercial data:

- unitCostAmount is optional
- exact decimal normalization is used
- negative/malformed unit cost quarantines
- currency is required when unit cost is known
- currency may remain NULL when unit cost is unknown

Persistence/reconciliation boundary:

- no canonical UUIDs are generated
- no organization ownership is assigned
- no store ownership is assigned
- no ProviderBinding write occurs
- no supplier-product canonical write occurs
- no supplier canonical write occurs
- no purchase-order canonical write occurs
- no purchase-order-item canonical write occurs
- reconciliation remains downstream in later M3 milestones

Scope exclusions:

- no incoming-stock calculation
- no supplier recommendation logic
- no reorder calculation
- no metrics
- no forecasting
- no decisions
- no AI
- no UI
- no API route
- no database migration
- no SyncRun mutation

Verification at M3.6 closure:

- typecheck PASS
- 17 focused CSV/provider/schema test files PASS
- 232 focused tests PASS
- lint PASS
- git diff check PASS

Next allowed sub-milestone:

M3.7 — Idempotency + provider-binding reconciliation

### M3.7 completion

Status: PASS

Implemented deterministic provider-binding reconciliation planning and SyncRun replay identity.

Provider binding identity:

- durable identity remains:
  - organizationId
  - integrationId
  - provider
  - resourceType
  - externalId
- surrounding external identity whitespace normalizes
- external ID case is preserved
- delimiter-safe JSON-array key construction is reused
- externalParentId remains mutable relationship metadata
- externalParentId is not hidden uniqueness
- sourceMetadata remains mutable reconciliation metadata

Provider binding replay:

- no existing binding => create
- same durable identity + same canonical target => idempotent
- same durable identity + different canonical target => conflict
- unrelated existing binding comparison => rejected
- organization mismatch is rejected
- integration mismatch is rejected
- provider/resource namespace mismatch is rejected
- canonical target is never silently rebound

Metadata reconciliation:

- metadata may reconcile only after durable identity matches
- metadata may reconcile only after canonical target matches
- changed externalParentId is detected as metadata reconciliation
- changed sourceMetadata is detected as metadata reconciliation
- metadata changes never convert a binding conflict into success

Persistence boundary:

- M3.7 remains pure planning/classification
- existing frozen assessProviderBindingReplay() is reused
- existing normalizeProviderBindingIdentity() is reused
- no duplicate binding identity algorithm introduced
- no Supabase dependency introduced
- no database query introduced
- no provider binding insert/update introduced
- persistence retains responsibility for transactional enforcement

SyncRun idempotency:

- SyncRun replay identity is:
  - organizationId
  - integrationId
  - idempotencyKey
- storeId is deliberately not a separate SyncRun replay-key component
- replay identity matches the frozen M2 database uniqueness
- blank trusted scope/idempotency values are rejected
- delimiter-safe JSON-array serialization is used
- no existing logical run => create
- same replay identity => idempotent
- unrelated existing run comparison => rejected
- SyncRun idempotency prevents duplicate operation execution
- SyncRun idempotency does not replace row-level ProviderBinding reconciliation

CSV replay semantics:

- repeated files do not derive canonical current-state identity from file name/hash
- row-level durable identity remains provider-binding based
- file-level idempotency and resource identity solve different problems
- current-state entity duplication prevention remains identity based
- historical append behavior remains resource-specific

Conflict semantics:

- binding conflict remains an expected source/reconciliation condition
- conflict must quarantine/fail closed downstream
- conflict is not last-write-wins
- conflict never reassigns canonicalEntityId
- durable DataQualityIssue persistence remains deferred to M4

Operational disposition boundary:

- M3.7 does not decide imported vs updated terminal row accounting by itself
- canonical write outcome remains necessary to determine imported vs updated
- accepted/skipped/quarantined normalization semantics remain unchanged
- M3.8/M3.9 own later row-level operational accounting/orchestration

Scope exclusions:

- no canonical entity writer
- no ProviderBinding writer
- no SyncRun writer
- no transaction implementation
- no API route
- no UI
- no database migration
- no metrics
- no forecasting
- no decisions
- no AI

Verification at M3.7 closure:

- typecheck PASS
- 10 focused provider/CSV/schema test files PASS
- 124 focused tests PASS
- lint PASS
- git diff check PASS

Next allowed sub-milestone:

M3.8 — Quarantine + partial-failure accounting

### M3.8 completion

Status: PASS

Implemented deterministic CSV row accounting, transient quarantine envelopes, and partial-failure classification.

SyncRun accounting model:

- canonical SyncRunCounts remains:
  - discovered
  - imported
  - updated
  - skipped
  - quarantined
  - failed
- discovered is not a terminal disposition
- discovered increments once when a row enters normalization/accounting
- each discovered row must receive exactly one terminal disposition
- terminal dispositions remain:
  - imported
  - updated
  - skipped
  - quarantined
  - failed
- terminal counts must never exceed discovered
- completed accounting requires terminal total == discovered
- all counts must be non-negative safe integers

Row accounting integrity:

- row number is used only as transient import-local diagnostic identity
- row number is never ProviderBinding identity
- row number is never canonical commerce identity
- duplicate discovery of the same row is rejected
- terminal accounting before discovery is rejected
- assigning a second terminal outcome to the same row is rejected
- one row cannot increment both quarantined and failed
- one row cannot increment imported and updated simultaneously

Quarantine semantics:

- quarantine represents understandable source/reconciliation problems
- normalization problems remain quarantine candidates
- provider-binding conflict remains quarantine
- unresolved relationships remain quarantine
- identity ambiguity remains quarantine
- provider inconsistency remains quarantine
- quarantine does not create guessed canonical entities
- quarantine preserves non-secret provenance:
  - row number
  - provider
  - resource type
  - external ID when known
  - external parent ID when known
  - adapter version
  - reconciliation reason
  - normalization/reconciliation issues
- quarantine metadata is transient in M3
- durable DataQualityIssue persistence remains deferred to M4

Operational failure semantics:

- unexpected operational/persistence errors classify as failed
- expected source-validation conditions must not be promoted to failed
- operational failure classification requires an explicit error code
- row failure classification does not own retry policy
- worker retry/dead-work semantics remain in the worker infrastructure layer

Partial-failure semantics:

- one quarantined row does not automatically fail independent valid rows
- valid independent rows may continue
- row accounting preserves independent terminal outcomes
- tenant authorization is not inferred from another row
- resource consistency requirements may still require orchestration-level abort
- file-level invalid contracts remain whole-import failures for M3.9

File-level failure boundary remains:

- unreadable CSV structure
- missing required header/mapping contract
- invalid trusted integration scope
- invalid resource adapter configuration

These are not row-level quarantine cases.

Transaction boundary:

- M3.8 introduces no transaction implementation
- canonical write atomicity remains deferred to M3.9 persistence orchestration
- canonical entity creation + first ProviderBinding must later be one safe reconciliation unit
- large imports must not be wrapped in one unbounded transaction

SyncRun status boundary:

- M3.8 does not decide final SyncRunStatus
- completed vs completed_with_errors vs failed remains orchestration-owned
- row counts alone do not determine cancellation or whole-import failure
- M3.9 owns final run lifecycle

Scope exclusions:

- no SyncRun writer
- no ProviderBinding writer
- no canonical entity writer
- no database migration
- no service-role access
- no worker retry modification
- no API route
- no UI
- no metrics
- no forecasting
- no decisions
- no AI

Verification at M3.8 closure:

- 12 focused provider/CSV/schema/worker test files PASS
- 140 focused tests PASS
- lint PASS
- git diff check PASS

Next allowed sub-milestone:

M3.9 — End-to-end CSV import orchestration

### M3.9D-E — Durable SyncRun orchestration + whole-import idempotency

Status: PASS

Purpose:

- give every operational CSV import durable SyncRun ownership before row persistence
- prevent exact same-key replay from re-executing D-D row persistence
- preserve append-only inventory history without weakening resource-level ProviderBinding reconciliation
- keep operational import identity separate from canonical commerce identity

Durable SyncRun replay identity remains exactly:

- organizationId
- integrationId
- explicit idempotencyKey

storeId remains trusted execution scope but is deliberately not a separate SyncRun replay-key component.

Idempotency-key boundary:

- idempotencyKey is supplied by the trusted orchestration boundary
- idempotencyKey is operational import identity
- idempotencyKey is not canonical entity identity
- idempotencyKey is not CSV row identity
- idempotencyKey must not be derived casually from file name, row number, upload timestamp, or mutable metadata
- same source content with a new explicit idempotencyKey is a new operational import

Database ownership:

- service-role-only `csv_begin_sync_run(...)`
- service-role-only `csv_complete_sync_run(...)`
- service-role-only `csv_fail_sync_run(...)`
- ordinary browser mutation grants remain unchanged
- existing M2 RLS/browser mutation boundaries remain frozen

`csv_begin_sync_run(...)` behavior:

- validates exact active CSV integration scope before ownership acquisition
- validates organization and exact integration store scope
- trims and requires a non-blank idempotency key
- durable lookup uses `(organization_id, integration_id, idempotency_key)`
- absent key => atomically creates one running SyncRun and returns `started`
- existing non-terminal run => returns `in_progress`
- existing terminal run => returns `replayed`
- terminal replay returns persisted status and persisted row counts
- concurrent duplicate acquisition is protected by the database unique key and unique-violation reconciliation path
- a second caller for the same operational key must not gain row-execution ownership

Terminal replay semantics:

- completed is terminal
- completed_with_errors is terminal
- failed is terminal
- cancelled is terminal
- terminal same-key replay never re-runs D-D
- failed/cancelled same-key replay requires a new idempotencyKey for a new operational attempt

Completion semantics:

- completion is allowed only from running
- all six counts must be non-negative
- completion requires:
  - imported
  - updated
  - skipped
  - quarantined
  - failed
    to sum exactly to discovered
- quarantined > 0 or failed > 0 => completed_with_errors
- otherwise => completed
- skipped rows alone do not make the run completed_with_errors
- completed counts are persisted durably and returned on replay

Failure semantics:

- whole-import structural/preflight/orchestration exceptions transition the SyncRun to failed
- original orchestration exceptions remain observable to the caller
- failure-finalization errors must not mask the original import exception
- row-level persistence errors already classified by D-D remain row terminal disposition `failed`
- row-level failed rows do not automatically become whole-import SyncRun `failed`
- a normally completed import containing failed/quarantined rows becomes completed_with_errors

D-D ownership boundary:

- `executeCsvImportPlan()` remains the row normalization/dependency/persistence engine
- D-E wraps D-D rather than duplicating it
- `started` => D-D executes
- `replayed` => D-D does not execute
- `in_progress` => D-D does not execute
- replay result intentionally has `execution: null`
- persisted prior counts are returned instead of fabricated row executions

Current-state vs history replay behavior:

- ProviderBinding identity remains resource-level current-state reconciliation identity
- SyncRun idempotency remains file/workflow-level operational identity
- same plan + same idempotencyKey:
  - current-state persistence does not re-run
  - append-only inventory persistence does not re-run
  - prior SyncRun is replayed
- same plan + new idempotencyKey:
  - this is a new operational import
  - current-state resources reconcile/skip by ProviderBinding identity
  - CSV inventory persistence executes, but exact existing observation identity with equal nullable quantities is skipped rather than appended
  - contradictory quantities for the same CSV observation identity quarantine as `HISTORY_CONFLICT`
  - `NULL` and `0` remain distinct
  - a different observed timestamp remains a genuinely new append-only observation

Live end-to-end proof:

- first execution with key A:
  - executed
  - one product imported
  - one variant imported
  - one inventory snapshot appended
- second execution with key A:
  - replayed
  - same SyncRun ID
  - `execution = null`
  - inventory snapshot count remains one
- execution with key B:
  - executed as a new operational import
  - product/variant reconcile without duplication
  - inventory snapshot count becomes two
- exactly two durable SyncRuns exist for keys A and B

M3.9D-E exclusions:

- no API route
- no merchant UI
- no retry/lease/recovery worker model
- no automatic restart of failed/cancelled same-key runs
- no DataQualityIssue persistence
- no metrics
- no forecasting
- no decision engine
- no AI
- no Shopify ingestion
- no billing changes

Focused verification completed before full closure gate:

- D-E SyncRun schema contract tests PASS
- SyncRun lifecycle tests PASS
- generic SyncRun idempotency tests PASS
- typed Supabase SyncRun persistence tests PASS
- typed Supabase SyncRun live RPC tests PASS twice
- operational import execution tests PASS
- operational import replay live E2E tests PASS twice
- D-E focused regression: 61 tests PASS
- expected non-live live-test skips: 5
- typecheck PASS
- lint PASS
- git diff check PASS

Full closure verification:

- full repository `npm run check` PASS
- 161 test files PASS
- 1691 tests PASS
- 3 live-test files skipped in ordinary test mode
- 7 live tests skipped in ordinary test mode
- Next.js production build PASS
- clean Supabase reset through `20261012090000_m3_9_csv_sync_run_orchestration.sql` PASS
- Supabase database lint PASS with no schema errors
- D-E SyncRun live SQL PASS
- D-E SyncRun adversarial SQL PASS
- live TypeScript SyncRun persistence verification 2/2 PASS
- live TypeScript operational replay verification 3/3 PASS
- combined final D-E TypeScript live gate 5/5 PASS
- typecheck PASS
- lint PASS
- git diff check PASS

Next implementation after D-E closure:

M3.9D-F — conflict typing + duplicate/history/concurrency hardening

### M3.10 completion

Status: PASS

M3 CSV ingestion is closed.

Final closure verification:

- M3.10A read-only repository/migration audit PASS
- M3.10B complete SQL live/adversarial matrix PASS
- M3.10B real Supabase live matrix PASS
  - 7 live test files
  - 14 live tests
- M3.10C architecture-freeze audit PASS
- no deterministic CSV dependency on AI, billing, UI, or commerce-provider SDKs
- tenant authority remains trusted-context/database enforced
- canonical UUID identity remains separate from provider identity
- row number, filename, and upload time remain non-identity diagnostic provenance
- current-state reconciliation remains separate from immutable inventory history
- SyncRun idempotency remains whole-import identity
- exact same-import duplicates skip deterministically
- contradictory same-import duplicates quarantine as DUPLICATE_CONFLICT
- immutable relationship contradictions map through SA001 / BINDING_CONFLICT
- contradictory inventory-history replay maps through SA002 / HISTORY_CONFLICT
- absent ProviderBinding races are serialized at the PostgreSQL identity boundary
- concurrent same-identity callers converge on one canonical winner
- cross-integration provider identities remain independent
- no application retry framework was introduced to solve database identity races

M3.9 hardening closed as:

- D-F1 — typed reconciliation conflicts
- D-F2 — deterministic same-import duplicate handling
- D-F3 — contradictory inventory-history protection
- D-F4 — absent-binding concurrency hardening

Frozen M3 ingestion model:

CSV source
-> deterministic parsing
-> deterministic normalization
-> trusted tenant context
-> dependency-ordered orchestration
-> deterministic persistence/reconciliation
-> terminal row accounting
-> durable SyncRun completion

M3 does not own forecasting, inventory decisions, AI explanation,
billing, UI workflow, Shopify synchronization, or supplier sourcing.

### M4 completion

Status: CLOSED

M4 owns durable data-quality issues only. Derived SKU metrics remain M5. Forecasting remains M6. Inventory decisions remain M7. AI, merchant UI, billing, Shopify synchronization, and supplier sourcing remain outside M4.

Frozen contract:

- severity is critical, high, medium, low, or info
- status is open, resolved, ignored, or superseded
- `issue_key` is deterministic and excludes organization id
- one OPEN row exists per organization and issue key
- message, context, and timestamps are not identity
- provider `externalParentId` is evidence only
- persistence and lifecycle execute as `service_role` only
- browser mutation is forbidden
- anon cannot read issues
- authenticated members have one SELECT policy
- `source_context` cannot establish tenancy
- open reconciliation preserves `detected_at`, moves `last_detected_at` only forward, increments `occurrence_count`, and never downgrades severity
- resolved recurrence creates a new OPEN row
- ignored history is SA003
- superseded history is SA004
- only OPEN may resolve, ignore, or supersede
- terminal statuses stay terminal
- wrong organization is SA006
- an illegal transition is SA005
- `occurredAt` before `detected_at` is SA007
- lifecycle updates assign only status and `resolved_at`
- durable qualification is BINDING_CONFLICT, IDENTITY_AMBIGUOUS, RELATIONSHIP_UNRESOLVED, AMBIGUOUS_INVENTORY_SEMANTICS, and NEGATIVE_INVENTORY
- ordinary transient quarantine stays non-durable

M4.7 live coverage in `tests/unit/data-quality-adversarial.live.test.ts`:

- cross-tenant reads and persistence
- forged identity
- payload and source-context abuse
- provider subject abuse
- lifecycle chronology
- mixed persistence and lifecycle concurrency
- identity immutability

### M5.1 completion

Status: CLOSED

The frozen derived-metric contract remains in `docs/INVENTORY_FORMULAS.md`. This record does not restate that contract.

### M5.2 completion

Status: CLOSED

`public.sku_daily_metrics` exists in `supabase/migrations/20261014100000_m5_2_sku_daily_metrics.sql`.

Authenticated members may SELECT. Anon has no access. Browser mutation and a persistence RPC are absent. Trusted persistence remains M5.5.

Local reset, lint, and the schema test passed. Local and remote migration history include `20261014100000`.

The M5.3 contract and completion sections below are the current M5.3 record.

### M5.3 contract completion

Status: CLOSED

The approved window-floor, return-attribution, eligible-day, and store-timezone clarifications are in `docs/INVENTORY_FORMULAS.md`, section “M5.3 frozen sales-aggregate clarifications”. M5.1 and M5.2 were not restated.

### M5.3 completion

Status: CLOSED

Implementation:

- `lib/metrics/sales-aggregates.ts`
- `tests/unit/m5-sales-aggregates.test.ts`
- `tests/unit/m5-sales-aggregates-architecture.test.ts`

Final verification:

- Vitest: 1833 passed, 32 skipped, 0 failed
- typecheck PASS
- lint PASS
- build PASS
- existing local Supabase persistence test PASS

M5.4 inventory metrics must not start until explicitly requested.

### M5.4 completion

Status: CLOSED

Clarification: `docs/INVENTORY_FORMULAS.md`, section “M5.4 frozen inventory-metric clarifications”.

Implementation:

- `lib/metrics/inventory-aggregates.ts`
- `tests/unit/m5-inventory-aggregates.test.ts`
- `tests/unit/m5-inventory-aggregates-architecture.test.ts`

Incoming quantity, inventory position, and inventory age remain unknown until trustworthy historical evidence exists.

Final verification:

- Vitest: 1846 passed, 32 skipped, 0 failed
- typecheck PASS
- lint PASS
- build PASS
- git diff --check PASS

M5.5 persistence/recomputation must not start until explicitly requested.

### M5.5 completion

Status: CLOSED — IMPLEMENTED, TESTED, COMMITTED, AND HOSTED MIGRATIONS DEPLOYED.

Commit: `6dc4ed249ddc32e278452e8b608c007c0567c01b` (`6dc4ed2`).

Migrations, present in both local and remote migration history:

- `supabase/migrations/20261015110000_m5_5_sku_daily_metric_recompute.sql`
- `supabase/migrations/20261015120000_m5_5_coverage_identity.sql`
- `supabase/migrations/20261015130000_m5_5_source_snapshot_consistency.sql`

Implementation:

- `lib/metrics/sku-daily-metric-record.ts`
- `lib/persistence/recompute-sku-daily-metric.ts`
- `tests/unit/m5-sku-daily-metric-record.test.ts`
- `tests/unit/m5-persistence-recompute.test.ts`
- `tests/unit/m5-persistence-architecture.test.ts`
- `tests/unit/m5-persistence.live.test.ts`

`sku_daily_metric_source_snapshot` and `commit_sku_daily_metric` are `security definer`, with an empty `search_path`. Execution is revoked from `public`, `anon`, and `authenticated`, and granted to `service_role`. Authenticated members remain SELECT-only on `public.sku_daily_metrics`. Pure aggregation and mapping stay in `lib/metrics/`. Supabase orchestration is server-only in `lib/persistence/recompute-sku-daily-metric.ts`. The algorithm version is `m5-derived-metrics-v1`.

The source token and the four payloads — orders, order items, returns, and snapshots — come from one PostgreSQL statement. Commit takes `SHARE` locks, re-reads the token, and raises `SA008` on mismatch. The commit lock wait is bounded by a 2-second `lock_timeout`. A lock timeout is not retried as `SA008`. Incoming quantity, inventory position, and inventory age remain unknown.

Final verification:

- Vitest: 1857 passed, 39 skipped, 0 failed
- Focused M5.5: 34 passed, including 7 live tests
- typecheck PASS
- lint PASS
- build PASS
- git diff --check PASS

Hosted deployment evidence: `20261015110000`, `20261015120000`, and `20261015130000` are in local and remote migration history. Both RPCs are `security definer` with `search_path` empty. `service_role` has `EXECUTE`. `authenticated` and `anon` do not. Verification did not recompute hosted merchant data.

### M5.6A completion

Status: CLOSED — IMPLEMENTED, TESTED, COMMITTED, AND HOSTED MIGRATION DEPLOYED.

Commit: `b549fe0b78173acc9a5e75e115866a135fbbcf65` (`b549fe0`).

Migration, present in both local and remote migration history:

- `supabase/migrations/20261015140000_m5_6a_metric_source_events.sql`

Table: `public.sku_daily_metric_source_events`. Statement triggers on orders, order items, return refunds, and inventory-snapshot insert append one unconsumed event per affected organization, store, location, variant, and store-local source date. Purchase orders are not captured. Snapshot update and delete remain blocked by the existing immutability triggers. The capture migration does not consume events or write recompute requests.

### M5.6B completion

Status: CLOSED — IMPLEMENTED, TESTED, COMMITTED, AND HOSTED MIGRATION DEPLOYED.

Commit: `118d9b511070d3f690d1852478230cb61b6d2527` (`118d9b5`).

Migration, present in both local and remote migration history:

- `supabase/migrations/20261016100000_m5_6b_metric_recompute_requests.sql`

Table: `public.sku_daily_metric_recompute_requests`. Function: `public.consume_sku_daily_metric_source_events(integer, uuid)`, `security definer`, empty `search_path`, `EXECUTE` granted to `service_role` only. Consumption locks unconsumed events and writes generation-aware requests in the caller’s transaction. It does not run by itself, and a request row does not mean the metric is current.

M5.6D daily rollover is **CLOSED** for implementation and native verification (see M5.6D closeout below). Hosted worker/rollover HTTP runtime remain unauthorized. The operating contract is `docs/M5_6_HANDOFF.md`.

### M5.6C completion

Status: CLOSED — LOCAL IMPLEMENTATION AND NATIVE LOCAL SUPABASE VERIFICATION. **HOSTED SCHEMA DEPLOYED.** HTTP WORKER DISABLED. NO SCHEDULER. Hosted **one-shot** canary recompute verified under M5.6E.4 Stage 3 (not via HTTP worker).

Commit: `5cc0e6fd21f87a8975c1cec91aa76e6b6c85d4b8` (`5cc0e6f`).

Migration: `supabase/migrations/20261018100000_m5_6c_metric_recompute_worker.sql` (hosted schema deployed; HTTP worker runtime still disabled).

It adds nullable queue columns (`available_at`, `last_error_class`, `last_error_code`, `last_error_message`, `failed_reason`), constrained values, partial indexes, and six `security definer` functions with an empty `search_path`, executable by `service_role` only: `recover_expired_sku_daily_metric_recompute_leases`, `claim_sku_daily_metric_recompute_requests`, `start_sku_daily_metric_recompute`, `complete_sku_daily_metric_recompute`, `fail_sku_daily_metric_recompute`, and `sku_daily_metric_recompute_queue_stats`. `service_role` keeps SELECT only on the request table.

Implementation:

- `lib/persistence/metric-recompute-queue.ts`
- `workers/metric-recompute-failure.ts`
- `workers/aggregate-metrics.ts`
- `app/api/internal/metric-recompute/route.ts`

Tests:

- `tests/unit/m5-6c-recompute-worker.test.ts`
- `tests/unit/m5-6c-recompute-worker-architecture.test.ts`
- `tests/unit/m5-6c-failure-classification.test.ts`
- `tests/unit/m5-6c-recompute-worker.live.test.ts`

Native verification evidence (authoritative closeout):

| Gate | Result |
|---|---|
| M5.6C unit tests | 40 passed |
| M5.5 + M5.6A + M5.6B + M5.6C live, one command, native Supabase PostgreSQL 17.11 | 36 passed |
| typecheck, lint, `git diff --check` | pass |
| `npm run build` (Turbopack) | pass |

Local verification applied migration `20261018100000` to the native local database. Hosted schema for M5.6C was later deployed under separate approval. Closing M5.6C and deploying its schema do not authorize HTTP worker enablement or scheduling. Isolation-safe hosted canary (M5.6E.4) later verified one-shot recompute and org-scoped rollover on the canary org; production HTTP worker enablement remains a separate approval (`docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md`).

Earlier PostgreSQL 16 role-shim evidence (40 unit / 36 live) is historical and superseded by the native closeout for milestone closure.

Final review before commit found one defect in the migration, and it is fixed. Expired-claim recovery now resets `attempt_count` when `dirty_generation` changed while the row was claimed. Without the fix, a newer generation could inherit an older generation's attempts. A live test covers this case and fails against the unfixed SQL.

### M5.6D daily rollover (implementation closeout)

Status: **CLOSED** for **implementation and native verification** (independent acceptance D1–D12). Migration `20261020100000` **HOSTED SCHEMA DEPLOYED**. E.4 Stage 4 org-scoped rollover ×2 is **supporting hosted evidence**, not full HTTP runtime verification. Hosted multi-store fairness, timezone fail/recovery paths, and rollover HTTP execution remain **unverified**. ROLLOVER HTTP TRIGGER DISABLED. NO SCHEDULER. Closure does **not** authorize production activation.

Migration: `supabase/migrations/20261020100000_m5_6d_metric_daily_rollover.sql` (hosted schema deployed; HTTP/runtime enablement unverified).

Adds `sku_daily_metric_rollover_runs`, `sku_daily_metric_rollover_enqueues`, `enqueue_sku_daily_metric_daily_rollover`, and `sku_daily_metric_rollover_stats`. Tables are RLS-enabled with `service_role` SELECT only. RPCs are `security definer` with empty `search_path` and `EXECUTE` for `service_role` only.

Implementation:

- `lib/persistence/metric-rollover.ts`
- `app/api/internal/metric-rollover/route.ts`
- `.env.example` (`METRIC_ROLLOVER_WORKER_ENABLED`, `METRIC_ROLLOVER_WORKER_SECRET`)

Tests:

- `tests/unit/m5-6d-metric-rollover.test.ts`
- `tests/unit/m5-6d-metric-rollover-architecture.test.ts`
- `tests/unit/m5-6d-metric-rollover.live.test.ts`

Native verification evidence (authoritative for closure):

| Gate | Result |
|---|---|
| M5.6D unit + architecture | pass (includes invalid-timezone recovery assertions) |
| M5.6D live acceptance matrix | pass (includes TZ fail-closed, same-day recovery, UTC≠local recovery, concurrent recovery) |
| M5.5–M5.6C + M5.6D combined | pass after TZ1 correction |
| typecheck, lint, `git diff --check`, `npm run build` | pass |

Hosted supporting evidence: M5.6E.4 Stage 4 ran org-scoped `enqueue_sku_daily_metric_daily_rollover` twice with frozen `as_of` on the canary org (first enroll completed; second idempotent zero enroll). Metrics unchanged by rollover; foreign fingerprint unchanged. Final canary request remains intentionally `queued` at `dirty_generation=2`, `claimed_generation=1`, `applied_generation=1` — do not drain.

Invalid `stores.timezone` fails closed with zero enqueues. After the timezone becomes a recognized IANA name, the next rollover enqueue recovers `invalid_iana_timezone` failures automatically (same corrected local date reopens; differing UTC-derived keys leave the failed row and open the corrected date). Unrelated failed reasons are not reopened. Those TZ behaviors are **locally verified**; hosted TZ paths remain unverified. Details: `docs/M5_6_HANDOFF.md` section 10.

### M5.7 adversarial verification (local closeout)

Status: **CLOSED** for **local adversarial engineering only**. HEAD at closeout documentation: `312bd9c`. Hosted F1/T4 schema deploy is recorded below; this still does **not** authorize hosted worker/runtime verification or production enablement. Workers / cron / HTTP metric routes remain **DISABLED**. M5.6D is **CLOSED** for implementation/native verification only (see above); that does **not** authorize rollover HTTP. The E.4 canary grain left `queued` at `dirty_generation=2` must **not** be drained.

Local vs hosted:

- **Locally verified:** architecture audit, F1/T4 SQL fixes on native local Supabase PostgreSQL 17, adversarial concurrency/containment suites, TypeScript containment defaults (`maxActive=1`, `claimLimit=1`).
- **Hosted schema (F1/T4):** migrations `20261028210000` and `20261028220000` are **APPLIED AND VERIFIED ON HOSTED** — both appear in `supabase_migrations.schema_migrations`; claim/complete RPCs remain `SECURITY DEFINER` with `search_path=""`; `service_role` has `EXECUTE`; `anon`, `authenticated`, and `PUBLIC` do not. E.4 canary post-deploy remains `queued`, `dirty_generation=2`, `claimed_generation=1`, `applied_generation=1`, `attempt_count=0`, lease fields cleared.
- **Still unauthorized / unverified:** hosted metric-worker runtime execution, production HTTP worker activation, cron/scheduler. Single-flight containment defaults exist in code but hosted worker ticks have not been enabled.

Phase record:

| Phase | Outcome |
|---|---|
| 1 — Architecture audit | READ-ONLY audit of M5.6 recompute/rollover isolation, fencing, and contention. Findings drove F1 (deferred attempt burn), T4 (busy-grain claim starvation), and F2 (SHARE lock blast-radius) follow-ups. |
| 2 — F1 deferred-attempt fix | Legitimate deferred completion must not consume retry budget. Migration `20261028210000_m5_7_deferred_completion_attempt_reset.sql`. Commit `a23d37f`. |
| 3 / 3B — Adversarial concurrency + T4 | Live scenarios for claim exclusivity, SHARE contention observation, SA008 fencing, rollover isolation; busy-grain exclusion before `LIMIT 500`. Migration `20261028220000_m5_7_claim_busy_grain_exclusion.sql`. Commit `5db70f7`. |
| 4 — F2 SHARE decision | **Retain** five-table `LOCK … IN SHARE MODE` on stores/orders/order_items/return_refunds/inventory_snapshots plus SA008 source-token fencing. Do not replace with SERIALIZABLE, row-only locks, or grain advisory locks without an equivalence proof. Contain concurrency operationally. |
| 5A / 5B — F2 containment | Design then implement single-flight defaults: `maxActive=1`, `claimLimit=1`; optional `METRIC_RECOMPUTE_MAX_ACTIVE` / `METRIC_RECOMPUTE_CLAIM_LIMIT` (integers 1–4, fail-closed). Per-item `executeDurationMs` and tick summary telemetry (not lock-wait). Commit `312bd9c`. Local containment adversarial C1–C7 passed as part of Phase 5B validation. |

Evidence pointers: `docs/M5_6_HANDOFF.md` section 12; tests under `tests/unit/m5-7-*.ts`. M5 worker/HTTP/cron activation remains a separate approval and must not drain the E.4 canary `queued` dirty=2 grain. M6 local work through P4d is on `main` @ `6136874`; hosted M6 schema readiness is **CLOSED** (see M6 progress below and `docs/PROJECT_HANDOFF.md`). Production forecast operation remains **NOT APPROVED**.

### M6 forecasting progress (through P4d + hosted schema closeout)

Status: **IN PROGRESS** for forecasting product operation; **local P1–P4d CLOSED** on `main` @ `6136874`; **hosted schema readiness CLOSED** through `20261030200000`. M6 owns forecasting only (not M7 decisions, not buying execution). No forecast HTTP worker/cron. Diagnostic backtesting is fixture-controlled PIT only; live historical PIT replay is unsupported. Product sequence remains forecasting → decisions → approval-gated buying.

| Phase | Commit(s) | State |
|---|---|---|
| P1 deterministic orchestrator | `cb5c371` | Implemented; locally verified |
| P2a commerce facts adapter | `0df9666` | Implemented; locally verified |
| P2b.1 promotion/coverage evidence | `d363c72`, `210f92d` | Implemented; locally verified |
| P2b.2a/b evidence schema, RLS, RPCs, persistence | `d776876`, `aeff78d`, `37699c4` (+ related) | Implemented; locally verified; **hosted** `20261030100000`, `20261030110000` **applied** |
| P2b.2c.1 merchant attestation | `e76a8cc` | Implemented; locally verified |
| P2b.2c.3b coverage correction outbox | `fb160e9` | Implemented; Git committed; **hosted `20261030120000` APPLIED AND VERIFIED** (7 triggers; pending=0) |
| P2c.1 gated sku-demand source snapshot RPC | `92853fa` | Implemented; Git committed; **hosted `20261030130000` APPLIED AND VERIFIED**; no table-level SHARE; `statement_timeout=15s`, `lock_timeout=2s` |
| P2c.2 gated TypeScript loader | `7f6ba7f` | Implemented; locally verified |
| P2c.3 loader integration/concurrency | `7cbd8e9` | Implemented; locally verified |
| P3b forecast persistence foundation + adapter | `c915079`, `6e40bbf` | Implemented; locally verified; **hosted `20261030140000` APPLIED AND VERIFIED** |
| P3d publication + fresh reader | `091a29c`, `a71faff`, `83c29b0` | Implemented; locally verified; **hosted `20261030150000` / `20261030160000` APPLIED AND VERIFIED**; `m7_eligible` hard-false; persist ≠ publish |
| P4a PIT backtest harness | `d4a91b2` | Implemented; locally verified; fixture diagnostics only |
| P4b historical evidence integrity gate | `24fa202` | Implemented; locally verified; live historical PIT **unsupported** |
| P4c evaluation persistence | `f179516`, `42c6111`, `4dfa844` | Implemented; locally verified; **hosted `20261030200000` APPLIED AND VERIFIED**; trust flags hard-false |
| P4d diagnostic evaluation reporting | `6136874` | Implemented; locally verified; pure-TS report; hard-false trust; fixture ≠ merchant performance |

Hosted schema closeout verification (read-only; linked project `qlsqminsfdntpqdkhxjx`):

- Migrations local=remote through `20261030200000` (including `100000`, `110000`, `120000`–`160000`, `200000`).
- Seven correction-outbox triggers installed; outbox pending/total = 0.
- Hosted row counts = 0 for `forecast_runs`, `sku_forecasts`, `sku_forecast_publications`, `sku_forecast_current`, `forecast_evaluation_runs`, `forecast_evaluation_model_scores`.
- E.4 canary remains `queued`, `dirty_generation=2`, `claimed_generation=1` (untouched).
- Invalid IANA timezone store count = 0.
- M5/forecast workers, cron, and HTTP remain disabled by **repo configuration**; live hosting environment settings were **not** verified.

Key artifacts:

- `lib/forecasting/*` (orchestrator, commerce facts, evidence, attestation, harness, integrity, diagnostic report)
- `lib/persistence/*` forecast load/persist/publish/eval adapters (server-only; not auto-activated)
- `supabase/migrations/20261030100000_m6_p2b2b1_forecast_day_evidence.sql`
- `supabase/migrations/20261030110000_m6_p2b2b2_forecast_evidence_rpcs.sql`
- `supabase/migrations/20261030120000_m6_p2b2c3b_forecast_coverage_correction_outbox.sql` (**hosted**)
- `supabase/migrations/20261030130000_m6_p2c1_forecast_sku_demand_source_snapshot.sql` (**hosted**)
- `supabase/migrations/20261030140000_m6_p3b_forecast_persistence.sql` (**hosted**)
- `supabase/migrations/20261030150000_m6_p3d1_forecast_publication.sql` (**hosted**)
- `supabase/migrations/20261030160000_m6_p3d3_fresh_published_forecast_reader.sql` (**hosted**)
- `supabase/migrations/20261030200000_m6_p4c1_forecast_evaluation_persistence.sql` (**hosted**)

Not approved / blocked (separate future gates):

- Production forecast operation (calling persist/publish/eval as production paths)
- Production algorithm approval / automatic publication
- M7 decisions and approval-gated buying
- M5 or forecast workers / cron / HTTP enablement
- Live historical PIT replay as merchant or production evidence

Open P1 (non-blocking): correction-outbox trigger-function EXECUTE defense-in-depth; live hosting env verification for worker flags.

Next: preserve schema closeout bans; await separate approval before any production forecast activation or M7. Preserve E.4 canary dirty=2/claimed=1 and worker OFF bans.
