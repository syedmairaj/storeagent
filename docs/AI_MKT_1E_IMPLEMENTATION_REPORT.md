# AI-MKT-1e — Guarded Merchant Research UX

| Field | Value |
|---|---|
| Document ID | AI-MKT-1E-IMPLEMENTATION-REPORT |
| Slice | **AI-MKT-1e** |
| DoD | **`LOCAL_COMPLETE`** (schema-neutral; no migrations) |
| As-of | 2026-11-27 (Asia/Dubai) |
| Baseline HEAD (pre-slice tip) | `2f6ae43` — AI-MKT-1d **CLOSED/PUSHED** |
| Full SHA (baseline) | `2f6ae43ffd3107e77acd674fc1c49cebde5352df` |
| `origin/main` | **Aligned** at `2f6ae43` before this uncommitted slice |
| Mode | Guarded merchant UX + server boundary + Vitest + isolated fixture browser + continuity docs — **no** live providers, SDKs, public routes, paid research, credits, persistence, cache, migrations, deps, env enablement, hosted ops, Git |
| Schema | Local/hosted **57/57** prior · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| Related | `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` · `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md` · `docs/AI_ARCH_1E_IMPLEMENTATION_REPORT.md` |

---

## 0. Verdict

| Gate | Result |
|---|---|
| Offline guarded UX / safe DTO / preview isolation | **GO** |
| Live research / paid providers / credits / production soft-show unlock | **NO-GO** |
| DoD class | **`LOCAL_COMPLETE`** · `HOSTED_SYNC_PENDING` N/A (no migrations) |
| Activation | **OFF** |
| Next slice | **AI-MKT-1f** — Adversarial Evaluation & Offline Acceptance (owner-gated; **not started**) |

**STOP for owner review.** No Git stage/commit/push. Do not start AI-MKT-1f.

---

## A. Starting baseline and protected files

| Field | Value |
|---|---|
| Verified HEAD at start | `2f6ae43` |
| AI-MKT-1d | **CLOSED/PUSHED** @ `2f6ae43` (reconciled from prior LOCAL_COMPLETE wording) |
| AI-MKT-1c | **CLOSED/PUSHED** @ `553e239` |
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` |
| Prior PASS | 1a–1d **83/83** · AI-ARCH **121/121** · AI-INV **27/27** |
| Migrations | **57 local / 57 hosted** (unchanged) |
| Post-catalog | **23/23 PASS** (prior) |
| Production activation | **OFF** |
| CONN-1 exit / V8 JWT / binding / D13/D14 | **UNMET** / **NOT VERIFIED** / **`NOT_YET_VERIFIED`** / **DEFERRED** (unchanged) |
| Protected (untouched) | `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md` (dirty — do not edit/stage/restore) · `docs/BACKGROUND_JOBS.md` · `docs/SERVICE_ROLE_BOUNDARY.md` · `next-env.d.ts` · `AGENTS.md` · `.tmp/` prior harnesses · `.vitest/` · SQL/operator/archive dirties · deleted roadmap DOCX |

---

## B. Exact files

### Added (1e)

| Path | Role |
|---|---|
| `lib/market-research/merchant-intents.ts` | Merchant intent/depth/country allowlists (AE design; US/GB preview) |
| `lib/market-research/merchant-response.ts` | Safe DTO allowlist; omits free-form `researchAnswer`/traces |
| `lib/market-research/merchant-research.ts` | Guarded core: auth → membership → inventory.read → enablement → grain → 1d |
| `lib/market-research/client-request.ts` | Stale/cross-context response isolation helpers |
| `lib/market-research/preview-isolation.ts` | Production/env synthetic override refusal; soft-show helper |
| `lib/market-research/actions.ts` | Production server action — **never** injects synthetic fixtures |
| `components/inventory/sku-market-research-panel.tsx` | Compact Market Intelligence panel in SKU inspector |
| `tests/unit/ai-mkt-1e-guarded-merchant-research-ux.test.ts` | Focused Vitest pack (**19/19**) |
| `docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md` | This report |
| `.tmp/ai-mkt-1e-accept/` | Isolated fixture harness + browser matrix (untracked) |

### Modified

| Path | Role |
|---|---|
| `lib/market-research/index.ts` | Re-export 1e contracts (actions stay server-only) |
| `components/inventory/sku-intelligence-inspector.tsx` | Wire `SkuMarketResearchPanel` (default hidden) |
| `components/inventory/inventory-intelligence-workspace.tsx` | Pass `marketResearchVisible` |
| `app/(app)/app/[organizationId]/inventory/page.tsx` | Server-resolved soft-show (default OFF) |
| `.env.example` | Document `STOREAGENT_MARKET_RESEARCH_*` (still default OFF; no real enablement) |
| Continuity docs | Master handoff, IMPLEMENTATION_STATUS, ledger, PROJECT_HANDOFF, AI roadmap, November plan |

### Not modified

M5–M7/PB1 · L1 tool allowlist · commerce-agent L1 behavior · migrations · deps · real env · credits/cache · Git history · protected dirties including `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`.

---

## C. UX integration

| Item | Behavior |
|---|---|
| Placement | Inside existing SKU Intelligence Inspector, after AI-ARCH commerce-agent panel |
| Intent | `market_opportunity` only (`competitor_research` / `zero_sales_diagnosis` unavailable) |
| Country | AE design; US/GB selector only when isolated preview countries authorized |
| Depth | `quick_lookup` / `standard` — `deep` forbidden |
| Visibility | Server `mayShowMarketResearchPanel` on inventory page → `marketResearchVisible` (default hidden) |
| Honesty | Prominent synthetic warning; external signals separated from inventory facts; partial ≠ exact; stale ≠ current; unknown ≠ zero; search/reviews/rank ≠ sales; no buy/price CTA |
| Stale isolation | `clientRequestId` + grain/intent/country/depth match; panel remounts on `key={market-research:${grainKey}}`; discard/cancel drops late results |
| Layout | Spacious controls; `min-h-11` targets; focus-visible rings; idle/loading/answered/partial/insufficient/conflict/error/retry/discard |

No disconnected dashboard, no inventory redesign, no COMP-1, no AI-MKT-2 causality.

---

## D. Auth / gate order

```text
1. Runtime-validate client IDs + supported intent/country/depth
2. Production env isolation — forbidden synthetic env overrides → PREVIEW_ISOLATION_VIOLATION
3. requireIdentity
4. resolveOrganization (membership)
5. inventory.read
6. Independent research enablement (mayRunMarketResearch) — distinct from L1 commerce-agent
7. Production path: refuse orchestration (no previewIsolation) → RESEARCH_DISABLED, zero 1d calls
8. Isolated preview only: ports.previewIsolation injects trusted fixtures
9. loadIntelligenceRows (membership-scoped grain proof)
10. Exact org/store/location/variant grain match
11. Trusted target attributes from grain row only (never browser metadata / licenseOk / rights)
12. runMarketResearchOrchestration (actual 1d pipeline)
13. toMerchantResearchDto + assertMerchantResearchSafeDto
```

**Browser supplies:** organizationId, storeId, locationId, variantId, intentClass, countryCode, depth, clientRequestId only.

**Never accepted as authority:** forceEnabled, allowSyntheticFixtures, fixtureId, licenseOk, rightsConditions, approval, adapters, bounds, draftAdapter, target metadata, satisfied*Conditions.

---

## E. Safe DTO allowlist

| Included | Excluded |
|---|---|
| kind/status, clientRequestId, intent/country/depth | `researchAnswer` / free-form draft prose |
| findings (label/value/unit/claim/signal/match/freshness/observation/confidence/geo/currency/limitations) | traces, binding, spend, credits |
| summaryLines (deterministic from findings) | rejected evidence, raw envelopes |
| citations (https only, evidence-bound) | secrets, hashes of internals, adapter IDs as authority |
| conflicts, limitations, generator | forceEnabled / enablementSource / fixtureId |
| originClass=`synthetic_fixture`, syntheticOriginPreserved, isRealMerchantOrMarketFact=false | approvals, licenseOk |
| syntheticPreviewWarning | L1 promotion paths |

---

## F. Preview isolation

| Rule | Enforcement |
|---|---|
| Default OFF | Soft-show + orchestration default disabled |
| Production action | `previewIsolation` omitted — never orchestrates |
| Env overrides | `STOREAGENT_MARKET_RESEARCH_ALLOW_SYNTHETIC` / fixture / force / `NEXT_PUBLIC_*` refused |
| Synthetic preview | Ports-only injection in tests / local harness through actual 1d |
| Public demo endpoint | **None** |
| Live / paid / credits | **Forbidden** |

---

## G. Tests and verification (actual)

| Check | Result |
|---|---|
| Focused 1e | **19/19 PASS** |
| Focused 1a+1b+1c+1d+1e | **102/102 PASS** (24+21+19+19+19) |
| AI-ARCH 1a–1f | **121/121 PASS** |
| AI-INV | **27/27 PASS** |
| `npm run typecheck` | **PASS** |
| ESLint (1e surfaces) | **PASS** (0 errors) |
| `npm run build` | **PASS** |
| `git diff --check` (1e paths) | **PASS** |
| Migration count | **57** unchanged |
| Isolated fixture browser 375/768/1280/1440/2560 | **PASS** — evidence `.tmp/ai-mkt-1e-accept/artifacts/` |
| Live authenticated soft-show inventory browser | **NOT EXECUTED** (activation forbidden) |
| Hosted / live AI / paid calls | **NOT EXECUTED** (forbidden) |

### Browser matrix (fixture harness — not authenticated product)

| Width | Disabled hidden | Controls | Honesty states | Overflow | Verdict |
|---|---|---|---|---|---|
| 375 | PASS | PASS | answered/partial/insufficient/conflict/loading/error | none | **PASS** |
| 768 | PASS | PASS | same | none | **PASS** |
| 1280 | PASS | PASS | same | none | **PASS** |
| 1440 | PASS | PASS | same | none | **PASS** |
| 2560 | PASS | PASS | same | none | **PASS** |

**Honest distinction:** Component/Vitest packs exercise the real guarded core + 1d pipeline. Browser matrix is a **mirrored harness** (markup/classes/data-attrs). Authenticated inventory soft-show browser was **not** run.

---

## H. Activation and migration status

| Item | Status |
|---|---|
| Soft-show | Default **OFF** |
| Orchestration unlock via env/request/fixture | **Impossible** on production action |
| Live LLM / SDK / web search | **None** |
| OAuth / SyncRun / workers / cron | **OFF** |
| Local / hosted migrations | **57 / 57** — no new files · prior hosted evidence retained |
| DoD | AI-MKT-1e **`LOCAL_COMPLETE`** · activation **OFF** · Git checkpoint **pending** |

---

## I. Limitations

- Soft-show stays OFF until separately authorized; UI hidden by default.
- Production merchant path never runs synthetic or live research — preview is ports/harness only.
- No durable audit/credit tables; no NL free-form research chat; COMP-1 / AI-MKT-2 deferred.
- Live authenticated soft-show inventory browser cert **not** run.
- Client cancel discards late results locally — does **not** claim server cancellation unless AbortSignal wired and tested (covered in Vitest abort path).
- Hosted JWT / binding / CONN-1 exit unchanged (**UNMET** / **NOT_YET_VERIFIED**).

---

## J. Exact checkpoint allowlist (owner Git — when authorized)

```text
lib/market-research/merchant-intents.ts
lib/market-research/merchant-response.ts
lib/market-research/merchant-research.ts
lib/market-research/client-request.ts
lib/market-research/preview-isolation.ts
lib/market-research/actions.ts
lib/market-research/index.ts
components/inventory/sku-market-research-panel.tsx
components/inventory/sku-intelligence-inspector.tsx
components/inventory/inventory-intelligence-workspace.tsx
app/(app)/app/[organizationId]/inventory/page.tsx
.env.example
tests/unit/ai-mkt-1e-guarded-merchant-research-ux.test.ts
docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
```

**Do not stage:** `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`, protected dirties, `.tmp/`, `.vitest/`, AGENTS.md, SQL/operator/archives.

---

## K. GO / NO-GO

| Decision | Verdict |
|---|---|
| Local eng + fixture visual acceptance | **GO** (`LOCAL_COMPLETE`) |
| Offline | **GO** |
| Live research / paid / activation | **NO-GO** |
| Owner Git checkpoint (allowlist only) | Pending owner auth |
| Start AI-MKT-1f | **NO-GO** until owner review |

**Actual HEAD at report time:** `2f6ae43` (committed tip; 1e uncommitted). Migrations **57/57**. Activation **OFF**.

**Next:** AI-MKT-1f — Adversarial Evaluation & Offline Acceptance — owner-gated only.

**STOP FOR OWNER REVIEW.** No Git stage/commit/push. No hosted operations.
