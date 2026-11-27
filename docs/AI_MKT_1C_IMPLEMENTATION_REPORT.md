# AI-MKT-1c — Evidence Normalization & Product/Geographic Matching

| Field | Value |
|---|---|
| Document ID | AI-MKT-1C-IMPLEMENTATION-REPORT |
| Slice | **AI-MKT-1c** |
| DoD | **`LOCAL_COMPLETE`** (schema-neutral; no migrations) |
| As-of | 2026-11-27 (Asia/Dubai) |
| Baseline HEAD (pre-slice tip) | `211d8e9` — AI-MKT-1b **CLOSED/PUSHED** |
| Full SHA (baseline) | `211d8e90cee94ca09a2a6a3e4339c9767509df2d` |
| `origin/main` | **Aligned** at `211d8e9` before this uncommitted slice |
| Mode | Offline normalization/matching + minimal fixture extensions + Vitest + continuity docs — **no** SDKs, network, persistence, UI, routes, orchestration, credits, migrations, Git |
| Schema | Local/hosted **57/57** prior · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| Related | `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` §§3–6, 8 · `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md` · `lib/market-research/**` |

---

## 0. Verdict

| Gate | Result |
|---|---|
| Offline normalization / matching | **GO** |
| Live research / paid providers / credits | **NO-GO** |
| DoD class | **`LOCAL_COMPLETE`** · `HOSTED_SYNC_PENDING` N/A (no migrations) |
| Activation | **OFF** |
| Next slice | **AI-MKT-1d** — Bounded Research Orchestration & Claim Validation (owner-gated; **not started**) |

**STOP for owner review.** No Git stage/commit/push. Do not start AI-MKT-1d.

---

## A. Starting baseline and protected files

| Field | Value |
|---|---|
| Verified HEAD at start | `211d8e9` |
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` (reconciled from prior LOCAL_COMPLETE/uncommitted wording) |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` |
| Prior PASS | 1a **24/24** · 1b **21/21** · 1a+1b **45/45** · AI-ARCH **121/121** · AI-INV **27/27** |
| Migrations | **57 local / 57 hosted** (unchanged) |
| Post-catalog | **23/23 PASS** (prior) |
| Production activation | **OFF** |
| CONN-1 exit / V8 JWT / binding / D13/D14 | **UNMET** / **NOT VERIFIED** / **`NOT_YET_VERIFIED`** / **DEFERRED** (unchanged) |
| Protected (untouched) | `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, SQL/operator/archive dirties, deleted roadmap DOCX |

---

## B. Exact files

### Added (1c)

| Path | Role |
|---|---|
| `lib/market-research/normalize/types.ts` | Normalization contracts, match/reject codes, accepted/rejected/conflict outputs |
| `lib/market-research/normalize/product-match.ts` | Deterministic product/variant matching |
| `lib/market-research/normalize/geo-match.ts` | Country/currency/unit matching; no FX without authorized rates |
| `lib/market-research/normalize/citations.ts` | HTTP(S) citation validation + claim-level binding |
| `lib/market-research/normalize/freshness.ts` | Injected-clock freshness; retrieval ≠ observation |
| `lib/market-research/normalize/honesty.ts` | Search/rank/review ≠ sales; injection; promotion rejection |
| `lib/market-research/normalize/dedupe.ts` | Duplicate / conflict detection; independence |
| `lib/market-research/normalize/validate-adapter.ts` | Runtime adapter envelope validation |
| `lib/market-research/normalize/pipeline.ts` | Main `normalizeMarketResearchEvidence` entry |
| `lib/market-research/normalize/evidence-authorize.ts` | Gated EvidenceRecord mapping; synthetic L1 promotion forbidden |
| `lib/market-research/normalize/index.ts` | Normalize barrel |
| `tests/unit/ai-mkt-1c-evidence-normalization-matching.test.ts` | Focused Vitest pack |
| `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md` | This report |

### Modified

| Path | Role |
|---|---|
| `lib/market-research/adapters/types.ts` | Optional product/geo/citation-binding metadata on snippets |
| `lib/market-research/adapters/fixtures.ts` | Enrich success/conflict fixtures; `buildSyntheticOpenAiSuccessEnvelope` helper |
| `lib/market-research/adapters/index.ts` | Re-export new types/helper |
| `lib/market-research/index.ts` | Re-export 1c normalize surface |
| Continuity docs | Master handoff, IMPLEMENTATION_STATUS, ledger, PROJECT_HANDOFF, AI roadmap, November plan |

### Not modified

M5–M7/PB1 · L1 tool allowlist · orchestrator · UI/routes · migrations · deps/env · credits/cache · Git history · protected dirties.

---

## C. Matching rules

### Product (`matchProductAttributes`)

| Priority | Rule |
|---|---|
| 1 | GTIN equal → `exact` (`GTIN_EXACT`) when no mismatches |
| 2 | Brand+MPN equal → `exact` (`MPN_BRAND_EXACT`) |
| 3 | Brand+model+(variant or ≥2 confirming attrs) → `exact` (`BRAND_MODEL_VARIANT_EXACT`) |
| Partial | Brand-only / attribute subsets / title → `partial` |
| Mismatch | GTIN/MPN/brand/model/variant/size/color/capacity/pack/condition/category; accessory vs product; bundle vs product |
| Unknown | Missing identifiers / insufficient attrs; cross-strong-id ambiguity (`AMBIGUOUS_ATTRIBUTES`) |
| Hard rule | Missing attributes **never** imply exact; no LLM similarity |

### Geographic (`matchGeographicObservation`)

| Rule | Outcome |
|---|---|
| Explicit market + country match (+ compatible currency) | `exact` / `compatible` |
| Requested ≠ observed country (AE vs US/GB) | `mismatch` (`COUNTRY_MISMATCH`) |
| Currency differ without authorized FX | `mismatch` (`CURRENCY_MISMATCH` + `FX_CONVERSION_UNAUTHORIZED`) |
| Domain suffix only / currency only | `unproven` (cannot prove geography) |
| Unknown / missing observed country | `unknown` |
| Unit mismatch when both present | `mismatch` |
| Design scope | AE design; US/GB synthetic fixtures only (unchanged 1a geo policy) |

### Freshness (`evaluateEvidenceFreshness`)

| Rule | Outcome |
|---|---|
| Injected `nowIso` required | Deterministic |
| No observation window | `unknown`; historicalOnly; retrieval ≠ observation |
| Observation age > 7d | `stale`; historicalOnly |
| Future retrieval/observation vs clock | Reject `FUTURE_TIMESTAMP` |
| Claim freshness from retrieval | Reject `RETRIEVAL_REFRESH_FORBIDDEN` |
| Historical as current | Forbidden |

---

## D. Normalization contract

```text
normalizeMarketResearchEvidence({
  merchantContext, rawRequest, adapterResult, targetProduct,
  nowIso, satisfiedNormalizeConditions?, …
}) → NormalizationResult

market-research-normalization-v1
  ok:true → accepted[] | rejected[] | conflicts[] | abstentions[]
             + researchEvidence[] (still synthetic)
  ok:false → code + detail (tenant/policy/rights/Gemini/malformed/…)
```

**Intake guarantees**

1. Parse/validate ResearchRequest; resolve trusted MerchantContext scope.
2. Validate adapter envelope schema; pin `sourcePolicyVersion`; require `originClass=synthetic_fixture`.
3. Reject payload `licenseOk` / policy / permissions / approval forgeries.
4. Re-evaluate **normalize** rights via 1a registry (never trust response rights).
5. Gemini `normalize` structurally denied (`GEMINI_NORMALIZE_DENIED`).
6. Per-snippet: honesty → citation bind → product match → geo match → freshness → accept/reject.
7. Dedupe + conflict detection; no silent consensus merge.
8. Deterministic evidence IDs: `mkt1c:{org}:{requestId}:{snippetId}`.
9. Synthetic origin preserved; L1 promotion always denied.

**OpenAI normalize conditions (server-satisfied):**
`tenant_scoped_only` · `third_party_source_rights_reviewed` · `no_sales_from_search_equivalence`

---

## E. Accepted / rejected evidence matrix

| Scenario | Outcome |
|---|---|
| Exact product + AE explicit geo + valid citation + rights OK | **Accepted** (synthetic) |
| Partial product match + geo OK | **Accepted** (lower confidence) |
| Ambiguous cross-identifiers | **Rejected** `PRODUCT_AMBIGUOUS` |
| Accessory / pack / category / condition mismatch | **Rejected** `PRODUCT_MISMATCH` |
| Missing identifiers | **Rejected** `INSUFFICIENT_EVIDENCE` |
| AE request vs US/GB observation | **Rejected** `GEO_MISMATCH` |
| Currency mismatch / FX unauthorized | **Rejected** `CURRENCY_MISMATCH` / `FX_UNAUTHORIZED` |
| Domain/currency-only geo proof | **Rejected** `GEO_UNPROVEN` |
| Missing / unbound / out-of-range citation | **Rejected** `CITATION_*` |
| Invalid citation URL scheme | Envelope or item reject `CITATION_INVALID` |
| Duplicate source+citation+value | **Rejected** `DUPLICATE_NOT_INDEPENDENT` |
| Conflicting values | Kept with `conflicts[]` (no invented consensus) |
| Rank/search/review claiming sales | **Rejected** `SIGNAL_NOT_SALES` |
| Hypothesis/estimate promotion | **Rejected** `PROMOTION_REJECTED` |
| Prompt injection in snippet text | **Rejected** `PROMPT_INJECTION_SUSPECT` |
| Wrong tenant / request / policy pin | Envelope **fail** |
| Forged licenseOk / rights overrides | **fail** `FORGED_POLICY_INPUT` |
| Missing normalize conditions | **fail** `RIGHTS_CONDITIONS_UNSATISFIED` |
| Prohibited/revoked source | **fail** `LICENSE_DENIED` / `SOURCE_REVOKED` |
| Gemini success envelope | **fail** `GEMINI_NORMALIZE_DENIED` |
| Synthetic → L1 findings | **Denied** `SYNTHETIC_PROMOTION_FORBIDDEN` |
| Adapter failure envelope | **fail** / reject `ADAPTER_FAILURE` |

---

## F. Rights / tenant guarantees

| Guarantee | Enforcement |
|---|---|
| Tenant from MerchantContext only | `resolveTrustedResearchScope` |
| Request org must match trusted org | Fail `TENANT_SCOPE_MISMATCH` |
| Adapter org/request must match | Envelope validation |
| Policy pin `2026-11-27.mkt1a` | Request + adapter |
| Normalize rights re-evaluated | `evaluateSourceOperationRights(operation:"normalize")` |
| `licenseOk` server-derived only | `deriveServerLicenseOk`; payload licenseOk forbidden |
| Gemini never normalizes | Early deny + registry `normalize:deny` |
| Synthetic never becomes real L1 finding | `authorizeNormalizedEvidenceForL1Findings` always denies |
| EvidenceRecord map inspect-only | `promotableToL1Findings:false` |
| Zero network / persistence | Static imports + Vitest offline assertion |

---

## G. Test commands and outcomes

| Check | Result |
|---|---|
| Focused 1c | **19/19 PASS** |
| Focused 1a+1b+1c | **64/64 PASS** (24+21+19) |
| AI-ARCH | **121/121 PASS** |
| AI-INV | **27/27 PASS** |
| `npm run typecheck` | **PASS** |
| ESLint (market-research + 1c tests) | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` (1c paths) | **PASS** |
| Migrations | **57** unchanged |

### Limitations

- No live providers, SDKs, API keys, network, persistence, or spend.
- No L1 `market.*` tools / orchestrator wiring (AI-MKT-1d).
- No claim-validation orchestration beyond honesty/match gates in normalize.
- OpenAI LEGAL third-party citation questions remain open (AI-MKT-0 §9).
- Gemini remains display-only; normalize denied.
- Credits / durable cache deferred to 1.1+.
- FX conversion path intentionally unauthorized.

### Protected exclusions

Do not stage: `BACKGROUND_JOBS.md`, `SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, operator scripts, SQL snippets, DOCX/archives, `supabase/snippets/`, dated handoff draft, deleted roadmap DOCX.

---

## H. Checkpoint allowlist (owner Git when authorized)

```text
lib/market-research/normalize/types.ts
lib/market-research/normalize/product-match.ts
lib/market-research/normalize/geo-match.ts
lib/market-research/normalize/citations.ts
lib/market-research/normalize/freshness.ts
lib/market-research/normalize/honesty.ts
lib/market-research/normalize/dedupe.ts
lib/market-research/normalize/validate-adapter.ts
lib/market-research/normalize/pipeline.ts
lib/market-research/normalize/evidence-authorize.ts
lib/market-research/normalize/index.ts
lib/market-research/adapters/types.ts
lib/market-research/adapters/fixtures.ts
lib/market-research/adapters/index.ts
lib/market-research/index.ts
tests/unit/ai-mkt-1c-evidence-normalization-matching.test.ts
docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
```

---

## I. Continuity reconciliation

| Item | State |
|---|---|
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` (reconciled) |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` |
| AI-MKT-1c | **`LOCAL_COMPLETE`** (uncommitted; this report) |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-ARCH-1 | **CLOSED/PUSHED** @ `c216ded` |
| Migrations | **57/57** prior · activation **OFF** |
| Actual committed HEAD | `211d8e9` (+ uncommitted 1c work) |
| Offline | **GO** |
| Live | **NO-GO** |
| Next proposed | **AI-MKT-1d** — Bounded Research Orchestration & Claim Validation |

Sequence: `AI-MKT-0 → 1a → 1b (CLOSED/PUSHED) → 1c (this) → 1d → … → 1.1 → …`

---

## J. STOP

**STOP FOR OWNER REVIEW.** Do not start AI-MKT-1d. No Git writes from this slice.
