# AI-MKT-1f-R1 — Merchant Evidence Identifier Hardening

| Field | Value |
|---|---|
| Document ID | AI-MKT-1F-R1-IMPLEMENTATION-REPORT |
| Slice | **AI-MKT-1f-R1** |
| DoD | **`LOCAL_COMPLETE`** (schema-neutral; no migrations) |
| As-of | 2026-11-28 (Asia/Dubai) |
| Baseline HEAD | `6b16caa` — DOC-GLOBAL-1 **CLOSED/PUSHED** |
| Full SHA | `6b16caab91c83ffd7aec4c4db566a2f06a7c1396` |
| `origin/main` | **Aligned** at `6b16caa` |
| Mode | Opaque response-scoped merchant public IDs + Vitest + continuity docs — **no** migrations, deps, env, persistence, GEO-1, live calls, hosted ops, activation, Git |
| Schema | Local/hosted **57/57** prior · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| Related | `docs/AI_MKT_1F_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md` · `docs/DOC_GLOBAL_1_FOUR_MARKET_LAUNCH_STRATEGY.md` |

---

## 0. Verdict

| Gate | Result |
|---|---|
| Offline opaque public ID remediation / M01b behavioral PASS | **GO** |
| Live research / paid providers / credits / soft-show / production activation | **NO-GO** |
| Authenticated merchant browser / integrated commercial UX | **NOT CERTIFIED** |
| DoD class | **`LOCAL_COMPLETE`** · `HOSTED_SYNC_PENDING` N/A (no migrations) |
| Activation | **OFF** |
| Critical failures | **none** |
| Next proposed | **AI-MKT-GEO-1** — versioned US/GB/CA/AU country/capability registry (**not started**) |

**STOP for owner review.** No Git stage/commit/push. Do not start AI-MKT-GEO-1.

---

## 1. Baseline reconciliation

| Field | Value |
|---|---|
| Verified HEAD | `6b16caa` — `docs(storeagent): define global architecture and four-market launch strategy` |
| DOC-GLOBAL-1 | **CLOSED/PUSHED** @ `6b16caa` (reconciled from prior `DOCS_ONLY_COMPLETE`/uncommitted wording) |
| AI-MKT-1f | **CLOSED/PUSHED** @ `e6943ce` |
| AI-MKT-1e | **CLOSED/PUSHED** @ `59ff8b0` |
| Prior PASS | 1f matrix **58** mandatory PASS · **1 SKIP** (M01b); AI-MKT **168/168** · AI-ARCH **121/121** · AI-INV **27/27** |
| Migrations | **57 local / 57 hosted** (unchanged) |
| Soft-show / activation | **OFF** |
| Protected (untouched) | `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md` · `docs/BACKGROUND_JOBS.md` · `docs/SERVICE_ROLE_BOUNDARY.md` · `AGENTS.md` · `.tmp/` · `.vitest/` · SQL/operator/archives · deleted roadmap DOCX |

### Owner decisions recorded (living docs)

| Decision | Record |
|---|---|
| Eng sequence | **R1 → GEO-1 → DATA-0 → 1.1 → DATA-1** |
| AE after GEO-1 | Historical / fixture-only — not launch eligibility |
| Billing | Independent of merchant domicile |
| Provider selection | Legal rights / commercial-use clearance **before** provider selection |
| Multi-country vs Shopify | Future multi-country support must **not** unnecessarily delay Shopify |
| US/GB/CA/AU targets | Flexible **KPIs only** — **never** registration caps or entitlement constraints |

---

## 2. Public / internal ID design

| Layer | Format / behavior | Authority |
|---|---|---|
| **Internal evidenceId** | `mkt1c:{organizationId}:{clientRequestId}:{snippetId}` | Unchanged — normalization, orchestration, claim validation, evidenceHash binding |
| **Internal findingId** | `mkt1d-finding:{internalEvidenceId}` | Unchanged inside orchestration |
| **Internal conflictId** | Adapter/dedupe IDs (may embed snippet tokens) | Unchanged inside orchestration |
| **Public evidenceId** | `mev_` + 24 hex (HMAC-SHA256, response-scoped key) | Merchant DTO / browser only |
| **Public findingId** | `mfd_` + 24 hex | Merchant DTO / UI keys only |
| **Public conflictId** | `mcf_` + 24 hex | Merchant DTO / UI keys only |
| **Response scope** | Fresh 32-byte key per `toMerchantResearchDto` (never returned) | Prevents cross-response / cross-tenant correlation |
| **Stability** | Same internal ID → same public ID **within one DTO** | Citation ↔ finding referential integrity |
| **Non-goals** | No reversible encoding, no base64 of internals, no persistent mapping table | Prefer in-memory session mapping (no migrations) |

Text fields (labels, values, limitations, conflict summaries, error strings) are scrubbed for known internal IDs / residual `mkt1c:` / `mkt1d-finding:` tokens. `assertMerchantResearchSafeDto` now rejects internal ID shapes on ID fields and string values.

`clientRequestId` remains on the DTO for stale-response correlation (merchant-generated; not an internal evidence identifier).

---

## 3. Deliverables

| Path | Role |
|---|---|
| `lib/market-research/merchant-public-ids.ts` | Response-scoped HMAC public ID mapper + leakage helpers |
| `lib/market-research/merchant-response.ts` | Map findings/citations/conflicts; scrub nested strings; harden safe-DTO assert |
| `lib/market-research/index.ts` | Re-export public-ID helpers |
| `tests/fixtures/ai/ai-mkt-1f-eval-v1.ts` | M01b SKIP → mandatory PASS expectations |
| `tests/evaluation/ai-mkt-1f-runner.ts` | Opaque ID uniqueness / integrity / leakage assertions |
| `tests/unit/ai-mkt-1f-r1-opaque-public-ids.test.ts` | Focused R1 behavioral pack |
| `docs/AI_MKT_1F_R1_IMPLEMENTATION_REPORT.md` | This report |
| Continuity docs | Master handoff, IMPLEMENTATION_STATUS, ledger, PROJECT_HANDOFF, AI roadmap, November plan |

**Not modified:** migrations · deps · env · persistence · GEO-1 · L1 allowlist · M5–M7/PB1 · protected dirties · Git history · soft-show unlock.

---

## 4. Case / test results

### 1f evaluation matrix (same 59 cases)

| Metric | Result |
|---|---|
| Mandatory PASS | **59/59** |
| SKIP | **0** (M01b converted to genuine behavioral PASS) |
| Critical FAIL | **0** |
| Focused 1f Vitest | **66/66 PASS** |

### Focused R1 pack

| File | Result |
|---|---|
| `tests/unit/ai-mkt-1f-r1-opaque-public-ids.test.ts` | **8/8 PASS** |

Coverage: opaque mapping · citation integrity · uniqueness · tenant/response isolation · adversarial leakage · internal claim-validation authority · malformed/missing/mismatched correlation fields · non-reversibility.

### Regressions

| Suite | Result |
|---|---|
| AI-MKT 1a–1f + R1 | **7 files · 176/176 PASS** (prior 168 + R1 8) |
| AI-ARCH 1a–1f | **6 files · 121/121 PASS** |
| AI-INV | **3 files · 27/27 PASS** |
| `npm run typecheck` | **PASS** |
| Scoped eslint (R1 paths) | **PASS** (0 errors) |
| `npm run build` | **PASS** |
| `git diff --check` (R1 paths) | **PASS** |

Migrations **57/57** unchanged. Activation **OFF**.

---

## 5. Correlation-field verification (real helpers)

Exercised `isCurrentMarketResearchResponse` against:

- matching latest request → accept
- missing / empty `clientRequestId` or `intentClass` → reject
- `latest === null` → reject
- mismatched request / intent / country / depth / grain → reject

### Unrelated / pre-existing notes (not R1 defects; not weakened)

| Note | Class |
|---|---|
| M03 title mentions absent/depth/intent/grain but fixture only probes `country` | Coverage incompleteness in 1f matrix title vs probe (pre-existing) |
| Optional `responseCountryCode` / `responseDepth` `undefined` skips that axis | Intentional optional-field behavior in 1e helper; documented, not changed |
| Soft-show / live / credits still OFF | Separate gates |

---

## 6. Residual risks

| Risk | Status |
|---|---|
| Soft-show / authenticated commercial UX | Still **OFF** / **NOT CERTIFIED** — R1 required but not sufficient |
| AE-centric runtime allowlists | Implementation residue until **AI-MKT-GEO-1** |
| Live/paid providers | **NO-GO** until LEGAL + **AI-MKT-1.1** |
| CONN-1 exit / V8 JWT / binding / D13/D14 | **UNMET** / **NOT VERIFIED** / **`NOT_YET_VERIFIED`** / **DEFERRED** |
| Public IDs are response-scoped only | No durable server-side remap; browser must not treat IDs as cross-request authority |
| Acquisition KPIs (500/250/125/125) | Living-doc KPIs only — never entitlement caps |

---

## 7. Exact checkpoint allowlist (owner Git — when authorized)

Stage **only** these paths:

```text
lib/market-research/merchant-public-ids.ts
lib/market-research/merchant-response.ts
lib/market-research/index.ts
tests/fixtures/ai/ai-mkt-1f-eval-v1.ts
tests/evaluation/ai-mkt-1f-runner.ts
tests/unit/ai-mkt-1f-evaluation-release-readiness.test.ts
tests/unit/ai-mkt-1f-r1-opaque-public-ids.test.ts
docs/AI_MKT_1F_R1_IMPLEMENTATION_REPORT.md
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
```

**Do not stage:** `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`, protected dirties, `.tmp/`, `.vitest/`, `AGENTS.md`, SQL/operator/archives, deleted roadmap DOCX.

---

## 8. GO / NO-GO

| Decision | Verdict |
|---|---|
| Offline engineering readiness (opaque public IDs) | **GO** — `LOCAL_COMPLETE` |
| M01b residual | **CLOSED** as behavioral PASS (SKIP ≠ PASS rule preserved historically) |
| Soft-enable / live AI / paid research / production activation | **NO-GO** |
| Authenticated merchant / integrated commercial UX certification | **NO-GO** / **NOT CERTIFIED** |
| Start AI-MKT-GEO-1 | **NO-GO** from this report alone — owner-gated next proposal |
| Owner Git checkpoint (allowlist only) | Pending owner authorization |

### Offline eng GO / production activation NO-GO (explicit)

- **Offline engineering GO:** opaque public IDs; 59/59 matrix PASS; 176/176 AI-MKT; 121/121 AI-ARCH; 27/27 AI-INV; typecheck/lint/build/whitespace PASS; activation remains OFF.
- **Production activation NO-GO:** not a hosted, authenticated-merchant, live-model, credit, or production certification. Soft-show stays OFF.

---

## 9. Status pin

| Item | Value |
|---|---|
| Slice | AI-MKT-1f-R1 |
| DoD | **`LOCAL_COMPLETE`** |
| HEAD baseline | `6b16caa` (DOC-GLOBAL-1 CLOSED/PUSHED; R1 uncommitted) |
| Migrations | **57/57** prior hosted evidence |
| Catalog | **23/23** prior |
| Activation | **OFF** |
| Offline | **GO** |
| Live | **NO-GO** |
| Next | **AI-MKT-GEO-1** (owner-gated; **not started**) |

**STOP FOR OWNER REVIEW.**
