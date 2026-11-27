# AI-MKT-1b — Offline Provider Adapters & Research Fixtures

| Field | Value |
|---|---|
| Document ID | AI-MKT-1B-IMPLEMENTATION-REPORT |
| Slice | **AI-MKT-1b** |
| DoD | **`LOCAL_COMPLETE`** (schema-neutral; no migrations) |
| As-of | 2026-11-27 (Asia/Dubai) |
| Baseline HEAD (pre-slice tip) | `f685c15` — AI-MKT-1a **CLOSED/PUSHED** (18-file checkpoint) |
| Full SHA (baseline) | `f685c15497253f45ef9a1c44c2b9bf8f3273284c` |
| `origin/main` | **Aligned** at `f685c15` before this uncommitted slice |
| Mode | Offline adapters + synthetic fixtures + Vitest + continuity docs — **no** SDKs, network, persistence, UI, routes, normalization, migrations, Git |
| Schema | Local/hosted **57/57** prior · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| Related | `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` · `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md` · `lib/market-research/**` |

---

## 0. Verdict

| Gate | Result |
|---|---|
| Offline adapters / fixtures | **GO** |
| Live research / paid providers / credits | **NO-GO** |
| DoD class | **`LOCAL_COMPLETE`** · `HOSTED_SYNC_PENDING` N/A (no migrations) |
| Activation | **OFF** |
| Next slice | **AI-MKT-1c** — Evidence Normalization & Product/Geographic Matching (owner-gated; **not started**) |

**STOP for owner review.** No Git stage/commit/push. Do not start AI-MKT-1c.

---

## A. Starting baseline and protected files

| Field | Value |
|---|---|
| Verified HEAD at start | `f685c15` |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` (parent `846ffea` + tip; **18 files** incl. `index.ts` + focused test) |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` |
| Prior PASS | 1a **24/24** · AI-ARCH **121/121** · AI-INV **27/27** |
| Migrations | **57 local / 57 hosted** (unchanged) |
| Post-catalog | **23/23 PASS** (prior) |
| Production activation | **OFF** |
| CONN-1 exit / V8 JWT / binding / D13/D14 | **UNMET** / **NOT VERIFIED** / **`NOT_YET_VERIFIED`** / **DEFERRED** (unchanged) |
| Protected (untouched) | `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, SQL/operator/archive dirties, deleted roadmap DOCX |

---

## B. Exact files

### Added (1b)

| Path | Role |
|---|---|
| `lib/market-research/adapters/types.ts` | Adapter interface, envelopes, failure reasons, fixture IDs |
| `lib/market-research/adapters/fixtures.ts` | Synthetic OpenAI/Gemini fixture builders |
| `lib/market-research/adapters/runtime.ts` | Abort / deadline / late-discard helpers |
| `lib/market-research/adapters/openai-offline.ts` | OpenAI offline_stub + recorded_replay |
| `lib/market-research/adapters/gemini-offline.ts` | Gemini display-only offline adapters |
| `lib/market-research/adapters/approval.ts` | Separate provider approval / egress gates |
| `lib/market-research/adapters/registry.ts` | Immutable offline adapter registry |
| `lib/market-research/adapters/invoke.ts` | Gated invoke (1a gates → approval → adapter) |
| `lib/market-research/adapters/index.ts` | Adapters barrel |
| `tests/unit/ai-mkt-1b-offline-adapters-fixtures.test.ts` | Focused Vitest pack |
| `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md` | This report |

### Modified

| Path | Role |
|---|---|
| `lib/market-research/index.ts` | Re-export 1b adapters |
| Continuity docs | Master handoff, IMPLEMENTATION_STATUS, ledger, PROJECT_HANDOFF, AI roadmap, November plan |

### Not modified

M5–M7/PB1 · L1 tool allowlist · orchestrator · evidence normalization · UI/routes · migrations · deps/env · credits/cache · Git history · protected dirties.

---

## C. Adapter contracts

```text
MarketResearchAdapter {
  adapterId, sourceId
  mode: "offline_stub" | "recorded_replay"
  supportsLiveNetwork: false
  originClass: "synthetic_fixture"
  providerShape: openai_responses_web_search_v1 | gemini_search_grounding_v1 | …
  research(input, { signal, timeoutMs, nowIso }) → AdapterResult
}
```

**Envelope:** `market-research-adapter-response-v1` with synthetic labels, fixtureId, source/policy version, request identity, citations/snippets/conflicts, retrieval vs optional observation timestamps. Snippets always `isRealMerchantOrMarketFact: false`.

**Registry keys:** `openai_offline_stub` · `openai_recorded_replay` · `gemini_offline_stub` · `gemini_recorded_replay`.

**Invoke order (denied → adaptersInvoked=0):** live/egress/forged reject → registry resolve → 1a admit (enablement/tenant/geo/rights) → provider approval → allowAdapters check → `adapter.research` under deadline.

**Separated gates:** source rights ≠ tenant auth ≠ provider approval ≠ data-egress permission. OpenAI design candidate ≠ live. Gemini automatic fallback forbidden by default.

---

## D. Fixture coverage

### OpenAI (Responses/web_search-shaped; no SDK)

| Fixture ID | Behavior |
|---|---|
| `openai_success_citations_v1` | Success + citations + observation window |
| `openai_empty_results_v1` | EMPTY_RESULTS |
| `openai_malformed_response_v1` | MALFORMED_PROVIDER_RESPONSE |
| `openai_conflicting_signals_v1` | Success with conflict hints (no invented consensus) |
| `openai_missing_provenance_v1` | MISSING_PROVENANCE |
| `openai_missing_citations_v1` | MISSING_CITATIONS |
| `openai_timeout_v1` | TIMEOUT |
| `openai_transient_failure_v1` | TRANSIENT |
| `openai_hang_until_abort_v1` | CANCELLED via AbortSignal |
| `openai_late_response_v1` | LATE_RESPONSE_DISCARDED |

### Gemini (display-only; no warehouse path)

| Fixture ID | Behavior |
|---|---|
| `gemini_display_only_success_v1` | Success + Search Suggestions ref |
| `gemini_missing_search_suggestions_v1` | ATTRIBUTION_REQUIRED path |
| `gemini_empty_results_v1` | EMPTY_RESULTS |
| `gemini_timeout_v1` | TIMEOUT |
| `gemini_hang_until_abort_v1` | CANCELLED |

Gemini `normalize` / `analyze` / `model_process` / `cache` remain rights-denied before invoke. No automatic fallback.

**Not in 1b:** canonical EvidenceRecord normalization / product-geo matching (AI-MKT-1c).

---

## E. Test commands and outcomes

| Check | Result |
|---|---|
| Focused 1b | **21/21 PASS** |
| Focused 1a+1b | **45/45 PASS** (24+21) |
| AI-ARCH | **121/121 PASS** |
| AI-INV | **27/27 PASS** |
| `npm run typecheck` | **PASS** |
| ESLint (market-research + 1a/1b tests) | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` (1b paths) | **PASS** |
| Migrations | **57** unchanged |

### Limitations

- No live providers, SDKs, API keys, network, persistence, or spend.
- No evidence normalization into findings (1c).
- No L1 `market.*` tools / orchestrator wiring.
- OpenAI LEGAL third-party citation questions remain open (AI-MKT-0 §9).
- Gemini remains display-only; live blocked.
- Credits / durable cache deferred to 1.1+.

### Protected exclusions

Do not stage: `BACKGROUND_JOBS.md`, `SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, operator scripts, SQL snippets, DOCX/archives, `supabase/snippets/`, dated handoff draft, deleted roadmap DOCX.

---

## F. Checkpoint allowlist (owner Git when authorized)

```text
lib/market-research/adapters/types.ts
lib/market-research/adapters/fixtures.ts
lib/market-research/adapters/runtime.ts
lib/market-research/adapters/openai-offline.ts
lib/market-research/adapters/gemini-offline.ts
lib/market-research/adapters/approval.ts
lib/market-research/adapters/registry.ts
lib/market-research/adapters/invoke.ts
lib/market-research/adapters/index.ts
lib/market-research/index.ts
tests/unit/ai-mkt-1b-offline-adapters-fixtures.test.ts
docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
```

---

## G. Continuity reconciliation

| Item | State |
|---|---|
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` (reconciled; 18-file checkpoint) |
| AI-MKT-1b | **`LOCAL_COMPLETE`** (uncommitted; this report) |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-ARCH-1 | **CLOSED/PUSHED** @ `c216ded` |
| Migrations | **57/57** prior · activation **OFF** |
| Actual committed HEAD | `f685c15` (+ uncommitted 1b work) |
| Offline | **GO** |
| Live | **NO-GO** |
| Next proposed | **AI-MKT-1c** — Evidence Normalization & Product/Geographic Matching |

Sequence: `AI-MKT-0 → 1a → 1b (this) → 1c → … → 1.1 → …`

---

## H. STOP

**STOP FOR OWNER REVIEW.** Do not start AI-MKT-1c. No Git writes from this slice.
