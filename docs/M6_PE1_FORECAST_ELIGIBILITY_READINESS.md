# M6-PE1 — Production Forecast Eligibility Readiness Audit

**Mode:** AUDIT + CONTRACT ONLY. No implementation, SQL, migrations, hosted ops, publication, M7 production decisions, workers/cron, E4 AI, or purchasing.
**As-of:** 2026-11-04
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested:** `main` @ `3564e77` or newer
**Verified HEAD:** `6fb4c63b1a53ea405f120f9dcbe030cee72f466b` — `docs(deployment): close HR3.2 readiness security audit` (`3564e77` is an ancestor)
**Dirty tree:** Preserved untouched except creation of **this** file.
**Parents / authority:** `docs/FORECASTING.md`, `docs/IMPLEMENTATION_STATUS.md` (M6 progress), `docs/PROJECT_HANDOFF.md`, `docs/PRA_1_PRODUCTION_READINESS_AUDIT.md`, `docs/M7_0_CONTRACT_ADDENDUM.md` §D, `docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md`, `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`.
**Authority when docs conflict:** this freeze for **M6 production-eligibility prerequisites and PE1 sequencing only**. Frozen M5/M6/M7 math and eligibility contracts must not be altered by PE1 docs or follow-on slices without separate explicit approval.

---

## 0. Executive verdict

| Question | Verdict |
|---|---|
| Local M6 P1–P4d forecast **code/schema** ready? | **YES** — IMPLEMENTED on `main` through `6136874` (+ later PB1) |
| Hosted M6 **schema** readiness (historical docs)? | **CLOSED** through `20261030200000` (operator claim; **not re-probed this session**) → treat live state as **UNKNOWN** until re-SELECT |
| Production forecast **operation** (persist/publish/eval callers)? | **NOT APPROVED** / **BLOCKED** |
| Production forecast **eligibility for M7 decisions**? | **HARD-FALSE by contract + schema** |
| Can PB1/M7 consume live published forecasts today? | **NO** — PB1 forces `forecastEligibility="ineligible"` |
| M6-PE1 production eligibility overall | **NO-GO** |

**One-line:** M6 is a complete **dormant** forecast pipeline (calculate → persist → publish → fresh-read → evaluate/diagnose) with fail-closed quality gates; it is **not** production-eligible for M7 until explicit policy + schema + canary operation approvals land.

**Earliest missing prerequisite (PE1):** an explicit **fail-closed Forecast→Decision eligibility binder** that can consume technical fresh-reader results **without** granting production eligibility (always ineligible under inactive attestation). Downstream schema flips, canary publish callers, and M7 age SLA are later.

---

## A. Verified M6 architecture and status

### A.0 Five forecast states (must not be conflated)

| State | Meaning | Produces M7 input numbers? | Production-eligible? |
|---|---|---|---|
| **1. Calculated** | In-memory / harness `forecastSkuDemand` result (`dailyDemand`, confidence, mode, sufficiency) | No | **No** |
| **2. Persisted** | Immutable `forecast_runs` + `sku_forecasts` via `persist_forecast_sku_demand_result` | No (historical only; adapter never publishes) | **No** |
| **3. Published** | Append-only `sku_forecast_publications` + `sku_forecast_current` via `publish_sku_forecast` | Not by itself; pointer may exist with `m7_eligible=false` | **No** (schema hard-false) |
| **4. Evaluated** | PIT / integrity / eval persistence / diagnostic report scores | No (diagnostic evidence only; trust hard-false) | **No** |
| **5. Production-eligible** | Separately approved for M7 `forecastExpectedDemandUnits` / `forecast_run_id` binding | Only after PE1 policy + schema + operation approvals | **HARD-FALSE today** |

**Technical ≠ production:** fresh-reader `disposition="eligible"` + `m7NumericEligible=true` means check-time **numeric usability** only. It is **state 3 refined**, not state 5.

### A.1 Pipeline stages (exact separation)

| Stage | Role | Key artifacts | Auto-activated? |
|---|---|---|---|
| **Calculate** | Deterministic demand forecast from classified daily facts | `lib/forecasting/orchestrate.ts` (`forecastSkuDemand`), windows/trend/confidence/sufficiency | No — pure TS |
| **Source snapshot** | Tenant-scoped commerce+evidence identity (`sourceToken`) | `forecast_sku_demand_source_snapshot` (`20261030130000`); loader `lib/persistence/load-forecast-sku-demand.ts` | No caller in `app/` / workers |
| **Persist** | Immutable historical run + sku_forecast | `persist_forecast_sku_demand_result` (`20261030140000`); `lib/persistence/persist-forecast-sku-demand.ts` | Explicit adapter only; **never publishes** |
| **Publish** | Append-only publication + current pointer | `publish_sku_forecast` (`20261030150000`); `lib/persistence/publish-forecast-sku-demand.ts` | Explicit; **`m7_eligible` always false** |
| **Fresh read** | Check-time numeric usability vs current token | `read_fresh_published_sku_forecast` (`20261030160000`); `lib/persistence/read-fresh-published-sku-forecast.ts` | Explicit; **not** M7 age policy |
| **Evaluate** | Fixture PIT backtest + integrity + eval persistence | P4a–c: harness / integrity / `persist-forecast-evaluation.ts` (`20261030200000`) | Diagnostic only |
| **Report** | Pure-TS diagnostic report | `lib/forecasting/diagnostic-evaluation-report.ts` (P4d) | Trust flags hard-false |

**Invariant (VERIFIED):** calculated ≠ persisted ≠ published ≠ evaluated ≠ production-eligible. Also: persist ≠ publish ≠ fresh-read ≠ M7 eligibility ≠ algorithm approval.

### A.2 Classification matrix (source-code vs hosted)

Legend: **IMPLEMENTED** / **PARTIAL** / **MISSING** / **BLOCKED** / **UNKNOWN**.

| Capability | Source code | Hosted | Evidence |
|---|---|---|---|
| P1 orchestrator (WMA + trend + confidence + sufficiency) | **IMPLEMENTED** | N/A (pure TS) | `lib/forecasting/orchestrate.ts`; `tests/unit/m6-forecast-orchestrator.test.ts` |
| P2a commerce facts adapter | **IMPLEMENTED** | N/A | `lib/forecasting/commerce-facts.ts` |
| P2b evidence / attestation / correction outbox | **IMPLEMENTED** | **UNKNOWN** this session (docs claim applied `100000`–`120000`) | migrations + `lib/forecasting/evidence*.ts`, `merchant-attestation.ts` |
| P2c gated source snapshot + loader | **IMPLEMENTED** | **UNKNOWN** this session (docs claim `130000`) | `20261030130000`; `load-forecast-sku-demand.ts`; live tests |
| P3b persist foundation + adapter | **IMPLEMENTED** | **UNKNOWN** this session (docs claim `140000`) | `persist-forecast-sku-demand.ts`; concurrency live tests |
| P3d publish + fresh reader | **IMPLEMENTED** | **UNKNOWN** this session (docs claim `150000`/`160000`) | publish + fresh-reader adapters/SQL; `m7_eligible=false` CHECK |
| P4a–d evaluation / integrity / diagnostic | **IMPLEMENTED** | Eval schema docs claim `200000`; live historical PIT **UNSUPPORTED** | harness + integrity + diagnostic report |
| Production persist/publish/eval **callers** | **MISSING** | **BLOCKED** | No imports under `app/`, `workers/` (except empty pipeline stage labels), or decision-engine |
| Algorithm approval / automatic publication | **MISSING** / **BLOCKED** | **BLOCKED** | Handoff + diagnostic hard-false trust |
| M7 consumption of published forecasts | **BLOCKED** | **BLOCKED** | M7.0 §D; PB1 binding forces ineligible |
| PB1.a metric→decision mapper | **IMPLEMENTED** | N/A (pure TS) | `lib/decision-engine/metric-decision-binding.ts`; `tests/unit/m7-pb1-metric-decision-binding*.test.ts` |
| PB1.b diagnostic evaluation | **IMPLEMENTED** | N/A | `metric-decision-diagnostic.ts`; commit `0d9bbf1` |
| Forecast HTTP workers / cron | **MISSING** / disabled | **BLOCKED** | No forecast enable path; M5 workers OFF separately |

### A.3 Git / tree (this session) — **VERIFIED**

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `6fb4c63` (≥ `3564e77`) |
| M6 local closeout commit | `6136874` (P4d) — ancestor |
| PB1 diagnostic | `0d9bbf1` — ancestor |
| `vercel.json` / forecast workers ENABLE | Absent / not applicable |
| Dirty files | Unrelated dirty/untracked preserved; only this doc added |

---

## B. Forecast production-eligibility dependency chain

Production eligibility is **not** “a published row exists.” It is a **chain**. Every link must be true.

```
Canonical commerce (org/store/location/variant)
  → store IANA timezone recognized
  → day evidence + coverage (+ attestation where required)
  → pendingCorrection fence clear
  → forecast_sku_demand_source_snapshot (sourceToken, lookback, as_of)
  → forecastSkuDemand (mode/sufficiency/confidence/dailyDemand)     [CALCULATED]
  → persist_forecast_sku_demand_result                               [PERSISTED]
  → publish_sku_forecast (m7_eligible forced false)                  [PUBLISHED]
  → read_fresh_published_sku_forecast
        disposition=eligible AND m7NumericEligible=true              [TECHNICAL ONLY]
  → [POLICY / BINDER GATE — earliest MISSING]
        production forecast eligibility approval
        + canary grain allowlist
        + forecast-age / revalidation policy owned by M7
  → M7 InventoryDecisionInput.forecastExpectedDemandUnits            [PRODUCTION-ELIGIBLE]
  → trusted source-of-create writer (M7.2) — still unavailable
  → merchant approvable predicate (M7.3) — hard-false
```

Optional side path (does not unlock production):

```
controlled PIT fixture → historical integrity → backtest harness → eval persist → diagnostic report
                                                                                 [EVALUATED only]
```

**PB1 production-create gates** (`PRODUCTION_CREATE_GATES` in `lib/decision-engine/metric-decision-binding.ts`):

1. `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` ← **this PE1 track** (never satisfied today)
2. `TRUSTED_INCOMING_EVIDENCE_AVAILABLE`
3. `TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED`
4. `M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED`

Clearing (1) alone does **not** authorize merchant decisions.

### B.1 Hard-false chain traced: M6 → PB1 → M7 (exact evidence)

Trace order is **defense-in-depth**: each layer independently refuses production forecast use.

#### Layer M6 — publication / numeric read never grants production eligibility

| # | Control | Exact locus | Locked by test |
|---|---|---|---|
| M6-1 | Persist never publishes / never M7-eligible | `lib/persistence/persist-forecast-sku-demand.ts` header: “never published and never M7-eligible”; `FORBIDDEN_INPUT_KEYS` includes `m7Eligible` | `tests/unit/m6-forecast-persist-adapter-architecture.test.ts` |
| M6-2 | Publish result type forces `m7Eligible: false` | `PublishForecastSkuDemandResult.m7Eligible: false` in `publish-forecast-sku-demand.ts`; runtime forces `m7Eligible: false`; rejects payload if `m7Eligible !== false` | publish adapter unit/architecture tests |
| M6-3 | SQL CHECK hard-false on every publication row | `constraint sku_forecast_publications_m7_eligible_false check (m7_eligible = false)` in `supabase/migrations/20261030150000_m6_p3d1_forecast_publication.sql`; RPC inserts always false | `tests/unit/m6-forecast-publication-architecture.test.ts` expects `check (m7_eligible = false)` |
| M6-4 | Fresh-reader may set `m7NumericEligible=true` **without** claiming post-commit freshness or production approval | `read_fresh_published_sku_forecast` SQL returns `claimsPostCommitFreshness: false` + limitation string; TS `FreshPublishedForecastEligible.claimsPostCommitFreshness: false` in `read-fresh-published-sku-forecast.ts` | `m6-forecast-fresh-reader.test.ts`, `m6-forecast-fresh-reader-architecture.test.ts`, live fresh-reader tests |
| M6-5 | Evaluation / diagnostic reject production trust | `lib/persistence/persist-forecast-evaluation.ts` rejects production/M7/algorithm approval claims; `diagnostic-evaluation-report.ts` hard-false trust vocabulary (`algorithm_approved`, `m7_numeric_eligible`, `production_activation` as rejected claim keys / NOT_ flags) | `tests/unit/m6-forecast-evaluation-persistence-architecture.test.ts` (“rejects production/M7/algorithm approval claims”) |
| M6-6 | No production callers | No `loadForecastSkuDemand` / `publishForecastSkuDemand` / `readFreshPublished*` under `app/` or `lib/decision-engine/` | Repo grep this session |

#### Layer PB1 — decision binding refuses production forecasts

| # | Control | Exact locus | Locked by test |
|---|---|---|---|
| PB1-1 | Request must declare `forecastEligibility: "ineligible"` | `validateRequestEnvelope` / `bindMetricToDecisionInput` in `metric-decision-binding.ts` → `FORECAST_ELIGIBILITY_INVALID` if not `"ineligible"` | `tests/unit/m7-pb1-metric-decision-binding.test.ts` (“rejects … non-ineligible forecast”) |
| PB1-2 | Production trust claims must be false on request | Same file rejects if `claimsProductionForecastApproval`, `claimsM7ProductionEligibility`, or `algorithmApproved` ≠ false → `PRODUCTION_TRUST_CLAIM_REJECTED` | same test + architecture bans of `…: true` literals |
| PB1-3 | Success provenance hard-false + forced ineligible note | `hardFalseProvenance()`; mapping note `FORECAST_FORCED_INELIGIBLE`; forecast units null / confidence low by PB1 rules | `m7-pb1-metric-decision-binding.test.ts` expects `FORECAST_FORCED_INELIGIBLE` + hard-false provenance |
| PB1-4 | PB1.b diagnostic still ineligible | `metric-decision-diagnostic.ts` requires provenance `forecastEligibility === "ineligible"` and hard-false trust; still emits `FORECAST_FORCED_INELIGIBLE` | `m7-pb1-metric-decision-diagnostic.test.ts` + architecture test |
| PB1-5 | Production-create blocked until PE1 gate | `productionCreateBlockedUntil` includes `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` | binding module + PB1 contract |

#### Layer M7 — fixtures / persistence / approval cannot consume production forecasts

| # | Control | Exact locus | Locked by test |
|---|---|---|---|
| M7-1 | Contract: production forecasts ineligible | `docs/M7_0_CONTRACT_ADDENDUM.md` §D | Authority doc |
| M7-2 | Fixture evaluator only allows `ineligible` \| `fixture_synthetic` | `lib/decision-engine/fixture-evaluation.ts`; synthetic is local-only | `tests/unit/m7-fixture-decision-evaluation.test.ts` (rejects `claimsProductionForecastApproval: true`) |
| M7-3 | Inventory action rows: `forecast_run_id` must be null; production eligibility claim false | `supabase/migrations/20261031100000_m7_2b_inventory_action_persistence.sql` — `check (forecast_run_id is null)` and `claims_m7_production_eligibility = false` coupling | persistence architecture tests |
| M7-4 | Reserved production source-of-create rejected | RPC path raises `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` for `m5_sku_daily_metric_bound_v1`; adapter `persist-inventory-action.ts` surfaces same | `m7-inventory-action-persistence-architecture.test.ts`, `m7-inventory-action-persist-adapter*.test.ts` |
| M7-5 | Merchant approval always false | `inventory_action_is_merchant_approvable` → `select case when p_action is null then false else false end` in `20261031130000_m7_3c_trusted_lifecycle_rpcs.sql` | M7.3 lifecycle live/e2e reject harness |

**Answer to audit Q12:** Yes — **production eligibility is hard-false by contract and schema today**, independently at M6 publish SQL, PB1 binding, and M7 persistence/approval layers. Fresh-reader `m7NumericEligible` does **not** pierce this chain.

### B.2 Earliest missing prerequisite

Among links required to eventually reach state 5, the **earliest engineering-owned missing piece** (without loosening hard-false controls) is:

> **PE1-P1-5 / §G:** a pure fail-closed binder from `FreshPublishedForecastResult` → decision forecast fields that remains **`forecastEligibility="ineligible"`** under inactive attestation — i.e. teaches the M6→M7 seam while preserving the chain above.

Why earliest (not canary publish / CHECK flip / age SLA first)?

1. Publish CHECK + PB1 already refuse production use — flipping them first would be unsafe.
2. Without a binder, even a future approved numeric forecast has **no typed seam** into `InventoryDecisionInput`.
3. Hosted re-SELECT and age SLA are prerequisites for **activation**, but the binder can land first as dormant preparation (same pattern as PB1.a).

---

## C. P0 / P1 / P2 blockers (with evidence)

### C.1 P0 — block any production-eligibility claim

| ID | Blocker | Class | Evidence |
|---|---|---|---|
| PE1-P0-1 | Production forecast operation **NOT APPROVED**; no persist/publish/eval production callers | **BLOCKED** / policy | `docs/IMPLEMENTATION_STATUS.md` M6 section; PROJECT_HANDOFF; grep: no `publishForecastSkuDemand` / `loadForecastSkuDemand` under `app/` or decision-engine |
| PE1-P0-2 | SQL `m7_eligible = false` CHECK — publications cannot claim M7 eligibility | **BLOCKED** by schema | `supabase/migrations/20261030150000_m6_p3d1_forecast_publication.sql`; `tests/unit/m6-forecast-publication-architecture.test.ts` |
| PE1-P0-3 | M7/PB1 force forecast ineligible | **BLOCKED** by contract + code | `docs/M7_0_CONTRACT_ADDENDUM.md` §D; `metric-decision-binding.ts` (`FORECAST_ELIGIBILITY_INVALID` if not ineligible) |
| PE1-P0-4 | No approved forecast-age / post-read revalidation policy for M7 | **MISSING** policy | Fresh-reader limitation string (SQL + TS): check-time token identity only |
| PE1-P0-5 | Hosted M6 live state not re-verified this session (row counts, constraints, EXECUTE grants) | **UNKNOWN** ops | Historical closeout claimed rows=0; this session did **not** SELECT |
| PE1-P0-6 | Live historical PIT evaluation unsupported → no merchant accuracy evidence path | **BLOCKED** / design | `historical-evidence-integrity.ts` rejects live canonical / snapshot as `UNSUPPORTED_HISTORICAL_REPLAY` |

### C.2 P1 — required before a canary eligibility approval

| ID | Gap | Class | Evidence |
|---|---|---|---|
| PE1-P1-1 | No canary grain allowlist / attestation constant for production forecast eligibility | **MISSING** | No PE1 policy module; PB1 gate name exists but is never satisfied |
| PE1-P1-2 | Incoming quantity still unknown on M5 path → even forecast-eligible decisions may lack commercial REORDER completeness | **PARTIAL** (M5) | PB1 maps `incoming_state_unknown`; PRA P1-4 |
| PE1-P1-3 | Continuous hosted commerce → metrics → forecast loop unverified (workers OFF; CSV HTTP missing) | **PARTIAL** / **UNKNOWN** | PRA; HR3 workers-OFF; no forecast workers |
| PE1-P1-4 | Returns/refunds CSV path incomplete for real imports → demand series may be incomplete | **PARTIAL** | PRA P1-2 |
| PE1-P1-5 | Explicit binder from fresh-reader → `InventoryDecisionInput` forecast fields absent | **MISSING** | Decision-engine never imports fresh-reader |
| PE1-P1-6 | Algorithm-approval evidence bar undefined for production (min origins, holdout, degradation rules beyond diagnostic) | **PARTIAL** | Diagnostic uses `FORECAST_BACKTEST_MIN_ORIGINS_V1 = 14` but hard-false trust |

### C.3 P2 — important, not immediate eligibility unlockers

| ID | Gap | Class |
|---|---|---|
| PE1-P2-1 | Metric `console`/ops runbooks for forecast publish canary | **MISSING** |
| PE1-P2-2 | Architecture lock: decision-engine must not import publish/persist until PE1 approval | **PARTIAL** (present by absence; not explicitly tested as PE1 gate) |
| PE1-P2-3 | Doc drift (some status docs older than HEAD PB1/HR1) | **PARTIAL** |
| PE1-P2-4 | Correction-outbox EXECUTE defense-in-depth (open M6 P1 in handoff) | **PARTIAL** |

---

## D. Source freshness, confidence, and quality requirements

### D.1 Grain and source integrity — **IMPLEMENTED** (code)

| Rule | Evidence |
|---|---|
| Exact grain `(organizationId, storeId, locationId, variantId)` | Snapshot RPC args; persist/publish/fresh-reader; series `ForecastGrain` |
| No cross-location rollup | Loader + SQL grain checks; PB1/M7 same grain |
| Store IANA timezone from `stores.timezone`; unrecognized → fail | `20261030130000` (`invalid_iana_timezone`) |
| Date window: `forecast_as_of` + `lookbackDays` (default 90, bounds 1..365) | Snapshot RPC; orchestrator `DEFAULT_FORECAST_LOOKBACK_DAYS_V1 = 90` |
| Local calendar dates via `timezone(store.tz, timestamptz)` | Snapshot SQL |
| `sourceToken` = identity of included snapshot rows **at statement time only** | Loader/publish/fresh-reader freshness limitation strings |

### D.2 Coverage, missing, stale — **IMPLEMENTED** fail-closed (code)

| Condition | Behavior | Evidence |
|---|---|---|
| Missing calendar days | Incomplete / unknown availability (not silent zero demand) | `lib/forecasting/series.ts` |
| Pending corrections | Fence before completeness; publish/fresh-read → `PENDING_CORRECTION` / throw | Snapshot + publish adapter + fresh reader |
| Stale `sourceToken` at publish/persist | Fail-closed (`STALE_SOURCE_TOKEN`) — reload required | Persist/publish adapters |
| Stale token at fresh-read | Disposition `STALE`, `m7NumericEligible=false` | `20261030160000` |
| Evidence conflicts / untrusted | Fail-closed unknown / throw | `evidence.ts`, `commerce-facts.ts` |
| Duplicate conflicting identities | Throw | commerce-facts / evidence |

### D.3 Calculation vs publication vs evaluation vs eligibility

| Concern | Requirement (frozen) | Status |
|---|---|---|
| Confidence | Starts from sufficiency; only degrades with censoring/promo/unusable ratios (`forecast-confidence-v1`) | **IMPLEMENTED** |
| History sufficiency | 0–6 insufficient; 7–27 limited; 28+ sufficient | **IMPLEMENTED** (`history-sufficiency.ts`) |
| Numeric fresh-read eligibility | `medium`\|`high` confidence; `standard`\|`limited_history`; `sufficient`\|`limited`; finite `dailyDemand ≥ 0`; token fresh; no pending | **IMPLEMENTED** (technical) |
| Low / none confidence | Fresh-read miss `FORECAST_CONFIDENCE_LOW` | **IMPLEMENTED** |
| Evaluation sample floor | ≥ 14 PIT origins for non-insufficient-sample diagnostic messaging | **IMPLEMENTED** diagnostically (`FORECAST_BACKTEST_MIN_ORIGINS_V1`) |
| Algorithm approval | Must not be inferred from diagnostic scores | **HARD-FALSE** |
| Production eligibility | Requires separate PE1 policy + schema change + operation approval | **BLOCKED** |

### D.4 Recommended eligibility bar (policy — not yet approved)

For a **future** single-grain canary approval, minimum bar suggested by existing code (must be frozen in a later PE1 policy slice before any CHECK relaxation):

1. Fresh-read `disposition=eligible` at decision time (revalidated; not cached blindly).
2. Confidence `medium` or `high`; mode not `unavailable`; sufficiency not `insufficient`.
3. Pending corrections = 0; sourceToken match on revalidation.
4. Explicit canary allowlist match (org + store + location + variant).
5. Explicit PE1 attestation / approval constant present in code **and** schema path that can set `m7_eligible=true` only for that path (today CHECK forbids all true).
6. Diagnostic evaluation (if used) does **not** alone approve; merchant performance claims remain false until a separate accuracy gate.
7. M7 forecast-age SLA defined and enforced at decision bind time (today **MISSING**).

---

## E. M6 → PB1 / M7 integration gaps

| Integration point | Today | Gap |
|---|---|---|
| PB1.a maps M5 → `InventoryDecisionInput` | **IMPLEMENTED**; forecast always ineligible | Cannot consume M6 numbers by design |
| PB1.b diagnostic `decideInventoryAction` | **IMPLEMENTED**; still hard-false trust | Forecast remains null/`low` |
| Fresh-reader → decision fields | **MISSING** binder | PE1-P1-5 |
| `forecast_run_id` on inventory actions | Column exists; CHECK null for M7.2 | Blocked until eligibility approval (`20261031100000` / M7.2a contract) |
| Merchant approval | Predicate hard-false | Out of PE1 scope; separate M7.3 approval |
| Fixture synthetic forecasts | Local M7.1 only | Must not be confused with M6 production |
| Engine reason codes | `FORECAST_UNAVAILABLE` / `FORECAST_CONFIDENCE_LOW` exist | Ready for miss dispositions; unused for live M6 |

**PB1 restriction (normative):** inventing forecasts, treating `m7NumericEligible` as production approval, or wiring Actions/`engine_bound` from published forecasts is **FORBIDDEN** until PE1 production eligibility is explicitly approved.

---

## F. Recommended next 3 narrow milestones

1. **M6-PE1.a — Fail-closed Forecast→Decision eligibility binder (pure TS + tests)** ← **smallest safe next slice**
   Map `FreshPublishedForecastResult` → decision forecast fields under an attestation that is **never true** in this slice (always ineligible). Lock architecture: no publish/persist side effects; no SQL CHECK change; no PB1 hard-false weakening.

2. **M6-PE1.b — Canary eligibility policy + hosted re-verification pack**
   Freeze canary grain allowlist shape, forecast-age SLA, and operator SELECT pack proving hosted constraints (`m7_eligible` CHECK), grants, and empty/non-prod row posture. Still **no** production publish callers.

3. **M6-PE1.c — Controlled canary publish path (separate approval)**
   Only after 1+2: explicit single-grain persist→publish under workers-OFF / org-scoped discipline; still keep merchant approval and M7.2 production writer **NO-GO** until later gates.

**Dependency note (PRA order):** M5-HR1 org-scoped HTTP is largely closed on HEAD; PB1.a/b are implemented. PE1 is the correct forecast track **before** E4 `engine_bound` or M7.3 success.

---

## G. ONE immediate implementation candidate (not authorized here)

### Name

**M6-PE1.a — Fail-closed published-forecast eligibility binder**

### Why (earliest missing prerequisite)

Closes the first missing typed seam after technical fresh-read (state 3) toward eventual state 5 — **without** activating publication or flipping hard-false M6/PB1/M7 controls traced in §B.1.

### In scope

- New pure module (suggested): `lib/decision-engine/published-forecast-eligibility.ts` (name flexible).
- Input: `FreshPublishedForecastResult` + grain + **inactive** policy attestation type.
- Output: `{ forecastEligibility: "ineligible", forecastExpectedDemandUnits: null, forecastConfidence: "low", reasonCodes, technicalNumericEligible: boolean, blockedUntil: ["M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED", ...] }`.
- Even when fresh-reader disposition is `eligible`, binder remains **ineligible** while attestation ≠ approved constant (constant absent or always false in this slice).
- Unit + architecture tests.

### Out of scope (hard boundaries)

- No SQL / migration / `m7_eligible` CHECK change
- No persist/publish/eval callers, HTTP, workers, cron
- No PB1 hard-false flag flips; no M7.2/M7.3 writer/approvable changes
- No E4, AI, purchasing, inventory mutation
- No frozen math edits in `lib/forecasting/*` or decision rules
- No hosted operations / forecast publication
- No treating `m7NumericEligible` as production eligibility

### Acceptance tests (must pass)

1. Fresh-reader miss dispositions → binder ineligible + mapped reason codes (`FORECAST_UNAVAILABLE` / `FORECAST_CONFIDENCE_LOW` / stale / pending) without inventing demand.
2. Fresh-reader `disposition=eligible` + `m7NumericEligible=true` → **still** `forecastEligibility="ineligible"` and units `null` under inactive attestation.
3. Architecture: module must not import publish/persist adapters; must not set `claimsProductionForecastApproval` / `claimsM7ProductionEligibility` / `algorithmApproved` true; must not contain `m7_eligible = true` paths.
4. Grain mismatch → reject fail-closed.
5. `claimsPostCommitFreshness` must remain treated as false (age not approved).
6. Output must list `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` in blocked-until / equivalent.
7. typecheck + focused unit/architecture tests green.

**STOP:** This candidate is **documented only**. Do not implement under this audit approval.

---

## H. GO / NO-GO matrix and unresolved decisions

### H.1 GO / NO-GO

| Action | Decision |
|---|---|
| Accept this PE1 audit/contract (docs only) | **GO** |
| Claim production forecast readiness / M7 forecast eligibility | **NO-GO** |
| Implement M6-PE1.a binder | **NO-GO** until separate explicit approval |
| Relax `m7_eligible=false` CHECK / set true | **NO-GO** |
| Wire production persist/publish/eval callers | **NO-GO** |
| Treat fresh-reader `m7NumericEligible` as production approval | **NO-GO** |
| Change PB1 to accept production forecasts | **NO-GO** |
| M7.2 production source-of-create / M7.3 merchant success | **NO-GO** |
| E4 `engine_bound` / live AI / purchasing / workers ENABLE | **NO-GO** |
| Alter frozen M5/M6/M7 math or eligibility contracts | **NO-GO** |
| Local diagnostic forecast calculate/persist in tests | **GO** (existing test harnesses only; not production) |

### H.2 Unresolved decisions (require explicit future freezes)

1. **Forecast-age SLA:** max age of `forecastAsOf` / publication relative to decision time (M7-owned; undefined).
2. **When may `m7_eligible` become true?** Migration strategy vs per-row policy vs separate eligibility table.
3. **Canary grain selection** and whether Preview/Production Supabase isolation is required first (see HR3.2b).
4. **Algorithm approval bar:** is diagnostic ≥14 origins necessary, sufficient, or irrelevant for canary numeric use?
5. **Incoming-unknown coexistence:** can forecast-eligible WATCH/HEALTHY paths ship before trusted incoming evidence?
6. **Hosted re-verification:** re-run SELECT pack for M6 migrations/constraints/row counts before any canary publish.
7. **Whether PE1 eligibility can unlock `forecast_run_id` persistence** without full M7.3 approvable flip (M7.2a implies separate approvals).

### H.3 Twelve-topic audit rollup

| # | Topic | Classification |
|---|---|---|
| 1 | Source integrity / exact grain | **IMPLEMENTED** (code) |
| 2 | Coverage / missing / stale | **IMPLEMENTED** fail-closed (code) |
| 3 | Timezone / date-window / observation | **IMPLEMENTED** (code); hosted TZ hygiene **UNKNOWN** this session |
| 4 | Calculate vs publish vs eval vs eligibility | **IMPLEMENTED** separation; eligibility **BLOCKED** |
| 5 | Published freshness / source watermark | **IMPLEMENTED** check-time only; post-return freshness **MISSING** policy |
| 6 | Confidence / eval evidence / min sample | **IMPLEMENTED** diagnostically; production approval **BLOCKED** |
| 7 | DQ / conflict / fail-closed | **IMPLEMENTED** (code) |
| 8 | M6→M7 / PB1 contract | PB1 **IMPLEMENTED** ineligible; production bind **MISSING** / **BLOCKED** |
| 9 | Tenant isolation / provenance / idempotency | **IMPLEMENTED** (RLS + source_token replay + immutable pubs) |
| 10 | Local tests vs hosted | Local **IMPLEMENTED**/tested; hosted schema **UNKNOWN** this session (docs claim CLOSED; rows historically 0) |
| 11 | Missing impl / policy / ops evidence | Callers, age SLA, eligibility attestation, hosted re-SELECT — **MISSING** / **UNKNOWN** |
| 12 | Production eligibility hard-false by contract? | **YES — BLOCKED** (schema CHECK + M7/PB1 + handoff) |

---

## Freeze checklist

- [x] HEAD ≥ `3564e77` verified (`6fb4c63`); dirty tree preserved aside from this file
- [x] Five forecast states distinguished (calculated / persisted / published / evaluated / production-eligible)
- [x] Hard-false chain traced M6 → PB1 → M7 with exact files/functions/tests (§B.1)
- [x] Earliest missing prerequisite identified (PE1.a binder)
- [x] P0/P1/P2 blockers classified with file evidence
- [x] M6→PB1/M7 gaps and next milestones recorded
- [x] Single PE1.a implementation candidate specified with acceptance tests — **not implemented**
- [ ] Production forecast eligibility / publication / M7 forecast consumption — **not authorized**

**PE1 audit COMPLETE (docs only).**
**STOP before implementation.** No forecast publication, eligibility loosening, SQL, or activation under this approval.
