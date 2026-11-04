# M7-PB1 — Trusted Metric→Decision Binding Contract (Freeze)

**Status:** FROZEN for subsequent PB1 implementation slices (docs only until separately approved)
**Baseline verified:** `main` @ `bd93b49316f4f2b714270e6d5fe21e230dc83520` — `docs(actions): close R2 enterprise UX functional acceptance`
**Origin:** `docs/PRA_1_PRODUCTION_READINESS_AUDIT.md` §G (M7-PB1)
**Authority when docs conflict:** this freeze for PB1 adapter I/O, provenance, eligibility, fail-closed behavior, and test gates; M5 formula/schema authority remains `docs/INVENTORY_FORMULAS.md` + `lib/metrics/*` + `supabase/migrations/20261014100000_m5_2_sku_daily_metrics.sql`; M6 production forecast eligibility remains **NOT APPROVED** (`docs/PROJECT_HANDOFF.md`, `docs/M7_0_CONTRACT_ADDENDUM.md` §D); M0.6 / `lib/decision-engine/*` remain authority for decision math; M7.1 fixture envelope remains `lib/decision-engine/fixture-evaluation.ts`; M7.2/M7.3 remain dormant / hard-false for production create and merchant approval.

This freeze does **not** authorize application code, UI, fixture mutation, SQL, migrations, hosted queries/ops, HTTP ticks, workers/cron, production persistence writers, M7.3 approval success, E4 `engine_bound` briefs, live AI, purchasing, supplier contact, payments, inventory mutation, deterministic engine math edits, tenant-security weakening, dependency changes, or Git operations.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze this PB1 binding contract (docs only) | **GO** |
| Implement pure-TS mapping adapter under this contract | **GO** after explicit slice approval |
| Treat PB1 mapped/diagnostic output as production merchant decisions | **FORBIDDEN** |
| Invent M6 production / live forecast numbers as decision inputs | **FORBIDDEN** |
| Flip M7.3 `inventory_action_is_merchant_approvable` or wire UI RPCs | **NO-GO** |
| Enable E4 `engine_bound`, live AI, workers/cron/HTTP metric routes | **NO-GO** |
| Persist via `m5_sku_daily_metric_bound_v1` / production source-of-create | **NO-GO** (reserved; RPC rejects today) |
| Purchasing / supplier contact / payments / inventory mutation | **FORBIDDEN** |

**Product intent:** Freeze a **validated preparation boundary** that maps one trusted M5 `sku_daily_metrics` grain into a typed `InventoryDecisionInput` (and optionally runs diagnostic `decideInventoryAction`) **without** inventing missing commercial evidence and **without** claiming production eligibility. PB1 is **not** production decision creation.

---

## 1. Critical architecture finding (forecast & production create)

### 1.1 Can the engine evaluate forecast-ineligible inputs?

**Yes.** `InventoryDecisionInput.forecastExpectedDemandUnits` may be `null`. M7.1 already freezes `forecastEligibility = "ineligible"` ⇒ forecast units **must** be `null` (`lib/decision-engine/fixture-evaluation.ts`; `docs/M7_0_CONTRACT_ADDENDUM.md` §D). `watch-healthy-rule-v1` emits `FORECAST_UNAVAILABLE` when forecast units are null and no commercial candidate is eligible (`lib/decision-engine/watch-healthy-rule.ts`).

Commercial rules (**REORDER / REDUCE / PROMOTE**) do **not** require forecast fields; they require other evidence (incoming known, lead time, ROP/target, ROQ, risks, etc.) — see `lib/decision-engine/reorder-rule.ts` and `docs/M7_0_CONTRACT_ADDENDUM.md` §B.

### 1.2 Does that authorize production decision creation?

**No.** Production source-of-create remains unavailable:

- M6 production forecast operation **NOT APPROVED**.
- M7.2 reserved class `m5_sku_daily_metric_bound_v1` is **rejected** with `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` (`docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md` §3.2).
- M7.3 `inventory_action_is_merchant_approvable` is hard-coded `false` (`supabase/migrations/20261031130000_m7_3c_trusted_lifecycle_rpcs.sql`).
- PRA-1 / this freeze: **do not invent a forecast substitute** to unlock merchant decisions.

### 1.3 PB1 posture (frozen)

PB1 is a **mapping / preparation / diagnostic** boundary:

1. Map durable M5 facts → `InventoryDecisionInput` with **`forecastEligibility = "ineligible"`** always.
2. Optionally evaluate `decideInventoryAction` for **local diagnostic** output only.
3. Every PB1 success still carries **hard-false** production / merchant / algorithm-approval claims.
4. PB1 **never** authorizes persistence, approval, UI production banners, E4, workers, or buying.

If a caller needs “valid production decision creation,” PB1 returns an explicit **blocked** production-create status until separately approved M6 eligibility + trusted source-of-create exist. It must **not** fabricate forecasts, incoming, lead time, age, or risks to clear that block.

---

## 2. Exact source metrics and grain identity

### 2.1 Decision grain (reuse M7.0 / M7.1)

```ts
type M7DecisionGrain = {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
};
```

Authority: `docs/M7_0_CONTRACT_ADDENDUM.md` §E; `lib/decision-engine/fixture-evaluation.ts` (`M7DecisionGrain`).

Rules:

- All four IDs required, non-blank after trim.
- **No** cross-location / cross-store / cross-variant rollup.
- **No** multi-grain aggregation inside one PB1 call.
- Output grain must echo input grain exactly.

### 2.2 M5 natural key (source row)

From `supabase/migrations/20261014100000_m5_2_sku_daily_metrics.sql`:

| Key part | Column |
|---|---|
| organization | `organization_id` |
| store | `store_id` |
| location | `location_id` |
| variant | `variant_id` |
| metric date | `metric_date` |
| algorithm | `algorithm_version` |

PB1 accepts **exactly one** source row for:

`(organization_id, store_id, location_id, variant_id, metric_date, algorithm_version)`

Allowed algorithm for V1 PB1:

- `algorithm_version === "m5-derived-metrics-v1"`
  (`SKU_DAILY_METRIC_ALGORITHM_VERSION` in `lib/metrics/sku-daily-metric-record.ts`)

Any other algorithm version → **reject** `UNSUPPORTED_METRIC_ALGORITHM`.

### 2.3 Trusted caller scope (tenant isolation)

PB1 request must include a **trusted tenant scope** established outside the adapter (auth `TenantContext` / test harness). The adapter compares scope to the metric row; it does **not** trust client-only org/store claims.

```ts
type Pb1TrustedTenantScope = {
  organizationId: string;
  storeId: string;
};
```

| Check | Failure code |
|---|---|
| `scope.organizationId !== metric.organization_id` | `FOREIGN_TENANT_REJECTED` |
| `scope.storeId !== metric.store_id` | `FOREIGN_STORE_REJECTED` |
| Request grain location/variant ≠ metric location/variant | `GRAIN_MISMATCH` |
| Metric org/store ≠ grain org/store | `GRAIN_MISMATCH` |

Service-role privilege alone is **not** provenance (`docs/SERVICE_ROLE_BOUNDARY.md`, M7.2 contract).

### 2.4 Timezone provenance

`sku_daily_metrics` does **not** persist `time_zone`. Recompute reads `stores.timezone` (`commit_sku_daily_metric` / `recompute-sku-daily-metric.ts`).

PB1 **requires** caller-supplied:

```ts
pinnedTimeZone: string; // recognized IANA; must match trusted store.timezone for metric.store_id
```

| Check | Failure code |
|---|---|
| Missing / blank / unrecognized IANA | `TIMEZONE_INVALID` |
| `pinnedTimeZone` ≠ trusted store timezone for that store | `TIMEZONE_MISMATCH` |

Adapter must not invent timezone from UTC defaulting.

### 2.5 Timestamps and watermarks (provenance only)

| Field | Source | Role |
|---|---|---|
| `metricDate` | `sku_daily_metrics.metric_date` | Business date of the metric grain |
| `metricUpdatedAt` | `sku_daily_metrics.updated_at` | Observation freshness watermark |
| `metricCreatedAt` | `sku_daily_metrics.created_at` | Row birth (optional echo) |
| `metricSourceWatermark` | Deterministic string derived from `{metricDate, algorithm_version, updated_at}` (exact serialize rules in impl slice; stable across retries) | Provenance token for future writers — **not** production authz |
| `decisionAsOf` (optional request) | Caller | If supplied, must be parseable; used only with explicit staleness policy |

**Staleness:** PB1 does **not** invent a default SLA.
If `stalenessPolicy.maxMetricAgeRelativeTo` is supplied and `metric.updated_at` violates it → **reject** `METRIC_STALE`.
If no policy → map proceeds; timestamps remain in provenance for the caller.

---

## 3. Source→`InventoryDecisionInput` mapping (verified)

Target type: `InventoryDecisionInput` in `lib/decision-engine/types.ts`.

### 3.1 Direct M5 column maps (no invention)

| `InventoryDecisionInput` field | M5 source | Mapping rule |
|---|---|---|
| `availableQuantity` | `available_quantity` | Pass-through `integer \| null` |
| `validIncomingQuantity` | `eligible_incoming_quantity` | Pass-through; see §3.2 for known-state coupling |
| `incomingStateKnown` | derived from incoming columns | §3.2 |
| `demandVelocity` | `sales_velocity_30d` | Pass-through `numeric \| null` (V1 planning velocity; M5.1/M7.0) |
| `daysOfStock` | `days_of_stock` | Pass-through |
| `safetyStockUnits` | `safety_stock` | Pass-through |
| `reorderPointUnits` | `reorder_point` | Pass-through |
| `targetStockUnits` | `target_stock` | Pass-through |
| `inventoryAgeDays` | `inventory_age_days` | Pass-through; current M5 path is typically `null` + `inventory_age_unknown` |
| `demandTrend` | `demand_trend` | `"rising"\|"stable"\|"falling"` → same; **`"unknown"` → `null`** (engine `DemandTrend` has no `unknown`; fixture validator rejects unknown strings) |

### 3.2 Incoming known-state coupling (fail-closed)

Reuse M7.0 §G / fixture asserts:

| `eligible_incoming_quantity` | `eligible_incoming_reason_code` | Result |
|---|---|---|
| `null` + reason present (incl. `incoming_state_unknown`) | → | `incomingStateKnown=false`, `validIncomingQuantity=null` |
| non-null + reason **null** | → | `incomingStateKnown=true`, `validIncomingQuantity=<qty>` |
| `null` + reason **null** (constraint violation shape) | → | **reject** `METRIC_ROW_INVARIANT_VIOLATION` |
| non-null + reason **non-null** | → | **reject** `METRIC_ROW_INVARIANT_VIOLATION` |
| `incomingStateKnown=false` with numeric qty | → | **reject** `INCOMING_STATE_CONTRADICTION` |

**Current verified M5 persist posture** (`toPersistedSkuDailyMetric` / `aggregateInventoryMetrics`): always `eligibleIncomingQuantity=null`, `eligibleIncomingReasonCode="incoming_state_unknown"`. PB1 must map that honestly → **incoming unknown**. Do **not** coerce to known-zero.

### 3.3 Fields **not** on M5 table (must not invent)

| Field | PB1 V1 rule |
|---|---|
| `leadTimeDays` | `null` unless optional `TrustedSupplierPlanningFacts.leadTimeDays` present (§3.4) |
| `recommendedOrderQuantity` | `null` unless optional derive flag and all ROQ inputs known (§3.5) |
| `stockoutRisk` | `null` unless optional derive via `calculateStockoutRisk` with complete inputs (§3.5) |
| `overstockRisk` | `null` unless optional derive via `calculateOverstockRisk` with complete inputs (§3.5) |
| `forecastExpectedDemandUnits` | **always `null`** (ineligible) |
| `forecastConfidence` | **always `"low"`** when forecast ineligible (matches M7.1 ineligible fixture convention in `tests/unit/m7-fixture-decision-evaluation.test.ts`) |
| `dataQualityScore` | **always `null`** in PB1 V1 (not a `sku_daily_metrics` column; do not invent from reason codes) |

### 3.4 Optional trusted supplier planning facts (explicit, not inferred)

```ts
type TrustedSupplierPlanningFacts = {
  /**
   * Must be supplied only from durable supplier_products (or approved
   * equivalent) for the same organizationId + variantId.
   * Adapter does not load SQL in V1 pure mapping tests — caller passes facts.
   */
  leadTimeDays: number; // non-negative finite
  sourceAttestation: "pb1_trusted_supplier_planning_v1";
};
```

Rules:

- Absent → `leadTimeDays=null`.
- Present with bad attestation / negative / non-finite → **reject**.
- PB1 must **not** default lead time to 0, 7, or any constant.
- PB1 V1 does **not** read Shopify/CSV/network to fill this.

### 3.5 Optional frozen-math derivation (preparation only)

Same posture as M7.1 `deriveRecommendedOrderQuantity`:

| Flag | Allowed function | Condition |
|---|---|---|
| `deriveRecommendedOrderQuantity=true` | `calculateRecommendedOrderQuantity` (`lib/metrics/inventory-math.ts`) | Only when target/available/incoming-state inputs satisfy that function; else leave `null` (do not invent) |
| `deriveStockoutRisk=true` | `calculateStockoutRisk` | Only when function returns non-null value; else `null` |
| `deriveOverstockRisk=true` | `calculateOverstockRisk` | Only when function returns non-null value; else `null` |

Defaults for all derive flags: **false** (strict pass-through mapping).

**Forbidden:** deriving forecast demand; inventing incoming; inventing age; inventing data-quality scores; changing M0.6 thresholds.

### 3.6 Units

- Quantities: non-negative integers where M5 stores integers; velocities/days may be non-negative finite numbers.
- Negative / NaN / Infinity on any mapped numeric → **reject** `NUMERIC_INVALID`.
- Known zero remains `0`; unknown remains `null`.

---

## 4. Input / output shapes (contract types)

Names are normative for the future module (suggested path: `lib/decision-engine/metric-decision-binding.ts`). Implementation must not diverge without amending this freeze.

### 4.1 Request

```ts
type Pb1MetricDecisionBindingRequest = {
  bindingVersion: "m7-pb1-metric-decision-binding-v1";

  /** Trusted auth/harness scope — never from untrusted client body alone. */
  trustedScope: Pb1TrustedTenantScope;

  grain: M7DecisionGrain;

  /** Exactly one M5 row projection (already loaded by trusted caller). */
  metric: Pb1SkuDailyMetricProjection;

  pinnedTimeZone: string;

  /**
   * Developer/ops attestation that this call is PB1 preparation only.
   * Not crypto proof; not production authorization.
   */
  bindingAttestation: "m7-pb1-metric-binding-v1";

  /** Always ineligible while M6 production forecasts remain NOT APPROVED. */
  forecastEligibility: "ineligible";

  /** Hard-false production claims required on the request surface. */
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;

  supplierPlanning?: TrustedSupplierPlanningFacts | null;

  deriveRecommendedOrderQuantity?: boolean; // default false
  deriveStockoutRisk?: boolean; // default false
  deriveOverstockRisk?: boolean; // default false

  /**
   * When true, call decideInventoryAction on the mapped input for
   * diagnostic output only. Still production-ineligible.
   */
  runDiagnosticDecision?: boolean; // default false

  stalenessPolicy?: {
    maxAgeMs: number;
    relativeTo: string; // ISO timestamptz
  } | null;

  configurationVersion?: string;
};
```

### 4.2 M5 projection (minimal required fields)

```ts
type Pb1SkuDailyMetricProjection = {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string; // YYYY-MM-DD
  algorithmVersion: string;
  updatedAt: string; // ISO timestamptz
  createdAt?: string;

  availableQuantity: number | null;
  eligibleIncomingQuantity: number | null;
  eligibleIncomingReasonCode: string | null;

  salesVelocity30d: number | null;
  daysOfStock: number | null;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  inventoryAgeDays: number | null;
  demandTrend: "rising" | "stable" | "falling" | "unknown";
};
```

Caller may pass additional M5 columns for logging; adapter **must ignore** them for decision input (no silent use of units_sold as velocity, etc.).

### 4.3 Result

```ts
type Pb1HardFalseProvenance = {
  audience: "local_developer" | "internal_preparation";
  evidenceScope: "m5_metric_bound_preparation_only";
  forecastEligibility: "ineligible";
  isScoredMerchantDecision: false;
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;
  productionDecisionCreationEligible: false;
  productionApprovalEligible: false;
  notProductionActivation: true;
  engineBoundBriefEligible: false;
};

type Pb1MetricDecisionBindingRejection = {
  ok: false;
  bindingVersion: "m7-pb1-metric-decision-binding-v1";
  code: Pb1BindingFailureCode;
  detail: string;
  provenance: Pb1HardFalseProvenance;
};

type Pb1MetricDecisionBindingSuccess = {
  ok: true;
  bindingVersion: "m7-pb1-metric-decision-binding-v1";
  grain: M7DecisionGrain;
  metricDate: string;
  metricAlgorithmVersion: "m5-derived-metrics-v1";
  pinnedTimeZone: string;
  metricSourceWatermark: string;
  decisionInput: InventoryDecisionInput;
  mappingNotes: readonly Pb1MappingNoteCode[];
  /**
   * Present only when runDiagnosticDecision=true.
   * Must not be fed to production persist/UI approval paths.
   */
  diagnosticDecision?: InventoryDecisionResult;
  diagnosticEvidence?: InventoryActionEvidence;
  provenance: Pb1HardFalseProvenance;
  warnings: readonly [
    "m5_metric_bound_preparation_only",
    "NOT_merchant_facing",
    "NOT_production_activation",
    "NOT_production_forecast",
    "NOT_production_decision_create",
    "NOT_m7_3_approvable",
    "NOT_engine_bound_brief",
  ];
  /**
   * Explicit dependency gate for future production create (informational).
   * PB1 never clears this.
   */
  productionCreateBlockedUntil: readonly Pb1ProductionCreateGate[];
};

type Pb1MetricDecisionBindingResult =
  | Pb1MetricDecisionBindingRejection
  | Pb1MetricDecisionBindingSuccess;
```

### 4.4 Production-create gates (informational; always blocking in PB1)

```ts
type Pb1ProductionCreateGate =
  | "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED"
  | "TRUSTED_INCOMING_EVIDENCE_AVAILABLE" // when commercial REORDER/REDUCE needed
  | "TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED" // m5_sku_daily_metric_bound_v1 live path
  | "M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED";
```

PB1 **always** sets `productionDecisionCreationEligible=false` and leaves these gates uncleared even if diagnostic actionType is REORDER (which should be rare/impossible under current M5 incoming-unknown posture without violating mapping rules).

---

## 5. Failure matrix

| Code | When |
|---|---|
| `BINDING_ATTESTATION_INVALID` | Wrong/missing `bindingAttestation` |
| `FORECAST_ELIGIBILITY_INVALID` | Not exactly `"ineligible"` |
| `PRODUCTION_TRUST_CLAIM_REJECTED` | Any hard-false claim field not `false` |
| `FOREIGN_TENANT_REJECTED` | Scope org ≠ metric org |
| `FOREIGN_STORE_REJECTED` | Scope store ≠ metric store |
| `GRAIN_MISMATCH` | Grain IDs disagree with metric row |
| `UNSUPPORTED_METRIC_ALGORITHM` | Not `m5-derived-metrics-v1` |
| `TIMEZONE_INVALID` | Unrecognized / blank IANA |
| `TIMEZONE_MISMATCH` | Pinned TZ ≠ trusted store TZ |
| `METRIC_STALE` | Optional staleness policy violated |
| `METRIC_ROW_INVARIANT_VIOLATION` | Incoming nullability/reason coupling broken |
| `INCOMING_STATE_CONTRADICTION` | Unknown incoming with numeric qty |
| `NUMERIC_INVALID` | Negative / non-finite / non-integer where required |
| `SUPPLIER_FACTS_INVALID` | Bad optional supplier planning payload |
| `MULTI_ROW_INPUT` | Caller attempted multi-metric bind in one call |
| `CROSS_GRAIN_AGGREGATION_FORBIDDEN` | Any rollup attempt |

On rejection: **no** `decisionInput`, **no** diagnostic decision, provenance hard-false still echoed.

---

## 6. Mapping note codes (success path)

| Code | Meaning |
|---|---|
| `FORECAST_FORCED_INELIGIBLE` | Forecast units null; confidence low |
| `INCOMING_STATE_UNKNOWN_PASSTHROUGH` | Mapped from M5 incoming unknown |
| `INVENTORY_AGE_UNKNOWN_PASSTHROUGH` | Age null / unavailable |
| `LEAD_TIME_ABSENT` | No trusted supplier facts |
| `LEAD_TIME_FROM_TRUSTED_SUPPLIER_FACTS` | Optional facts applied |
| `DEMAND_TREND_UNKNOWN_TO_NULL` | M5 `unknown` → null |
| `DATA_QUALITY_SCORE_ABSENT` | Left null |
| `ROQ_NOT_DERIVED` / `ROQ_DERIVED` | Derive flag outcome |
| `RISK_NOT_DERIVED` / `RISK_DERIVED_PARTIAL_OR_FULL` | Risk derive outcome |
| `DIAGNOSTIC_DECISION_RUN` | Engine invoked diagnostically |

---

## 7. Determinism & reproducibility

- Mapping is pure: same request → same `decisionInput` + same watermark string.
- Optional diagnostic uses existing `decideInventoryAction` / `buildInventoryActionEvidence` / optional fingerprint helpers — **do not fork** rules.
- Do not call M6 persist/publish/fresh-reader APIs.
- Do not call M7.2 persist / M7.3 lifecycle RPCs.
- Do not import Actions demo fixtures as a metric source.
- Do not change `lib/decision-engine/{reorder,reduce,promote,watch-healthy,conflict,confidence,priority}.ts` math in PB1.

---

## 8. Eligibility hard-false (all PB1 outputs)

Every success **and** rejection provenance must assert:

| Flag | Value |
|---|---|
| `claimsMerchantFacing` | `false` |
| `claimsProductionForecastApproval` | `false` |
| `claimsM7ProductionEligibility` | `false` |
| `algorithmApproved` | `false` |
| `isScoredMerchantDecision` | `false` |
| `productionDecisionCreationEligible` | `false` |
| `productionApprovalEligible` | `false` |
| `engineBoundBriefEligible` | `false` |
| `forecastEligibility` | `"ineligible"` |

Architecture tests must fail if any PB1 path sets these true.

---

## 9. What PB1 explicitly does **NOT** create, persist, approve, or execute

| Forbidden | Authority |
|---|---|
| Production `inventory_actions` rows / `m5_sku_daily_metric_bound_v1` writes | M7.2 |
| Merchant accept/edit/dismiss/complete success | M7.3 SQL always false |
| E4 `engine_bound` Decision Brief delivery | `validate-grounding.ts` reject + this freeze |
| Live LLM / soft-enable expansion | E3 contract |
| M5/M6 HTTP workers, cron, canary drain | PRA-1 / M5.6E.4 |
| CSV/Shopify import routes | Out of scope |
| Purchase orders, supplier contact, payments, inventory mutation | Product bans |
| Synthetic Actions fixture replacement | Demo remains `m7-synthetic-demonstration-v1` |
| Substituting fixture_synthetic forecast numbers on this path | Only M7.1 fixture API may use that mode |
| Altering RLS / service-role grants | Out of scope |

---

## 10. Relationship to existing envelopes

| Envelope | Role vs PB1 |
|---|---|
| M7.1 `evaluateFixtureInventoryDecision` | Remains **fixture-only**; attestation `m7-controlled-local-fixture-v1`. PB1 must **not** call it as a production bridge. PB1 may **mirror** its forecast-ineligible validation rules. |
| M7.2 harness persist | Remains dormant harness class only; PB1 must not become its evidence source. |
| Actions demo | Unchanged synthetic path. |
| `decideInventoryAction` | Reused only when `runDiagnosticDecision=true`. |

---

## 11. Pure adapter / API boundary

### 11.1 Suggested module

- `lib/decision-engine/metric-decision-binding.ts` (pure TS)
- Optional thin re-export from `lib/decision-engine/index.ts` **only if** existing export style requires it (no new HTTP route)

### 11.2 Dependency allowlist

**Allowed:** `lib/decision-engine/types.ts`, `decide.ts`, `evidence-snapshot.ts`, `reproducibility.ts` (diagnostic only), `lib/metrics/inventory-math.ts` (optional derive), `lib/metrics/sku-daily-metric-record.ts` (algorithm constant), commerce-domain quantity/confidence types.

**Forbidden imports:** `lib/decision-brief/**`, `lib/demo/**`, `lib/persistence/persist-inventory-action.ts`, M7.3 adapters, `app/**`, `workers/**`, AI SDKs, Supabase clients inside the pure mapper (caller loads metric rows).

### 11.3 Runtime surface

- Default: **library function only**, not referenced from Routes/UI.
- No feature flag required for pure unit use; any future server route wiring needs a **separate** approval and must default OFF.

---

## 12. Test matrix (implementation acceptance)

### 12.1 Unit — mapping

1. Happy path: incoming unknown M5 shape → `incomingStateKnown=false`, forecast null, confidence `low`, hard-false provenance.
2. `demand_trend=unknown` → `demandTrend=null`.
3. Foreign org/store → reject.
4. Grain mismatch → reject.
5. Wrong algorithm → reject.
6. Timezone invalid / mismatch → reject.
7. Incoming contradiction shapes → reject.
8. Numeric invalid → reject.
9. Staleness policy hit → reject; absent policy → map.
10. Supplier facts absent → `leadTimeDays=null`; present valid → mapped; invalid → reject.
11. Derive flags default off → ROQ/risks null even if math could run.
12. Derive ROQ with incomplete incoming → remains null (no invention).
13. Production trust claim true on request → reject.
14. `forecastEligibility` other than ineligible → reject.
15. Non-null `forecastExpectedDemandUnits` cannot appear on success path.

### 12.2 Unit — diagnostic decision (optional flag)

16. `runDiagnosticDecision=true` on current M5-like unknown incoming → typically `WATCH` with `MATERIAL_UNCERTAINTY` / `INCOMING_STATE_UNKNOWN` / `FORECAST_UNAVAILABLE` (assert codes present; do not overfit exact full array if engine adds compatible codes).
17. Diagnostic result still hard-false; warnings include `NOT_production_decision_create`.
18. Must not call persist/lifecycle (architecture import bans).

### 12.3 Architecture

19. Forbidden dependency list enforced (AI, demo, persist, workers, app routes).
20. No `productionApprovalEligible=true` / eligibility true literals in module.
21. Engine rule files untouched (hash/path guard or diff policy in architecture test).
22. Does not import `evaluateFixtureInventoryDecision` as the metric binding implementation.

### 12.4 Non-goals for PB1 tests

- Hosted SQL, Playwright, worker ENABLE, M7.3 success path, E4 grounding accept.

### 12.5 Repo gates

Focused vitest + `tsc` + eslint + `git diff --check` on the implementation PR.

---

## 13. Implementation slices (post-approval only)

| Slice | Scope | Exit |
|---|---|---|
| **PB1.0** | This contract freeze | Done when this doc lands |
| **PB1.a** | Pure mapper + failure codes + unit/architecture tests (no diagnostic engine call) | Mapping acceptance 1–15, 19–22 |
| **PB1.b** | Optional `runDiagnosticDecision` + evidence snapshot + tests 16–18 | Diagnostic gated; still no persist/UI |
| **PB1.c** | (Optional, separate approval) Trusted loader helper that reads one M5 row under tenant scope — still no HTTP worker ENABLE | Loader tests; no production writer |

Stop after PB1.a unless PB1.b/c explicitly approved. **No UI slice** in PB1.

---

## 14. Acceptance gates for calling PB1 “implemented”

1. This contract unchanged in spirit (amendments explicit).
2. PB1.a merged with tests green.
3. Provenance hard-false on all paths.
4. Forecast always ineligible; no invented forecast.
5. Actions demo unchanged.
6. M7.3 predicate unchanged.
7. No workers/cron/HTTP enablement.
8. Explicit closeout note: **preparation only; production create still NO-GO**.

---

## 15. Unresolved architecture questions (operator / future freezes)

These do **not** block PB1.a contract freeze; they block later production create:

1. **When** may `eligible_incoming_*` become known on M5 without violating fail-closed PO aggregation rules?
2. **Where** is durable lead-time attested for production (supplier_products binding semantics)?
3. Exact serialize algorithm for `metricSourceWatermark` vs M7.2 persist watermark fields (align in writer freeze).
4. Whether diagnostic PB1 outputs may ever seed a **new** dormant harness persist class (default **NO**).
5. Hosted apply state of M7.2/M7.3 migrations (operator SELECT) — irrelevant to pure PB1.a.
6. Default staleness SLA for merchant UX (explicitly **not** invented here).

---

## 16. GO / NO-GO summary

| Item | Call |
|---|---|
| Freeze PB1 contract | **GO** |
| Implement PB1.a pure mapper after approval | **GO** |
| Production decision create / persist | **NO-GO** |
| M7.3 approval success | **NO-GO** |
| E4 engine-bound Brief | **NO-GO** |
| Live AI | **NO-GO** |
| Hosted workers / canary drain | **NO-GO** |
| Invent forecast / incoming / lead-time defaults | **NO-GO** |
| Purchasing / payments / inventory mutation | **NO-GO** |

---

## 17. References

- `docs/PRA_1_PRODUCTION_READINESS_AUDIT.md`
- `docs/M7_0_CONTRACT_ADDENDUM.md`
- `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md`
- `docs/DECISION_ENGINE.md`
- `lib/decision-engine/types.ts`
- `lib/decision-engine/fixture-evaluation.ts`
- `lib/decision-engine/reorder-rule.ts`
- `lib/decision-engine/watch-healthy-rule.ts`
- `lib/metrics/sku-daily-metric-record.ts`
- `lib/metrics/inventory-aggregates.ts`
- `lib/metrics/inventory-math.ts`
- `supabase/migrations/20261014100000_m5_2_sku_daily_metrics.sql`
- `supabase/migrations/20261031130000_m7_3c_trusted_lifecycle_rpcs.sql`

---

**STOP.** Await explicit approval before PB1.a implementation.
