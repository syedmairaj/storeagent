# AI-MKT-1d — Bounded Research Orchestration & Claim Validation

| Field | Value |
|---|---|
| Document ID | AI-MKT-1D-IMPLEMENTATION-REPORT |
| Slice | **AI-MKT-1d** |
| DoD | **`LOCAL_COMPLETE`** (schema-neutral; no migrations) |
| As-of | 2026-11-27 (Asia/Dubai) |
| Baseline HEAD (pre-slice tip) | `553e239` — AI-MKT-1c **CLOSED/PUSHED** |
| Full SHA (baseline) | `553e239783ba213e4ea5efd7039ff36e69845646` |
| `origin/main` | **Aligned** at `553e239` before this uncommitted slice |
| Mode | Offline bounded orchestration + claim validation + Vitest + continuity docs — **no** SDKs, network, persistence, UI, routes, credits, migrations, Git |
| Schema | Local/hosted **57/57** prior · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| Related | `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` · `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md` · `lib/market-research/orchestration/**` |

---

## 0. Verdict

| Gate | Result |
|---|---|
| Offline bounded orchestration / claim validation | **GO** |
| Live research / paid providers / credits / merchant UX | **NO-GO** |
| DoD class | **`LOCAL_COMPLETE`** · `HOSTED_SYNC_PENDING` N/A (no migrations) |
| Activation | **OFF** |
| Next slice | **AI-MKT-1e** — Guarded Merchant Research UX (owner-gated; **not started**) |

**STOP for owner review.** No Git stage/commit/push. Do not start AI-MKT-1e.

---

## A. Starting baseline and protected files

| Field | Value |
|---|---|
| Verified HEAD at start | `553e239` |
| AI-MKT-1c | **CLOSED/PUSHED** @ `553e239` (reconciled from prior LOCAL_COMPLETE wording) |
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` |
| Prior PASS | 1a **24/24** · 1b **21/21** · 1c **19/19** · 1a–1c **64/64** · AI-ARCH **121/121** · AI-INV **27/27** |
| Migrations | **57 local / 57 hosted** (unchanged) |
| Post-catalog | **23/23 PASS** (prior) |
| Production activation | **OFF** |
| CONN-1 exit / V8 JWT / binding / D13/D14 | **UNMET** / **NOT VERIFIED** / **`NOT_YET_VERIFIED`** / **DEFERRED** (unchanged) |
| Protected (untouched) | `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, SQL/operator/archive dirties, deleted roadmap DOCX |

---

## B. Exact files

### Added (1d)

| Path | Role |
|---|---|
| `lib/market-research/orchestration/types.ts` | Orchestration/draft contracts, ARCH ceilings, failure codes |
| `lib/market-research/orchestration/bounds.ts` | Step/tool/deadline/retry/payload caps; offline spend counters |
| `lib/market-research/orchestration/plan.ts` | Literal six-step plan; deep/recursive research forbidden |
| `lib/market-research/orchestration/evidence-hash.ts` | Deterministic `sha256:` evidence binding hash |
| `lib/market-research/orchestration/binding.ts` | Trusted run binding; forged authority probes |
| `lib/market-research/orchestration/validate-claims.ts` | Material claim ↔ accepted evidence validation |
| `lib/market-research/orchestration/draft.ts` | Versioned draft contract + validation |
| `lib/market-research/orchestration/offline-stub.ts` | Injectable offline draft stub (no network) |
| `lib/market-research/orchestration/synthesize.ts` | Deterministic findings + draft apply/fallback |
| `lib/market-research/orchestration/run.ts` | `runMarketResearchOrchestration` entry |
| `lib/market-research/orchestration/index.ts` | Orchestration barrel |
| `tests/unit/ai-mkt-1d-bounded-orchestration-claim-validation.test.ts` | Focused Vitest pack |
| `docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md` | This report |

### Modified

| Path | Role |
|---|---|
| `lib/market-research/index.ts` | Re-export 1d orchestration surface |
| Continuity docs | Master handoff, IMPLEMENTATION_STATUS, ledger, PROJECT_HANDOFF, AI roadmap, November plan |

### Not modified

M5–M7/PB1 · L1 tool allowlist · commerce-agent orchestrator · UI/routes · migrations · deps/env · credits/cache · Git history · protected dirties.

---

## C. Orchestration contract

```text
runMarketResearchOrchestration({
  merchantContext, rawRequest, targetProduct, sourceId, nowIso,
  allowSyntheticFixtures?, satisfied*Conditions?, draftAdapter?, bounds?, …
}) → MarketResearchOrchestrationResult

market-research-orchestration-v1
  status: answered | partial | abstained | error
  + evidenceHash, findings[], limitations[], conflicts[], spend{actualSpend:0,credits:0}
  + originClass=synthetic_fixture, promotableToL1Findings=false
  + generator: deterministic | draft_validated | fallback_deterministic | none
```

**Flow (actual 1a/1b/1c functions):**

1. Fail-closed forged authority / spend-ledger / recursive-plan probes
2. Enablement OFF unless explicit synthetic injection
3. **Admit** via `admitMarketResearchRequest` (retrieve rights)
4. Build literal bounded plan (depth `deep` forbidden)
5. **Retrieve** via `invokeMarketResearchAdapter` (≤1 tool call)
6. Cancellation / deadline → discard; late responses → zero findings
7. **Normalize** via `normalizeMarketResearchEvidence`
8. Re-evaluate **analyze** and **display** rights independently; Gemini normalize/analyze denied
9. Hash accepted evidence; deterministic synthesize; optional offline draft validate
10. Seal typed answered/partial or abstain/error — never L1 promotion

---

## D. Execution bounds

| Bound | Research default | ARCH ceiling (never exceed) |
|---|---|---|
| Steps | 6 | 6 |
| Tool calls | 1 | 4 |
| Deadline | 2000ms | 8000ms |
| Retries | 0 (max clamp 1) | — |
| Payload | 64_000 bytes | clamped ≤ 256_000 |
| Draft chars | 2000 | 2000 |

- Failed adapter attempts counted in `spend.failedAttempts`
- Offline token estimates only; **actualSpend=0**, **credits=0** (no ledger / production budget)
- No recursive planning, deep research, uncontrolled retry/fallback

---

## E. Claim-validation matrix

| Scenario | Outcome |
|---|---|
| Exact value/unit/currency/country/signal/claim-class bind | **Accept** |
| Evidence hash mismatch | **Reject** `HASH_MISMATCH` |
| Valid number / wrong claim value | **Reject** `VALUE_MISMATCH` |
| Wrong unit / currency / country | **Reject** matching code |
| Partial match → exact_sku claim | **Reject** `PARTIAL_MATCH_OVERCLAIM` |
| Stale → current | **Reject** `STALE_AS_CURRENT_FORBIDDEN` |
| Unknown observation → current | **Reject** `UNKNOWN_OBSERVATION_AS_CURRENT` |
| Search/rank/review → sales | **Reject** `SIGNAL_NOT_SALES` |
| Fake / rejected evidence citation | **Reject** `EVIDENCE_NOT_ACCEPTED` / `EVIDENCE_REJECTED_ID` |
| Prompt injection / forbidden action | **Reject** |
| Hypothesis / estimate promotion | **Reject** |
| Conflict / duplicate certainty inflation | **Reject** |
| Malformed draft | Deterministic **fallback** (`DRAFT_REJECTED`) |
| No accepted evidence | **Abstain** `INSUFFICIENT_EVIDENCE` |
| Gemini normalize/analyze/fallback | **Denied** |
| Synthetic → L1 findings | **Forbidden** |

Draft contract: `market-research-answer-draft-v1` + prompt pin `market-research-draft-prompt-v1`. Findings remain evidence-bound; draft may polish prose only after validation.

---

## F. Rights / tenant guarantees

| Guarantee | Enforcement |
|---|---|
| Tenant/store/variant from MerchantContext | `buildTrustedResearchRunBinding` + 1a scope |
| Policy pin `2026-11-27.mkt1a` | Request + binding |
| Retrieve / normalize / analyze / display re-evaluated separately | `evaluateSourceOperationRights` per op |
| `licenseOk` server-derived only | `deriveServerLicenseOk`; caller licenseOk forged |
| Caller evidence / approval / hash / scope overrides | `detectForgedBindingAuthority` fail-closed |
| Gemini excluded from normalize/analyze + auto-fallback | Early deny codes |
| Synthetic never L1 | `authorizeNormalizedEvidenceForL1Findings` + result flags |
| Enablement default OFF | `mayRunMarketResearch` without synthetic injection |
| L1 `web_search` / `market.*` remain forbidden | `assertL1MarketToolsRemainForbidden` |
| Zero network / persistence / spend | Static offline stubs + Vitest assertions |

---

## G. Fallback behavior

| Event | Outcome |
|---|---|
| No draft adapter | `generator: deterministic` |
| Valid offline draft | `generator: draft_validated` (findings unchanged) |
| Invalid / timed-out / live draft | `generator: fallback_deterministic` |
| Cancel / deadline / late | `status: error`, `producedFindings: false` |
| Disabled / unauthorized | Zero adapter calls; abstain/error |

---

## H. Test commands and outcomes

| Check | Result |
|---|---|
| Focused 1d | **19/19 PASS** |
| Focused 1a+1b+1c+1d | **83/83 PASS** (24+21+19+19) |
| AI-ARCH | **121/121 PASS** |
| AI-INV | **27/27 PASS** |
| `npm run typecheck` | **PASS** |
| ESLint (orchestration + 1d tests) | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` (1d paths) | **PASS** |
| Migrations | **57** unchanged |

### Limitations

- No live providers, SDKs, API keys, network, persistence, or spend.
- No merchant-callable route/action / AI-MKT-1e UX.
- No credit ledger (AI-MKT-1.1).
- OpenAI LEGAL third-party citation questions remain open (AI-MKT-0 §9).
- Gemini remains display-only; normalize/analyze denied.
- CONN-1 exit **UNMET**; V8 JWT **NOT VERIFIED**; binding **NOT_YET_VERIFIED**; D13/D14 **DEFERRED**.

### Protected exclusions

Do not stage: `BACKGROUND_JOBS.md`, `SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, operator scripts, SQL snippets, DOCX/archives, `supabase/snippets/`, dated handoff draft, deleted roadmap DOCX.

---

## I. Checkpoint allowlist (owner Git when authorized)

```text
lib/market-research/orchestration/types.ts
lib/market-research/orchestration/bounds.ts
lib/market-research/orchestration/plan.ts
lib/market-research/orchestration/evidence-hash.ts
lib/market-research/orchestration/binding.ts
lib/market-research/orchestration/validate-claims.ts
lib/market-research/orchestration/draft.ts
lib/market-research/orchestration/offline-stub.ts
lib/market-research/orchestration/synthesize.ts
lib/market-research/orchestration/run.ts
lib/market-research/orchestration/index.ts
lib/market-research/index.ts
tests/unit/ai-mkt-1d-bounded-orchestration-claim-validation.test.ts
docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
```

---

## J. Continuity reconciliation

| Item | State |
|---|---|
| AI-MKT-1c | **CLOSED/PUSHED** @ `553e239` (reconciled) |
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` |
| AI-MKT-1d | **`LOCAL_COMPLETE`** (uncommitted; this report) |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-ARCH-1 | **CLOSED/PUSHED** @ `c216ded` |
| Migrations | **57/57** prior · activation **OFF** |
| Actual committed HEAD | `553e239` (+ uncommitted 1d work) |
| Offline | **GO** |
| Live | **NO-GO** |
| Next proposed | **AI-MKT-1e** — Guarded Merchant Research UX |

Sequence: `AI-MKT-0 → 1a → 1b → 1c (CLOSED/PUSHED) → 1d (this) → 1e → … → 1.1 → …`

---

## K. STOP

**STOP FOR OWNER REVIEW.** Do not start AI-MKT-1e. No Git writes from this slice.
