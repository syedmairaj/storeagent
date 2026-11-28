# DOC-GLOBAL-1 — Global Architecture / Four-Market Launch Strategy

| Field | Value |
|---|---|
| Document ID | DOC-GLOBAL-1-FOUR-MARKET-LAUNCH-STRATEGY |
| Slice | **DOC-GLOBAL-1** |
| Mode | **DOCS ONLY** — planning / decision record · **not** implementation authorization |
| DoD | **`DOCS_ONLY_COMPLETE`** |
| As-of | 2026-11-28 (Asia/Dubai) |
| Verified HEAD | `e6943ce` — AI-MKT-1f **CLOSED/PUSHED** |
| Full SHA | `e6943ce3f8ceb4185681ebe245bf7be9726577fc` |
| `origin/main` | **Aligned** at `e6943ce` |
| Migrations | **57/57** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |

---

## 0. Verdict

| Gate | Result |
|---|---|
| Docs-only global strategy decision record | **COMPLETE** |
| Runtime / migrations / deps / env / providers / Git | **NOT EXECUTED** (forbidden this slice) |
| Soft-show / live research / credits / connector activation | **NO-GO** |
| Authenticated browser / integrated commercial UX | **NOT CERTIFIED** (unchanged) |
| Next eng (owner-gated) | Propose **AI-MKT-1f-R1** (opaque public IDs) and/or **AI-MKT-GEO-1** before soft-show; **AI-MKT-DATA-0** before new paid sources; **AI-MKT-1.1** before any paid path |

**STOP for owner review.** No Git stage/commit/push.

---

## 1. Baseline reconciliation (Git-verified)

| Field | Verified value |
|---|---|
| HEAD / `origin/main` | `e6943ce` · `test(ai-mkt): add adversarial evaluation and offline acceptance (1f)` |
| AI-MKT-1f | **CLOSED/PUSHED** @ `e6943ce` (reconciled from prior `LOCAL_COMPLETE`/uncommitted wording) |
| AI-MKT-1e | **CLOSED/PUSHED** @ `59ff8b0` |
| AI-MKT-1d…0 / AI-ARCH-1 | Prior CLOSED/PUSHED pins unchanged |
| Prior eval | **58** mandatory PASS · **1 SKIP** (M01b) · never count SKIP as PASS · AI-MKT **168/168** · AI-ARCH **121/121** · AI-INV **27/27** |
| Schema | **57/57** · catalog **23/23** prior · activation **OFF** |
| CONN-1 / V8 JWT / binding / D13/D14 | **UNMET** / **NOT VERIFIED** / **`NOT_YET_VERIFIED`** / **DEFERRED** |
| Protected dirties | Untouched (incl. `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`) |

---

## 2. Owner direction (frozen for living docs)

StoreAgent is a **global, provider-independent** AI Inventory, Market Intelligence & Buying Agent.

| Topic | Decision |
|---|---|
| Product identity | Global-ready architecture; English-first commercial launch |
| Initial commercial launch markets | **US, GB, CA, AU** |
| Registration targets (not forecasts) | US **500** · GB **250** · CA **125** · AU **125** = **1,000** first registrations |
| UAE-first / AE-primary launch narrative | **Incorrect for commercial launch** — **superseded** for living strategy |
| Noon | Regional marketplace **example only** — not launch geography authority |
| Future countries | Added via **versioned configuration, capabilities, and validation** — **not** separate intelligence engines |
| Connector sequence | Preserve **CSV → Shopify → WooCommerce → Amazon**; eBay / regional marketplaces later by demand + API feasibility |
| Launch candidates after production acceptance | CSV and Shopify (separately gated) |

### Explicit supersession

| Prior authority | Living-doc status |
|---|---|
| `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` § geography recommending **`AE` primary** (+ US/GB fixtures) | **Historical**. Superseded for *commercial launch geography* by **this decision record**. Feasibility methods, rights fail-closed, and unresolved LEGAL items remain valid. |
| Registry/runtime AE design allowlists (`geo-category.ts`, source `allowedCountries`, merchant intents AE/US/GB) | **Implementation residue**. Change only under separately authorized **AI-MKT-GEO-1** (or successor). Do not treat current AE-centric code as launch strategy. |

**Do not rewrite** historical AI-MKT-0 / 1a–1f implementation reports. Prefer this record + living roadmap/handoff for current geography truth.

---

## 3. Separated geographic / commercial dimensions

One organization must be able to model these as **distinct** server-owned facts (browser hints never authoritative):

| Dimension | Meaning | Launch note |
|---|---|---|
| Merchant domicile | Legal/home country of the org | May differ from selling markets |
| Billing currency | Invoice / credit settlement currency | Independent of research FX |
| Locale | UI language/region (`en-US` / `en-GB` / `en-CA` / `en-AU`) | English-first launch |
| Timezone | Reporting/as-of clocks | Explicit; no silent local-browser authority |
| Selling marketplace / country | Channel + market where inventory sells | Multi-country stores **future-supported** |
| Warehouse / fulfillment geography | Physical stock location grain | M5–M7 remain deterministic |
| Research geography | Country/market for external evidence | Source × country × endpoint × operation capabilities |

Unknown / unsupported dimensions **fail closed** (`UNSUPPORTED_GEO`, rights denial, abstention).

---

## 4. Proposed milestone IDs (not started)

### 4.1 AI-MKT-1f-R1 — Opaque merchant public IDs (remediation)

| Field | Proposal |
|---|---|
| Status | **PROPOSED** (narrow remediation; separate auth) |
| Why | M01b residual: merchant DTO `evidenceId` / `findingId` embed own org UUID (`mkt1c:org:request:snippet`). **SKIP ≠ PASS**. Soft-show must not ship this leakage. |
| Scope | Public opaque IDs in merchant DTO; preserve **internal** evidence/citation/binding hashes for orchestration & claim validation |
| Non-goals | Soft-show unlock, live providers, credits, migrations unless required for mapping tables (prefer in-memory/session mapping first) |
| Gate | Required **before** soft-show / authenticated merchant research UX certification |

### 4.2 AI-MKT-GEO-1 — Versioned country / capability registry

| Field | Proposal |
|---|---|
| Status | **PROPOSED** |
| Country registry (launch) | US/USD/`en-US` · GB/GBP/`en-GB` · CA/CAD/`en-CA` · AU/AUD/`en-AU` |
| Separate axes | Launch eligibility ≠ connector support ≠ research capability (source × country × endpoint × operation) |
| UX | Dynamic country selectors from registry; remove AE-centric merchant defaults **only** in authorized implementation |
| Fail closed | Unknown/unsupported country/currency/unit/timezone |
| FX | Explicit FX evidence only; unauthorized conversion forbidden (retain 1c honesty) |
| Expansion test | Add a **fifth synthetic** market via registry configuration **without** core engine fork |
| Depends on | AI-MKT-1a–1f offline contracts; preferably after or with 1f-R1 for DTO surfaces |

### 4.3 AI-MKT-DATA-0 — Four-market source coverage feasibility

| Field | Proposal |
|---|---|
| Status | **PROPOSED** (docs/legal feasibility; no subscriptions) |
| Evaluate | Coverage, accuracy, history depth, licensing, economics for US/GB/CA/AU |
| Preference | Authorized **free** sources first; then prepaid/PAYG APIs |
| Candidates (no commitment) | OpenAI web search · Google Trends / Search Console / Ads (authorized surfaces only) · DataForSEO · Everydata · Bright Data |
| Conditional only | Keepa / Jungle Scout / SmartScout — rights + commercial use + attribution required |
| Forbidden | Subscription commitment this slice; unauthorized scraping; inventing sales from BSR/search/reviews |

### 4.4 AI-MKT-DATA-1 — Conditional structured / historical adapters

| Field | Proposal |
|---|---|
| Status | **PROPOSED** |
| Rule | Reuse existing rights, normalization, orchestration — **no** independent research engine |
| Depends on | AI-MKT-DATA-0 + AI-MKT-GEO-1 + AI-MKT-1.1 before paid calls |

### 4.5 AI-MKT-1.1 — Credits & commercial cost controls (expanded)

| Field | Proposal |
|---|---|
| Status | **PLANNED** (IDs preserved; scope clarified) |
| Controls | LLM + external data costs · versioned tariffs · bounded reservations · idempotent settle/refund · hard budgets · rights-aware caching |
| Gate | **Before any paid research path** |

### 4.6 Expanded merchant intelligence (preserved IDs, clarified scope)

| ID | Clarified scope | Status |
|---|---|---|
| **AI-MKT-2** | Internal-first Zero-Sales Detective; visibility, pricing, availability, and **labeled** external demand hypotheses | PLANNED |
| **COMP-1** | Competitor pricing, historical rank signals, review barriers, customer voice, product gaps — **no** invented competitor sales | PROPOSED |
| **AI-MKT-3** | Product/variant/category/country opportunities with landed cost, margin, MOQ, cash, supplier feasibility | PLANNED |
| **AI-MKT-4 / LOOP-1** | Consented market monitoring + decision outcome measurement; tenant-private learning | PLANNED / PROPOSED |

### 4.7 Future onboarding (docs only)

Country-aware integration directory; multiple selling markets; unsupported connector **request** capture. **Never** advertise planned integrations as live.

---

## 5. Dependency graph (owner authorization still required)

```text
AI-MKT-1f CLOSED/PUSHED @ e6943ce
        │
        ├─► AI-MKT-1f-R1 (opaque public IDs) ──► soft-show unlock (separate)
        │
        ├─► AI-MKT-GEO-1 (US/GB/CA/AU registry + capabilities)
        │         │
        │         └─► AI-MKT-DATA-0 (four-market source feasibility)
        │                   │
        │                   └─► AI-MKT-DATA-1 (structured adapters; after 1.1 if paid)
        │
        └─► AI-MKT-1.1 (credits/tariffs/budgets/cache)
                  │
                  ├─► AI-MKT-2 (zero-sales detective)
                  ├─► COMP-1 (competitor/voice; licensed only)
                  ├─► AI-MKT-3 (opportunity advisor)
                  └─► AI-MKT-4 / LOOP-1 (monitoring + outcomes)

Connector production path (parallel, not substituted by AI-MKT):
CSV acceptance → Shopify (OAuth/SyncRun gated) → Woo → Amazon → later eBay/regional
CONN-1 exit / V8 JWT / binding / D13/D14 remain blockers for vaulted production connectors.
```

---

## 6. Affected runtime surfaces (change only under later auth)

| Surface | Current residue | GEO/DATA impact |
|---|---|---|
| `lib/market-research/geo-category.ts` | `designGeoAllowlist: ["AE"]` | Replace with versioned launch registry |
| `lib/market-research/registry.ts` | OpenAI/Gemini `allowedCountries: ["AE"]` (merchant_owned broader) | Source × country capabilities |
| `lib/market-research/merchant-intents.ts` | Countries `AE` \| `US` \| `GB` | Add CA/AU; demote AE from launch default |
| `lib/market-research/merchant-research.ts` / panel / actions | AE design UX; soft-show OFF | Dynamic selectors; domicile ≠ research geo |
| `lib/market-research/normalize/geo-match.ts` | Currency/FX honesty | Launch currencies USD/GBP/CAD/AUD |
| `lib/market-research/merchant-response.ts` | evidenceId embeds org UUID | **AI-MKT-1f-R1** opaque mapping |
| Tenancy / org / store models | Single-country assumptions possible | Multi-country selling markets (future) |
| Onboarding / integration directory | — | Country-aware; no false “live” badges |
| M5–M7 engines | Unchanged authority | Must remain deterministic; no per-country engine fork |

---

## 7. Launch gates (commercial four-market)

| Gate | Status |
|---|---|
| Offline AI-MKT 1a–1f | **PASS** (1f CLOSED/PUSHED) |
| M01b opaque public IDs (1f-R1) | **OPEN** residual before soft-show |
| AI-MKT-GEO-1 registry + fail-closed | **NOT STARTED** |
| AI-MKT-DATA-0 licensing for launch markets | **NOT STARTED** |
| AI-MKT-1.1 credits before paid | **NOT STARTED** |
| Soft-show / live research | **OFF / NO-GO** |
| Authenticated merchant browser cert | **NOT CERTIFIED** |
| CSV / Shopify production acceptance | Separately gated; CONN/security prerequisites |
| CONN-1 exit / V8 JWT / binding / D13/D14 | **UNMET** / **NOT VERIFIED** / **NOT_YET_VERIFIED** / **DEFERRED** |
| Paying launch | **NO-GO** |

---

## 8. Governance (unchanged, restated)

- One canonical commerce domain; provider-independent adapters.
- M5–M7 deterministic engines own inventory/sales/forecast/reorder math.
- Evidence & Accuracy Contract + Commerce Decision Loop (AI-ARCH-0).
- BSR / search / reviews / rank ≠ verified sales; unknown ≠ zero.
- No uncalibrated sales estimates, invented confidence bounds, confirmed external causality, unauthorized scraping, cross-tenant cache, or autonomous purchases.
- Human approval for purchasing, ads, supplier contact, inventory mutation.

---

## 9. Unresolved decisions (owner)

1. Ordering preference: **1f-R1 before GEO-1** vs parallel (recommend 1f-R1 before soft-show; GEO-1 before marketing four-market research UX).
2. Whether AE remains a **synthetic/fixture** research country after GEO-1 (recommend: optional fixture-only, not launch eligibility).
3. Billing currency default vs domicile for first 1,000 targets.
4. Which DATA-0 candidates enter LEGAL review first (recommend: OpenAI web search + one structured PAYG candidate).
5. Whether multi-country stores land before or after Shopify production activation.
6. Registration targets: tracking instrumentation vs marketing copy only (targets ≠ forecasts).

---

## 10. Exact checkpoint allowlist (when owner authorizes Git)

```text
docs/DOC_GLOBAL_1_FOUR_MARKET_LAUNCH_STRATEGY.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/DECISIONS.md
```

**Do not stage:** `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`, other protected dirties, `.tmp/`, `.vitest/`, `AGENTS.md`, SQL/operator/archives, deleted roadmap DOCX, runtime/test sources.

---

## 11. Status pin

| Item | Value |
|---|---|
| Slice | DOC-GLOBAL-1 |
| DoD | **`DOCS_ONLY_COMPLETE`** |
| HEAD | `e6943ce` |
| AI-MKT-1f | **CLOSED/PUSHED** @ `e6943ce` |
| Activation | **OFF** |
| Next proposed eng | **AI-MKT-1f-R1** and/or **AI-MKT-GEO-1** (owner-gated; not started) |

**STOP FOR OWNER REVIEW.**
