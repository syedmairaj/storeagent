# M6-PE1.b — Canary Forecast Eligibility Policy

**Mode:** AUDIT + CONTRACT ONLY. No implementation, SQL, migrations, hosted queries, forecast publication, canary runs, workers/cron, Vercel deployment, E4, M7.3, AI, purchasing, or inventory mutation.
**As-of:** 2026-11-04
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested (original freeze):** `main` @ `e557b2a`
**Verified HEAD (original freeze):** `e557b2acf49e6a6109d5abf6fb32d2091f3d78fd` — `feat(forecast): add fail-closed published forecast evidence binder`
**Reconciliation (docs only):** 2026-11-04 against `main` @ `debb032` + PE1.b.1 implementation + `docs/M6_PE1_B2_POLICY_CONSISTENCY_AND_DECISIONS.md` contradictions **C1, C3, C4, C5**. No new policy approvals, numeric thresholds, UUID selection, or production activation.
**Dirty tree:** Unrelated dirty files preserved; this reconciliation edits **this** file only among PE1.b authority docs (plus PE1.b.2 status update).
**Parents / authority:**
- `docs/M6_PE1_FORECAST_ELIGIBILITY_READINESS.md` (PE1 sequencing; PE1.b defined as policy + SELECT pack)
- `lib/decision-engine/published-forecast-eligibility.ts` (PE1.a structural binder — always ineligible)
- `lib/decision-engine/canary-forecast-eligibility-policy.ts` (PE1.b.1 fail-closed policy evaluator — **implemented**; production attestation inactive)
- `docs/M6_PE1_B2_POLICY_CONSISTENCY_AND_DECISIONS.md` (precedence / contradiction catalog)
- M6 P3/P4 publish / fresh-reader / evaluation contracts + SQL
- M5 metrics freshness / coverage / source-token contracts + M5 canary allowlist patterns
- `docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md`, `docs/M7_0_CONTRACT_ADDENDUM.md` §D, `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`
**Authority when docs conflict:** this freeze for **PE1.b canary eligibility policy shape, fail-closed states, attestation boundaries, hosted SELECT pack, and GO/NO-GO only**, as reconciled below with PE1.b.1. Frozen M5/M6/M7 math, SQL `m7_eligible=false` CHECK, PB1 hard-false gates, and PE1.a always-ineligible semantics must not be altered by this document or by any follow-on slice without separate explicit approval.

---

## 0. Executive verdict

| Question | Verdict |
|---|---|
| May PE1.b freeze a fail-closed canary **policy contract** (docs only)? | **GO** (this document) |
| Is production forecast eligibility approved? | **NO** — hard-false by schema + PB1 + PE1.a |
| May anyone set `m7_eligible=true`, relax CHECK, or clear `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED`? | **NO-GO** |
| May anyone publish/persist/eval in production, run a canary, or wire M7 decision units? | **NO-GO** |
| Are forecast-age SLA, canary UUID, algorithm-approval bar, and attestation authority frozen? | **NO** — marked `POLICY_DECISION_REQUIRED` |
| Overall PE1.b production trust | **NO-GO** |

**One-line:** PE1.b freezes the **policy evaluator contract** and **fail-closed canary gates** for a future single-grain canary — without inventing thresholds, approving an algorithm, authenticating DB reads, flipping schema, or granting M7/merchant eligibility.

---

## 1. Exact canary grain

### 1.1 Frozen grain identity

Canary grain is exactly one tuple:

```
(organizationId, storeId, locationId, variantId)
```

| Rule | Status |
|---|---|
| UUID × 4; no wildcards, no org-only, no store-rollups | **FROZEN** |
| No cross-location or cross-variant aggregation | **FROZEN** (M6/PB1/PE1.a) |
| Multi-grain arrays / batches as eligibility units | **FORBIDDEN** |
| Metric-date is **not** part of M6 forecast grain (unlike M5 metric canary) | **FROZEN** — forecast grain is as-of + lookback on the 4-tuple |

### 1.2 Canary UUID selection — `POLICY_DECISION_REQUIRED`

| Option | Tradeoff |
|---|---|
| **A. Dedicated synthetic canary org** (mirror M5.6E.4 fixed UUIDs, new PE1 namespace) | Strong isolation; requires fixture commerce→metrics→forecast path; no merchant blast radius |
| **B. Real merchant grain in Preview Supabase only** | Realistic series; requires Preview/Prod isolation proof first (HR3.2b class); higher ops risk if env pin fails |
| **C. Real merchant grain in Production Supabase** | Highest realism; **rejected until** Preview isolation + SELECT pack + kill-switch proven — default **NO-GO** |

**This freeze does not pick A/B/C or mint UUIDs.** Future PE1.c+ must record exact UUIDs in a code allowlist constant (M5 pattern: `lib/canary/m5-6e4-stage3-oneshot.ts`).

### 1.3 Allowlist shape (frozen for future code; inactive today)

```
Pe1bCanaryAllowlistEntryV1 = {
  organizationId: uuid
  storeId: uuid
  locationId: uuid
  variantId: uuid
  // optional ops metadata — never trust for eligibility math:
  label?: string
  approvedBy?: string
  approvedAt?: string  // ISO timestamptz declaration only
  revokedAt?: string | null
}
```

Exactly **one** active entry permitted for the first canary. Empty allowlist ⇒ every grain **ineligible**.

---

## 2. Trusted database-read provenance vs PE1.a structural evidence

| Layer | What it proves | What it does **not** prove | Authority |
|---|---|---|---|
| **DB fresh-reader RPC** `read_fresh_published_sku_forecast` | Check-time pointer + `source_token` identity + publication numeric gates at statement time | Post-return freshness; forecast age; production eligibility; algorithm approval | `20261030160000`; `lib/persistence/read-fresh-published-sku-forecast.ts` |
| **PE1.a binder** `bindPublishedForecastEvidence` | Structural shape of a fresh-reader-**shaped** payload; mints WeakSet-gated success objects | Authenticated DB/RPC issuance; post-return freshness; production eligibility | `lib/decision-engine/published-forecast-eligibility.ts` |
| **PE1.b policy evaluator** (PE1.b.1 **implemented**; production activation **blocked**) | Allowlist + age + algorithm-pin + attestation gates on PE1.a-minted evidence under hard-false envelope | Merchant approval; M7.2 create; CHECK flip; authenticated DB provenance; production eligibility | `lib/decision-engine/canary-forecast-eligibility-policy.ts` + **this document** |

### 2.1 Normative authenticity classes

| `evidenceAuthenticity` | Meaning | May unlock technical canary numeric signal? | May unlock production M7 fields? |
|---|---|---|---|
| `fresh_reader_shaped_structural_only` (PE1.a / PE1.b.1 today) | Caller-shaped; structurally checked | Observe only (still production-ineligible) | **Never** |
| `db_rpc_fresh_reader_v1` (future authenticated path) | Evidence obtained via service-role call to `read_fresh_published_sku_forecast` under pinned project URL + attested grain | Required for any future canary numeric path that claims DB provenance | **Still no** until separate production attestation + schema path |
| `caller_forged` / unknown / PE1.b.1 forged `db_rpc_fresh_reader_v1` label | **Reject** (`ok:false`, code `AUTHENTICITY_CLASS_INSUFFICIENT`) | No | No |

**PE1.a remains valid preparation.** PE1.b **must not** treat PE1.a success as authenticated DB provenance. PE1.b.1 accepts PE1.a mint + structural authenticity **only** for policy-ineligible observation outcomes and **rejects** caller-forged DB authenticity claims with `ok:false` (does not emit an `ineligible_*` success for that case).

### 2.2 Trusted attestation authority — `POLICY_DECISION_REQUIRED`

Who may mint / rotate production-eligibility attestation constants?

| Option | Tradeoff |
|---|---|
| **A. Repo-pinned opaque constant** (like `M56E4_CANARY_APPROVAL_PHRASE`) + dual execute phrase | Simple; rotation = code change; matches M5 canary |
| **B. Separate signed operator attestation record** (table / sealed JSON) | Auditable revoke; needs schema + writer trust — out of PE1.b |
| **C. Env-only secret phrase** | Fast kill via unset; weaker code review trail |

**Recommendation:** Option **A** for first canary (mirror M5 dual-phrase), with env kill-switch as defense-in-depth — **not approved here**; decision required before PE1.c.

Frozen names (inactive; must never evaluate true under PE1.b docs alone):

| Constant (proposed) | Role |
|---|---|
| `m6-pe1b-canary-eligibility-policy-v1` | Policy evaluator version |
| `m6-pe1b-canary-policy-attestation-v1` | Authorizes **policy evaluation path only** |
| `M6_PE1B_CANARY_APPROVED` (phrase) | Future canary **ops** approval — not present in code today |
| Production gate `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` | PB1/PE1.a create gate — **remains unsatisfied** |

---

## 3. Forecast publication age and source freshness SLA

### 3.1 What is already frozen (do not reinterpret)

Exact check-time limitation (SQL + TS + PE1.a):

> `read_fresh_published_sku_forecast proves source_token identity and publication gates at check time only; it does not prove post-return freshness or acceptable forecast age. M7 owns forecast-age policy and must revalidate before acting.`

- `claimsPostCommitFreshness` is **always** `false`
- Token match ≠ age approval
- PE1.a always emits `AGE_POLICY_NOT_APPROVED` + `CHECK_TIME_FRESHNESS_ONLY`

### 3.2 Forecast-age SLA — `POLICY_DECISION_REQUIRED`

Define age as wall-clock delta from decision/eval time `T` to a chosen watermark. Watermark candidates:

| Watermark | Meaning |
|---|---|
| `forecastAsOf` (store-local date) | Calendar lag of forecast origin day |
| Publication `created_at` / pointer advance time | Artifact age |
| Live snapshot re-read at bind time | Source identity only (already required) |

**Recommended decision options (not selected):**

| Option | Rule sketch | Tradeoff |
|---|---|---|
| **Age-A** | `forecastAsOf >= store_local_today - 1` (same-day or prior calendar day only) | Tight; fails easily across TZ / late commerce |
| **Age-B** | `forecastAsOf >= store_local_today - 7` | Tolerates weekly batch; stale risk for fast movers |
| **Age-C** | Publication `created_at` within 24h **and** token revalidated at bind | Ops-friendly for canary; still needs TZ rules |
| **Age-D** | Defer all age enforcement to M7 bind; PE1.b only records `AGE_POLICY_NOT_APPROVED` | Safest for PE1.b docs; blocks any “canary actionable” claim |

**PE1.b default until decided:** **Age-D** — policy evaluator **must fail closed** with reason `AGE_POLICY_NOT_APPROVED` / decision state `ineligible_age_unapproved`. No numeric threshold is invented here.

### 3.3 Source freshness (distinct from age)

| Gate | Behavior | Status |
|---|---|---|
| Live snapshot `sourceToken` ≠ published pointer token | `STALE` | **FROZEN** (fresh-reader) |
| Pointer/run/publication token inconsistency | `STALE` / unavailable | **FROZEN** |
| Pending corrections on snapshot | `PENDING_CORRECTION` | **FROZEN** |
| Post-return commerce drift | Not covered by reader | Require re-read before any future action |

---

## 4. Minimum coverage, sufficiency, confidence, and evaluation evidence

### 4.1 Technical numeric bar (frozen — **not** production approval)

Inherited from fresh-reader / PE1.a eligible shape. All required for `technicalNumericEligible=true`:

| Gate | Required |
|---|---|
| Disposition | `eligible` |
| Confidence | `medium` \| `high` |
| Mode | `standard` \| `limited_history` |
| Data sufficiency | `sufficient` \| `limited` |
| Demand | finite `dailyDemand >= 0` |
| Pending corrections | none |
| Source token | fresh vs live snapshot |
| `claimsPostCommitFreshness` | `false` |
| Freshness limitation string | exact M6 check-time string |

History bands (calculation authority — **FROZEN**):

| Constant | Value |
|---|---|
| `LIMITED_HISTORY_MIN_DAYS_V1` | 7 (0–6 → `insufficient`) |
| `SUFFICIENT_HISTORY_MIN_DAYS_V1` | 28 (7–27 → `limited`) |
| `DEFAULT_FORECAST_LOOKBACK_DAYS_V1` | 90 (bounds 1..365) |

### 4.2 Coverage / missing-input rejection (frozen fail-closed)

| Condition | Policy |
|---|---|
| Missing calendar days / unknown availability | Incomplete — never silent zero demand |
| Evidence conflicts / duplicate identities | Reject / throw upstream; PE1.b maps to `CONFLICTING_EVIDENCE` / unavailable |
| `trustedCompleteDates` invented by caller | **FORBIDDEN** (PE1.a) |
| Returns/refunds incompleteness (PRA) | Treat as **P1 data-quality risk**; do not invent coverage thresholds here |

### 4.3 Evaluation evidence bar — `POLICY_DECISION_REQUIRED`

Diagnostic constant (not algorithm approval):

| Constant | Value | Proves |
|---|---|---|
| `FORECAST_BACKTEST_MIN_ORIGINS_V1` | 14 | Sample-floor messaging only |

| Option | Canary rule | Tradeoff |
|---|---|---|
| **Eval-A** | Ignore evaluation entirely for technical canary numeric observation | Fast; no accuracy evidence |
| **Eval-B** | Require diagnostic report with ≥14 origins **and** hard-false trust flags | Uses existing harness; still not algorithm approval |
| **Eval-C** | Require merchant-holdout / live PIT | **UNSUPPORTED** today (`UNSUPPORTED_HISTORICAL_REPLAY`) — **NO-GO** |

**PE1.b default:** evaluation **never** alone approves algorithm or production eligibility. Choosing Eval-A vs Eval-B is required before PE1.c; Eval-C is blocked by design.

### 4.4 Production coverage threshold beyond technical bar — `POLICY_DECISION_REQUIRED`

Whether canary production path (future) requires `sufficient` only (reject `limited`) is **not frozen**. Options:

| Option | Rule | Tradeoff |
|---|---|---|
| **Cov-A** | Accept technical bar as-is (`limited` OK) | Matches fresh-reader; higher cold-start risk |
| **Cov-B** | Require `sufficient` + `standard` + `high` only | Stricter canary; fewer grains qualify |

Do **not** invent a new percentage coverage SLA in PE1.b.

---

## 5. Algorithm approval policy and version pinning

### 5.1 Explicit non-approval

**No algorithm is approved by this document.** Diagnostic scores, backtests, and `m7NumericEligible` must not be inferred as `algorithmApproved=true`.

Evaluation SQL CHECK (frozen):

```sql
claims_production_approval = false
and claims_m7_numeric_eligibility = false
and algorithm_approved = false
```

### 5.2 Version pinning candidates (compute-time constants — FROZEN as code pins, not as canary allowlist)

| Constant | Value |
|---|---|
| `FORECAST_ORCHESTRATOR_VERSION_V1` | `forecast-orchestrator-v1` |
| `FORECAST_CONFIGURATION_VERSION_V1` | `forecast-config-v1` |
| `FORECAST_ALGORITHM_VERSIONS_V1.*` | `weighted-demand-v1`, `trend-adjustment-v1`, `stockout-censoring-v1`, `promotion-treatment-v1`, `cold-start-v1`, `forecast-confidence-v1`, `forecast-horizon-v1`, `forecast-backtest-v1` |

SQL persist/publish stores version strings but **does not CHECK** equality to these constants.

### 5.3 Canary algorithm pin — `POLICY_DECISION_REQUIRED`

| Option | Rule | Tradeoff |
|---|---|---|
| **Alg-A** | Reject unless `algorithm_version = forecast-orchestrator-v1` and config/fingerprint match current `FORECAST_*_V1` | Safe pin; breaks if versions bump without policy bump |
| **Alg-B** | Allow any non-blank version recorded on run | Too loose for canary |
| **Alg-C** | Explicit allowlist of N version tuples in policy module | Flexible; must be code-reviewed |

**Recommendation:** Alg-A for first canary — **not approved here**.

---

## 6. Pending corrections, conflicts, missing inputs, stale-data rejection

Fail-closed matrix (normative for future PE1.b evaluator; mirrors M6):

| Input condition | Fresh-reader / publish today | PE1.b policy decision state | Stable reason / note |
|---|---|---|---|
| No current pointer | `ABSENT` | `ineligible_absent` | `FORECAST_UNAVAILABLE` / `DISPOSITION_ABSENT` |
| Token drift vs live snapshot | `STALE` | `ineligible_stale` | `FORECAST_UNAVAILABLE` / `DISPOSITION_STALE` |
| Pending correction fence | `PENDING_CORRECTION` | `ineligible_pending_correction` | `FORECAST_UNAVAILABLE` / `DISPOSITION_PENDING_CORRECTION` |
| Low/none confidence | `FORECAST_CONFIDENCE_LOW` | `ineligible_confidence` | `FORECAST_CONFIDENCE_LOW` |
| Mode unavailable / insufficient / null demand / NaN | `FORECAST_UNAVAILABLE` | `ineligible_unavailable` | `FORECAST_UNAVAILABLE` |
| Grain mismatch vs trusted/allowlist | reject | `rejected_grain` | `GRAIN_MISMATCH` / `CANARY_ALLOWLIST_MISS` |
| Conflicting eligible flags | reject | `rejected_conflict` | `CONFLICTING_EVIDENCE` |
| Forged freshness / age claim | reject | `rejected_freshness_claim` | `FRESHNESS_CLAIM_REJECTED` / `AGE_POLICY_NOT_APPROVED` |
| Production trust claim true | reject | `rejected_trust_claim` | `PRODUCTION_TRUST_CLAIM_REJECTED` |
| Missing required identities | reject | `rejected_identity` | `IDENTITY_INVALID` / `EVIDENCE_MALFORMED` |
| Technically eligible + Age-D (age unapproved) | observe technical | `ineligible_age_unapproved` | `AGE_POLICY_NOT_APPROVED` + `ALGORITHM_PIN_MISS` + `FORECAST_FORCED_INELIGIBLE`; production attestation still blocked |
| Technically eligible + age+alg approved + inactive production attestation | observe technical | `ineligible_production_unapproved` | `FORECAST_FORCED_INELIGIBLE` + `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` blocked |

Publish soft withholds (`MODE_UNAVAILABLE`, `NULL_DEMAND`, `INSUFFICIENT_EVIDENCE`, `OLDER_AS_OF_THAN_CURRENT`, `OLDER_SOURCE_VERSION`) never create an eligible pointer advance for M7; PE1.b treats absence of eligible current pointer as `ineligible_absent` / unavailable.

---

## 7. Source-token / watermark consistency and replay protection

### 7.1 Token contract (frozen)

| Rule | Detail |
|---|---|
| Format | MD5 hex `^[a-f0-9]{32}$` (lowercased in adapters) |
| Semantics | Identity of included snapshot rows **at statement/check time** |
| Persist stale | Fail-closed `STALE_SOURCE_TOKEN` — no silent retry |
| Publish stale | Throw `ForecastPublishStaleTokenError` |
| Fresh-read stale | Disposition `STALE`, `m7NumericEligible=false` |
| Ordering | Older as_of / completed_at rules; **`source_token` differences never override** version ordering |

### 7.2 Replay protection (frozen)

| Event | Behavior |
|---|---|
| Same `forecast_run_id` already `published` | `disposition=replayed`; `pointerAdvanced=false`; no pointer move |
| Unique published-per-run index | Enforced in SQL |
| Unique-violation race | Resolved to replayed path |

### 7.3 PE1.b policy requirements

1. Policy evaluator must compare evidence `sourceToken` to the token returned by a **fresh** DB read when authenticity class is `db_rpc_fresh_reader_v1`.
2. Cached PE1.a structural binds must not be reused across time as freshness proof.
3. Replay of an old publication id against a moved pointer → fail closed (`STALE` / allowlist miss / conflict).
4. M5 metric watermark (`m7-pb1-metric-source-watermark-v1|…`) is **orthogonal** provenance for metrics — not a substitute for forecast `sourceToken`.

---

## 8. Explicit allowlist, authorization, and revocation

### 8.1 Authorization rules (frozen shape)

A grain is **canary-allowlisted** iff **all** hold:

1. Exact 4-UUID match against the single active allowlist entry
2. `revokedAt` is null
3. Policy attestation constant matches pinned PE1.b attestation (when evaluator exists)
4. Caller hard-false trust flags are exactly `false`
5. No bypass keys (`m7Eligible`, `forecastExpectedDemandUnits`, etc.)

Otherwise: **not allowlisted** → fail closed.

### 8.2 Revocation (frozen requirements; mechanism `POLICY_DECISION_REQUIRED`)

Minimum revoke semantics:

| Action | Effect |
|---|---|
| Set `revokedAt` / remove allowlist entry | Immediate policy miss for that grain |
| Unset env kill-switch / approval phrase | All canary paths refuse |
| Flip workers ENABLE off | No forecast HTTP/cron activation (today already OFF / absent) |

Revoke must **not** require dropping SQL CHECK or rewriting historical publications. Historical rows remain `m7_eligible=false`.

### 8.3 Isolation (mirror M5; not re-proven this session)

- Prefer Preview vs Prod pin before any real-merchant grain (Option B/C in §1.2)
- Service-role only; never anon/authenticated EXECUTE on forecast RPCs
- Do not drain leftover M5 E.4 dirty grains as a side effect
- Do not enable metric/forecast workers for PE1.b

---

## 9. Eligibility decision states, stable reason codes, and failure matrix

### 9.1 Decision states (PE1.b vocabulary)

| State | Meaning | Decision forecast fields |
|---|---|---|
| `rejected_*` | Envelope/evidence invalid | N/A (rejection object) |
| `ineligible_absent` | No usable publication | `forecastEligibility="ineligible"`, units `null`, confidence `"low"` |
| `ineligible_stale` | Token / pointer drift | same |
| `ineligible_pending_correction` | Correction fence | same |
| `ineligible_confidence` | Low/none confidence | same (+ `FORECAST_CONFIDENCE_LOW`) |
| `ineligible_unavailable` | Mode/sufficiency/demand gates | same |
| `ineligible_allowlist` | Grain not on canary allowlist | same |
| `ineligible_age_unapproved` | Age SLA missing or failed (Age-D) | same — **PE1.b.1 / Age-D default for technical+allowlisted** |
| `ineligible_algorithm_unapproved` | Algorithm pin miss / unapproved | same — only after age gate is approved |
| `ineligible_production_unapproved` | Technical OK; age+alg approved; production attestation inactive | same — reachable only after age+algorithm gates clear |
| `technical_numeric_observed` | Annotation only when fresh-reader eligible | Still production-ineligible fields (not a primary PE1.b.1 `decisionState`) |
| `production_eligible` | Reserved | **FORBIDDEN under PE1.b** — must not be emitted by any PE1.b-authorized code |

**Precedence (normative; strictest wins; do not mask):**
invalid/allowlist → miss dispositions → **age** unapproved → **algorithm** unapproved → **production** unapproved.
Under Age-D + unapproved algorithm pin (PE1.b.1 envelope), technical+allowlisted emits `ineligible_age_unapproved`, **not** `ineligible_production_unapproved`.

### 9.2 Stable reason / note codes

**Engine reason codes (existing):** `FORECAST_UNAVAILABLE`, `FORECAST_CONFIDENCE_LOW`

**PE1.a mapping notes (reuse):**
`FORECAST_FORCED_INELIGIBLE`, `TECHNICAL_NUMERIC_SIGNAL_OBSERVED`, `TECHNICAL_NUMERIC_SIGNAL_ABSENT`, `AGE_POLICY_NOT_APPROVED`, `CHECK_TIME_FRESHNESS_ONLY`, `OBSERVED_DEMAND_NOT_DECISION_INPUT`, disposition notes.

**PE1.b additional policy notes (PE1.b.1 emits on success paths where applicable):**
`CANARY_ALLOWLIST_MISS`, `CANARY_ALLOWLIST_REVOKED`, `ALGORITHM_PIN_MISS`, `AUTHENTICITY_CLASS_INSUFFICIENT`, `HOSTED_SELECT_PACK_UNVERIFIED`, `KILL_SWITCH_ACTIVE`, `PRODUCTION_ATTESTATION_INACTIVE`.

**Machine-readable blockers (mandatory on PE1.b.1 `ok:true` successes; not optional prose):**
`AGE_POLICY_NOT_APPROVED`, `ALGORITHM_PIN_MISS` (plus `PRODUCTION_ATTESTATION_INACTIVE` / `HOSTED_SELECT_PACK_UNVERIFIED` while those remain inactive/unverified). Primary `decisionState` names the strictest gate; **all still-applicable blockers remain in `mappingNotes`**.

**Binding failure codes (PE1.a; reuse):**
`BINDING_ATTESTATION_INVALID`, `PRODUCTION_TRUST_CLAIM_REJECTED`, `GRAIN_MISMATCH`, `EVIDENCE_MALFORMED`, `EVIDENCE_UNTRUSTED`, `FRESHNESS_CLAIM_REJECTED`, `IDENTITY_INVALID`, `CONFLICTING_EVIDENCE`, `CROSS_GRAIN_AGGREGATION_FORBIDDEN`.

**PE1.b.1 policy failure codes (also on `ok:false`):**
`POLICY_ATTESTATION_INVALID`, `AUTHENTICITY_CLASS_INSUFFICIENT`, `AGE_POLICY_REJECTED`, `ALGORITHM_PIN_POLICY_REJECTED` (and allowlist note codes when used as failure vocabulary).

### 9.3 Failure matrix (summary)

```
invalid envelope/trust/age-claim     → rejected_* (ok:false)
grain ∉ allowlist / revoked          → ineligible_allowlist
authenticity forged/insufficient     → ok:false + AUTHENTICITY_CLASS_INSUFFICIENT
fresh-reader miss dispositions       → mapped ineligible_* (§6)
technical eligible + age undecided   → ineligible_age_unapproved (Age-D default) ★ PE1.b.1 steady
technical eligible + age OK + alg unapproved → ineligible_algorithm_unapproved
technical eligible + age+alg OK + prod inactive → ineligible_production_unapproved
any path claiming production_eligible→ FORBIDDEN / architecture fail
```

---

## 10. Separation of three eligibility planes

| Plane | Signal | Unlocks |
|---|---|---|
| **A. Technical numeric eligibility** | Fresh-reader `disposition=eligible` + `m7NumericEligible=true` | Observation / diagnostics only |
| **B. Forecast production approval** | Explicit PE1 attestation + (future) schema path that can set `m7_eligible=true` + operation approval | Future binding of `forecastExpectedDemandUnits` / `forecast_run_id` — **HARD-FALSE today** |
| **C. M7 merchant decision eligibility** | All `PRODUCTION_CREATE_GATES` + trusted M7.2 writer + M7.3 approvable predicate | Merchant-approvable actions — **HARD-FALSE today** |

```
A ⊄ B ⊄ C
clearing A ≠ clearing B
clearing B ≠ clearing C
```

PB1 `PRODUCTION_CREATE_GATES` (unchanged):

1. `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED`
2. `TRUSTED_INCOMING_EVIDENCE_AVAILABLE`
3. `TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED`
4. `M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED`

PE1.b may prepare policy text for (1) only. It must **not** claim (1) is satisfied.

---

## 11. Hosted SELECT-only verification requirements

**PE1.b authorizes planning of a SELECT pack — not execution in this session.** Hosted live state remains **UNKNOWN** until an operator runs the pack.

### 11.1 Required SELECT pack (operator; read-only)

Mirror HR2 / M5.6E.2 patterns. No consume/claim/publish/persist/eval RPCs.

1. **Identity:** `current_database()`, `current_user`, `inet_server_addr()` / project pin confirmation
2. **Migrations present:** at least
   `20261030130000`, `20261030140000`, `20261030150000`, `20261030160000`, `20261030200000`, plus M7 persistence if claiming adjacency
3. **CHECK proof:** `sku_forecast_publications_m7_eligible_false` → `m7_eligible = false`
   and `sku_forecast_publications_no_freshness_claim` → `persist_claims_post_commit_freshness = false`
   and evaluation trust hard-false CHECK
4. **RPC security:** `read_fresh_published_sku_forecast` / `publish_sku_forecast` / persist RPCs are `SECURITY DEFINER`, `search_path=''`, EXECUTE for `service_role` only; **revoke** anon/authenticated
5. **Table grants:** service_role SELECT-only on forecast publication/current/run tables where intended; RLS on
6. **Row posture:** counts for `forecast_runs`, `sku_forecasts`, `sku_forecast_publications`, `sku_forecast_current`, `forecast_evaluation_runs` — expect empty or explicitly documented non-prod canary-only; **flag any `m7_eligible=true` as P0 incident** (should be impossible under CHECK)
7. **Timezone hygiene:** canary store (once chosen) has recognized IANA `stores.timezone`
8. **Live env (console, not SQL):** forecast workers/cron absent; metric workers ENABLE ≠ `1`; no vercel forecast cron

### 11.2 Explicit non-goals of the pack

- No `publish_sku_forecast`, persist, or eval writes
- No fresh-reader use as production approval evidence without policy evaluator + attestation
- No merchant deep-dive beyond pinned canary grain (once chosen)

Until pack passes: emit policy note `HOSTED_SELECT_PACK_UNVERIFIED` and keep **NO-GO** for PE1.c.

---

## 12. Audit logging, rollback, and kill-switch

### 12.1 Audit logging (required before any future canary mutate)

Minimum fields for any future PE1 policy evaluation or canary ops event:

| Field | Required |
|---|---|
| `policyVersion` | `m6-pe1b-canary-eligibility-policy-v1` |
| `grain` | 4-tuple |
| `decisionState` | §9.1 |
| `reasonCodes` / `mappingNotes` | stable codes |
| `evidenceAuthenticity` | §2.1 |
| `sourceToken` | if present |
| `publicationId` / `forecastRunId` | if present |
| `technicalNumericEligible` | boolean |
| `productionAttestationActive` | must be false under PE1.b |
| `actor` / `approvalPhrasePresent` | ops path only |
| `at` | timestamptz |

Logs must not claim merchant performance or algorithm approval.

### 12.2 Rollback

| Layer | Rollback action |
|---|---|
| Allowlist | Revoke entry / empty list |
| Pointer | Do **not** delete immutable publications; publish does not grant M7 eligibility today |
| Schema | **No** CHECK relaxation to roll back — CHECK already enforces false |
| Code attestation | Revert constant / remove phrase |
| Decisions | M7.2 still forbids `forecast_run_id`; nothing to unbind in production |

### 12.3 Kill-switches (defense in depth)

1. Empty / revoked canary allowlist
2. Missing approval phrase / env flag ≠ exact approved value
3. Workers ENABLE unset (404 pattern from M5)
4. SQL `m7_eligible=false` CHECK (always on)
5. PB1 refuses non-`ineligible` forecast eligibility
6. PE1.a forces ineligible decision fields
7. M7.2 `forecast_run_id IS NULL` + merchant approvable hard-false

PE1.b relies on (1)+(4)+(5)+(6)+(7) without implementing (2)–(3).

---

## 13. Safe relationship to SQL `m7_eligible=false` CHECK and PB1/M7 hard-false gates

### 13.1 Must not change

| Control | Locus | PE1.b duty |
|---|---|---|
| `check (m7_eligible = false)` | `20261030150000_m6_p3d1_forecast_publication.sql` | Preserve; SELECT-verify only |
| Publish adapter forces `m7Eligible: false` | `publish-forecast-sku-demand.ts` | Preserve |
| Fresh-reader `claimsPostCommitFreshness: false` | reader SQL/TS | Preserve |
| PE1.a always `forecastEligibility: "ineligible"` | `published-forecast-eligibility.ts` | Preserve |
| PB1 requires `forecastEligibility: "ineligible"` | `metric-decision-binding.ts` | Preserve |
| M7.2 `forecast_run_id is null` | `20261031100000` | Preserve |
| M7.3 merchant approvable `false` | `20261031130000` | Preserve |
| Evaluation trust hard-false CHECK | `20261030200000` | Preserve |

### 13.2 How PE1.b coexists

PE1.b is a **policy overlay** that can only add **more** rejection reasons. It cannot widen eligibility past technical observation, and it cannot set production-true flags.

Future CHECK relaxation (if ever) requires a **separate** explicit migration approval after PE1.c canary operation approval — **out of scope** and **NO-GO** here.

---

## 14. Policy evaluator — exact I/O contract

### 14.1 Module status

Path: `lib/decision-engine/canary-forecast-eligibility-policy.ts`
Version: `m6-pe1b-canary-eligibility-policy-v1`
**Status:** PE1.b.1 **implemented** (pure TS + tests). Production eligibility activation, attestation satisfaction, algorithm approval, numeric age SLA, canary UUID selection, publish/persist callers, and PE1.c remain **NO-GO** / `POLICY_DECISION_REQUIRED` as listed in §19.

### 14.2 Input

```ts
Pe1bCanaryPolicyEvaluateRequest = {
  policyVersion: "m6-pe1b-canary-eligibility-policy-v1";
  policyAttestation: "m6-pe1b-canary-policy-attestation-v1";
  trustedGrain: ForecastGrain; // exact 4-tuple
  /**
   * Prefer: PE1.a trusted binding success minted by bindPublishedForecastEvidence
   * plus authenticity class. Structural-only authenticity must not unlock
   * production eligibility. Under Age-D it may observe technical numeric
   * signal only while emitting ineligible_age_unapproved (or a stricter miss),
   * never production_eligible / m7Eligible=true.
   */
  binding: Pe1aPublishedForecastBindingSuccess; // runtime-gated via isPe1aTrusted…
  evidenceAuthenticity:
    | "fresh_reader_shaped_structural_only"
    | "db_rpc_fresh_reader_v1"; // forged claim without authenticated path → ok:false
  canaryAllowlist: Pe1bCanaryAllowlistEntryV1[]; // empty ⇒ miss
  // Hard-false required:
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;
  // Forbidden bypass keys: m7Eligible, forecastExpectedDemandUnits, etc.
  /**
   * Age SLA fields — must be absent or explicitly "unapproved" until
   * POLICY_DECISION_REQUIRED resolves. Supplying a numeric maxAge without
   * frozen policy must reject.
   */
  forecastAgePolicy: "unapproved";
  algorithmPinPolicy: "unapproved" | { /* only after Alg decision */ };
  productionEligibilityAttestation: null; // must be null under PE1.b
}
```

### 14.3 Output

```ts
Pe1bCanaryPolicyEvaluateResult =
  | {
      ok: false;
      policyVersion: "m6-pe1b-canary-eligibility-policy-v1";
      code: Pe1aBindingFailureCode | Pe1bPolicyFailureCode;
      detail: string;
      provenance: /* hard-false; m7Eligible:false; forecastEligibility:"ineligible" */;
    }
  | {
      ok: true;
      policyVersion: "m6-pe1b-canary-eligibility-policy-v1";
      grain: ForecastGrain;
      decisionState: Exclude<Pe1bDecisionState, "production_eligible">;
      technicalNumericEligible: boolean;
      forecastEligibility: "ineligible";
      forecastExpectedDemandUnits: null;
      forecastConfidence: "low";
      reasonCodes: readonly InventoryDecisionReasonCode[];
      mappingNotes: readonly string[];
      productionCreateBlockedUntil: typeof PRODUCTION_CREATE_GATES;
      warnings: readonly [
        "m6_pe1b_canary_policy_only",
        "NOT_production_forecast",
        "NOT_m7_eligible",
        "NOT_merchant_facing",
        "NOT_production_activation",
        // ...
      ];
    };
```

### 14.4 Fail-closed default

**Default outcome under PE1.b / Age-D (PE1.b.1 steady technical+allowlisted path):**
`decisionState = ineligible_age_unapproved` (or a stricter miss: invalid/`ok:false`, allowlist, or disposition `ineligible_*`) with `forecastEligibility="ineligible"`, units `null`, confidence `"low"`, `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` listed in `productionCreateBlockedUntil`, and machine-readable mappingNotes including at least `AGE_POLICY_NOT_APPROVED` and `ALGORITHM_PIN_MISS`.

`ineligible_production_unapproved` is **not** the Age-D default; it applies only after age and algorithm gates are approved while production attestation remains inactive.

Emitting `production_eligible` or `m7Eligible: true` is an architecture defect.

---

## 15. P0 / P1 dependencies

### 15.1 P0 — block any canary eligibility claim / PE1.c

| ID | Blocker | Class |
|---|---|---|
| PE1B-P0-1 | Production forecast operation / callers still NOT APPROVED | policy / missing |
| PE1B-P0-2 | SQL `m7_eligible=false` CHECK — cannot claim row-level M7 eligibility | schema (keep) |
| PE1B-P0-3 | PB1 + PE1.a force forecast ineligible | contract (keep) |
| PE1B-P0-4 | Forecast-age SLA unresolved (`POLICY_DECISION_REQUIRED`, Age-D default) | missing policy |
| PE1B-P0-5 | Hosted M6 SELECT pack not executed this session | UNKNOWN ops |
| PE1B-P0-6 | Canary UUID / isolation choice unresolved | missing policy |
| PE1B-P0-7 | Trusted attestation authority unresolved | missing policy |
| PE1B-P0-8 | Live historical PIT unsupported → no merchant accuracy path | design blocked |

### 15.2 P1 — required before PE1.c controlled publish path

| ID | Gap | Class |
|---|---|---|
| PE1B-P1-1 | Policy evaluator module + architecture tests | **CLEARED by PE1.b.1** (`canary-forecast-eligibility-policy.ts` + tests); production activation still NO-GO |
| PE1B-P1-2 | Algorithm pin policy (Alg-A/B/C) | `POLICY_DECISION_REQUIRED` |
| PE1B-P1-3 | Eval-A vs Eval-B evidence bar | `POLICY_DECISION_REQUIRED` |
| PE1B-P1-4 | Cov-A vs Cov-B production coverage bar | `POLICY_DECISION_REQUIRED` |
| PE1B-P1-5 | Continuous commerce→metrics→forecast loop unverified; workers OFF | PARTIAL / UNKNOWN |
| PE1B-P1-6 | Incoming-unknown coexistence with forecast-eligible WATCH/HEALTHY | open (PB1/PRA) |
| PE1B-P1-7 | Returns/refunds incompleteness risk on demand series | PARTIAL |
| PE1B-P1-8 | Explicit kill-switch env + approval phrases (code) | missing |
| PE1B-P1-9 | Audit log sink for policy evaluations | missing |

---

## 16. Minimum tests required before any future implementation

Gate any PE1.b **code** slice behind (PE1.b.1 satisfied these; retain for regressions):

1. **Allowlist miss / revoke** → `ineligible_allowlist`; no units invented
2. **Empty allowlist** → all grains ineligible
3. **PE1.a technical eligible + structural authenticity** → `ineligible_age_unapproved` under Age-D; units null; still production-ineligible
4. **Age policy `unapproved`** → never production-eligible; decisionState `ineligible_age_unapproved` when technical+allowlisted; note `AGE_POLICY_NOT_APPROVED`
5. **Freshness claim true / wrong limitation string** → reject
6. **Production trust claims true** → reject
7. **Grain mismatch / cross-grain array** → reject
8. **Miss dispositions** map to §6 states + reason codes
9. **Architecture:** no publish/persist imports; no `m7_eligible = true`; no `production_eligible` emission; no PB1 hard-false weakening; no SQL/migration edits in the slice
10. **Algorithm pin unapproved** → cannot emit production-eligible; note `ALGORITHM_PIN_MISS`
11. **Forged `db_rpc_fresh_reader_v1` / insufficient authenticity** → `ok:false` + `AUTHENTICITY_CLASS_INSUFFICIENT`
12. **typecheck + focused unit/architecture tests green**

Hosted SELECT pack is an **ops** gate, not a unit test — still P0 for PE1.c.

---

## 17. Implementation slice status

### Name

**M6-PE1.b.1 — Fail-closed canary policy evaluator (pure TS + tests)** — **IMPLEMENTED** on `main` @ `debb032`

### Delivered (historical)

- Pure module implementing §14 with:
  - empty/inactive allowlist fail-closed
  - `forecastAgePolicy: "unapproved"` → `ineligible_age_unapproved` for technical+allowlisted
  - `productionEligibilityAttestation: null`
  - authenticity `fresh_reader_shaped_structural_only` accepted only for ineligible observation; forged DB class → `ok:false`
- Unit + architecture tests from §16 (as reconciled)
- Mandatory machine-readable `AGE_POLICY_NOT_APPROVED` + `ALGORITHM_PIN_MISS` on success paths

### Still out of scope / blocked (unchanged)

- SQL / CHECK / PB1 / PE1.a semantic changes
- Hosted SELECT execution, publish/persist callers, workers, cron
- Choosing canary UUIDs or setting approval phrases true
- Algorithm approval, age threshold numbers, M7.2/M7.3 flips
- Clearing `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED`
- Any production eligibility activation

### After PE1.b.1 (separate approvals; unchanged checklist)

1. Resolve remaining `POLICY_DECISION_REQUIRED` items (age beyond Age-D default, alg, eval, coverage, authority, UUID) — §19
2. Operator SELECT pack pass
3. **M6-PE1.c** — controlled single-grain persist→publish under workers-OFF (still merchant/M7.2 **NO-GO**)

---

## 18. GO / NO-GO matrix

| Action | Decision |
|---|---|
| Accept this PE1.b policy contract (docs only), including C1/C3/C4/C5 reconciliation | **GO** |
| Claim production forecast eligibility / M7 forecast consumption | **NO-GO** |
| PE1.b.1 policy evaluator module (pure offline) | **IMPLEMENTED** — production activation still **NO-GO** |
| Activate production attestation / clear `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` | **NO-GO** |
| Relax `m7_eligible=false` CHECK / set true | **NO-GO** |
| Wire production persist/publish/eval callers | **NO-GO** |
| Run hosted SELECT pack / canary / publish | **NO-GO** under this approval (pack may be run later under ops approval) |
| Treat PE1.a structural bind or `m7NumericEligible` as production approval | **NO-GO** |
| Change PB1 to accept production forecasts | **NO-GO** |
| Approve any forecast algorithm | **NO-GO** |
| Invent age/coverage/accuracy thresholds as frozen numbers | **NO-GO** (mark decisions; Age-D default) |
| M7.2 production writer / M7.3 merchant success / E4 / AI / purchasing | **NO-GO** |
| Alter frozen M5/M6/M7 math | **NO-GO** |

---

## 19. Unresolved decisions checklist (`POLICY_DECISION_REQUIRED`)

1. **Canary UUID + isolation** (Options A/B/C in §1.2)
2. **Attestation authority** (Options A/B/C in §2.2)
3. **Forecast-age SLA** (Age-A..D; default Age-D fail-closed)
4. **Algorithm pin** (Alg-A/B/C; no algorithm approved)
5. **Evaluation evidence bar** (Eval-A/B; Eval-C blocked)
6. **Coverage bar beyond technical** (Cov-A/B)
7. **When/whether SQL may allow `m7_eligible=true`** (separate migration approval — not PE1.b)
8. **Whether clearing gate (1) may unlock `forecast_run_id` without M7.3** (M7.2a separate)
9. **Hosted SELECT pack execution + env pin proof**
10. **Incoming-unknown coexistence** with any future forecast-eligible decision paths

---

## Freeze checklist

- [x] HEAD `e557b2a` verified at original freeze; dirty tree preserved aside from this file
- [x] Canary grain = exact org/store/location/variant; UUID selection deferred
- [x] DB-read provenance vs PE1.a structural evidence separated
- [x] Age SLA marked `POLICY_DECISION_REQUIRED` with options; default fail-closed Age-D → `ineligible_age_unapproved`
- [x] Technical coverage/confidence/sufficiency reused; production bars deferred
- [x] Algorithm explicitly **not** approved; pin options listed
- [x] Pending/stale/conflict/missing rejection matrix frozen
- [x] Source-token + replay rules referenced
- [x] Allowlist / authz / revoke / kill-switch requirements frozen
- [x] Decision states + reason codes + failure matrix defined (precedence: invalid/allowlist → age → algorithm → production)
- [x] Planes A/B/C separated from M7 merchant eligibility
- [x] Hosted SELECT-only pack specified (not executed)
- [x] Audit / rollback / kill-switch requirements recorded
- [x] SQL CHECK + PB1/M7 hard-false coexistence stated as preserve-only
- [x] Evaluator I/O contract specified; PE1.b.1 implemented; fail-closed Age-D default recorded
- [x] P0/P1, minimum tests, slice status, GO/NO-GO recorded
- [x] Docs reconciliation C1/C3/C4/C5 applied (2026-11-04 @ `debb032`); §19 unresolved decisions preserved
- [ ] Production forecast eligibility / publication / canary execution — **not authorized**

**PE1.b policy freeze COMPLETE (docs only), with PE1.b.1 implementation reconciled.**
**STOP.** No forecast publication, eligibility loosening, SQL, hosted queries, or activation under this approval. Remaining §19 items stay `POLICY_DECISION_REQUIRED`.
