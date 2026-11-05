# M6-PE1.b.3 — Production Forecast Policy Decision Packet

**Mode:** DOCUMENTATION ONLY. No implementation, SQL, migrations, hosted queries, policy activation, algorithm approval, numeric SLA approval, canary UUID selection, attestation activation, PB1/M7 eligibility changes, workers/cron, Vercel deployment, M7.3, E4, AI, purchasing, or inventory mutation.
**As-of:** 2026-11-05
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested:** `main` @ `9be22a1`
**Verified HEAD:** `9be22a1e79fe25f3018114a8d4a0c47ca9c6f2da` — `docs(forecast): close HV2 hosted authorization verification`
**Branch:** `main`
**Dirty tree:** Unrelated dirty/untracked files preserved untouched except creation of **this** file.
**Parents / authority:**
- `docs/M6_PE1_B_CANARY_FORECAST_ELIGIBILITY_POLICY.md` (PE1.b freeze; Age-D default; §19 unresolved)
- `docs/M6_PE1_B2_POLICY_CONSISTENCY_AND_DECISIONS.md` (precedence + decision framing)
- `docs/M6_PE1_FORECAST_ELIGIBILITY_READINESS.md` (PE1 sequencing; five forecast states)
- `docs/M6_HV1_HOSTED_FORECAST_VERIFICATION.md` (schema/metadata SELECT closeout)
- `docs/M6_HV2_HOSTED_IDENTITY_AUTHORIZATION.md` (identity pin + RLS/RPC catalog closeout)
- `lib/decision-engine/published-forecast-eligibility.ts` (PE1.a — always ineligible)
- `lib/decision-engine/canary-forecast-eligibility-policy.ts` (PE1.b.1 — Age-D fail-closed; production attestation null)
- PE1.a / PE1.b.1 unit + architecture tests
- M6 evaluation / freshness contracts; `docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md`; M7.2a / M7.0 §D

**Authority when docs conflict:** this document for **owner decision framing, recommended (not approved) production-eligibility policy choices, evidence gates, dependency order, and GO/NO-GO only**. It does **not** approve production forecast eligibility, invent thresholds as frozen numbers, select canary UUIDs, activate attestation, or authorize PE1.c.

**Status legend (normative):**
| Label | Meaning |
|---|---|
| **RECOMMENDED** | Architect recommendation in this packet — **not** owner approval |
| **POLICY_DECISION_REQUIRED** | Owner must choose; recommendation ≠ approval |
| **UNAPPROVED** | Explicit owner approval status for every decision in this packet |
| **APPROVED** | Reserved — **none** in this packet |
| **SAFE_TO_DECIDE_NOW** | Owner may approve this option letter **for the stated scope only** (usually offline synthetic / fail-closed retention) without new real-world evidence |
| **EVIDENCE_REQUIRED** | Must not approve for production (or for the stated stronger claim) until listed evidence exists |

**A documented recommendation is NOT approval.**
**Offline-synthetic approval is NOT production age / algorithm / accuracy / coverage approval.**

---

## 0. Executive verdict

| Question | Verdict |
|---|---|
| May this packet freeze owner decision options + recommendations (docs only)? | **GO** (this document) |
| Are any production eligibility policies owner-approved here? | **NO** — all `UNAPPROVED` |
| Which D1–D7 choices are `SAFE_TO_DECIDE_NOW`? | Fail-closed / offline-synthetic scopes only — see **§H** |
| May production age / algorithm / accuracy / coverage be approved without evidence? | **NO** — remain `EVIDENCE_REQUIRED` |
| Is production forecast eligibility / `m7_eligible=true` / PB1 gate clear authorized? | **NO-GO** |
| May anyone choose canary UUIDs, approve an algorithm, or activate attestation here? | **NO-GO** |
| Do PE1.a / PE1.b.1 / SQL CHECK / PB1 / M7 hard-false gates remain? | **YES — PRESERVE** |
| Smallest next milestone | **Evidence-producing offline synthetic lifecycle** (§H.5) — **not** another policy abstraction |
| Overall PE1.b.3 production trust | **NO-GO** |

**One-line:** PE1.b.3 packages remaining decisions with a readiness split — some fail-closed / offline-synthetic choices are `SAFE_TO_DECIDE_NOW`; production age/algorithm/accuracy/coverage stay `EVIDENCE_REQUIRED`; next step must produce lifecycle evidence under hard-false gates.

---

## A. Current verified baseline

### A.1 Git / tree (this session) — VERIFIED

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `9be22a1` (`docs(forecast): close HV2 hosted authorization verification`) |
| Relevant ancestors | PE1.a `e557b2a` → PE1.b docs `1333740` → PE1.b.1 `debb032` → PE1.b.2 + PE1.b reconcile `38a7b31` → HV1 `770afed` → HV2 `9be22a1` |
| Dirty tree | Unrelated dirty/untracked preserved; **only this file** added for PE1.b.3 |
| `vercel.json` crons | Absent at HEAD (HV2 F8) |

### A.2 Implementation posture (offline) — VERIFIED

| Layer | Status | Proves | Does **not** prove |
|---|---|---|---|
| PE1.a binder | **IMPLEMENTED** | Structural fresh-reader-shaped bind; always `forecastEligibility="ineligible"` | DB/RPC issuance; age SLA; production eligibility |
| PE1.b.1 policy evaluator | **IMPLEMENTED** | Fail-closed allowlist + Age-D + alg-unapproved + attestation-null envelope | Numeric age SLA; algorithm approval; production attestation; hosted authenticity |
| Technical numeric bar | **FROZEN** (fresh-reader / PE1.a) | Check-time disposition/confidence/mode/sufficiency/token | Post-return freshness; production / M7 |
| Evaluation / diagnostic | **IMPLEMENTED** (P4) | Fixture PIT + hard-false trust CHECK | Merchant accuracy; algorithm approval; live historical PIT |
| Production persist/publish/eval callers | **MISSING** | — | — |
| Canary UUID allowlist (active) | **EMPTY / absent** | Empty ⇒ every grain ineligible | — |

**PE1.b.1 steady technical+allowlisted outcome:** `decisionState = ineligible_age_unapproved` with machine-readable `AGE_POLICY_NOT_APPROVED` + `ALGORITHM_PIN_MISS` + `PRODUCTION_ATTESTATION_INACTIVE` (+ `HOSTED_SELECT_PACK_UNVERIFIED` still emitted by code mapping notes until a separate code/docs reconciliation after owner ops acknowledgment).

### A.3 Hosted runtime posture (owner evidence; agent did not re-query) — SCOPE-LIMITED

| Evidence | Source | Scope-limited call |
|---|---|---|
| M6 migrations / tables / named CHECKs / RPC EXECUTE metadata / zero forecast rows | HV1 §H | **PASS** (schema/metadata) |
| Project pin `qlsqminsfdntpqdkhxjx` / `postgres` / PG 17.11 | HV2 §H.0 | **PASS** (identity pin) |
| Forecast RLS membership policies (catalog) + SELECT-only ACLs | HV2 §H.1 | **PASS** (catalog) |
| DEFINER + empty `search_path` + tenant-guard **markers** | HV2 §H.1 | **PASS** (markers ≠ full body semantics) |
| Local metric ENABLE unset; repo no `vercel.json`; hosted `pg_cron` absent | HV2 §H.2 | **PASS** (local/repo/`pg_cron`) |
| Vercel ENABLE / cron inventory | HV2 F2–F7 | **N/A** (no Vercel project reported) |
| Preview vs Production env class of pin | HV1/HV2 | **NOT EXPLICITLY LABELED** — treat as **POLICY_DECISION_REQUIRED** for canary env |
| JWT cross-tenant runtime | HV2 | **UNPROVEN** |
| Full RPC body semantics | HV2 | **UNPROVEN** |
| Hosted persist→publish→fresh-read lifecycle | HV1/HV2 | **NO EVIDENCE** |
| Forecast accuracy / evaluation quality on hosted | HV1/HV2 | **NO EVIDENCE** (eval tables empty) |

```
offline policy evaluator  ⊄  hosted schema/auth catalog  ⊄  hosted lifecycle proof  ⊄  production eligibility
```

### A.4 Hard-false gates retained (MUST NOT CHANGE under this packet)

| Gate | Locus | PE1.b.3 duty |
|---|---|---|
| SQL `m7_eligible = false` CHECK | `20261030150000` | **PRESERVE** |
| Publish adapter `m7Eligible: false` | `publish-forecast-sku-demand.ts` | **PRESERVE** |
| Fresh-reader `claimsPostCommitFreshness: false` + check-time limitation | reader SQL/TS | **PRESERVE** |
| Evaluation trust hard-false CHECK (`algorithm_approved=false`, etc.) | `20261030200000` | **PRESERVE** |
| PE1.a always ineligible decision fields | `published-forecast-eligibility.ts` | **PRESERVE** |
| PE1.b.1 Age-D + attestation null + no `production_eligible` | `canary-forecast-eligibility-policy.ts` | **PRESERVE** |
| PB1 requires `forecastEligibility: "ineligible"` | `metric-decision-binding.ts` | **PRESERVE** |
| PB1 `PRODUCTION_CREATE_GATES` (all four unsatisfied) | same | **PRESERVE** |
| M7.2 `forecast_run_id IS NULL` | `20261031100000` (if/when present) | **PRESERVE**; hosted M7 adjacency **absent** on HV1 pin |
| M7.3 merchant approvable hard-false | `20261031130000` track | **PRESERVE** |

**PB1 production-create gates (unchanged; none cleared):**
1. `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED`
2. `TRUSTED_INCOMING_EVIDENCE_AVAILABLE`
3. `TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED`
4. `M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED`

### A.5 Fail-closed precedence (operative; PE1.b.1 / PE1.b.2)

```
invalid envelope / forged authenticity / trust breach → ok:false
allowlist miss / revoke / ≠1 active                 → ineligible_allowlist
miss dispositions                                   → mapped ineligible_*
technical eligible + age unapproved                 → ineligible_age_unapproved  ★ steady today
technical + age OK + alg unapproved                 → ineligible_algorithm_unapproved  (unreachable under current envelope)
technical + age+alg OK + prod attestation inactive  → ineligible_production_unapproved  (unreachable under current envelope)
production_eligible                                 → FORBIDDEN
```

### A.6 Frozen technical constants (calculation / diagnostic — NOT production approvals)

| Constant | Value | Role |
|---|---|---|
| `LIMITED_HISTORY_MIN_DAYS_V1` | 7 | Technical sufficiency band |
| `SUFFICIENT_HISTORY_MIN_DAYS_V1` | 28 | Technical sufficiency band |
| `FORECAST_BACKTEST_MIN_ORIGINS_V1` | 14 | Diagnostic sample-floor messaging only |
| `FORECAST_ORCHESTRATOR_VERSION_V1` | `forecast-orchestrator-v1` | Compute pin candidate — **not** algorithm approval |
| Policy / path attestation strings | `m6-pe1b-canary-eligibility-policy-v1` / `m6-pe1b-canary-policy-attestation-v1` | Evaluator path only; production inactive |

**ILLUSTRATIVE ONLY (not approved thresholds):** Age-A “same/prior day”, Age-B “7 calendar days”, Age-C “publication `created_at` within 24h” remain option sketches from PE1.b — none are frozen as production SLAs.

---

## B. Owner decision matrix

Every row: **Owner approval status = `UNAPPROVED`**. Recommendations are **RECOMMENDED** only.

### B.1 Forecast-age SLA and timezone handling

| | |
|---|---|
| **Decision ID** | `PE1B3-D1` |
| **Existing contract / evidence** | Fresh-reader proves check-time token/publication gates only; PE1.a always emits `AGE_POLICY_NOT_APPROVED` + `CHECK_TIME_FRESHNESS_ONLY`; PE1.b.1 forces `forecastAgePolicy: "unapproved"` → `ineligible_age_unapproved`; M7 owns forecast-age revalidation before acting (PE1.b §3.1) |
| **Options** | **Age-A** — `forecastAsOf >= store_local_today - 1` (ILLUSTRATIVE calendar rule). **Age-B** — `forecastAsOf >= store_local_today - 7` (ILLUSTRATIVE). **Age-C** — publication `created_at` within ILLUSTRATIVE 24h **and** token revalidated at bind. **Age-D** — defer numeric age; emit `AGE_POLICY_NOT_APPROVED` / `ineligible_age_unapproved` |
| **Tradeoffs** | A/B require store IANA TZ + boundary tests; TZ/late commerce false fails. B tolerates weekly batch but stales fast movers. C needs reliable publication watermark plumbing + clock skew rules. D blocks any “canary actionable age” claim until M7 bind policy exists |
| **RECOMMENDED** | **Age-D** until M7 bind age policy is separately frozen |
| **Required evidence / acceptance** | Written SLA; watermark choice; TZ source = recognized `stores.timezone`; boundary-day tests; explicit M7 revalidation ownership; PE1.b.1 remains fail-closed until code allowed to accept a non-`"unapproved"` age policy **after** approval |
| **Blocked by missing real-world evidence?** | **Yes for Age-A/B/C** — no hosted lifecycle timings, no chosen canary store TZ, no production commerce cadence measured. **Age-D** is an offline policy default already coded |
| **Offline vs hosted** | Choosing Age-D is an **offline policy** choice. Enforcing Age-A/B/C on live grains is **hosted runtime** (store TZ + publication watermarks + re-read) |
| **Owner approval** | **UNAPPROVED** (`POLICY_DECISION_REQUIRED`) |

### B.2 Algorithm version approval / pinning

| | |
|---|---|
| **Decision ID** | `PE1B3-D2` |
| **Existing contract / evidence** | No algorithm approved; evaluation SQL CHECK forces `algorithm_approved=false`; orchestrator/config version constants exist as compute pins; PE1.b.1 forces `algorithmPinPolicy: "unapproved"` + `ALGORITHM_PIN_MISS` |
| **Options** | **Alg-A** — reject unless `algorithm_version = forecast-orchestrator-v1` and config/fingerprint match current `FORECAST_*_V1`. **Alg-B** — any non-blank recorded version. **Alg-C** — explicit N-tuple allowlist in policy module |
| **Tradeoffs** | A safe but brittle on bumps. B too loose for canary. C flexible; review/drift burden |
| **RECOMMENDED** | **Alg-A** for first canary — **not approved**; keep `"unapproved"` until owner sign-off + bump checklist |
| **Required evidence / acceptance** | Version/fingerprint equality tests; bump checklist; proof evaluation CHECK remains hard-false; never treat diagnostic scores as `algorithmApproved=true` |
| **Blocked by missing real-world evidence?** | **Partially** — offline pin choice can be made without hosted data; **approval** that a version is “good enough” needs evaluation/lifecycle evidence (currently absent hosted) |
| **Offline vs hosted** | Pin **policy shape** is offline. Proving published runs actually carry the pinned strings on a grain is hosted |
| **Owner approval** | **UNAPPROVED** (`POLICY_DECISION_REQUIRED`) |

### B.3 Evaluation sufficiency and accuracy evidence

| | |
|---|---|
| **Decision ID** | `PE1B3-D3` |
| **Existing contract / evidence** | `FORECAST_BACKTEST_MIN_ORIGINS_V1 = 14` is diagnostic messaging only; live merchant PIT → `UNSUPPORTED_HISTORICAL_REPLAY`; hosted eval tables empty (HV1); trust flags hard-false |
| **Options** | **Eval-A** — ignore evaluation for technical canary numeric observation. **Eval-B** — require diagnostic report with ≥14 origins **and** hard-false trust flags. **Eval-C** — merchant-holdout / live PIT |
| **Tradeoffs** | A fast, no accuracy evidence. B uses harness; still ≠ algorithm approval. C blocked by design |
| **RECOMMENDED** | Choose **Eval-B** before any PE1.c that claims accuracy posture; **Eval-A** only if owner explicitly accepts observation-without-accuracy; **Eval-C = NO-GO** |
| **Required evidence / acceptance** | For B: artifacted diagnostic report + trust hard-false proof; scores never set `algorithmApproved=true`. For A: written owner acceptance that canary observation has **no** accuracy bar |
| **Blocked by missing real-world evidence?** | **Yes for claiming accuracy** — hosted evaluation rows = 0; no merchant holdout path. Eval-A/B **policy choice** can still be recorded offline |
| **Offline vs hosted** | Bar selection is offline. Producing Eval-B artifacts for a grain is hosted/fixture ops (still not production eligibility) |
| **Owner approval** | **UNAPPROVED** (`POLICY_DECISION_REQUIRED`) |

### B.4 Production data coverage requirements

| | |
|---|---|
| **Decision ID** | `PE1B3-D4` |
| **Existing contract / evidence** | Technical bar accepts `limited`/`sufficient` and `medium`/`high` for `technicalNumericEligible`; history bands 7/28 frozen for calculation; PE1.b forbids inventing percentage coverage SLAs |
| **Options** | **Cov-A** — accept technical bar (`limited` OK). **Cov-B** — require `sufficient` + `standard` + `high` only for any future canary production path |
| **Tradeoffs** | A matches fresh-reader; higher cold-start risk. B stricter; fewer grains |
| **RECOMMENDED** | **Cov-B** for first production-path canary **if** age+alg+attestation ever clear; until then keep technical observation under Cov-A semantics without claiming production coverage approval. **Do not invent** % coverage SLA |
| **Required evidence / acceptance** | Explicit owner choice recorded; tests rejecting limited/medium if Cov-B; no new numeric % threshold without separate freeze |
| **Blocked by missing real-world evidence?** | **Yes for validating Cov-B yield** — zero hosted forecast rows; no canary grain series. Policy choice still recordable offline |
| **Offline vs hosted** | Coverage **bar** is offline policy. Measuring which grains qualify is hosted |
| **Owner approval** | **UNAPPROVED** (`POLICY_DECISION_REQUIRED`) |

### B.5 Canary environment and exact-grain authorization

| | |
|---|---|
| **Decision ID** | `PE1B3-D5` |
| **Existing contract / evidence** | Grain = exact `(organizationId, storeId, locationId, variantId)`; single active allowlist entry; empty allowlist ⇒ all ineligible; HV2 pin `qlsqminsfdntpqdkhxjx` proven for schema/auth catalog; Preview vs Prod **not** explicitly labeled on pin; no UUIDs selected |
| **Options** | **Env-A** — dedicated synthetic canary org (M5.6E.4-style isolation). **Env-B** — real merchant grain in Preview Supabase only. **Env-C** — real merchant grain in Production Supabase |
| **Tradeoffs** | A strong isolation; needs fixture commerce→metrics→forecast path. B realistic; requires Preview/Prod isolation proof. C highest realism; **default NO-GO** until Preview isolation + SELECT + kill-switch proven |
| **RECOMMENDED** | **Env-A** for first canary; **Env-C NO-GO now**; **do not mint UUIDs in this packet**. Separately require owner to **label** HV2 pin as Preview \| Production \| Other before any env-specific PE1.c claim |
| **Required evidence / acceptance** | Exact 4-UUID allowlist constant (future code; inactive until approved); store IANA timezone recognized; env pin match worksheet; revoke/`revokedAt` immediate miss tests; workers ENABLE off on that env |
| **Blocked by missing real-world evidence?** | **Yes** — no UUID chosen; pin env class unlabeled; no fixture path proven end-to-end on hosted; lifecycle **NO EVIDENCE** |
| **Offline vs hosted** | Allowlist **shape** + Env-A preference are offline. Exact UUID + env pin + TZ hygiene are hosted/ops |
| **Owner approval** | **UNAPPROVED** (`POLICY_DECISION_REQUIRED`) — **no UUID selected** |

### B.6 Attestation authority and revocation

| | |
|---|---|
| **Decision ID** | `PE1B3-D6` |
| **Existing contract / evidence** | Policy path attestation strings exist but authorize **evaluation path only**; `productionEligibilityAttestation` must be `null` under PE1.b.1; `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` remains unsatisfied; revoke via `revokedAt` / empty allowlist shape frozen |
| **Options** | **Attest-A** — repo-pinned opaque phrase + dual execute (M5-like) + env kill defense-in-depth. **Attest-B** — signed operator attestation record (table / sealed JSON). **Attest-C** — env-only secret phrase |
| **Tradeoffs** | A rotation = code change; strong review trail. B auditable revoke; needs schema + writer trust — out of PE1.b.3. C fast kill; weak code-review trail |
| **RECOMMENDED** | **Attest-A** for first canary ops path — **not approved**; production attestation remains **null** / inactive; revoke = set `revokedAt` or empty allowlist **without** CHECK relaxation |
| **Required evidence / acceptance** | Phrase absent/inactive tests; kill-switch refuse-all; no path satisfies `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED`; revoke does not rewrite historical `m7_eligible=false` rows |
| **Blocked by missing real-world evidence?** | **No for choosing Attest-A shape offline**. **Yes for activating** — requires separate ops approval + inactive-by-default proof |
| **Offline vs hosted** | Authority **model** is offline. Phrase presence in a deployed env and revoke effectiveness are hosted/ops |
| **Owner approval** | **UNAPPROVED** (`POLICY_DECISION_REQUIRED`) — **attestation not activated** |

### B.7 Kill-switch and audit-log ownership

| | |
|---|---|
| **Decision ID** | `PE1B3-D7` |
| **Existing contract / evidence** | Defense-in-depth kill layers listed in PE1.b §12.3 (allowlist empty, SQL CHECK, PB1, PE1.a, M7.2/M7.3); env approval phrase + worker ENABLE kills specified but **not implemented** for PE1; audit field minimums in PE1.b §12.1; audit sink **missing**; named owners **unassigned** |
| **Options** | **Own-A** — Eng owns allowlist constant + evaluator; Ops owns hosted SELECT + workers ENABLE; Security/Eng jointly own attestation phrase rotation; on-call revoke = `revokedAt`/empty allowlist. **Own-B** — single Ops owner for all revoke/kill/audit. **Own-C** — defer ownership naming until PE1.c design |
| **Tradeoffs** | A clear RACI; needs staffing sign-off. B simpler; bus-factor/security review risk. C blocks PE1.c readiness narrative |
| **RECOMMENDED** | **Own-A** (proposed staffing split — **not** staffing-approved). Require audit sink + runbook **before** any mutate canary |
| **Required evidence / acceptance** | Named humans/roles in runbook; audit fields per PE1.b §12.1; tests that revoke is immediate policy miss; workers ENABLE remain ≠ `1`; no CHECK relaxation as “rollback” |
| **Blocked by missing real-world evidence?** | **Yes for staffing** — no named on-call recorded. Mechanism shape partially frozen offline |
| **Offline vs hosted** | Ownership **policy** is offline. Kill effectiveness (env unset, workers off) is hosted/ops |
| **Owner approval** | **UNAPPROVED** (`POLICY_DECISION_REQUIRED`) |

---

## C. Recommended policy choices (NOT approvals)

| ID | Topic | RECOMMENDED choice | Explicit non-claims |
|---|---|---|---|
| D1 | Forecast-age SLA / TZ | **Age-D** | No numeric max-age approved; no TZ SLA approved |
| D2 | Algorithm pin | **Alg-A** (when later activated) | No algorithm approved; pin remains `"unapproved"` in code today |
| D3 | Evaluation evidence | **Eval-B** before accuracy claims; else owner-accepted **Eval-A**; **Eval-C NO-GO** | Diagnostic ≠ algorithm approval |
| D4 | Coverage beyond technical | Prefer **Cov-B** for future production-path canary; no % SLA | Technical `limited` observation ≠ production coverage approval |
| D5 | Canary env / grain | **Env-A** synthetic; **Env-C NO-GO**; label HV2 pin env class | **No UUID minted** |
| D6 | Attestation / revoke | **Attest-A** + env kill; revoke via allowlist | **Attestation not activated**; production gate unsatisfied |
| D7 | Kill-switch / audit ownership | **Own-A** RACI | Staffing not approved; audit sink missing |

**All remain `UNAPPROVED` / `POLICY_DECISION_REQUIRED`.**

---

## D. Evidence required before approval

### D.1 Cross-cutting acceptance criteria (any decision → `APPROVED`)

1. Owner records choice ID + selected option in writing (this packet or successor sign-off note).
2. Choice does **not** invent numeric thresholds unless explicitly labeled and separately frozen — examples remain **ILLUSTRATIVE ONLY**.
3. SQL `m7_eligible=false`, PE1.a/b.1 hard-false, PB1 gates, and M7.2/M7.3 hard-false remain unchanged.
4. Offline policy approval is distinguished from hosted runtime proof (see §D.3).
5. No canary UUID, approval phrase, or attestation constant evaluates true in production under that approval alone.

### D.2 Per-decision evidence checklist

| ID | Minimum evidence before owner may mark APPROVED |
|---|---|
| D1 | SLA text + watermark + TZ source + M7 revalidation owner; if leaving Age-D, boundary tests + ILLUSTRATIVE numbers replaced by frozen approved numbers in a **separate** freeze |
| D2 | Pin tuple + bump checklist + evaluation CHECK still hard-false |
| D3 | Eval-A written waiver **or** Eval-B diagnostic artifact path; Eval-C remains blocked |
| D4 | Cov-A or Cov-B recorded; if Cov-B, rejection tests for limited/medium |
| D5 | Env-A/B/C choice + pin env class label; UUID only in a later allowlist slice after this approval — **not in this packet** |
| D6 | Attest-A/B/C choice; inactive-by-default tests; revoke semantics without CHECK drop |
| D7 | Named Eng/Ops/Security owners; audit sink designated; kill-switch runbook |

### D.3 Offline policy vs hosted runtime authorization proof

| Class | What owner can approve offline | What still requires hosted/ops proof |
|---|---|---|
| **Offline policy** | Age-D retention; Alg/Eval/Cov option letters; Attest-A shape; Own-A RACI; Env-A preference | — |
| **Hosted catalog (already scope-limited PASS)** | — | HV1 schema/CHECK/RPC grants; HV2 pin + RLS catalog + markers + `pg_cron` absent |
| **Hosted runtime still open** | — | Pin Preview\|Prod label; JWT negative tests; full RPC body semantics; service_role misuse resistance; lifecycle persist→publish→fresh-read; accuracy artifacts; canary store TZ; Vercel/external scheduler inventory; workers ENABLE on any future PaaS |

**HV1/HV2 PASS does not clear `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED`, does not authorize PE1.c, and does not replace D1–D7 owner decisions.**

---

## E. Remaining P0 / P1 blockers

### E.1 P0 — block production eligibility claim / PE1.c activation

| ID | Blocker | Class | Notes |
|---|---|---|---|
| PE1B3-P0-1 | Production forecast operation / callers still NOT APPROVED | policy | Unchanged |
| PE1B3-P0-2 | SQL `m7_eligible=false` CHECK | schema (**keep**) | Unchanged |
| PE1B3-P0-3 | PB1 + PE1.a + PE1.b.1 force forecast ineligible | contract (**keep**) | Unchanged |
| PE1B3-P0-4 | Forecast-age SLA unresolved beyond Age-D default | `POLICY_DECISION_REQUIRED` | D1 |
| PE1B3-P0-5 | Canary UUID / isolation / pin env class unresolved | `POLICY_DECISION_REQUIRED` | D5; HV2 pin PASS but Preview\|Prod unlabeled |
| PE1B3-P0-6 | Trusted production attestation authority unresolved / inactive | `POLICY_DECISION_REQUIRED` | D6 |
| PE1B3-P0-7 | Live historical PIT unsupported | design blocked | Eval-C NO-GO |
| PE1B3-P0-8 | Hosted forecast lifecycle / accuracy evidence absent | ops / data | Zero rows; no persist→publish→read proof |
| PE1B3-P0-9 | service_role RLS bypass trust boundary | security | HV2-P0-4 OPEN — app must remain server-only |
| PE1B3-P0-10 | Clearing PB1 gate (1) / CHECK relaxation / `production_eligible` | forbidden here | Separate explicit approvals only |

**Cleared vs earlier PE1.b track (not production eligibility):** PE1.b.1 evaluator + tests; PE1.b↔PE1.b.1 doc consistency; HV1 schema/metadata SELECT; HV2 identity pin + RLS/RPC catalog markers + local/repo/`pg_cron` off-posture.

### E.2 P1 — required before controlled canary publish planning

| ID | Gap | Class |
|---|---|---|
| PE1B3-P1-1 | Algorithm pin (Alg-A/B/C) owner choice | `POLICY_DECISION_REQUIRED` (D2) |
| PE1B3-P1-2 | Eval-A vs Eval-B owner choice | `POLICY_DECISION_REQUIRED` (D3) |
| PE1B3-P1-3 | Cov-A vs Cov-B owner choice | `POLICY_DECISION_REQUIRED` (D4) |
| PE1B3-P1-4 | Kill-switch / audit ownership + audit sink | `POLICY_DECISION_REQUIRED` (D7) / missing |
| PE1B3-P1-5 | Env kill-switch + approval phrases in code | missing (inactive until approved) |
| PE1B3-P1-6 | Authenticated `db_rpc_fresh_reader_v1` issuance path | missing (structural only today) |
| PE1B3-P1-7 | JWT cross-tenant negative tests; full RPC body semantics | UNPROVEN (HV2) |
| PE1B3-P1-8 | Continuous commerce→metrics→forecast loop; workers OFF on future PaaS | PARTIAL / N/A / UNKNOWN |
| PE1B3-P1-9 | Returns/refunds incompleteness; incoming-unknown coexistence | PARTIAL / open (PB1/PRA) |
| PE1B3-P1-10 | M7 adjacency on hosted pin (if later claimed) | absent on HV1 evidence |
| PE1B3-P1-11 | Formal acknowledgment whether PE1.b.1 may stop emitting `HOSTED_SELECT_PACK_UNVERIFIED` after HV1/HV2 | docs/code reconciliation — **not** eligibility approval |

### E.3 Decisions blocked by missing real-world evidence (summary)

Cannot responsibly **approve as production-ready** (vs merely selecting an offline option letter) without further evidence:

- Numeric Age-A/B/C SLAs (need TZ + cadence + watermarks)
- Algorithm “approved for production” (need evaluation/lifecycle evidence beyond pin shape)
- Eval accuracy claims (hosted eval empty; Eval-C impossible)
- Cov-B yield / cold-start risk quantification
- Exact canary UUID + env class (Env-B/C especially)
- Attestation **activation** in a live environment
- Staffed kill-switch/audit ownership effectiveness

---

## F. Recommended next milestone and acceptance gates

### F.1 Dependency order

1. **PE1.b.3** (this packet + §H readiness review) — decision framing — **COMPLETE (docs)** when accepted as docs-only
2. **Optional narrow offline-synthetic owner note** — approve only §H.2 `SAFE_TO_DECIDE_NOW` scopes (Age-D retention, Env-A isolation intent, Attest inactive, etc.) — **not** production age/alg/accuracy/coverage
3. **M6-PE1.b.4 — Offline synthetic single-grain lifecycle evidence** (§H.5) — **smallest evidence-producing next milestone**
4. **Ops acknowledgment** — label HV2 pin Preview\|Production\|Other before any hosted PE1.c planning
5. **M6-PE1.c** — controlled single-grain persist→publish under workers-OFF — **separate explicit approval**; merchant/M7.2/M7.3 still **NO-GO**
6. **Later independent NO-GOs** — CHECK relaxation; PB1 gate (1) satisfaction; `forecast_run_id`; M7.3; E4; AI; purchasing; production Age-A/B/C / algorithm / accuracy / Cov-B approvals

**Do not** start PE1.c before offline synthetic lifecycle evidence (§H.5) + pin env label + separate PE1.c approval.
**Do not** insert another pure policy-abstraction packet as the next milestone.

### F.2 Smallest safe next milestone (evidence-producing)

See **§H.5** — **M6-PE1.b.4 Offline synthetic single-grain lifecycle evidence** (local/fixture only).
Supersedes the earlier “docs-only D1–D7 sign-off” as the recommended next step when the goal is actual evidence.

### F.3 Explicitly retained hard-false gates (non-negotiable through PE1.c planning)

- SQL `m7_eligible=false` CHECK
- PE1.a always-ineligible binder semantics
- PE1.b.1 fail-closed Age-D / alg-unapproved / attestation-null envelope (until separately approved changes)
- PB1 `forecastEligibility="ineligible"` + all `PRODUCTION_CREATE_GATES`
- M7 production hard-false / `forecast_run_id` null track
- Evaluation trust hard-false CHECK

---

## G. GO / NO-GO

| Action | Decision |
|---|---|
| Accept this PE1.b.3 decision packet + §H readiness review (docs only) | **GO** |
| Treat §C / §H rows as owner **APPROVED** production policy | **NO-GO** — all production claims `UNAPPROVED` / `EVIDENCE_REQUIRED` |
| Approve §H.2 offline-synthetic / fail-closed scopes only | **GO** (owner may; still not production eligibility) |
| Approve production age / algorithm / accuracy / coverage without evidence | **NO-GO** |
| Claim production forecast eligibility / clear `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` | **NO-GO** |
| Set `m7_eligible=true` / emit `production_eligible` / `m7Eligible=true` | **NO-GO** |
| Mint production/merchant canary UUIDs or activate attestation / approval phrases | **NO-GO** |
| Treat HV1/HV2 PASS or PE1.a/`technicalNumericEligible` as production / DB provenance approval | **NO-GO** |
| Wire publish/persist/eval production callers, workers, cron, Vercel enablement | **NO-GO** |
| Proceed to PE1.b.4 offline synthetic lifecycle evidence (separate approval) | **GO to plan** — **NO-GO to implement under this doc alone** |
| Proceed to PE1.c hosted/controlled publish | **NO-GO** until PE1.b.4 evidence + pin env label + separate PE1.c approval |
| Change PB1 / M7.2 / M7.3 / E4 / AI / purchasing / inventory mutation | **NO-GO** |
| Env-A path access or mutate production/merchant data | **NO-GO** (§H.4) |
| Preserve unrelated dirty tree; no git commit/push under this task | **GO** (process) |

---

## H. Final owner decision readiness review (2026-11-05)

**Purpose:** Distinguish what the owner may decide **now** for fail-closed / offline-synthetic scopes from what remains **evidence-blocked** for production. Clarifies option consequences, Env-A isolation, and the next evidence-producing milestone.
**Does not** approve D1–D7, mint UUIDs, activate attestation, or authorize implementation.

### H.1 Readiness vocabulary

| Class | Meaning |
|---|---|
| `SAFE_TO_DECIDE_NOW` | Owner may record an offline-synthetic or fail-closed retention choice without new hosted/merchant evidence. Scope must be written as **non-production**. |
| `EVIDENCE_REQUIRED` | Must not approve the stronger/production claim until listed evidence exists. |
| `OFFLINE_SYNTHETIC_ONLY` | Approval (if granted later) authorizes local/fixture testing under hard-false gates only — **not** hosted merchant grains, **not** production eligibility. |

### H.2 Decision readiness matrix (D1–D7)

| ID | Exact options + consequences | SAFE_TO_DECIDE_NOW | EVIDENCE_REQUIRED | Offline-synthetic-only approval allowed? |
|---|---|---|---|---|
| **D1 Age** | **Age-D:** keep `forecastAgePolicy:"unapproved"` → `ineligible_age_unapproved`; no actionable age claim. **Age-A/B/C:** numeric/calendar or publication-age rules (numbers ILLUSTRATIVE until separately frozen) → may unlock age gate in evaluator **only after** explicit code+policy approval; still ≠ production eligibility. | **Age-D retention** | **Age-A/B/C as production (or any numeric) SLA** — need store TZ, watermark, commerce cadence, M7 revalidation owner, boundary tests | **Yes — Age-D only.** Numeric age for synthetic “pass age gate” experiments still needs a separate freeze; default remains Age-D |
| **D2 Algorithm** | **Alg-A:** future reject unless orchestrator/config fingerprint = current `FORECAST_*_V1`. **Alg-B:** any non-blank version (too loose). **Alg-C:** N-tuple allowlist. Consequence today: PE1.b.1 keeps `algorithmPinPolicy:"unapproved"` + `ALGORITHM_PIN_MISS`; evaluation CHECK `algorithm_approved=false` unchanged. | **Keep pin unapproved** + optionally record **Alg-A as intended future pin shape** (shape only) | **Algorithm approved for production** / enabling non-`"unapproved"` pin in production path — need lifecycle + diagnostic evidence; scores ≠ approval | **Yes — shape intent + remain unapproved.** Activating pin as production approval = **NO** |
| **D3 Evaluation** | **Eval-A:** ignore eval for technical observation. **Eval-B:** require diagnostic ≥14 origins + hard-false trust. **Eval-C:** merchant/live PIT → **blocked** (`UNSUPPORTED_HISTORICAL_REPLAY`). | **Eval-A for offline synthetic observation** (explicit no-accuracy claim). **Eval-C = NO-GO** | **Any accuracy / production eval bar** (including treating Eval-B scores as algorithm or production approval). Hosted eval rows currently **0** | **Yes — Eval-A (or fixture Eval-B artifact under hard-false trust) for synthetic only.** Production accuracy = **NO** |
| **D4 Coverage** | **Cov-A:** technical bar (`limited` OK) for observation. **Cov-B:** require `sufficient`+`standard`+`high` for future production-path canary. No % SLA invented. | **Cov-A for offline synthetic technical observation** | **Cov-B (or any stricter bar) as production coverage approval** — need real series yield/cold-start evidence | **Yes — Cov-A observation only.** Production Cov-B = **NO** without evidence |
| **D5 Env/grain** | **Env-A:** dedicated synthetic canary org/grain namespace (see §H.4). **Env-B:** real merchant grain in Preview only. **Env-C:** real merchant grain in Production — **default NO-GO**. Grain = exact 4-UUID; empty allowlist ⇒ all ineligible. | **Env-A as isolation strategy** (no UUID mint in this packet; no Production target) | **Env-B/C**, exact hosted UUID selection, HV2 pin Preview\|Prod label for env-specific claims, hosted lifecycle on that grain | **Yes — Env-A intent only.** Minting/allowlisting UUIDs = later slice; Env-B/C = **NO** now |
| **D6 Attestation** | **Attest-A:** repo-pinned phrase + dual execute + env kill (M5-like). **Attest-B:** signed record/schema. **Attest-C:** env-only secret. Consequence: `productionEligibilityAttestation` stays **null**; path attestation ≠ `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` | **Attest-A shape + remain inactive**; revoke via empty allowlist / `revokedAt` | **Activating** production attestation / clearing PB1 gate (1) / satisfying approval phrases in any live env | **Yes — inactive shape only.** Activation = **NO** |
| **D7 Kill/audit** | **Own-A:** Eng allowlist+evaluator; Ops SELECT/workers; Security/Eng phrase rotation; on-call revoke without CHECK drop. **Own-B:** single Ops owner. **Own-C:** defer naming. Audit sink still missing. | **Own-A RACI names (proposed)** for offline synthetic runbooks | **Proof kill/audit work in hosted/PaaS**; audit sink exists and is used; staffing on-call effectiveness | **Yes — name Own-A for synthetic.** Hosted kill proof = **NO** yet |

**Production age / algorithm / accuracy / coverage approval:** remain **`EVIDENCE_REQUIRED`** and **blocked** under this packet.

### H.3 Safe offline-only choices (summary)

Owner may later approve **only** these as `OFFLINE_SYNTHETIC_ONLY` without claiming production readiness:

1. **D1 Age-D** — retain fail-closed age gate
2. **D2** — keep algorithm unapproved; optionally note Alg-A as future pin **shape**
3. **D3 Eval-A** (or fixture Eval-B under hard-false trust) — observation / diagnostic only
4. **D4 Cov-A** — technical observation bar only
5. **D5 Env-A** — synthetic isolation strategy (no production data plane)
6. **D6 Attest-A inactive** — authority model without activation
7. **D7 Own-A** — proposed ownership for synthetic revoke/kill runbook

**Still forbidden under offline-only approval:** clearing PB1 gates, `m7_eligible=true`, `production_eligible`, merchant UUID allowlists, hosted Production publish, workers/cron ENABLE, M7.2/M7.3 flips.

### H.4 Env-A isolation rule (normative if Env-A selected later)

If owner later selects **Env-A**, the synthetic canary path **MUST NOT** access or mutate production / merchant data:

| Rule | Requirement |
|---|---|
| Identity namespace | Dedicated synthetic org/store/location/variant UUIDs — **not** real merchant grains |
| Data plane | Fixture / local (or explicitly non-Production isolated project if separately proven) — **never** Production Supabase merchant rows |
| Allowlist | Exact 4-tuple only; default empty; no wildcards; ops metadata non-authoritative |
| RPCs / writers | No production callers; no workers/cron; service_role must not be aimed at Production merchant tenants for Env-A work |
| Reads | No merchant deep-dive SELECTs; no draining leftover M5 E.4 dirty grains as side effect |
| Mutations | Persist/publish only against synthetic grain under separate approval; publications remain `m7_eligible=false` |
| Eligibility | PE1.a + PE1.b.1 remain ineligible; PB1 still requires `forecastEligibility="ineligible"` |
| Kill | Empty/`revokedAt` allowlist immediately misses; SQL CHECK + PB1/M7 hard-false untouched |

**Env-A ≠ permission to touch Production.** Env-C remains **NO-GO** until Preview isolation + SELECT + kill-switch are separately proven.

### H.5 Next evidence-producing milestone (not another policy abstraction)

**Name:** **M6-PE1.b.4 — Offline synthetic single-grain lifecycle evidence**
**Goal:** Produce **actual** calculate → persist → publish → fresh-read → PE1.a → PE1.b.1 evidence on a **synthetic** grain under hard-false gates.
**Not authorized by this document** — requires separate explicit implementation approval.

| | |
|---|---|
| **In scope (when separately approved)** | Local/fixture (or dedicated synthetic DB) single 4-tuple; workers OFF; `m7_eligible=false` preserved; PE1.a ineligible; PE1.b.1 Age-D → `ineligible_age_unapproved`; record tokens, dispositions, mapping notes, row counts as evidence artifact |
| **Out of scope** | Production/merchant data; Env-B/C; attestation activation; Age-A/B/C numeric SLA; algorithm approval; Cov-B production bar; PB1/M7/CHECK changes; Vercel/workers/cron; PE1.c hosted canary; E4/AI/purchasing |
| **Acceptance gates** | (1) Synthetic grain only / Env-A isolation rules held. (2) Publication rows `m7_eligible=false`. (3) Fresh-read check-time only; no post-commit freshness claim. (4) PE1.a/b.1 force ineligible + Age-D blockers present. (5) PB1 still rejects non-ineligible forecast. (6) No production attestation; gate (1) unsatisfied. (7) Evidence artifact committed or attached without secrets. |
| **What this unlocks** | Offline lifecycle **evidence** for PE1.c planning — **not** production eligibility |
| **What this does not unlock** | Production age/alg/accuracy/coverage approval; PE1.c; CHECK relaxation; merchant canary |

### H.6 Hard-false protections confirmed retained

Unchanged and non-negotiable under §H and any future PE1.b.4/PE1.c planning:

- SQL `sku_forecast_publications_m7_eligible_false` (`m7_eligible = false`)
- Evaluation trust hard-false CHECK (`algorithm_approved = false`, etc.)
- Publish adapter forces `m7Eligible: false`
- Fresh-reader `claimsPostCommitFreshness: false`
- PE1.a always `forecastEligibility: "ineligible"`
- PE1.b.1 Age-D + `algorithmPinPolicy: "unapproved"` + `productionEligibilityAttestation: null` + never `production_eligible`
- PB1 requires `forecastEligibility: "ineligible"` + all four `PRODUCTION_CREATE_GATES` unsatisfied
- M7.2 `forecast_run_id` null / M7.3 merchant approvable hard-false tracks

---

## Freeze checklist

- [x] HEAD `9be22a1` verified; dirty tree preserved aside from this file
- [x] Current verified baseline recorded (offline + hosted scope-limited)
- [x] Hard-false SQL / PE1.a / PE1.b.1 / PB1 / M7 gates explicitly retained
- [x] Owner decision matrix D1–D7 with options, tradeoffs, RECOMMENDED, evidence, UNAPPROVED
- [x] §H readiness review: `SAFE_TO_DECIDE_NOW` vs `EVIDENCE_REQUIRED`; option consequences; offline-synthetic-only set
- [x] Production age / algorithm / accuracy / coverage kept evidence-blocked
- [x] Env-A isolation: no production data access/mutation (§H.4)
- [x] Next milestone replaced with evidence-producing PE1.b.4 (§H.5), not another policy abstraction
- [x] No numeric thresholds invented as approved; ILLUSTRATIVE labels used where helpful
- [x] No canary UUID selected; no algorithm approved; no attestation activated
- [ ] Owner approvals of D1–D7 — **not granted**
- [ ] PE1.b.4 / PE1.c / production forecast eligibility — **not authorized**

**PE1.b.3 production policy decision packet + final owner readiness review COMPLETE (docs only).**
**STOP before implementation / activation.**
