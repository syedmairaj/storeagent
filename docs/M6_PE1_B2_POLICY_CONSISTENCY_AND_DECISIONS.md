# M6-PE1.b.2 — Policy Consistency & Decision Freeze

**Mode:** DOCUMENTATION ONLY. No implementation, SQL, migrations, hosted queries, policy activation, algorithm approval, numeric SLA approval, canary UUID selection, PB1/M7 eligibility changes, workers/cron, Vercel deployment, M7.3, E4, AI, purchasing, or inventory mutation.
**As-of:** 2026-11-04
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested:** `main` @ `debb032`
**Verified HEAD:** `debb03225ca58123326863d0ef15f4f4fc9930fb` — `feat(forecast): add fail-closed canary eligibility policy evaluator`
**Dirty tree:** Unrelated dirty files preserved untouched except creation of **this** file.
**Parents / authority:**
- `docs/M6_PE1_B_CANARY_FORECAST_ELIGIBILITY_POLICY.md` (PE1.b freeze — **C1/C3/C4/C5 reconciled** in follow-on docs edit)
- `docs/M6_PE1_FORECAST_ELIGIBILITY_READINESS.md` (PE1 sequencing)
- `lib/decision-engine/canary-forecast-eligibility-policy.ts` (PE1.b.1 implemented evaluator)
- `lib/decision-engine/published-forecast-eligibility.ts` (PE1.a structural binder)
- PE1.a / PE1.b.1 unit + architecture tests
- M6 publication / fresh-reader + PB1 / M7 hard-false contracts

**Authority when docs conflict:** this document for **PE1.b ↔ PE1.b.1 consistency reconciliation, fail-closed precedence freeze, unresolved decision framing, SELECT/P0/P1 posture, and next-milestone order only**. It does **not** approve production forecast eligibility, invent thresholds, or select canary UUIDs. PE1.b contract amendments for C1/C3/C4/C5 are **applied** in the PE1.b file; remaining §19 items stay `POLICY_DECISION_REQUIRED`.

**A documented recommendation is NOT approval.**

---

## 0. Executive verdict

| Question | Verdict |
|---|---|
| Does PE1.b.1 match PE1.b fail-closed hard-false production posture? | **YES** |
| Is decision-state precedence internally consistent in **code** (age → alg → production)? | **YES** (PE1.b.1) |
| Is the frozen PE1.b **doc** consistent with that precedence after C1/C3/C4/C5 reconciliation? | **YES** |
| May production forecast eligibility / `m7_eligible=true` / PB1 gate clear? | **NO** — hard-false |
| Are age SLA, algorithm pin, eval bar, coverage, UUID, attestation authority decided? | **NO** — `POLICY_DECISION_REQUIRED` |
| Overall PE1.b.2 production trust | **NO-GO** |

**One-line:** PE1.b.2 freezes the **implemented** fail-closed precedence and evidence planes; C1/C3/C4/C5 doc contradictions are **reconciled** in the PE1.b contract; remaining production-eligibility decisions stay unresolved without inventing numbers or approvals.

---

## A. Verified implementation-to-contract reconciliation

### A.1 What PE1.b.1 actually implements (code truth)

Module: `lib/decision-engine/canary-forecast-eligibility-policy.ts`
Version / attestation (path-only; inactive for production):
`m6-pe1b-canary-eligibility-policy-v1` / `m6-pe1b-canary-policy-attestation-v1`

#### Evaluation order (observed)

1. **Request envelope** — policy version/attestation; hard-false trust claims; `forecastAgePolicy === "unapproved"`; `algorithmPinPolicy === "unapproved"`; `productionEligibilityAttestation === null`; forbid bypass keys; allowlist must be an array; known authenticity class.
2. **Grain identity** — exact 4-UUID `trustedGrain` clone/validate.
3. **PE1.a mint gate** — `isPe1aTrustedPublishedForecastBindingSuccess` (WeakSet); clones/spreads/JSON/`structuredClone` fail → `EVIDENCE_UNTRUSTED`.
4. **Binding grain match** — binding.grain vs trustedGrain → else `GRAIN_MISMATCH`.
5. **Defensive PE1.a hard-false / freshness re-check** — ineligible fields, `claimsPostCommitFreshness === false`, exact check-time limitation string; provenance trust flags false.
6. **Authenticity** — PE1.a provenance must be `fresh_reader_shaped_structural_only`; caller `db_rpc_fresh_reader_v1` **rejected** (`AUTHENTICITY_CLASS_INSUFFICIENT`); no upgrade from caller labels.
7. **Allowlist** — empty / all-revoked / ≠1 active / cross-grain / duplicate active → `ok:true` + `decisionState: ineligible_allowlist` (not an authorized match). Malformed entries → `ok:false`.
8. **Disposition / technical path** — miss dispositions → mapped `ineligible_*`; technical `eligible` → `selectTechnicalIneligibleState` (age → algorithm → production).

#### Implemented decision states (emitted)

| Condition | `ok` | `decisionState` / `code` |
|---|---|---|
| Envelope / trust / age-policy object / alg-pin object / attestation non-null / bypass keys | `false` | codes below (no decisionState) |
| Forged/unminted PE1.a binding | `false` | `EVIDENCE_UNTRUSTED` |
| Grain mismatch (trusted vs binding) | `false` | `GRAIN_MISMATCH` |
| Freshness / hard-false binding breach | `false` | `FRESHNESS_CLAIM_REJECTED` / `PRODUCTION_TRUST_CLAIM_REJECTED` |
| Forged `db_rpc_fresh_reader_v1` / unknown authenticity | `false` | `AUTHENTICITY_CLASS_INSUFFICIENT` |
| Allowlist miss / revoke / duplicate / multi-active / cross-grain | `true` | `ineligible_allowlist` |
| Disposition `ABSENT` | `true` | `ineligible_absent` |
| Disposition `STALE` | `true` | `ineligible_stale` |
| Disposition `PENDING_CORRECTION` | `true` | `ineligible_pending_correction` |
| Disposition `FORECAST_CONFIDENCE_LOW` | `true` | `ineligible_confidence` |
| Disposition `FORECAST_UNAVAILABLE` | `true` | `ineligible_unavailable` |
| Technical eligible + allowlisted + Age-D + alg unapproved (PE1.b.1 steady) | `true` | `ineligible_age_unapproved` |
| `production_eligible` | — | **never emitted** (type-excluded + defensive guard) |

`ineligible_algorithm_unapproved` and `ineligible_production_unapproved` are **reachable only if** age (then algorithm) flags become approved — **not** under current PE1.b.1 request envelope, which forces age/alg `"unapproved"` and attestation `null`.

`technical_numeric_observed` exists on the type union but is **not** emitted as `decisionState`; technical observation is signaled via `technicalNumericEligible` + `TECHNICAL_NUMERIC_SIGNAL_OBSERVED` mapping note.

#### Rejection / policy failure codes (implemented)

**PE1.a reuse on `ok:false`:**
`EVIDENCE_UNTRUSTED`, `GRAIN_MISMATCH`, `FRESHNESS_CLAIM_REJECTED`, `PRODUCTION_TRUST_CLAIM_REJECTED`, `IDENTITY_INVALID`, `EVIDENCE_MALFORMED`, `CROSS_GRAIN_AGGREGATION_FORBIDDEN`

**PE1.b.1 additions on `ok:false`:**
`POLICY_ATTESTATION_INVALID`, `AUTHENTICITY_CLASS_INSUFFICIENT`, `AGE_POLICY_REJECTED`, `ALGORITHM_PIN_POLICY_REJECTED`

#### Mapping notes / blockers (implemented; success paths)

Always present on PE1.b.1 `ok:true` successes (via `buildMappingNotes` with age/alg/prod flags true):

| Code | Role |
|---|---|
| `FORECAST_FORCED_INELIGIBLE` | Production decision fields forced ineligible |
| `CHECK_TIME_FRESHNESS_ONLY` | Source-token check-time limitation preserved |
| `OBSERVED_DEMAND_NOT_DECISION_INPUT` | Observed demand ≠ decision input |
| `HOSTED_SELECT_PACK_UNVERIFIED` | Operator SELECT pack not proven this track |
| `AGE_POLICY_NOT_APPROVED` | **Machine-readable Age-D blocker** |
| `ALGORITHM_PIN_MISS` | **Machine-readable algorithm-pin blocker** |
| `PRODUCTION_ATTESTATION_INACTIVE` | Production attestation null / inactive |

Allowlist-specific: `CANARY_ALLOWLIST_MISS` / `CANARY_ALLOWLIST_REVOKED`.
Plus PE1.a disposition / technical notes copied from the binding (`TECHNICAL_NUMERIC_SIGNAL_*`, `DISPOSITION_*`, etc.).

#### Hard-false production fields (every result)

- `forecastEligibility: "ineligible"`
- `forecastExpectedDemandUnits: null`
- `forecastConfidence: "low"`
- provenance `m7Eligible: false`, `productionAttestationActive: false`, all trust claims false
- `productionCreateBlockedUntil` includes `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` (+ remaining PB1 gates)

Engine reason codes reused from binding: `FORECAST_UNAVAILABLE` or `FORECAST_CONFIDENCE_LOW` only — no invented production reason codes.

### A.2 Confirmed contradictions (historical) → reconciliation status

Originally cataloged as PE1.b freeze text vs PE1.b.1 code. **C1, C3, C4, C5 resolved** by explicit PE1.b contract edit (2026-11-04). **C2** was already aligned.

| ID | Original issue | Resolution | Status |
|---|---|---|---|
| **C1** | §§9.1 / 14.4 / 16.3 named `ineligible_production_unapproved` as technical default | Age-D default = `ineligible_age_unapproved`; production_unapproved only after age+alg clear; §6 matrix row split | **RESOLVED** |
| **C2** | §3.2 / §9.3 age→alg→production | Matches PE1.b.1 `selectTechnicalIneligibleState` | **ALIGNED** (unchanged) |
| **C3** | §14.2 structural “beyond production_unapproved” wording | Structural must not unlock production; Age-D observation → `ineligible_age_unapproved` (or stricter miss) | **RESOLVED** |
| **C4** | §9.3 authenticity as ineligible success | Forged/insufficient authenticity → `ok:false` + `AUTHENTICITY_CLASS_INSUFFICIENT` | **RESOLVED** |
| **C5** | §2 evaluator labeled “(future)” | PE1.b.1 **implemented**; production activation still blocked | **RESOLVED** |

**Consistency verdict (post-reconciliation):**
**GO for docs consistency** between PE1.b contract and PE1.b.1 fail-closed precedence. Production eligibility / activation remain **NO-GO**. Unresolved §19 / §C decisions unchanged.

### A.3 PE1.b contract amendments (applied)

Applied in `docs/M6_PE1_B_CANARY_FORECAST_ELIGIBILITY_POLICY.md` (this reconciliation slice):

1. §16.3 / §9.1 / §14.4 / §6 — Age-D → `ineligible_age_unapproved`; production_unapproved only after age+alg.
2. §9.1 / §9.3 — precedence: invalid/allowlist → age → algorithm → production; blockers preserved in `mappingNotes`.
3. §14.2 — structural observation wording corrected.
4. §2.1 / §9.3 / §16 — authenticity forged path = `ok:false`.
5. §2 / §14.1 / §17 / §18 — evaluator marked implemented; future activation still blocked.

No numeric thresholds, UUID selection, algorithm approval, or production attestation activation were introduced.

### A.4 Evidence planes (must not be conflated)

| Plane | Source of truth today | Proves | Does **not** prove |
|---|---|---|---|
| **Structural evidence** | PE1.a WeakSet-minted bind | Shape of fresh-reader-**shaped** payload | DB/RPC issuance; post-return freshness; production eligibility |
| **Trusted DB provenance** | Future `db_rpc_fresh_reader_v1` under pinned service-role read | Authenticated check-time pointer + token | Age SLA; algorithm approval; production / M7 eligibility |
| **Technical numeric eligibility** | Fresh-reader / PE1.a `disposition=eligible` + `technicalNumericEligible` | Observation / diagnostics only | Decision units; `m7Eligible`; PB1 create |
| **Production forecast eligibility** | Explicit attestation + (future) schema path + PE1 ops approval | Future binding of forecast decision fields | **HARD-FALSE today** at SQL CHECK, publish adapter, PE1.a, PE1.b.1, PB1, M7.2/M7.3 |

```
structural ⊄ DB provenance ⊄ technical numeric ⊄ production ⊄ M7 merchant
```

PE1.b.1 accepts structural authenticity **only** for ineligible observation and **rejects** forged DB authenticity claims.

---

## B. Frozen fail-closed precedence and blocker matrix

### B.1 Normative precedence (PE1.b.2 freeze — matches PE1.b.1)

Apply **first match**; do not mask a stricter condition with a weaker `decisionState`.

```
1. invalid envelope / trust / age-policy≠unapproved / alg-pin≠unapproved /
   attestation≠null / bypass keys / unminted binding / grain mismatch /
   freshness or provenance breach / forged authenticity
        → ok:false (rejected_*)
2. allowlist empty | revoked match | ≠1 active | cross-grain | duplicate active
        → ineligible_allowlist
3. fresh-reader miss dispositions (ABSENT/STALE/PENDING/CONFIDENCE/UNAVAILABLE)
        → mapped ineligible_* (§6 / PE1.b.1 mapDispositionDecisionState)
4. technical eligible + age unapproved
        → ineligible_age_unapproved
5. technical eligible + age approved + algorithm unapproved
        → ineligible_algorithm_unapproved
6. technical eligible + age+alg approved + production attestation inactive
        → ineligible_production_unapproved
7. production_eligible
        → FORBIDDEN (architecture defect)
```

Under PE1.b.1 request constraints, steps 5–6 are **unreachable**; steady technical path is step **4**.

### B.2 Blocker preservation rule

Primary `decisionState` names the **strictest** applicable gate.
**All still-applicable blockers remain in `mappingNotes`** (and hard-false fields), including when a stricter state wins:

| Blocker code | When present under PE1.b.1 |
|---|---|
| `AGE_POLICY_NOT_APPROVED` | Every `ok:true` success |
| `ALGORITHM_PIN_MISS` | Every `ok:true` success |
| `PRODUCTION_ATTESTATION_INACTIVE` | Every `ok:true` success |
| `HOSTED_SELECT_PACK_UNVERIFIED` | Every `ok:true` success |
| `CANARY_ALLOWLIST_MISS` / `CANARY_ALLOWLIST_REVOKED` | Allowlist miss paths |
| `FORECAST_FORCED_INELIGIBLE` | Every `ok:true` success |
| `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` in `productionCreateBlockedUntil` | Every `ok:true` success |

Blockers are **deterministic machine-readable codes**, not optional prose.

### B.3 Allowlist authorization rule (implemented)

Authorized match iff **all**:

1. Exactly **one** active entry (`revokedAt` null/undefined/empty)
2. Exact org/store/location/variant match (case-insensitive UUID compare after normalize)
3. No reliance on `label` / `approvedBy` / `approvedAt` for eligibility math

Otherwise: **not authorized** → `ineligible_allowlist` (or `ok:false` if entry malformed).

---

## C. Policy decisions: options, recommendation, evidence, status

**Status legend:** `POLICY_DECISION_REQUIRED` = unresolved; recommendation ≠ approval.
**No numeric thresholds or approval phrases are frozen as approved values here.**

### C.1 Forecast-age SLA

| | |
|---|---|
| **Options** | **Age-A** same/prior calendar day via `forecastAsOf`; **Age-B** 7-day calendar lag; **Age-C** publication `created_at` within 24h + token revalidation; **Age-D** defer numeric age; emit `AGE_POLICY_NOT_APPROVED` / `ineligible_age_unapproved` |
| **Risks** | A/B TZ/store-local errors; B stale fast-movers; C clock skew / missing created_at plumbing; D blocks any “canary actionable” age claim |
| **Recommended default** | **Age-D** until M7 bind policy exists (matches PE1.b §3.2 + PE1.b.1) |
| **Evidence required** | Written SLA; watermark choice; TZ source (`stores.timezone`); tests for boundary days; M7 revalidation ownership |
| **Status** | `POLICY_DECISION_REQUIRED` (Age-D operational default in code; **not** a numeric SLA approval) |

### C.2 Algorithm version approval / pinning

| | |
|---|---|
| **Options** | **Alg-A** pin `forecast-orchestrator-v1` + current `FORECAST_*_V1` fingerprint; **Alg-B** any non-blank recorded version; **Alg-C** explicit N-tuple allowlist in policy module |
| **Risks** | A brittle on version bump; B too loose; C review burden / drift |
| **Recommended default** | **Alg-A** for first canary — **not approved**; PE1.b.1 keeps `algorithmPinPolicy: "unapproved"` + `ALGORITHM_PIN_MISS` |
| **Evidence required** | Version/fingerprint equality tests; bump checklist; proof evaluation CHECK remains `algorithm_approved=false` |
| **Status** | `POLICY_DECISION_REQUIRED` |

### C.3 Evaluation accuracy / sufficiency

| | |
|---|---|
| **Options** | **Eval-A** ignore evaluation for technical observation; **Eval-B** diagnostic ≥14 origins + hard-false trust; **Eval-C** merchant-holdout / live PIT |
| **Risks** | A no accuracy evidence; B still ≠ algorithm approval; C blocked (`UNSUPPORTED_HISTORICAL_REPLAY`) |
| **Recommended default** | Choose **Eval-A vs Eval-B** before PE1.c; **Eval-C NO-GO** by design |
| **Evidence required** | For B: diagnostic report artifact + trust hard-false proof; never treat scores as `algorithmApproved=true` |
| **Status** | `POLICY_DECISION_REQUIRED` (Eval-C blocked) |

### C.4 Production data coverage beyond technical bar

| | |
|---|---|
| **Options** | **Cov-A** accept technical bar (`limited` OK); **Cov-B** require `sufficient` + `standard` + `high` only |
| **Risks** | A cold-start risk; B fewer canary grains |
| **Recommended default** | Defer; **do not invent** percentage coverage SLA |
| **Evidence required** | Explicit choice recorded; tests for rejected limited/medium if Cov-B |
| **Status** | `POLICY_DECISION_REQUIRED` |

### C.5 Canary UUID and environment isolation

| | |
|---|---|
| **Options** | **A** dedicated synthetic canary org; **B** real merchant grain in Preview only; **C** real merchant grain in Production |
| **Risks** | A fixture-path cost; B env-pin failure; C merchant blast radius — default **NO-GO** until Preview isolation + SELECT + kill-switch proven |
| **Recommended default** | Prefer **A** for first canary isolation; **C NO-GO** now; **no UUIDs minted in this document** |
| **Evidence required** | Exact 4-UUID allowlist constant; Preview vs Prod pin proof (HR3.2b class); store IANA timezone |
| **Status** | `POLICY_DECISION_REQUIRED` |

### C.6 Trusted attestation authority

| | |
|---|---|
| **Options** | **A** repo-pinned opaque phrase + dual execute (M5-like); **B** signed operator attestation record; **C** env-only secret |
| **Risks** | A rotation=code change; B schema/writer trust; C weak review trail |
| **Recommended default** | **A** + env kill-switch defense-in-depth — **not approved**; `productionEligibilityAttestation` remains **null** |
| **Evidence required** | Phrase absent/inactive tests; kill-switch refuse-all; no path sets `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` satisfied |
| **Status** | `POLICY_DECISION_REQUIRED` |

### C.7 Revocation, audit, and kill-switch ownership

| | |
|---|---|
| **Options** | Revoke via `revokedAt` / empty allowlist (code today); env phrase kill (future); workers ENABLE off (ops); SQL CHECK + PB1/PE1.a/M7.2 (always-on) |
| **Risks** | Missing audit sink; unclear on-call owner for revoke; env kill unimplemented (PE1.b.1 relies on allowlist + schema + PB1/PE1.a/M7) |
| **Recommended default** | **Ownership split (proposed, not staffing-approved):** Eng owns allowlist constant + PE1.b evaluator; Ops owns hosted SELECT + workers ENABLE; Security/Eng jointly own attestation phrase rotation when introduced; on-call revoke = set `revokedAt` / empty allowlist **without** CHECK relaxation |
| **Evidence required** | Audit log fields per PE1.b §12.1 before any mutate canary; runbook naming owners; tests that revoke is immediate policy miss |
| **Status** | Mechanism shape partially frozen in PE1.b; **ownership + audit sink + env kill** remain `POLICY_DECISION_REQUIRED` |

---

## D. Security / tenant isolation / attestation requirements

### D.1 Tenant / grain isolation (frozen)

- Eligibility unit = exact `(organizationId, storeId, locationId, variantId)` — no wildcards, rollups, or multi-grain batches.
- Cross-tenant / cross-grain mismatch → reject or allowlist miss (never authorized match).
- Ops metadata on allowlist entries is non-authoritative.

### D.2 Authenticity / attestation (frozen for PE1.b.1; production still inactive)

- Structural PE1.a bind ≠ DB provenance.
- Caller cannot mint production trust via labels, bypass keys, non-null `productionEligibilityAttestation`, or `db_rpc_fresh_reader_v1` without a future authenticated path.
- Policy attestation authorizes **evaluation path only**; production gate `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` remains unsatisfied.
- Service-role only for any future DB read; never anon/authenticated EXECUTE on forecast RPCs (SELECT-verify).

### D.3 Hard-false production eligibility gates (confirmed still hard-false)

| Gate | Locus | PE1.b.2 status |
|---|---|---|
| SQL `m7_eligible = false` CHECK | `20261030150000` | **PRESERVE** |
| Publish adapter `m7Eligible: false` | publish adapter | **PRESERVE** |
| Fresh-reader `claimsPostCommitFreshness: false` | reader SQL/TS | **PRESERVE** |
| PE1.a always ineligible decision fields | `published-forecast-eligibility.ts` | **PRESERVE** |
| PE1.b.1 always ineligible + attestation null | `canary-forecast-eligibility-policy.ts` | **PRESERVE** |
| PB1 requires `forecastEligibility: "ineligible"` | `metric-decision-binding.ts` | **PRESERVE** |
| M7.2 `forecast_run_id IS NULL` | `20261031100000` | **PRESERVE** |
| M7.3 merchant approvable hard-false | `20261031130000` | **PRESERVE** |
| Evaluation trust hard-false CHECK | `20261030200000` | **PRESERVE** |

Clearing any gate requires **separate explicit approval** beyond PE1.b.2.

### D.4 Operator-hosted SELECT verification (required before PE1.c; not executed here)

Reuse PE1.b §11 — read-only; no consume/claim/publish/persist/eval.

1. Identity / project pin
2. Required migrations present
3. CHECK proofs (`m7_eligible=false`, no freshness claim, evaluation trust hard-false)
4. RPC security (DEFINER, empty search_path, service_role EXECUTE only)
5. Table grants + RLS
6. Row posture; any `m7_eligible=true` = **P0 incident**
7. Canary store IANA timezone (once UUID chosen)
8. Env: forecast workers/cron absent; metric workers ENABLE ≠ `1`

Until pack passes: keep `HOSTED_SELECT_PACK_UNVERIFIED` and **NO-GO** for PE1.c.

---

## E. Remaining P0 / P1 blockers

### E.1 P0 — block any production eligibility claim / PE1.c activation

| ID | Blocker | Class | Notes |
|---|---|---|---|
| PE1B2-P0-1 | Production forecast operation / callers still NOT APPROVED | policy | Unchanged |
| PE1B2-P0-2 | SQL `m7_eligible=false` CHECK | schema (keep) | Unchanged |
| PE1B2-P0-3 | PB1 + PE1.a + PE1.b.1 force forecast ineligible | contract (keep) | Unchanged |
| PE1B2-P0-4 | Forecast-age SLA unresolved (Age-D default only) | `POLICY_DECISION_REQUIRED` | |
| PE1B2-P0-5 | Hosted M6 SELECT pack not executed | UNKNOWN ops | |
| PE1B2-P0-6 | Canary UUID / isolation choice unresolved | `POLICY_DECISION_REQUIRED` | No UUIDs here |
| PE1B2-P0-7 | Trusted attestation authority unresolved | `POLICY_DECISION_REQUIRED` | Attestation null |
| PE1B2-P0-8 | Live historical PIT unsupported | design blocked | Eval-C NO-GO |
| PE1B2-P0-9 | PE1.b freeze text contradictions C1/C3/C4/C5 | docs | **CLEARED** by PE1.b contract reconciliation |

### E.2 P1 — required before controlled canary publish path

| ID | Gap | Class |
|---|---|---|
| PE1B2-P1-1 | Algorithm pin (Alg-A/B/C) | `POLICY_DECISION_REQUIRED` |
| PE1B2-P1-2 | Eval-A vs Eval-B | `POLICY_DECISION_REQUIRED` |
| PE1B2-P1-3 | Cov-A vs Cov-B | `POLICY_DECISION_REQUIRED` |
| PE1B2-P1-4 | Continuous commerce→metrics→forecast loop; workers OFF | PARTIAL / UNKNOWN |
| PE1B2-P1-5 | Incoming-unknown coexistence with future forecast-eligible paths | open (PB1/PRA) |
| PE1B2-P1-6 | Returns/refunds incompleteness on demand series | PARTIAL |
| PE1B2-P1-7 | Env kill-switch + approval phrases in code | missing |
| PE1B2-P1-8 | Audit log sink for policy evaluations | missing |
| PE1B2-P1-9 | Named revoke/audit/kill-switch ownership | `POLICY_DECISION_REQUIRED` |
| PE1B2-P1-10 | Authenticated `db_rpc_fresh_reader_v1` issuance path | missing (structural only today) |

**Cleared vs PE1.b:** PE1.b.1 evaluator module + architecture tests exist (former PE1B-P1-1).

---

## F. Next milestone dependency order

### Smallest safe next milestone

**Resolve remaining `POLICY_DECISION_REQUIRED` packet (docs only)**
or, if ops-ready first: **Operator SELECT pack execution (ops only; no code activation)**

Recommended dependency order:

1. **PE1.b.2** (this document) — consistency + decision framing — **COMPLETE (docs)**
2. **Formal PE1.b text amendments** (C1/C3/C4/C5) — **COMPLETE (docs reconciliation)**
3. **Resolve `POLICY_DECISION_REQUIRED` packet** (age remaining numeric choice if leaving Age-D; Alg; Eval; Cov; UUID/isolation; attestation authority; ownership) — docs approval; **no thresholds invented in code until approved**
4. **Operator hosted SELECT pack pass** — ops evidence; still NO-GO for publish
5. **Optional:** authenticated DB provenance wrapper design (still hard-false production) — separate slice
6. **M6-PE1.c** — controlled single-grain persist→publish under workers-OFF — **separate approval**; merchant/M7.2 still **NO-GO**
7. **Later:** CHECK relaxation / PB1 gate satisfaction / M7.2 `forecast_run_id` / M7.3 — each **independent NO-GO** until explicit approval

**Do not** start PE1.c before steps 3–4.

---

## G. GO / NO-GO matrix

| Action | Decision |
|---|---|
| Accept this PE1.b.2 consistency & decision-freeze document | **GO** (docs only) |
| Treat PE1.b.1 age→alg→production precedence as operative fail-closed rule | **GO** |
| PE1.b C1/C3/C4/C5 documentation reconciliation | **GO** (applied) |
| Claim production forecast eligibility / clear `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` | **NO-GO** |
| Set `m7_eligible=true` / emit `production_eligible` / `m7Eligible=true` | **NO-GO** |
| Approve algorithm, invent numeric age/coverage/accuracy SLAs, or mint canary UUIDs here | **NO-GO** |
| Treat structural PE1.a bind or `technicalNumericEligible` as production / DB provenance | **NO-GO** |
| Activate attestation / approval phrases | **NO-GO** |
| Run hosted SELECT pack under this doc alone | **NO-GO** (ops approval separate; pack **specified** in §D.4) |
| Wire publish/persist/eval production callers, workers, cron, M7.2/M7.3, E4, AI, purchasing | **NO-GO** |
| Proceed to PE1.c | **NO-GO** until decision packet + SELECT + separate approval |

---

## Freeze checklist

- [x] HEAD `debb032` verified; dirty tree preserved aside from this file
- [x] Implementation-to-contract reconciliation recorded (states, codes, order)
- [x] Confirmed contradictions C1/C3/C4/C5 reconciled in PE1.b contract; C2 already aligned
- [x] Fail-closed precedence + blocker preservation frozen
- [x] Evidence planes distinguished (structural / DB / technical / production)
- [x] Unresolved decisions framed with options / risks / recommended default / evidence / `POLICY_DECISION_REQUIRED`
- [x] No numeric thresholds or approvals invented
- [x] SELECT verification + P0/P1 + next milestone order recorded
- [x] Production eligibility gates confirmed hard-false
- [ ] Production forecast eligibility / canary execution / PE1.c — **not authorized**

**PE1.b.2 policy consistency & decision freeze COMPLETE (docs only); C1/C3/C4/C5 reconciliation applied.**
**STOP before implementation / activation.**
