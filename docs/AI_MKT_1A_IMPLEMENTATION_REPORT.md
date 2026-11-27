# AI-MKT-1a — Research Contracts, Source Registry & Rights Enforcement

| Field | Value |
|---|---|
| Document ID | AI-MKT-1A-IMPLEMENTATION-REPORT |
| Slice | **AI-MKT-1a** |
| DoD | **`LOCAL_COMPLETE`** (schema-neutral; no migrations) |
| As-of | 2026-11-27 (Asia/Dubai) |
| Baseline HEAD (pre-slice tip) | `de01686` — AI-MKT-0 **CLOSED/PUSHED** |
| Full SHA (baseline) | `de01686c4eb94a3f36af4d07aa85612e49e442ef` |
| `origin/main` | **Aligned** at `de01686` before this uncommitted slice |
| Mode | Contracts + pure policy enforcement + Vitest + continuity docs — **no** adapters, network, persistence, UI, routes, migrations, Git |
| Schema | Local/hosted **57/57** prior · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| Related | `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` §§3–6, 8–11 · `.cursor/rules/commerce-intelligence-governance.mdc` · `lib/commerce-agent` |

---

## 0. Verdict

| Gate | Result |
|---|---|
| Offline foundation | **GO** |
| Live research / paid providers / credits | **NO-GO** |
| DoD class | **`LOCAL_COMPLETE`** · `HOSTED_SYNC_PENDING` N/A (no migrations) |
| Activation | **OFF** |
| Next slice | **AI-MKT-1b** — Offline Provider Adapters & Research Fixtures (owner-gated; **not started**) |

**STOP for owner review.** No Git stage/commit/push. Do not start AI-MKT-1b.

---

## A. Starting baseline and protected files

| Field | Value |
|---|---|
| Verified HEAD at start | `de01686` (`docs(ai-mkt): define market intelligence feasibility and governance (0)`) |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` (reconciled from prior LOCAL_COMPLETE/uncommitted wording) |
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` (ancestor of `de01686`) |
| Migrations | **57 local / 57 hosted** (unchanged; no new migration files) |
| Post-catalog | **23/23 PASS** (prior evidence) |
| Production activation | **OFF** |
| CONN-1 exit | **UNMET** (unchanged) |
| V8 hosted JWT | **NOT VERIFIED** (unchanged) |
| Binding | **`NOT_YET_VERIFIED`** (unchanged) |
| D13/D14 | **DEFERRED** (unchanged) |
| Protected (untouched) | `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, SQL/operator/archive dirties, deleted roadmap DOCX |

---

## B. Exact contracts / policy enforcement and files

### Added

| Path | Role |
|---|---|
| `lib/market-research/types.ts` | Versioned DTOs: ResearchRequest/Result, MarketSourcePolicy, ResearchProvenance, ResearchEvidenceItem, signal/rights/operation classes, failure codes |
| `lib/market-research/registry.ts` | Immutable server-owned source registry (OpenAI, Gemini, merchant internal, prohibited, unknown) |
| `lib/market-research/rights.ts` | Deny-by-default executable rights; operation-specific + conditional conditions; forged-input rejection |
| `lib/market-research/geo-category.ts` | AE design allowlist; US/GB synthetic-fixture-only; production allowlist disabled; owner-gated categories |
| `lib/market-research/scope.ts` | Trusted MerchantContext scope; forged override rejection; retrieval ≠ observation time |
| `lib/market-research/enablement.ts` | Separate research enablement (default OFF); live always forbidden; L1 market-tool guard |
| `lib/market-research/validate.ts` | Runtime validation at untrusted boundaries |
| `lib/market-research/evidence-map.ts` | ResearchEvidenceItem → EvidenceRecord-compatible mapping (no L1 type edits) |
| `lib/market-research/gate.ts` | Pure offline admission gate (no network/persistence) |
| `lib/market-research/index.ts` | Public barrel |
| `tests/unit/ai-mkt-1a-research-contracts-rights.test.ts` | Focused Vitest pack |
| `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md` | This report |

### Modified (continuity only)

- `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md`
- `docs/PROJECT_HANDOFF.md`
- `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`
- `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md`

### Not modified

M5–M7/PB1 engines · L1 tool allowlist · commerce-agent contracts (except read/reuse) · UI · public routes · migrations · dependencies · env · provider SDKs · caches · credits · hosted ops · Git history.

**Policy pin:** `2026-11-27.mkt1a` · schema versions `market-source-policy-v1` / `market-research-request-v1` / `market-research-result-v1`.

---

## C. Source × operation permission matrix

Registry pin `2026-11-27.mkt1a`. Registration ≠ authorization. Live execution forbidden in 1a regardless of matrix allows.

| Source | retrieve | display | normalize | analyze | model_process | cache | retain | redistribute |
|---|---|---|---|---|---|---|---|---|
| `openai_web_search_v1` | conditional¹ | conditional² | conditional³ | conditional³ | conditional⁴ | conditional⁵ + durable **deny** | conditional⁵ | **deny** |
| `gemini_search_grounding_v1` | conditional⁶ | conditional⁷ | **deny** | **deny** | **deny** | **deny** (CACHE_FORBIDDEN) | conditional⁸ | **deny** |
| `merchant_internal_v1` | allow | allow | allow | allow | allow | allow | allow | **deny** |
| `shopify_catalog_market_db_prohibited_v1` | **deny** | **deny** | **deny** | **deny** | **deny** | **deny** | **deny** | **deny** |
| `unknown_unregistered_v1` / unregistered | **deny** (SOURCE_UNKNOWN / LICENSE_DENIED) | same | same | same | same | same | same | same |

**Notes**

1. OpenAI retrieve requires `live_research_authorized` + `third_party_source_rights_reviewed` + `credit_reservation_ok`. Satisfying conditions ≠ live approval (`openaiConditionalRightsImplyLiveApproval() === false`).
2. Display requires inline citations + third-party rights review; attribution mandatory.
3. Normalize/analyze remain tenant-scoped; search≠sales equivalence forbidden.
4. Model-processing requires paid Business non-training tier + third-party rights review; training consent never implied.
5. Cache/retain conditional but durable/shared cache still **CACHE_FORBIDDEN** unless ephemeral exception; `maxRetentionDays=null` until later legal approval.
6. Gemini retrieve requires display-only path + Search Suggestions renderable + **no automatic fallback** (fallback needs separate approval flag).
7. Display requires Search Suggestions with results for the submitting end user.
8. Retain limited to end-user chat history; no shared/durable research cache.
9. Caller-supplied `licenseOk` / policy / permissions / approval → **FORGED_POLICY_INPUT**.
10. UNKNOWN / revoked / expired / policy-version mismatch → deny.

**Geo/category:** AE design allowlist; US/GB synthetic fixtures only; production geo allowlist **disabled**; category selection owner-gated (empty by default); no `*` / GLOBAL fallback.

---

## D. Test commands and outcomes

| Check | Command / scope | Result |
|---|---|---|
| Focused AI-MKT-1a | `npx vitest run tests/unit/ai-mkt-1a-research-contracts-rights.test.ts` | **24/24 PASS** |
| AI-ARCH regression | `npx vitest run tests/unit/ai-arch-*.test.ts` | **121/121 PASS** |
| AI-INV regression | `npx vitest run tests/unit/ai-inv-*.test.ts` | **27/27 PASS** |
| Typecheck | `npm run typecheck` | **PASS** |
| Lint (1a paths) | `npx eslint lib/market-research tests/unit/ai-mkt-1a-research-contracts-rights.test.ts` | **PASS** |
| Build | `npm run build` | **PASS** |
| Whitespace | `git diff --check -- lib/market-research tests/unit/ai-mkt-1a-…` | **PASS** |
| Migrations | `ls supabase/migrations/*.sql \| wc -l` | **57** (unchanged) |

### Acceptance coverage (focused pack)

- Valid versioned DTOs + malformed runtime inputs
- Unknown / revoked / expired rights + policy-version mismatch
- Operation-specific rights + retention/attribution
- Gemini cache / normalize / analyze / model_process denial; automatic fallback denied by default
- OpenAI conditional rights ≠ implicit live approval; redistribute deny; durable cache forbidden
- Unsupported country/category; US/GB fixture-only; production allowlist disabled
- Tenant mismatch + forged policy/license/adapter inputs
- Default OFF; live path impossible; L1 `web_search`/`market.*` still forbidden; no network/persistence APIs in sources

### Limitations

- No provider adapters, recorded-replay fixtures, credit ledger, durable cache, UI, or public routes (deferred to later slices).
- OpenAI third-party citation caching LEGAL items remain unresolved (AI-MKT-0 §9).
- Gemini display-only candidate remains blocked for live execution.
- Exact merchant category allowlist empty until owner authorization.
- Soft-enable / research env flags cannot unlock live path in 1a.
- Offline eval pack (AI-ARCH 38/38) not re-run this slice (Vitest regressions only).

### Protected exclusions (not staged)

`docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, `scripts/conn-hr-1/operator/`, SQL snippets, DOCX/archives, `supabase/snippets/`, dated handoff draft, deleted `docs/StoreAgent_Roadmap_2026.docx`.

---

## E. Checkpoint allowlist (owner Git when authorized)

Stage **only**:

```text
lib/market-research/types.ts
lib/market-research/registry.ts
lib/market-research/rights.ts
lib/market-research/geo-category.ts
lib/market-research/scope.ts
lib/market-research/enablement.ts
lib/market-research/validate.ts
lib/market-research/evidence-map.ts
lib/market-research/gate.ts
lib/market-research/index.ts
tests/unit/ai-mkt-1a-research-contracts-rights.test.ts
docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
```

**Do not stage:** protected dirty/untracked set listed above. Preserve migration rule; do not reopen 57/57 sync.

---

## F. Continuity reconciliation

| Item | State |
|---|---|
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` (reconciled) |
| AI-MKT-1a | **`LOCAL_COMPLETE`** (uncommitted; this report) |
| AI-ARCH-1 | **CLOSED/PUSHED** @ `c216ded` |
| Migrations | **57/57** prior · activation **OFF** |
| Actual HEAD (tree tip before Git) | `de01686` + uncommitted 1a work |
| Offline | **GO** |
| Live | **NO-GO** |
| Next proposed | **AI-MKT-1b** — Offline Provider Adapters & Research Fixtures |

Canonical sequence preserved:

```text
AI-MKT-0 → AI-MKT-1a (this) → AI-MKT-1b → … → AI-MKT-1.1 → …
```

CONN-1 exit **UNMET**; V8 hosted JWT **NOT VERIFIED**; binding **`NOT_YET_VERIFIED`**; D13/D14 **DEFERRED** — unchanged.

---

## G. STOP

**STOP FOR OWNER REVIEW.** Do not start AI-MKT-1b. No Git writes from this slice.
