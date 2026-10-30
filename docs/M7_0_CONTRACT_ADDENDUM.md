# M7.0 — Inventory Decision Engine Contract Addendum

**Status:** FROZEN for M7.1 fixture-only evaluation
**Baseline:** `main` @ `1a6c93c`
**Authority:** repository TypeScript under `lib/decision-engine/*` and `lib/metrics/inventory-math.ts` where docs differ.

This addendum does **not** authorize production forecast operation, M5 worker/cron/HTTP enablement, decision persistence, human-approval APIs, purchasing, inventory mutation, or merchant-facing UI.

---

## A. Input/output type reuse and evidence provenance

### Reuse (do not fork)

| Contract | Source |
|---|---|
| `InventoryDecisionInput` | `lib/decision-engine/types.ts` |
| `InventoryDecisionResult` | `lib/decision-engine/types.ts` |
| `decideInventoryAction` | `lib/decision-engine/decide.ts` (`inventory-decision-v1`) |
| `buildInventoryActionEvidence` | `lib/decision-engine/evidence-snapshot.ts` |
| `buildDecisionReproducibilityFingerprint` | `lib/decision-engine/reproducibility.ts` |
| ROQ / MOQ / pack / incoming math | `lib/metrics/inventory-math.ts` |
| Domain evidence shape | `InventoryActionEvidence` in `lib/commerce-domain/types.ts` |

### M7.1 evaluation envelope (fixture-only)

`evaluateFixtureInventoryDecision` wraps the existing engine. It adds grain identity, hard-false trust flags, required `fixtureAttestation`, optional ROQ derivation via existing inventory math, evidence snapshot, and a reproducibility fingerprint.

It does **not** introduce a second decision algorithm.

### `fixtureAttestation` (developer declaration only)

Request field `fixtureAttestation` must equal `m7-controlled-local-fixture-v1`.

This is a **developer declaration** that the caller intends a controlled local fixture evaluation. It is **not** cryptographic proof, **not** a production authorization mechanism, and **not** merchant/live-forecast provenance. Missing or incorrect values are rejected at runtime. Production paths must not call this API.

### Provenance hard-false flags

Every M7.1 result must assert:

- `audience = local_developer`
- `evidenceScope = controlled_fixture_only`
- `claimsMerchantFacing = false`
- `claimsProductionForecastApproval = false`
- `claimsM7ProductionEligibility = false`
- `algorithmApproved = false`
- `isScoredMerchantDecision = false`

HEALTHY remains `healthState` with `actionType = null` — not an `InventoryAction` persistence candidate.

---

## B. Eligibility and abstention gates

Unchanged from frozen M0.6 (`docs/DECISION_ENGINE.md` M0.6.3–M0.6.6) and source:

- **REORDER:** available known; incoming known; demand velocity known; lead time known; ROP known; target known; `recommendedOrderQuantity > 0`
- **REDUCE:** available known; incoming known and **> 0**; target known; position above target; overstock medium/high
- **PROMOTE:** available known and **> 0**; target known; demand known; available above target; overstock medium/high; demand-pressure (age ≥ 90 / falling / known-zero demand)
- **WATCH:** material uncertainty or commercial conflict after candidate evaluation
- **HEALTHY:** no candidates and no material uncertainty

Missing required evidence → rule ineligible / WATCH; **never** substitute zero for unknown.

---

## C. M5 metrics and supplier-data mapping

M7.1 does **not** read hosted SQL. Fixture inputs map conceptually as:

| Decision input | Typical M5 / supplier origin (when production wiring is later approved) |
|---|---|
| `availableQuantity` | `sku_daily_metrics.available_quantity` / snapshot `available_quantity` |
| `validIncomingQuantity` + `incomingStateKnown` | `eligible_incoming_*` / PO aggregation |
| `demandVelocity` | sales velocity columns |
| `daysOfStock` | `days_of_stock` |
| `leadTimeDays` | supplier / `supplier_products` (not invent) |
| `safetyStockUnits` / `reorderPointUnits` / `targetStockUnits` | M5 columns / inventory-math |
| `recommendedOrderQuantity` | inventory-math ROQ ± `applySupplierOrderConstraints` |
| `inventoryAgeDays` / `demandTrend` | M5 |
| `stockoutRisk` / `overstockRisk` | inventory-math (not persisted on M5 table today) |
| Forecast fields | **Production forecasts are ineligible.** Explicit controlled synthetic fixture facts are permitted only for local evaluation (see §D). |

Snapshot fields `on_hand_quantity` and `committed_quantity` exist in M2; V1 decision rules consume **available** + **valid incoming** terminology (approved). Do not invent reserved/on-hand substitutes.

---

## D. Forecast eligibility (fixture-only)

**Production forecasts are ineligible** for M7.1. M6 forecast publication/eligibility remains **NOT APPROVED**. Hosted/live/merchant forecast values must not be treated as M7 decision inputs.

**Explicit controlled synthetic fixture facts** (`forecastEligibility = fixture_synthetic` plus a caller-supplied `forecastExpectedDemandUnits`) are permitted **only** for local-developer evaluation through `evaluateFixtureInventoryDecision`, gated by `fixtureAttestation = m7-controlled-local-fixture-v1` and `evidenceScope = controlled_fixture_only`.

M7.1 fixtures choose one of:

| `forecastEligibility` | `forecastExpectedDemandUnits` | Intent |
|---|---|---|
| `ineligible` | must be `null` | Exercise WATCH/`FORECAST_UNAVAILABLE`; reject if a number is supplied |
| `fixture_synthetic` | **required** non-null controlled fixture number | Satisfy frozen M0.6 completeness for HEALTHY/confidence paths **without** production forecast claims; reject if null |

In both modes:

- `claimsProductionForecastApproval` remains hard-false
- Adapter must **not** invent ROQ from forecast fields
- Adapter must **not** call M6 persist/publish/fresh-reader APIs
- Synthetic forecast numbers are local-developer fixtures only — not merchant accuracy evidence
- `fixtureAttestation` remains a developer declaration only (see §A)

---

## E. Decision grain and location isolation

V1 grain: `(organizationId, storeId, locationId, variantId)`.

- `locationId` is **required** and non-empty
- No cross-location rollup
- No foreign-grain aggregation inside one evaluation
- Output echoes the same grain

---

## F. Action semantics

Unchanged from M0.6:

| State | Meaning | `recommendedQuantity` |
|---|---|---|
| REORDER | Replenish | Only V1 action with quantity (from upstream ROQ) |
| REDUCE | Reduce additional incoming exposure | null |
| PROMOTE | Demand-generation for on-hand excess | null |
| WATCH | Uncertainty or conflict | null |
| HEALTHY | No intervention | null; `actionType = null` |

REDUCE + PROMOTE may coexist (REDUCE primary). REORDER + excess family → WATCH + `CONFLICTING_SIGNALS`.

---

## G. Null/zero and conflict handling

- Known zero ≠ unknown (`null`)
- `incomingStateKnown = true` and `validIncomingQuantity = null` → known zero incoming (engine `?? 0`)
- `incomingStateKnown = false` with non-null `validIncomingQuantity` → **reject** at adapter (contradictory)
- Negative / non-finite numerics → **reject**
- Conflicts: existing `decision-conflict-v1` / orchestration — do not change

---

## H. Minimal M7.1 implementation plan

| File | Role |
|---|---|
| `docs/M7_0_CONTRACT_ADDENDUM.md` | This freeze |
| `lib/decision-engine/fixture-evaluation.ts` | Pure-TS fixture adapter |
| `tests/unit/m7-fixture-decision-evaluation.test.ts` | Focused fixture cases |
| `tests/unit/m7-fixture-evaluation-architecture.test.ts` | Import isolation from production paths |

**Out of scope:** SQL, persistence, HTTP, workers, UI, approval APIs, M0.6 rule edits, M5/M6 contract changes, production forecast activation, E.4 canary ops.

**Acceptance:** focused vitest + existing decision/M5 golden regressions; `tsc`; eslint; `git diff --check`.
